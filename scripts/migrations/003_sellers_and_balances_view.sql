-- ==========================================================================
-- Migration: 003_sellers_and_balances_view.sql
-- Supabase project: jeyudbkttazpifxvzqvq
-- Purpose:
--   1. Create sellers table (name PK, address indexed)
--   2. Convert balances from a table to a computed view derived from
--      deposits, private_bids, and private_withdrawals
-- ==========================================================================

-- ==========================================================================
-- TABLE: sellers
-- ==========================================================================
-- Stores seller identity. Name is the primary key and must be unique.

CREATE TABLE sellers (
  name            text PRIMARY KEY,
  address         text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sellers_addr CHECK (address ~* '^0x[a-f0-9]{40}$')
);

CREATE INDEX idx_sellers_address ON sellers (address);

CREATE TRIGGER sellers_updated_at
  BEFORE UPDATE ON sellers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE sellers ENABLE ROW LEVEL SECURITY;

-- ==========================================================================
-- VIEW: balances (replaces table)
-- ==========================================================================
-- Formula:
--   available = total_deposited - locked_in_active_bids - spent_on_won_bids
--               - pending_withdrawals - completed_withdrawals
--   locked    = SUM(active bids)
--   pending   = SUM(requested/transferring withdrawals)
--
-- Performance: 3 indexed subqueries with predicate pushdown. Sub-1ms at
-- hackathon scale.

DROP TRIGGER IF EXISTS balances_updated_at ON balances;
DROP TABLE IF EXISTS balances;

-- Columns are cast to text so PostgREST returns strings (not JS numbers).
-- This preserves precision for 18-decimal token amounts and matches the
-- original balances table's PostgREST behavior (numeric(78,0) → string).
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
    FROM private_withdrawals
    GROUP BY user_address
  ) w ON w.user_address = d.user_address;
