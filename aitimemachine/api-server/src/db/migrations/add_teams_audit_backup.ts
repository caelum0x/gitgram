/**
 * Migration: add_teams_audit_backup
 *
 * Adds five new tables to support teams, persistent session sharing,
 * S3 backup job tracking, and async email delivery queuing.
 *
 * NOTE: This file is a reference document — SQL is shown for manual
 * application or to drive a raw `db.execute()` migration runner.
 * The canonical schema lives in src/db/schema.ts (Drizzle); generate
 * the actual migration SQL with:
 *
 *   npx drizzle-kit generate
 *
 * then apply it with:
 *
 *   npx drizzle-kit migrate
 *
 * What already existed (no-op for these tables):
 *   - audit_logs       (added in earlier migration)
 *   - webhook_deliveries (added in earlier migration)
 *
 * Tables added by this migration:
 *   1. teams
 *   2. team_members
 *   3. shared_sessions
 *   4. backup_jobs
 *   5. email_jobs
 */

export const SQL_UP = `
-- ----------------------------------------------------------------
-- 1. teams
--    Sub-groups within an organization. Each team has a unique
--    invite code used to generate shareable join links.
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS teams (
  id            TEXT        PRIMARY KEY,
  org_id        TEXT        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name          TEXT        NOT NULL,
  slug          TEXT        NOT NULL,
  description   TEXT,
  invite_code   TEXT        NOT NULL UNIQUE,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_teams_org
  ON teams (org_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_teams_org_slug
  ON teams (org_id, slug);

CREATE INDEX IF NOT EXISTS idx_teams_invite_code
  ON teams (invite_code);


-- ----------------------------------------------------------------
-- 2. team_members
--    Many-to-many join between teams and users with an explicit
--    role column (admin | member | viewer).
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS team_members (
  id          TEXT        PRIMARY KEY,
  team_id     TEXT        NOT NULL REFERENCES teams(id)  ON DELETE CASCADE,
  user_id     TEXT        NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
  role        TEXT        NOT NULL DEFAULT 'member',
  joined_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_team_members_team
  ON team_members (team_id);

CREATE INDEX IF NOT EXISTS idx_team_members_user
  ON team_members (user_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_team_members_team_user
  ON team_members (team_id, user_id);


-- ----------------------------------------------------------------
-- 3. shared_sessions
--    Persists the in-memory share-link records that previously
--    lived in sharingService.ts. Replaces the Map<> store.
--    share_id is the public-facing random UUID token embedded in
--    share URLs.
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS shared_sessions (
  id          TEXT        PRIMARY KEY,
  session_id  TEXT        NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  share_id    TEXT        NOT NULL UNIQUE,
  visibility  TEXT        NOT NULL DEFAULT 'public',
  team_id     TEXT        REFERENCES teams(id) ON DELETE SET NULL,
  expires_at  TIMESTAMPTZ,
  created_by  TEXT        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  revoked_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shared_sessions_session
  ON shared_sessions (session_id);

CREATE INDEX IF NOT EXISTS idx_shared_sessions_share_id
  ON shared_sessions (share_id);

CREATE INDEX IF NOT EXISTS idx_shared_sessions_created_by
  ON shared_sessions (created_by);

CREATE INDEX IF NOT EXISTS idx_shared_sessions_expires
  ON shared_sessions (expires_at);


-- ----------------------------------------------------------------
-- 4. backup_jobs
--    Tracks every S3 upload attempt made by backupService.ts.
--    Enables retry logic, audit visibility, and storage accounting.
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS backup_jobs (
  id           TEXT        PRIMARY KEY,
  session_id   TEXT        NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  user_id      TEXT        NOT NULL REFERENCES users(id),
  key          TEXT        NOT NULL,
  size         BIGINT      NOT NULL DEFAULT 0,
  status       TEXT        NOT NULL DEFAULT 'pending',
  error        TEXT,
  uploaded_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_backup_jobs_session
  ON backup_jobs (session_id);

CREATE INDEX IF NOT EXISTS idx_backup_jobs_user
  ON backup_jobs (user_id);

CREATE INDEX IF NOT EXISTS idx_backup_jobs_status
  ON backup_jobs (status);

CREATE INDEX IF NOT EXISTS idx_backup_jobs_created
  ON backup_jobs (created_at);


-- ----------------------------------------------------------------
-- 5. email_jobs
--    Persistent queue for outbound emails. Allows retry on
--    transient provider failures and provides a delivery audit
--    trail. The email service worker polls for pending rows
--    where next_attempt_at <= NOW() and attempts < max_attempts.
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS email_jobs (
  id               TEXT        PRIMARY KEY,
  "to"             TEXT        NOT NULL,
  subject          TEXT        NOT NULL,
  html_body        TEXT        NOT NULL,
  text_body        TEXT,
  from_address     TEXT,
  priority         INTEGER     NOT NULL DEFAULT 0,
  status           TEXT        NOT NULL DEFAULT 'pending',
  attempts         INTEGER     NOT NULL DEFAULT 0,
  max_attempts     INTEGER     NOT NULL DEFAULT 3,
  next_attempt_at  TIMESTAMPTZ DEFAULT NOW(),
  last_attempt_at  TIMESTAMPTZ,
  sent_at          TIMESTAMPTZ,
  error            TEXT,
  external_id      TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_jobs_status
  ON email_jobs (status);

CREATE INDEX IF NOT EXISTS idx_email_jobs_next_attempt
  ON email_jobs (next_attempt_at);

CREATE INDEX IF NOT EXISTS idx_email_jobs_priority
  ON email_jobs (priority);

CREATE INDEX IF NOT EXISTS idx_email_jobs_created
  ON email_jobs (created_at);
`;

export const SQL_DOWN = `
DROP TABLE IF EXISTS email_jobs;
DROP TABLE IF EXISTS backup_jobs;
DROP TABLE IF EXISTS shared_sessions;
DROP TABLE IF EXISTS team_members;
DROP TABLE IF EXISTS teams;
`;
