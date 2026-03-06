-- ==========================================================================
-- Migration: 004_rename_withdrawals_to_transfers.sql
-- Supabase project: jeyudbkttazpifxvzqvq
-- Purpose:
--   1. Rename private_withdrawals → transfers
--   2. Add type column (default 'user_withdrawal')
--   3. Rename constraints, indexes, trigger
--   4. Recreate balances view with new table name
-- ==========================================================================

-- ==========================================================================
-- RENAME TABLE
-- ==========================================================================

ALTER TABLE private_withdrawals RENAME TO transfers;

-- ==========================================================================
-- ADD TYPE COLUMN
-- ==========================================================================
-- Tracks the nature of the transfer. Defaults to 'user_withdrawal' for
-- backward compatibility with existing rows.

ALTER TABLE transfers ADD COLUMN type text NOT NULL DEFAULT 'user_withdrawal'
  CHECK (type IN ('user_withdrawal', 'platform_transfer'));

-- ==========================================================================
-- RENAME CONSTRAINTS, INDEXES, TRIGGER
-- ==========================================================================

ALTER TABLE transfers RENAME CONSTRAINT pw_user_addr TO transfers_user_addr;
ALTER TABLE transfers RENAME CONSTRAINT pw_amount_positive TO transfers_amount_positive;

ALTER INDEX idx_pw_user RENAME TO idx_transfers_user;
ALTER INDEX idx_pw_status RENAME TO idx_transfers_status;

CREATE INDEX idx_transfers_type ON transfers (type);

ALTER TRIGGER private_withdrawals_updated_at ON transfers
  RENAME TO transfers_updated_at;

-- ==========================================================================
-- RECREATE BALANCES VIEW (references transfers instead of private_withdrawals)
-- ==========================================================================

CREATE OR REPLACE VIEW balances AS
SELECT
  d.user_address,
  (COALESCE(d.total_deposited, 0)
    - COALESCE(b.locked_balance, 0)
    - COALESCE(b.spent_on_wins, 0)
    - COALESCE(w.pending_withdrawal, 0)
    - COALESCE(w.completed_withdrawals, 0))::text
    AS available_balance,
  COALESCE(b.locked_balance, 0)::text AS locked_balance,
  COALESCE(w.pending_withdrawal, 0)::text AS pending_withdrawal
FROM
  (
    SELECT user_address, SUM(amount) AS total_deposited
    FROM deposits
    WHERE status = 'confirmed' AND user_address IS NOT NULL
    GROUP BY user_address
  ) d
LEFT JOIN
  (
    SELECT
      bidder_address AS user_address,
      COALESCE(SUM(amount) FILTER (WHERE status = 'active'), 0) AS locked_balance,
      COALESCE(SUM(amount) FILTER (WHERE status = 'won'), 0) AS spent_on_wins
    FROM private_bids
    GROUP BY bidder_address
  ) b ON b.user_address = d.user_address
LEFT JOIN
  (
    SELECT
      user_address,
      COALESCE(SUM(amount) FILTER (WHERE status IN ('requested', 'transferring')), 0) AS pending_withdrawal,
      COALESCE(SUM(amount) FILTER (WHERE status = 'completed'), 0) AS completed_withdrawals
    FROM transfers
    GROUP BY user_address
  ) w ON w.user_address = d.user_address;
