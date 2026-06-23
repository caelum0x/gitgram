-- Migration: Add knowledge_base_files and knowledge_base_artifacts tables
-- These tables support persistent KB storage with optional S3 offloading

CREATE TABLE IF NOT EXISTS "knowledge_base_files" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "repository_id" text NOT NULL REFERENCES "repositories"("id"),
  "project_id" text NOT NULL REFERENCES "projects"("id"),
  "user_id" text NOT NULL REFERENCES "users"("id"),
  "file_path" text NOT NULL,
  "content" text,
  "content_hash" text NOT NULL,
  "size" integer DEFAULT 0,
  "language" text,
  "source" text DEFAULT 'local',
  "storage" text DEFAULT 'db',
  "s3" jsonb,
  "indexed_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "knowledge_base_artifacts" (
  "id" text PRIMARY KEY,
  "user_id" text NOT NULL REFERENCES "users"("id"),
  "project_id" text REFERENCES "projects"("id"),
  "job_id" text,
  "type" text NOT NULL,
  "format" text NOT NULL,
  "storage" text DEFAULT 'db',
  "content" jsonb,
  "content_hash" text,
  "size" integer DEFAULT 0,
  "stats" jsonb,
  "s3" jsonb,
  "created_at" timestamp DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS "idx_kb_files_repo" ON "knowledge_base_files" ("repository_id");
CREATE INDEX IF NOT EXISTS "idx_kb_files_user" ON "knowledge_base_files" ("user_id");
CREATE INDEX IF NOT EXISTS "idx_kb_files_path" ON "knowledge_base_files" ("file_path");
CREATE INDEX IF NOT EXISTS "idx_kb_files_hash" ON "knowledge_base_files" ("content_hash");
CREATE INDEX IF NOT EXISTS "idx_kb_artifacts_user" ON "knowledge_base_artifacts" ("user_id");
CREATE INDEX IF NOT EXISTS "idx_kb_artifacts_type" ON "knowledge_base_artifacts" ("type");
CREATE INDEX IF NOT EXISTS "idx_kb_artifacts_job" ON "knowledge_base_artifacts" ("job_id");
