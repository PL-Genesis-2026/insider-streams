-- ==========================================================================
-- Migration: 007_merge_deposits_into_transfers.sql
-- Purpose:
--   Merge the `deposits` table into `transfers` by:
--   1. Adding deposit-specific columns to transfers
--   2. Expanding type/status CHECK constraints
--   3. Migrating existing deposit rows
--   4. Dropping the deposits table
--   5. Recreating the balances VIEW against the unified table
--
--   After this migration, transfers.type can be:
--     'deposit'            — incoming private transfer to platform EOA
--     'user_withdrawal'    — user-initiated withdrawal
--     'platform_transfer'  — platform-initiated outgoing transfer
-- ==========================================================================

-- 1. Drop balances VIEW first (depends on both deposits and transfers)
DROP VIEW IF EXISTS balances;

-- 2. Add columns from deposits that transfers doesn't have
ALTER TABLE transfers ADD COLUMN sender_address text;
ALTER TABLE transfers ADD COLUMN raw_data jsonb;
ALTER TABLE transfers ADD COLUMN credited_at timestamptz;

-- 3. Add CHECK on sender_address (matching deposits' constraint pattern)
ALTER TABLE transfers ADD CONSTRAINT transfers_sender_addr
  CHECK (sender_address IS NULL OR sender_address ~* '^0x[a-f0-9]{40}$');

-- 4. Expand type CHECK to include 'deposit'
ALTER TABLE transfers DROP CONSTRAINT transfers_type_check;
ALTER TABLE transfers ADD CONSTRAINT transfers_type_check
  CHECK (type IN ('deposit', 'user_withdrawal', 'platform_transfer'));

-- 5. Expand status CHECK to include deposit statuses
ALTER TABLE transfers DROP CONSTRAINT private_withdrawals_status_check;
ALTER TABLE transfers ADD CONSTRAINT transfers_status_check
  CHECK (status IN ('pending', 'confirmed', 'failed', 'requested', 'transferring', 'completed'));

-- 6. Make transaction_id NOT NULL (deposits requires it; existing transfers may have NULLs)
-- First, backfill any NULL transaction_ids with a generated value
UPDATE transfers SET transaction_id = 'legacy-' || id::text WHERE transaction_id IS NULL;
ALTER TABLE transfers ALTER COLUMN transaction_id SET NOT NULL;

-- 7. Migrate deposit rows into transfers
INSERT INTO transfers (
  transaction_id, type, user_address, token_address, amount,
  sender_address, recipient_address, status, raw_data, credited_at,
  created_at, updated_at
)
SELECT
  transaction_id,
  'deposit',
  COALESCE(user_address, sender_address, '0x0000000000000000000000000000000000000000'),
  token_address,
  amount,
  sender_address,
  NULL,           -- no recipient for deposits (platform EOA is implicit)
  status,
  raw_data,
  credited_at,
  created_at,
  updated_at
FROM deposits;

-- 8. Drop deposits table
DROP TABLE deposits;

-- 9. Add composite index for balances VIEW performance
CREATE INDEX idx_transfers_type_status ON transfers (type, status);

-- 10. Recreate balances VIEW against unified transfers table
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
        WHERE type = 'deposit' AND status = 'confirmed'
      ), 0) AS total_deposited,
      COALESCE(SUM(amount::numeric) FILTER (
        WHERE type IN ('user_withdrawal', 'platform_transfer')
          AND status IN ('requested', 'transferring')
      ), 0) AS pending_withdrawal,
      COALESCE(SUM(amount::numeric) FILTER (
        WHERE type IN ('user_withdrawal', 'platform_transfer')
          AND status = 'completed'
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
