-- ==========================================================================
-- Migration: 006_amount_columns_to_text.sql
-- Purpose:
--   Change `amount` columns from `numeric` to `text` in deposits,
--   private_bids, and transfers tables.
--
--   PostgreSQL `numeric` maps to TypeScript `number` via Supabase codegen,
--   but Wei values (up to 256-bit) overflow JS Number.MAX_SAFE_INTEGER.
--   Storing as `text` gives `string` in TypeScript, matching how the
--   application handles these values.
--
--   The `balances` view and check constraints are recreated to cast
--   text→numeric for arithmetic operations.
-- ==========================================================================

-- 1. Drop the balances view (depends on amount columns)
DROP VIEW IF EXISTS balances;

-- 2. Drop check constraints that reference amount as numeric
ALTER TABLE deposits DROP CONSTRAINT IF EXISTS deposits_amount_positive;
ALTER TABLE private_bids DROP CONSTRAINT IF EXISTS pb_amount_positive;
ALTER TABLE transfers DROP CONSTRAINT IF EXISTS transfers_amount_positive;

-- 3. Alter columns from numeric to text
ALTER TABLE deposits ALTER COLUMN amount TYPE text USING amount::text;
ALTER TABLE private_bids ALTER COLUMN amount TYPE text USING amount::text;
ALTER TABLE transfers ALTER COLUMN amount TYPE text USING amount::text;

-- 4. Recreate check constraints with explicit cast
ALTER TABLE deposits ADD CONSTRAINT deposits_amount_positive CHECK (amount::numeric > 0);
ALTER TABLE private_bids ADD CONSTRAINT pb_amount_positive CHECK (amount::numeric > 0);
ALTER TABLE transfers ADD CONSTRAINT transfers_amount_positive CHECK (amount::numeric > 0);

-- 5. Recreate balances view with text→numeric casts for arithmetic
CREATE VIEW balances AS
SELECT
  d.user_address,
  (
    COALESCE(d.total_deposited, 0) -
    COALESCE(b.locked_balance, 0) -
    COALESCE(b.spent_on_wins, 0) -
    COALESCE(w.pending_withdrawal, 0) -
    COALESCE(w.completed_withdrawals, 0)
  )::text AS available_balance,
  COALESCE(b.locked_balance, 0)::text AS locked_balance,
  COALESCE(w.pending_withdrawal, 0)::text AS pending_withdrawal
FROM (
  SELECT user_address, sum(amount::numeric) AS total_deposited
  FROM deposits
  WHERE status = 'confirmed' AND user_address IS NOT NULL
  GROUP BY user_address
) d
LEFT JOIN (
  SELECT
    bidder_address AS user_address,
    COALESCE(sum(amount::numeric) FILTER (WHERE status = 'active'), 0) AS locked_balance,
    COALESCE(sum(amount::numeric) FILTER (WHERE status = 'won'), 0) AS spent_on_wins
  FROM private_bids
  GROUP BY bidder_address
) b ON b.user_address = d.user_address
LEFT JOIN (
  SELECT
    user_address,
    COALESCE(sum(amount::numeric) FILTER (WHERE status IN ('requested', 'transferring')), 0) AS pending_withdrawal,
    COALESCE(sum(amount::numeric) FILTER (WHERE status = 'completed'), 0) AS completed_withdrawals
  FROM transfers
  GROUP BY user_address
) w ON w.user_address = d.user_address;
