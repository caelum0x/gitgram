-- Migration: Canonical v1 social layer for Gitgram
-- Source: ../../../../CANONICAL_SQL_SCHEMA_V1.sql
-- Notes:
-- 1) Existing users/repositories/projects tables use text IDs.
-- 2) Social tables are additive and reference existing entities.

-- Canonical membership mapping (kept separate from existing org_members)
CREATE TABLE IF NOT EXISTS organization_memberships (
  organization_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('owner', 'admin', 'member')),
  created_at timestamp DEFAULT now(),
  PRIMARY KEY (organization_id, user_id)
);

-- Canonical project/repository mapping table
CREATE TABLE IF NOT EXISTS project_repositories (
  project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  repository_id text NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  created_at timestamp DEFAULT now(),
  PRIMARY KEY (project_id, repository_id)
);

CREATE TABLE IF NOT EXISTS repo_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  repository_id text NOT NULL UNIQUE REFERENCES repositories(id) ON DELETE CASCADE,
  headline text,
  bio text,
  hero_media_url text,
  visibility text NOT NULL DEFAULT 'public'
    CHECK (visibility IN ('public', 'unlisted', 'private')),
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  repository_id text REFERENCES repositories(id) ON DELETE SET NULL,
  project_id text REFERENCES projects(id) ON DELETE SET NULL,
  type text NOT NULL CHECK (type IN ('post', 'reel', 'story', 'change_story', 'snippet')),
  caption text,
  code_snippet text,
  language text,
  linked_checkpoint_id text REFERENCES checkpoints(id) ON DELETE SET NULL,
  visibility text NOT NULL DEFAULT 'public'
    CHECK (visibility IN ('public', 'followers', 'private')),
  published_at timestamp,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS post_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  media_type text NOT NULL CHECK (media_type IN ('image', 'video', 'gif')),
  storage_key text NOT NULL,
  mime_type text,
  width integer,
  height integer,
  duration_ms integer,
  position integer NOT NULL DEFAULT 0,
  created_at timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  author_user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  parent_comment_id uuid REFERENCES comments(id) ON DELETE CASCADE,
  body text NOT NULL,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_type text NOT NULL CHECK (target_type IN ('post', 'comment', 'repository')),
  target_id text NOT NULL,
  reaction text NOT NULL CHECK (reaction IN ('like', 'love', 'fire', 'clap', 'rocket')),
  created_at timestamp DEFAULT now(),
  UNIQUE (user_id, target_type, target_id, reaction)
);

CREATE TABLE IF NOT EXISTS follows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_type text NOT NULL CHECK (target_type IN ('user', 'repository')),
  target_user_id text REFERENCES users(id) ON DELETE CASCADE,
  target_repository_id text REFERENCES repositories(id) ON DELETE CASCADE,
  created_at timestamp DEFAULT now(),
  CHECK (
    (target_type = 'user' AND target_user_id IS NOT NULL AND target_repository_id IS NULL) OR
    (target_type = 'repository' AND target_repository_id IS NOT NULL AND target_user_id IS NULL)
  )
);

CREATE TABLE IF NOT EXISTS trend_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  repository_id text NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  window_start timestamp NOT NULL,
  window_end timestamp NOT NULL,
  score numeric(12,4) NOT NULL,
  signals jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp DEFAULT now(),
  UNIQUE (repository_id, window_start, window_end)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_project_repo_repo ON project_repositories(repository_id);
CREATE INDEX IF NOT EXISTS idx_posts_repo_created ON posts(repository_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_author_created ON posts(author_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_comments_post_created ON comments(post_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reactions_target ON reactions(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_follows_target_user ON follows(target_user_id);
CREATE INDEX IF NOT EXISTS idx_follows_target_repo ON follows(target_repository_id);
CREATE INDEX IF NOT EXISTS idx_trend_scores_repo_window ON trend_scores(repository_id, window_end DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_follows_user_target
  ON follows(follower_user_id, target_user_id)
  WHERE target_type = 'user';

CREATE UNIQUE INDEX IF NOT EXISTS uq_follows_repo_target
  ON follows(follower_user_id, target_repository_id)
  WHERE target_type = 'repository';
