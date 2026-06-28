-- Migration: add `user_settings` for the website account + dashboard settings pages
-- Source: aitm-website production wiring (settings/page.tsx, dashboard/settings/page.tsx)
-- Notes:
--  - One row per user (PK = user_id, cascades on user delete).
--  - Stores account preferences (display name, sync/email toggles) and dashboard
--    preferences (compression, retention, timezone, per-event notification map).
--  - Additive + idempotent. Defaults match SETTINGS_DEFAULTS in the API + website.

CREATE TABLE IF NOT EXISTS user_settings (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  display_name TEXT,
  auto_sync BOOLEAN NOT NULL DEFAULT true,
  email_notifications BOOLEAN NOT NULL DEFAULT false,
  weekly_summary BOOLEAN NOT NULL DEFAULT true,
  compress BOOLEAN NOT NULL DEFAULT true,
  retain_days INTEGER NOT NULL DEFAULT 30,
  timezone TEXT NOT NULL DEFAULT 'UTC',
  notifications JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);
