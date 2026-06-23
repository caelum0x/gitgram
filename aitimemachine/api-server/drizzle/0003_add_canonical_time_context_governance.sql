-- Migration: Canonical v1 foundation (time/context/governance)
-- Source: ../../../../CANONICAL_SQL_SCHEMA_V1.sql
-- Notes:
-- 1) Existing api-server schema uses text IDs for core tables; this migration follows that convention.
-- 2) Only additive, non-breaking changes are applied.

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS vector;

-- Align checkpoints with canonical fields (additive only)
ALTER TABLE checkpoints ADD COLUMN IF NOT EXISTS tree_hash text;
ALTER TABLE checkpoints ADD COLUMN IF NOT EXISTS session_id text;
ALTER TABLE checkpoints ADD COLUMN IF NOT EXISTS trigger_tool text;

-- Merkle trees (canonical time layer)
CREATE TABLE IF NOT EXISTS trees (
  hash text PRIMARY KEY,
  entries jsonb NOT NULL,
  created_at timestamp DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_checkpoints_tree_hash'
  ) THEN
    ALTER TABLE checkpoints
      ADD CONSTRAINT fk_checkpoints_tree_hash
      FOREIGN KEY (tree_hash)
      REFERENCES trees(hash)
      ON DELETE SET NULL;
  END IF;
END $$;

-- File state per checkpoint (canonical)
CREATE TABLE IF NOT EXISTS checkpoint_files (
  checkpoint_id text NOT NULL REFERENCES checkpoints(id) ON DELETE CASCADE,
  file_path text NOT NULL,
  blob_hash text REFERENCES blobs(hash) ON DELETE SET NULL,
  size bigint,
  mode integer,
  mtime_ms bigint,
  change_type text NOT NULL DEFAULT 'unchanged'
    CHECK (change_type IN ('added', 'modified', 'deleted', 'unchanged')),
  PRIMARY KEY (checkpoint_id, file_path)
);

-- Precomputed diffs
CREATE TABLE IF NOT EXISTS diffs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_checkpoint_id text NOT NULL REFERENCES checkpoints(id) ON DELETE CASCADE,
  to_checkpoint_id text NOT NULL REFERENCES checkpoints(id) ON DELETE CASCADE,
  file_path text NOT NULL,
  diff_content text NOT NULL,
  stats jsonb NOT NULL DEFAULT '{}'::jsonb,
  algorithm text NOT NULL DEFAULT 'histogram',
  created_at timestamp DEFAULT now()
);

-- Canonical message stream (separate from existing chat_messages)
CREATE TABLE IF NOT EXISTS messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  session_id text NOT NULL,
  checkpoint_id text REFERENCES checkpoints(id) ON DELETE SET NULL,
  role text NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp DEFAULT now()
);

-- Context snapshots linked to checkpoints
CREATE TABLE IF NOT EXISTS contexts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  checkpoint_id text NOT NULL REFERENCES checkpoints(id) ON DELETE CASCADE,
  session_id text NOT NULL,
  summary text,
  active_files jsonb NOT NULL DEFAULT '[]'::jsonb,
  cursor_position jsonb,
  current_task text,
  goals jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamp DEFAULT now()
);

-- Restore operations log
CREATE TABLE IF NOT EXISTS restore_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  actor_user_id text REFERENCES users(id) ON DELETE SET NULL,
  from_checkpoint_id text REFERENCES checkpoints(id) ON DELETE SET NULL,
  to_checkpoint_id text REFERENCES checkpoints(id) ON DELETE SET NULL,
  scope_type text NOT NULL CHECK (scope_type IN ('file', 'folder', 'project')),
  scope_path text,
  status text NOT NULL CHECK (status IN ('requested', 'applied', 'failed')),
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp DEFAULT now()
);

-- Unified embeddings table (canonical)
CREATE TABLE IF NOT EXISTS embeddings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  checkpoint_id text REFERENCES checkpoints(id) ON DELETE SET NULL,
  source_type text NOT NULL CHECK (source_type IN ('code', 'message', 'doc')),
  file_path text,
  chunk_text text NOT NULL,
  chunk_start_line integer,
  chunk_end_line integer,
  embedding vector(1536),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp DEFAULT now()
);

-- Indexed docs
CREATE TABLE IF NOT EXISTS indexed_docs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  url text NOT NULL,
  title text,
  content text NOT NULL,
  embedding vector(1536),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  indexed_at timestamp DEFAULT now()
);

-- Governance entities
CREATE TABLE IF NOT EXISTS consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text REFERENCES organizations(id) ON DELETE CASCADE,
  project_id text REFERENCES projects(id) ON DELETE CASCADE,
  granted_by_user_id text REFERENCES users(id) ON DELETE SET NULL,
  consent_type text NOT NULL CHECK (consent_type IN ('operational_capture', 'training_export')),
  granted boolean NOT NULL,
  effective_from timestamp NOT NULL DEFAULT now(),
  effective_to timestamp,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp DEFAULT now(),
  CHECK ((organization_id IS NOT NULL) OR (project_id IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS retention_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text REFERENCES organizations(id) ON DELETE CASCADE,
  project_id text REFERENCES projects(id) ON DELETE CASCADE,
  data_class text NOT NULL
    CHECK (data_class IN ('checkpoints', 'messages', 'tool_calls', 'social_media', 'exports', 'audit_logs')),
  retention_days integer NOT NULL CHECK (retention_days > 0),
  hard_delete boolean NOT NULL DEFAULT false,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now(),
  CHECK ((organization_id IS NOT NULL) OR (project_id IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS export_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  requested_by_user_id text REFERENCES users(id) ON DELETE SET NULL,
  consent_id uuid REFERENCES consents(id) ON DELETE SET NULL,
  export_type text NOT NULL CHECK (export_type IN ('training', 'compliance', 'backup')),
  status text NOT NULL CHECK (status IN ('queued', 'running', 'completed', 'failed', 'cancelled')),
  redaction_profile text NOT NULL DEFAULT 'default',
  artifact_uri text,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp DEFAULT now(),
  completed_at timestamp
);

CREATE TABLE IF NOT EXISTS data_delete_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_user_id text REFERENCES users(id) ON DELETE SET NULL,
  organization_id text REFERENCES organizations(id) ON DELETE CASCADE,
  project_id text REFERENCES projects(id) ON DELETE CASCADE,
  target_type text NOT NULL CHECK (target_type IN ('user_data', 'project_data', 'export_data')),
  status text NOT NULL CHECK (status IN ('requested', 'approved', 'processing', 'completed', 'rejected')),
  reason text,
  requested_at timestamp DEFAULT now(),
  completed_at timestamp
);

-- Useful indexes
CREATE INDEX IF NOT EXISTS idx_checkpoint_files_path ON checkpoint_files(file_path);
CREATE INDEX IF NOT EXISTS idx_diffs_from_to ON diffs(from_checkpoint_id, to_checkpoint_id);
CREATE INDEX IF NOT EXISTS idx_messages_project_session ON messages(project_id, session_id, created_at);
CREATE INDEX IF NOT EXISTS idx_messages_checkpoint ON messages(checkpoint_id);
CREATE INDEX IF NOT EXISTS idx_contexts_checkpoint ON contexts(checkpoint_id);
CREATE INDEX IF NOT EXISTS idx_restore_events_project_created ON restore_events(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_embeddings_project_checkpoint ON embeddings(project_id, checkpoint_id);
CREATE INDEX IF NOT EXISTS idx_indexed_docs_project ON indexed_docs(project_id);
CREATE INDEX IF NOT EXISTS idx_consents_scope ON consents(organization_id, project_id, consent_type, effective_from DESC);
CREATE INDEX IF NOT EXISTS idx_retention_scope ON retention_policies(organization_id, project_id, data_class);
CREATE INDEX IF NOT EXISTS idx_export_jobs_project_created ON export_jobs(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_delete_requests_status ON data_delete_requests(status, requested_at DESC);

CREATE INDEX IF NOT EXISTS idx_messages_fts
  ON messages USING gin (to_tsvector('english', content));

CREATE INDEX IF NOT EXISTS idx_embeddings_vector
  ON embeddings USING ivfflat (embedding vector_cosine_ops);
