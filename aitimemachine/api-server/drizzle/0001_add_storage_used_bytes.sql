-- Migration: Add storage_used_bytes column to users table
-- This tracks the total storage used by each user in bytes

ALTER TABLE users ADD COLUMN IF NOT EXISTS storage_used_bytes BIGINT DEFAULT 0;

-- Initialize storage_used_bytes for existing users based on their blobs
UPDATE users u
SET storage_used_bytes = COALESCE(
  (SELECT SUM(size) FROM blobs b WHERE b.user_id = u.id),
  0
);

-- Add a comment explaining the column
COMMENT ON COLUMN users.storage_used_bytes IS 'Total storage used by user in bytes. Updated when blobs are uploaded or deleted.';
