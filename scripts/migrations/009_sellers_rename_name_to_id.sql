-- ==========================================================================
-- Migration: 009_sellers_rename_name_to_id.sql
-- Purpose: Rename sellers.name → sellers.id (still text, still PK)
-- ==========================================================================

ALTER TABLE sellers DROP CONSTRAINT sellers_pkey;
ALTER TABLE sellers RENAME COLUMN name TO id;
ALTER TABLE sellers ADD PRIMARY KEY (id);
