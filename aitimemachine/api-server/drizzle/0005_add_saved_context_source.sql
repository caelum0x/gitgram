-- Migration: add `source` to saved_contexts for the unified AITM memory layer
-- Source: vendored-merge (beads + context7 feed AITM memory)
-- Notes:
--  - beads tasks ingest with source='task'; context7 docs with source='library';
--    conversation snapshots keep source='conversation'; checkpoint memory 'checkpoint'.
--  - Additive + idempotent. Existing rows backfill to 'conversation' via the default.
--  - Enforced as a plain TEXT column (the schema uses no pgEnum); allowed values are
--    validated at the TypeScript layer (SAVED_CONTEXT_SOURCES).

ALTER TABLE saved_contexts
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'conversation';

CREATE INDEX IF NOT EXISTS idx_saved_contexts_source
  ON saved_contexts (source);
