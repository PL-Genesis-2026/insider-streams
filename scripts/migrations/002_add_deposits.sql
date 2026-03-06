-- ==========================================================================
-- Migration: 002_add_deposits.sql
-- Purpose: Add deposits table for tracking incoming private token transfers
--          to the platform EOA. Provides reconciliation and idempotency.
--
-- A cron job polls POST /transactions on the platform EOA to detect new
-- incoming transfers. Each transfer's transaction_id (from the Private Token
-- API) is stored as a UNIQUE key to prevent double-crediting on re-polls.
-- ==========================================================================

CREATE TABLE deposits (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id    text NOT NULL UNIQUE,   -- From Private Token API (idempotency key)
  user_address      text,                    -- Matched user (NULL if hide-sender and unmatched)
  token_address     text NOT NULL DEFAULT '0xb308ef20527c5215ec2b2b10f52b311f3aac6eeb',
  amount            numeric(78,0) NOT NULL,
  sender_address    text,                    -- Sender address if visible (NULL if hide-sender)
  status            text NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'confirmed', 'failed')),
  credited_at       timestamptz,             -- When balance was credited
  raw_data          jsonb,                   -- Full API response for audit trail
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT deposits_token_addr  CHECK (token_address ~* '^0x[a-f0-9]{40}$'),
  CONSTRAINT deposits_user_addr   CHECK (user_address IS NULL OR user_address ~* '^0x[a-f0-9]{40}$'),
  CONSTRAINT deposits_sender_addr CHECK (sender_address IS NULL OR sender_address ~* '^0x[a-f0-9]{40}$'),
  CONSTRAINT deposits_amount_positive CHECK (amount > 0)
);

CREATE INDEX idx_deposits_user ON deposits (user_address);
CREATE INDEX idx_deposits_status ON deposits (status);

CREATE TRIGGER deposits_updated_at
  BEFORE UPDATE ON deposits
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE deposits ENABLE ROW LEVEL SECURITY;
