-- ==========================================================================
-- Consolidated schema for secrets marketplace with web2 private bidding
-- Supabase project: jeyudbkttazpifxvzqvq
--
-- Tables:
--   1. sellers      - Seller identity (id PK, address indexed)
--   2. secrets      - Off-chain secret data tied to on-chain auctions (FK → sellers)
--   3. transfers    - Unified table: deposits and withdrawals (direction inferred from status)
--   4. private_bids - Complete bid history for web2 private bidding
--
-- Views:
--   1. balances     - Computed available/locked/pending from transfers + private_bids
-- ==========================================================================

-- ==========================================================================
-- EXTENSION: pg_jsonschema (for JSON schema validation)
-- ==========================================================================
CREATE EXTENSION IF NOT EXISTS pg_jsonschema;

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
-- TABLE 1: sellers
-- ==========================================================================
-- Stores seller identity. id is the primary key and must be unique.
-- Must be created before secrets (secrets.seller_id references sellers.id).

CREATE TABLE sellers (
  id              text PRIMARY KEY,
  address         text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sellers_addr CHECK (address ~* '^0x[a-f0-9]{40}$')
);

CREATE INDEX idx_sellers_address ON sellers (address);

CREATE TRIGGER sellers_updated_at
  BEFORE UPDATE ON sellers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ==========================================================================
-- TABLE 2: secrets
-- ==========================================================================
-- Stores the actual secret data that sellers are auctioning.
-- auction_id references the uint256 ID from SecretMarketplace contract.
-- buyer is NULL until the auction closes and a winner is determined.

CREATE TABLE secrets (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auction_id     text NOT NULL UNIQUE,
  secret_data    text NOT NULL,
  event_data     jsonb,
  seller_id      text NOT NULL REFERENCES sellers (id),
  buyer          text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT secrets_buyer_addr  CHECK (buyer IS NULL OR buyer ~* '^0x[a-f0-9]{40}$'),
  CONSTRAINT secrets_event_data_schema CHECK (
    event_data IS NULL OR jsonb_matches_schema(
      '{
        "type": "object",
        "required": ["marketplace", "event", "marketId", "outcome"],
        "properties": {
          "marketplace": { "type": "string" },
          "event": { "type": "string" },
          "marketId": { "type": "number" },
          "outcome": { "type": "string", "enum": ["yes", "no"] }
        },
        "additionalProperties": false
      }',
      event_data
    )
  )
);

CREATE INDEX idx_secrets_seller_id ON secrets (seller_id);

CREATE TRIGGER secrets_updated_at
  BEFORE UPDATE ON secrets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ==========================================================================
-- TABLE 3: transfers
-- ==========================================================================
-- Unified table for all token movements (deposits and withdrawals).
-- Direction is inferred from status values:
--   Deposits:     pending → confirmed | failed
--   Withdrawals:  requested → transferring → completed | failed

CREATE TABLE transfers (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id    text NOT NULL UNIQUE,
  user_address      text NOT NULL,
  token_address     text NOT NULL DEFAULT '0xcd71c57e6280b72cacd8305a6c0da7c348ca70b5',
  amount            text NOT NULL,
  recipient_address text,
  sender_address    text,
  status            text NOT NULL DEFAULT 'requested'
                      CHECK (status IN ('pending', 'confirmed', 'failed', 'requested', 'transferring', 'completed')),
  raw_data          jsonb,
  credited_at       timestamptz,
  completed_at      timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT transfers_user_addr      CHECK (user_address ~* '^0x[a-f0-9]{40}$'),
  CONSTRAINT transfers_sender_addr    CHECK (sender_address IS NULL OR sender_address ~* '^0x[a-f0-9]{40}$'),
  CONSTRAINT transfers_amount_positive CHECK (amount::numeric > 0)
);

CREATE INDEX idx_transfers_user ON transfers (user_address);
CREATE INDEX idx_transfers_status ON transfers (status);

CREATE TRIGGER transfers_updated_at
  BEFORE UPDATE ON transfers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ==========================================================================
-- TABLE 4: private_bids
-- ==========================================================================
-- Complete bid history for the web2 private bidding layer.
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
  auction_id      text NOT NULL, -- Text because supabase thinks uints are hard
  bidder_address  text NOT NULL, -- Needed so we can decrement their balance
  amount          text NOT NULL, 
  status          text NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active', 'outbid', 'won', 'refunded')),
  outbid_at       timestamptz,
  won_at          timestamptz,
  refunded_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT pb_bidder_addr    CHECK (bidder_address ~* '^0x[a-f0-9]{40}$'),
  CONSTRAINT pb_amount_positive CHECK (amount::numeric > 0)
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
-- ROW-LEVEL SECURITY
-- ==========================================================================
-- All tables: deny everything for anon/authenticated roles.
-- service_role bypasses RLS by default in Supabase.
-- The backend API authenticates users via EIP-712 and uses service_role.

ALTER TABLE secrets ENABLE ROW LEVEL SECURITY;
ALTER TABLE sellers ENABLE ROW LEVEL SECURITY;
ALTER TABLE transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE private_bids ENABLE ROW LEVEL SECURITY;

-- No permissive policies = deny all for anon/authenticated.
-- service_role bypasses RLS entirely (Supabase default behavior).

-- ==========================================================================
-- VIEW: balances
-- ==========================================================================
-- Computed view — no physical table. Derives balances from transfers + private_bids.
--
-- Formula:
--   available = total_deposited - locked_in_active_bids - spent_on_won_bids
--               - pending_withdrawals - completed_withdrawals
--   locked    = SUM(active bids)
--   pending   = SUM(requested/transferring withdrawals)
--
-- Columns are cast to text so PostgREST returns strings (preserving precision
-- for 18-decimal token amounts).

CREATE OR REPLACE VIEW balances AS
SELECT
  t.user_address,
  (COALESCE(t.total_deposited, 0)
    - COALESCE(b.locked_balance, 0)
    - COALESCE(b.spent_on_wins, 0)
    - COALESCE(t.pending_withdrawal, 0)
    - COALESCE(t.completed_withdrawals, 0))::text AS available_balance,
  COALESCE(b.locked_balance, 0)::text AS locked_balance,
  COALESCE(t.pending_withdrawal, 0)::text AS pending_withdrawal
FROM
  (
    SELECT
      user_address,
      COALESCE(SUM(amount::numeric) FILTER (
        WHERE status = 'confirmed'
      ), 0) AS total_deposited,
      COALESCE(SUM(amount::numeric) FILTER (
        WHERE status IN ('requested', 'transferring')
      ), 0) AS pending_withdrawal,
      COALESCE(SUM(amount::numeric) FILTER (
        WHERE status = 'completed'
      ), 0) AS completed_withdrawals
    FROM transfers
    WHERE user_address IS NOT NULL
    GROUP BY user_address
  ) t
LEFT JOIN
  (
    SELECT
      bidder_address AS user_address,
      COALESCE(SUM(amount::numeric) FILTER (WHERE status = 'active'), 0) AS locked_balance,
      COALESCE(SUM(amount::numeric) FILTER (WHERE status = 'won'), 0) AS spent_on_wins
    FROM private_bids
    GROUP BY bidder_address
  ) b ON b.user_address = t.user_address;

-- RLS on view: security_invoker ensures the view runs with the caller's
-- permissions, so only service_role can query it.
ALTER VIEW balances SET (security_invoker = true);
