-- Migration: add structured test/build status columns to `checkpoints`
-- Source: api-server last-green detection (routes/restore.ts) — replaces fuzzy
--   name-substring matching ('green'/'passed'/'success') with an authoritative
--   boolean signal so test-status-based green checkpoints are found reliably.
-- Notes:
--  - tests_passed: nullable boolean. null = unknown, true = tests passed,
--    false = tests failed. This is the column last-green detection queries.
--  - test_status: richer label (passed | failed | unknown | skipped).
--  - Additive + idempotent (ADD COLUMN IF NOT EXISTS). Existing rows get NULL
--    (= unknown), and the last-green endpoint falls back to name matching for
--    those legacy checkpoints.

ALTER TABLE checkpoints ADD COLUMN IF NOT EXISTS tests_passed BOOLEAN;
ALTER TABLE checkpoints ADD COLUMN IF NOT EXISTS test_status TEXT;

-- Partial index to make "most recent passing checkpoint per project" cheap.
CREATE INDEX IF NOT EXISTS idx_checkpoints_tests_passed
  ON checkpoints (project_id, user_id, created_at)
  WHERE tests_passed = true;
