-- ==========================================================================
-- Migration: 005_unique_transfer_tx_id.sql
-- Purpose:
--   1. Rename transfers.transfer_tx_id → transfers.transaction_id
--      (consistent with deposits.transaction_id)
--   2. Add UNIQUE constraint so batch inserts with
--      Prefer: resolution=ignore-duplicates, on_conflict=transaction_id work.
--      Must be a real UNIQUE constraint (not a partial index) for PostgREST.
-- ==========================================================================

ALTER TABLE transfers RENAME COLUMN transfer_tx_id TO transaction_id;

ALTER TABLE transfers ADD CONSTRAINT transfers_transaction_id_unique UNIQUE (transaction_id);
