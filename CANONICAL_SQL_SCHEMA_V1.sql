-- Canonical SQL Schema v1
-- Unified model for Gitgram + AITimeMachine + Governance
-- Source document: NORTH_STAR_PRD_ARCHITECTURE_V1.md

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS vector;

-- =========================
-- Core Identity / Tenancy
-- =========================

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  handle TEXT NOT NULL UNIQUE,
  display_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  created_by_user_id UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS organization_memberships (
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'member')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, user_id)
);

CREATE TABLE IF NOT EXISTS api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  scopes JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((user_id IS NOT NULL) OR (organization_id IS NOT NULL))
);

-- =========================
-- Repository / Project Map
-- =========================

CREATE TABLE IF NOT EXISTS repositories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  github_node_id TEXT UNIQUE,
  github_owner TEXT NOT NULL,
  github_name TEXT NOT NULL,
  full_name TEXT NOT NULL UNIQUE,
  is_private BOOLEAN NOT NULL DEFAULT false,
  default_branch TEXT,
  description TEXT,
  stars_count BIGINT NOT NULL DEFAULT 0,
  forks_count BIGINT NOT NULL DEFAULT 0,
  imported_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  owner_user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  local_path TEXT,
  is_archived BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((organization_id IS NOT NULL) OR (owner_user_id IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS project_repositories (
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  repository_id UUID NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, repository_id)
);

-- =========================
-- Gitgram Social Layer
-- =========================

CREATE TABLE IF NOT EXISTS repo_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repository_id UUID NOT NULL UNIQUE REFERENCES repositories(id) ON DELETE CASCADE,
  headline TEXT,
  bio TEXT,
  hero_media_url TEXT,
  visibility TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'unlisted', 'private')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  repository_id UUID REFERENCES repositories(id) ON DELETE SET NULL,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  type TEXT NOT NULL CHECK (type IN ('post', 'reel', 'story', 'change_story', 'snippet')),
  caption TEXT,
  code_snippet TEXT,
  language TEXT,
  linked_checkpoint_id TEXT,
  visibility TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'followers', 'private')),
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS post_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  media_type TEXT NOT NULL CHECK (media_type IN ('image', 'video', 'gif')),
  storage_key TEXT NOT NULL,
  mime_type TEXT,
  width INTEGER,
  height INTEGER,
  duration_ms INTEGER,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  author_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  parent_comment_id UUID REFERENCES comments(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL CHECK (target_type IN ('post', 'comment', 'repository')),
  target_id UUID NOT NULL,
  reaction TEXT NOT NULL CHECK (reaction IN ('like', 'love', 'fire', 'clap', 'rocket')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, target_type, target_id, reaction)
);

CREATE TABLE IF NOT EXISTS follows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL CHECK (target_type IN ('user', 'repository')),
  target_user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  target_repository_id UUID REFERENCES repositories(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (
    (target_type = 'user' AND target_user_id IS NOT NULL AND target_repository_id IS NULL) OR
    (target_type = 'repository' AND target_repository_id IS NOT NULL AND target_user_id IS NULL)
  )
);

CREATE TABLE IF NOT EXISTS trend_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repository_id UUID NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  window_start TIMESTAMPTZ NOT NULL,
  window_end TIMESTAMPTZ NOT NULL,
  score NUMERIC(12,4) NOT NULL,
  signals JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (repository_id, window_start, window_end)
);

-- =========================
-- AITM Time Layer
-- =========================

CREATE TABLE IF NOT EXISTS blobs (
  hash TEXT PRIMARY KEY,
  content BYTEA NOT NULL,
  size BIGINT NOT NULL,
  compression TEXT NOT NULL DEFAULT 'brotli',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS trees (
  hash TEXT PRIMARY KEY,
  entries JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS checkpoints (
  id TEXT PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  parent_id TEXT REFERENCES checkpoints(id) ON DELETE SET NULL,
  linked_checkpoint_id TEXT REFERENCES checkpoints(id) ON DELETE SET NULL,
  tree_hash TEXT NOT NULL REFERENCES trees(hash),
  trigger_type TEXT NOT NULL CHECK (trigger_type IN ('manual', 'auto', 'before_action', 'after_action', 'restore')),
  trigger_tool TEXT,
  description TEXT,
  session_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_posts_linked_checkpoint'
  ) THEN
    ALTER TABLE posts
      ADD CONSTRAINT fk_posts_linked_checkpoint
      FOREIGN KEY (linked_checkpoint_id)
      REFERENCES checkpoints(id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS checkpoint_files (
  checkpoint_id TEXT NOT NULL REFERENCES checkpoints(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  blob_hash TEXT REFERENCES blobs(hash),
  size BIGINT,
  mode INTEGER,
  mtime_ms BIGINT,
  change_type TEXT NOT NULL CHECK (change_type IN ('added', 'modified', 'deleted', 'unchanged')),
  PRIMARY KEY (checkpoint_id, file_path)
);

CREATE TABLE IF NOT EXISTS diffs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_checkpoint_id TEXT NOT NULL REFERENCES checkpoints(id) ON DELETE CASCADE,
  to_checkpoint_id TEXT NOT NULL REFERENCES checkpoints(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  diff_content TEXT NOT NULL,
  stats JSONB NOT NULL DEFAULT '{}'::jsonb,
  algorithm TEXT NOT NULL DEFAULT 'histogram',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =========================
-- AITM Context Layer
-- =========================

CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL,
  checkpoint_id TEXT REFERENCES checkpoints(id) ON DELETE SET NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tool_calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID REFERENCES messages(id) ON DELETE SET NULL,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL,
  checkpoint_before_id TEXT REFERENCES checkpoints(id) ON DELETE SET NULL,
  checkpoint_after_id TEXT REFERENCES checkpoints(id) ON DELETE SET NULL,
  tool_name TEXT NOT NULL,
  arguments JSONB NOT NULL DEFAULT '{}'::jsonb,
  result JSONB,
  success BOOLEAN,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS contexts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  checkpoint_id TEXT NOT NULL REFERENCES checkpoints(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL,
  summary TEXT,
  active_files JSONB NOT NULL DEFAULT '[]'::jsonb,
  cursor_position JSONB,
  current_task TEXT,
  goals JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS restore_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  from_checkpoint_id TEXT REFERENCES checkpoints(id) ON DELETE SET NULL,
  to_checkpoint_id TEXT REFERENCES checkpoints(id) ON DELETE SET NULL,
  scope_type TEXT NOT NULL CHECK (scope_type IN ('file', 'folder', 'project')),
  scope_path TEXT,
  status TEXT NOT NULL CHECK (status IN ('requested', 'applied', 'failed')),
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =========================
-- AITM Augmented Layer
-- =========================

CREATE TABLE IF NOT EXISTS embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  checkpoint_id TEXT REFERENCES checkpoints(id) ON DELETE SET NULL,
  source_type TEXT NOT NULL CHECK (source_type IN ('code', 'message', 'doc')),
  file_path TEXT,
  chunk_text TEXT NOT NULL,
  chunk_start_line INTEGER,
  chunk_end_line INTEGER,
  embedding vector(1536) NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS indexed_docs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  title TEXT,
  content TEXT NOT NULL,
  embedding vector(1536),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  indexed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =========================
-- Governance / Compliance
-- =========================

CREATE TABLE IF NOT EXISTS consents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  granted_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  consent_type TEXT NOT NULL CHECK (consent_type IN ('operational_capture', 'training_export')),
  granted BOOLEAN NOT NULL,
  effective_from TIMESTAMPTZ NOT NULL DEFAULT now(),
  effective_to TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((organization_id IS NOT NULL) OR (project_id IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS retention_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  data_class TEXT NOT NULL CHECK (data_class IN ('checkpoints', 'messages', 'tool_calls', 'social_media', 'exports', 'audit_logs')),
  retention_days INTEGER NOT NULL CHECK (retention_days > 0),
  hard_delete BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((organization_id IS NOT NULL) OR (project_id IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS export_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  requested_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  consent_id UUID REFERENCES consents(id) ON DELETE SET NULL,
  export_type TEXT NOT NULL CHECK (export_type IN ('training', 'compliance', 'backup')),
  status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'completed', 'failed', 'cancelled')),
  redaction_profile TEXT NOT NULL DEFAULT 'default',
  artifact_uri TEXT,
  summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS data_delete_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL CHECK (target_type IN ('user_data', 'project_data', 'export_data')),
  status TEXT NOT NULL CHECK (status IN ('requested', 'approved', 'processing', 'completed', 'rejected')),
  reason TEXT,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  actor_api_key_id UUID REFERENCES api_keys(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT,
  ip_address INET,
  user_agent TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =========================
-- Indexes
-- =========================

CREATE INDEX IF NOT EXISTS idx_projects_org ON projects(organization_id);
CREATE INDEX IF NOT EXISTS idx_projects_owner ON projects(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_project_repo_repo ON project_repositories(repository_id);
CREATE INDEX IF NOT EXISTS idx_posts_repo_created ON posts(repository_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_author_created ON posts(author_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_comments_post_created ON comments(post_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reactions_target ON reactions(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_follows_target_user ON follows(target_user_id);
CREATE INDEX IF NOT EXISTS idx_follows_target_repo ON follows(target_repository_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_follows_user_target
  ON follows(follower_user_id, target_user_id)
  WHERE target_type = 'user';
CREATE UNIQUE INDEX IF NOT EXISTS uq_follows_repo_target
  ON follows(follower_user_id, target_repository_id)
  WHERE target_type = 'repository';
CREATE INDEX IF NOT EXISTS idx_trend_scores_repo_window ON trend_scores(repository_id, window_end DESC);

CREATE INDEX IF NOT EXISTS idx_checkpoints_project_created ON checkpoints(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_checkpoints_session ON checkpoints(session_id);
CREATE INDEX IF NOT EXISTS idx_checkpoint_files_path ON checkpoint_files(file_path);
CREATE INDEX IF NOT EXISTS idx_diffs_from_to ON diffs(from_checkpoint_id, to_checkpoint_id);
CREATE INDEX IF NOT EXISTS idx_messages_project_session ON messages(project_id, session_id, created_at);
CREATE INDEX IF NOT EXISTS idx_messages_checkpoint ON messages(checkpoint_id);
CREATE INDEX IF NOT EXISTS idx_tool_calls_project_session ON tool_calls(project_id, session_id, created_at);
CREATE INDEX IF NOT EXISTS idx_contexts_checkpoint ON contexts(checkpoint_id);
CREATE INDEX IF NOT EXISTS idx_restore_events_project_created ON restore_events(project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_embeddings_project_checkpoint ON embeddings(project_id, checkpoint_id);
CREATE INDEX IF NOT EXISTS idx_embeddings_vector ON embeddings USING ivfflat (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS idx_indexed_docs_project ON indexed_docs(project_id);
CREATE INDEX IF NOT EXISTS idx_consents_scope ON consents(organization_id, project_id, consent_type, effective_from DESC);
CREATE INDEX IF NOT EXISTS idx_retention_scope ON retention_policies(organization_id, project_id, data_class);
CREATE INDEX IF NOT EXISTS idx_export_jobs_project_created ON export_jobs(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_delete_requests_status ON data_delete_requests(status, requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_project_created ON audit_logs(project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_messages_fts
  ON messages USING gin (to_tsvector('english', content));

COMMIT;
