-- ==========================================================================
-- Migration: 001_initial_schema.sql
-- Supabase project: jeyudbkttazpifxvzqvq
-- Purpose: Schema for secrets marketplace with web2 private bidding
--
-- Tables:
--   1. secrets           - Off-chain secret data tied to on-chain auctions
--   2. balances          - User private token (DEMO) balance tracking
--   3. private_bids      - Complete bid history for web2 private bidding
--   4. private_withdrawals - Withdrawal request lifecycle
-- ==========================================================================

-- ==========================================================================
-- HELPER: updated_at trigger function
-- ==========================================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ==========================================================================
-- TABLE 1: secrets
-- ==========================================================================
-- Stores the actual secret data that sellers are auctioning.
-- auction_id references the uint256 ID from SecretMarketplace contract.
-- buyer is NULL until the auction closes and a winner is determined.

CREATE TABLE secrets (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auction_id     text NOT NULL UNIQUE,
  secret_data    jsonb NOT NULL,
  market_data    jsonb,
  seller         text NOT NULL,
  buyer          text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT secrets_seller_addr CHECK (seller ~* '^0x[a-f0-9]{40}$'),
  CONSTRAINT secrets_buyer_addr  CHECK (buyer IS NULL OR buyer ~* '^0x[a-f0-9]{40}$')
);

CREATE INDEX idx_secrets_seller ON secrets (seller);

CREATE TRIGGER secrets_updated_at
  BEFORE UPDATE ON secrets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ==========================================================================
-- TABLE 2: balances
-- ==========================================================================
-- Tracks each user's DEMO token balance within the web2 private bidding layer.
--
-- Three balance components:
--   available_balance  - Free to bid or withdraw
--   locked_balance     - Currently locked in active bids
--   pending_withdrawal - Currently in the withdrawal pipeline
--
-- Uses numeric(78,0) because DEMO has 18 decimals and bigint overflows at ~9.2 tokens.
-- All balance mutations MUST use SELECT ... FOR UPDATE to prevent race conditions.

CREATE TABLE balances (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_address       text NOT NULL UNIQUE,
  available_balance  numeric(78,0) NOT NULL DEFAULT 0,
  locked_balance     numeric(78,0) NOT NULL DEFAULT 0,
  pending_withdrawal numeric(78,0) NOT NULL DEFAULT 0,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT balances_user_addr              CHECK (user_address ~* '^0x[a-f0-9]{40}$'),
  CONSTRAINT balances_available_non_negative CHECK (available_balance >= 0),
  CONSTRAINT balances_locked_non_negative    CHECK (locked_balance >= 0),
  CONSTRAINT balances_pending_non_negative   CHECK (pending_withdrawal >= 0)
);

CREATE TRIGGER balances_updated_at
  BEFORE UPDATE ON balances
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ==========================================================================
-- TABLE 3: private_bids
-- ==========================================================================
-- Complete bid history for the web2 private bidding layer.
-- Unlike the on-chain contract (which only stores the current highest bid
-- and refunds previous bidders immediately), this table stores every bid.
--
-- Status lifecycle:
--   active   - Currently the highest bid (balance locked)
--   outbid   - Was outbid, balance released back to available
--   won      - Auction closed, this bid won
--   refunded - Auction force-closed, balance released
--
-- The unique partial index ensures at most one active bid per auction.

CREATE TABLE private_bids (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auction_id      text NOT NULL,
  bidder_address  text NOT NULL,
  amount          numeric(78,0) NOT NULL,
  status          text NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active', 'outbid', 'won', 'refunded')),
  outbid_at       timestamptz,
  won_at          timestamptz,
  refunded_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT pb_bidder_addr    CHECK (bidder_address ~* '^0x[a-f0-9]{40}$'),
  CONSTRAINT pb_amount_positive CHECK (amount > 0)
);

CREATE INDEX idx_pb_auction_status ON private_bids (auction_id, status);
CREATE INDEX idx_pb_bidder ON private_bids (bidder_address);

-- DB-level guarantee: at most one active bid per auction
CREATE UNIQUE INDEX idx_pb_one_active_per_auction
  ON private_bids (auction_id) WHERE status = 'active';

CREATE TRIGGER private_bids_updated_at
  BEFORE UPDATE ON private_bids
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ==========================================================================
-- TABLE 4: private_withdrawals
-- ==========================================================================
-- Tracks withdrawal requests from users wanting DEMO tokens back.
--
-- Primary flow:
--   1. User requests withdrawal -> status='requested'
--      available_balance decreased, pending_withdrawal increased
--   2. Platform calls POST /private-transfer to user's address
--      -> status='transferring'
--   3. Transfer confirmed -> status='completed'
--      pending_withdrawal decreased
--   4. If transfer fails -> status='failed'
--      pending_withdrawal released back to available_balance

CREATE TABLE private_withdrawals (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_address      text NOT NULL,
  token_address     text NOT NULL DEFAULT '0xb308ef20527c5215ec2b2b10f52b311f3aac6eeb',
  amount            numeric(78,0) NOT NULL,
  recipient_address text,
  status            text NOT NULL DEFAULT 'requested'
                      CHECK (status IN ('requested', 'transferring', 'completed', 'failed')),
  transfer_tx_id    text,
  completed_at      timestamptz,
  failed_reason     text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT pw_user_addr      CHECK (user_address ~* '^0x[a-f0-9]{40}$'),
  CONSTRAINT pw_amount_positive CHECK (amount > 0)
);

CREATE INDEX idx_pw_user ON private_withdrawals (user_address);
CREATE INDEX idx_pw_status ON private_withdrawals (status);

CREATE TRIGGER private_withdrawals_updated_at
  BEFORE UPDATE ON private_withdrawals
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ==========================================================================
-- ROW-LEVEL SECURITY
-- ==========================================================================
-- All tables: deny everything for anon/authenticated roles.
-- service_role bypasses RLS by default in Supabase.
-- The backend API authenticates users via EIP-712 and uses service_role.

ALTER TABLE secrets ENABLE ROW LEVEL SECURITY;
ALTER TABLE balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE private_bids ENABLE ROW LEVEL SECURITY;
ALTER TABLE private_withdrawals ENABLE ROW LEVEL SECURITY;

-- No permissive policies = deny all for anon/authenticated.
-- service_role bypasses RLS entirely (Supabase default behavior).
