-- Migration 003: Add optional Filecoin attachment metadata to secrets
--
-- Stores encrypted file pointers and the decryption key needed by the seller
-- and winning buyer to retrieve and decrypt uploaded attachments.

ALTER TABLE secrets
  ADD COLUMN IF NOT EXISTS encryption_key text,
  ADD COLUMN IF NOT EXISTS encryption_algorithm text,
  ADD COLUMN IF NOT EXISTS file_name text,
  ADD COLUMN IF NOT EXISTS encrypted_file_name text,
  ADD COLUMN IF NOT EXISTS file_content_type text,
  ADD COLUMN IF NOT EXISTS file_md5 text,
  ADD COLUMN IF NOT EXISTS file_size_bytes text,
  ADD COLUMN IF NOT EXISTS encrypted_file_size_bytes text,
  ADD COLUMN IF NOT EXISTS filecoin_piece_cid text,
  ADD COLUMN IF NOT EXISTS filecoin_retrieval_url text,
  ADD COLUMN IF NOT EXISTS filecoin_copies jsonb;
