# Gitgram Backend — End-to-End (E2E) Tests

This suite exercises the **real** Express HTTP API against a **real** PostgreSQL
(and optionally Redis) instance. Unlike the default Jest suite (which mocks
Prisma, Redis, and external services via `tests/setup.ts`), these tests catch
cross-service regressions and route-wiring breaks that mocks cannot.

## What it covers

- **`auth.e2e.test.ts`** — register, `/me`, login, refresh, logout, validation boundaries.
- **`posts.e2e.test.ts`** — create/read posts, comments, like/unlike, likers, follow graph.
- **`snippets.e2e.test.ts`** — snippet CRUD plus comments and likers (social parity).
- **`system.e2e.test.ts`** — health/readiness, AI-analysis feature flag (503 when disabled),
  Polar webhook route mounting, and confirmation the duplicate webhook route was removed.

## Running locally

### Option A — one command (Docker)

Requires Docker. Brings up ephemeral Postgres (`:5433`) + Redis (`:6380`),
runs the suite, and tears everything down:

```bash
npm run test:e2e:docker
```

### Option B — manual

```bash
# 1. Start the harness
docker compose -f docker-compose.test.yml up -d --wait

# 2. Point the suite at it and run
export DATABASE_URL="postgresql://gitgram_test:gitgram_test@localhost:5433/gitgram_test"
export REDIS_URL="redis://localhost:6380"
npm run test:e2e

# 3. Tear down
docker compose -f docker-compose.test.yml down -v
```

The global setup (`globalSetup.ts`) runs `prisma db push` against the test
database before the suite, so a fresh empty DB is fine — no migration history
required.

## CI

The `Gitgram Tests` workflow (`.github/workflows/gitgram-tests.yml`) runs this
suite in the **`backend-e2e`** job using GitHub Actions service containers for
Postgres and Redis.

## Notes

- The suite runs serially (`--runInBand`) and resets the relevant tables between
  suites for deterministic state.
- External integrations (email, storage, Polar, GitNexus) are intentionally left
  unconfigured so flows are deterministic; the feature-flag tests assert the
  graceful-degradation behavior.
