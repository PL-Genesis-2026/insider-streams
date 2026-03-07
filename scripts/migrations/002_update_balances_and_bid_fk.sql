-- ==========================================================================
-- Migration 002: Update balances view, make auction_id PK on secrets,
-- add FK from private_bids to secrets
--
-- Changes:
--   1. Drop uuid `id` column from secrets, make `auction_id` the PK
--   2. Add FK from private_bids.auction_id → secrets.auction_id
--   3. Rebuild balances view with:
--      - seller earnings (total_from_won_bids) via private_bids → secrets → sellers join
--      - UNION-based all_users so users with only bids/earnings (no transfers) appear
--      - Renamed internal aliases (total_transferred_in, total_transferred_out)
--      - Preserved output column names for backward compatibility
-- ==========================================================================

-- ==========================================================================
-- 1. Make auction_id the PK of secrets (drop uuid id column)
-- ==========================================================================
-- auction_id already has a UNIQUE constraint, so this is safe.
-- Drop the existing PK first, then promote auction_id.

ALTER TABLE secrets DROP CONSTRAINT secrets_pkey;
ALTER TABLE secrets ADD PRIMARY KEY (auction_id);
ALTER TABLE secrets DROP COLUMN id;

-- Drop the now-redundant unique constraint on auction_id (PK implies uniqueness)
ALTER TABLE secrets DROP CONSTRAINT IF EXISTS secrets_auction_id_key;

-- ==========================================================================
-- 2. Add FK from private_bids.auction_id → secrets.auction_id
-- ==========================================================================
-- Ensures bids can only reference existing auctions with secrets data.

ALTER TABLE private_bids
  ADD CONSTRAINT pb_auction_id_fk FOREIGN KEY (auction_id) REFERENCES secrets (auction_id);

-- ==========================================================================
-- 3. Rebuild balances view
-- ==========================================================================
-- Key improvements:
--   - all_users UNION ensures users appear even if they only have bids or seller earnings
--   - seller_totals CTE joins private_bids → secrets → sellers to credit seller earnings
--   - total_from_won_bids is both a display column and part of available_balance formula

CREATE OR REPLACE VIEW balances AS
WITH transfer_totals AS (
  SELECT
    user_address,
    COALESCE(SUM(amount::numeric) FILTER (WHERE status = 'confirmed'), 0) AS total_transferred_in,
    COALESCE(SUM(amount::numeric) FILTER (WHERE status IN ('requested', 'transferring')), 0) AS pending_withdrawal,
    COALESCE(SUM(amount::numeric) FILTER (WHERE status = 'completed'), 0) AS total_transferred_out
  FROM transfers
  WHERE user_address IS NOT NULL
  GROUP BY user_address
),
buyer_totals AS (
  SELECT
    bidder_address AS user_address,
    COALESCE(SUM(amount::numeric) FILTER (WHERE status = 'active'), 0) AS locked_balance,
    COALESCE(SUM(amount::numeric) FILTER (WHERE status = 'won'), 0) AS spent_on_wins
  FROM private_bids
  GROUP BY bidder_address
),
seller_totals AS (
  SELECT
    s.address AS user_address,
    COALESCE(SUM(pb.amount::numeric), 0) AS total_from_won_bids
  FROM private_bids pb
  JOIN secrets sec ON sec.auction_id = pb.auction_id
  JOIN sellers s ON s.id = sec.seller_id
  WHERE pb.status = 'won'
  GROUP BY s.address
),
all_users AS (
  SELECT user_address FROM transfer_totals
  UNION
  SELECT user_address FROM buyer_totals
  UNION
  SELECT user_address FROM seller_totals
)
SELECT
  u.user_address,
  (COALESCE(t.total_transferred_in, 0)
    + COALESCE(se.total_from_won_bids, 0)
    - COALESCE(b.locked_balance, 0)
    - COALESCE(b.spent_on_wins, 0)
    - COALESCE(t.pending_withdrawal, 0)
    - COALESCE(t.total_transferred_out, 0))::text AS available_balance,
  COALESCE(b.locked_balance, 0)::text AS locked_balance,
  COALESCE(t.pending_withdrawal, 0)::text AS pending_withdrawal,
  COALESCE(se.total_from_won_bids, 0)::text AS total_from_won_bids
FROM all_users u
LEFT JOIN transfer_totals t ON t.user_address = u.user_address
LEFT JOIN buyer_totals b ON b.user_address = u.user_address
LEFT JOIN seller_totals se ON se.user_address = u.user_address;

-- Re-apply security_invoker so only service_role can query
ALTER VIEW balances SET (security_invoker = true);
