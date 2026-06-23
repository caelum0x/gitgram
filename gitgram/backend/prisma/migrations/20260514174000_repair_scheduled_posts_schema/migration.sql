-- Repair ScheduledPost drift from earlier table recreations.
-- The application schema now uses scheduledFor, optional account/user links,
-- timezone support, recurrence metadata, and published-post linkage.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'RecurrenceType') THEN
    CREATE TYPE "RecurrenceType" AS ENUM ('NONE', 'DAILY', 'WEEKLY', 'MONTHLY');
  END IF;
END $$;

ALTER TABLE "ScheduledPost"
  ADD COLUMN IF NOT EXISTS "accountId" TEXT,
  ADD COLUMN IF NOT EXISTS "userId" TEXT,
  ADD COLUMN IF NOT EXISTS "scheduledFor" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "published" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "publishedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS "timezone" TEXT NOT NULL DEFAULT 'UTC',
  ADD COLUMN IF NOT EXISTS "recurrenceType" "RecurrenceType" NOT NULL DEFAULT 'NONE',
  ADD COLUMN IF NOT EXISTS "recurrenceEndDate" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "parentPostId" TEXT,
  ADD COLUMN IF NOT EXISTS "publishedPostId" TEXT;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'ScheduledPost'
      AND column_name = 'scheduledAt'
  ) THEN
    EXECUTE 'UPDATE "ScheduledPost" SET "scheduledFor" = COALESCE("scheduledFor", "scheduledAt")';
  END IF;
END $$;

UPDATE "ScheduledPost"
SET
  "scheduledFor" = COALESCE("scheduledFor", CURRENT_TIMESTAMP),
  "mediaUrls" = COALESCE("mediaUrls", ARRAY[]::TEXT[]),
  "status" = COALESCE("status", 'pending'),
  "timezone" = COALESCE("timezone", 'UTC'),
  "recurrenceType" = COALESCE("recurrenceType", 'NONE'::"RecurrenceType"),
  "published" = COALESCE("published", false);

ALTER TABLE "ScheduledPost"
  ALTER COLUMN "accountId" DROP NOT NULL,
  ALTER COLUMN "userId" DROP NOT NULL,
  ALTER COLUMN "scheduledFor" SET NOT NULL,
  ALTER COLUMN "mediaUrls" SET DEFAULT ARRAY[]::TEXT[],
  ALTER COLUMN "mediaUrls" SET NOT NULL,
  ALTER COLUMN "published" SET DEFAULT false,
  ALTER COLUMN "published" SET NOT NULL,
  ALTER COLUMN "status" SET DEFAULT 'pending',
  ALTER COLUMN "status" SET NOT NULL,
  ALTER COLUMN "timezone" SET DEFAULT 'UTC',
  ALTER COLUMN "timezone" SET NOT NULL,
  ALTER COLUMN "recurrenceType" SET DEFAULT 'NONE',
  ALTER COLUMN "recurrenceType" SET NOT NULL;

CREATE INDEX IF NOT EXISTS "ScheduledPost_accountId_idx" ON "ScheduledPost"("accountId");
CREATE INDEX IF NOT EXISTS "ScheduledPost_userId_idx" ON "ScheduledPost"("userId");
CREATE INDEX IF NOT EXISTS "ScheduledPost_scheduledFor_idx" ON "ScheduledPost"("scheduledFor");
CREATE INDEX IF NOT EXISTS "ScheduledPost_status_idx" ON "ScheduledPost"("status");
CREATE INDEX IF NOT EXISTS "ScheduledPost_parentPostId_idx" ON "ScheduledPost"("parentPostId");
