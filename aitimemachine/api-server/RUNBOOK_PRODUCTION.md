# AITM + Gitgram API Runbook

## 1. Prerequisites
- Node.js 20+
- npm 10+
- Neon Postgres database
- `DATABASE_URL` set

## 2. Install + Build
```bash
npm ci
npm run build
```

## 3. Database Migrations
```bash
npm run db:migrate
```

## 4. Required Environment
```bash
DATABASE_URL=postgresql://...
PORT=3001
CORS_ORIGIN=https://your-web-origin
```

## 5. Background Worker Configuration

### Delete Request Worker
```bash
DELETE_WORKER_ENABLED=true
DELETE_WORKER_INTERVAL_MS=60000
DELETE_WORKER_DRY_RUN=false
DELETE_WORKER_LIMIT=50
DELETE_WORKER_RUN_ON_START=true
# optional scope filter
DELETE_WORKER_USER_ID=
```

### Retention Worker
```bash
RETENTION_WORKER_ENABLED=true
RETENTION_WORKER_INTERVAL_MS=300000
RETENTION_WORKER_DRY_RUN=false
RETENTION_WORKER_LIMIT=100
RETENTION_WORKER_RUN_ON_START=true
# optional filters
RETENTION_WORKER_PROJECT_ID=
RETENTION_WORKER_USER_ID=
RETENTION_WORKER_DATA_CLASS=
```

## 6. Start API
```bash
npm start
```

## 7. Neon Verification Probes
```bash
psql "$DATABASE_URL" -Atc "select tablename from pg_tables where schemaname='public' and tablename in ('checkpoint_files','diffs','messages','contexts','repo_profiles','posts','follows','trend_scores','consents') order by tablename;"
```

```bash
psql "$DATABASE_URL" -Atc "select tablename from pg_tables where schemaname='public' and tablename in ('retention_policies','restore_events','post_assets','comments','reactions','project_repositories') order by tablename;"
```

## 8. API Smoke Checks
```bash
curl -sS http://localhost:3001/health
curl -sS http://localhost:3001/health/ready
curl -sS http://localhost:3001/v1
curl -sS http://localhost:3001/docs/openapi.json | head
```

## 9. Integration Test Execution

### In restricted/sandbox environments
- Keep default `AITM_TEST_NO_LISTEN=1`.
- Run service tests only:
```bash
npx vitest run tests/services
```

### On your local machine (full integration)
- Allow real listen sockets:
```bash
npm run test:integration:local
```

### Safe mode (CI/sandbox auto-detect)
```bash
npm run test:integration:safe
```

Note: `tests/integration/api.test.ts` uses `fetch(API_BASE)` style checks. If needed on local:
```bash
API_BASE=http://127.0.0.1:3001 TEST_API_KEY=aitm_xxx npx vitest run tests/integration/api.test.ts
```

## 10. Launch Checklist
- Migrations applied in Neon.
- `/health` and `/health/ready` both return `200`.
- OpenAPI served at `/docs/openapi.json`.
- Worker logs show periodic cycles without errors:
  - `delete-request worker cycle complete`
  - `retention worker cycle complete`
- Core endpoints smoke-tested:
  - `/v1/time/diff`, `/v1/time/timeline`, `/v1/time/restore-events`
  - `/v1/consent`, `/v1/consent/history`
  - `/v1/data/delete-request`, `/v1/retention/apply`
  - `/v1/gitgram/repos/import`, `/v1/gitgram/posts`, `/v1/gitgram/trending`

## 11. Rollback
- Disable workers:
```bash
DELETE_WORKER_ENABLED=false
RETENTION_WORKER_ENABLED=false
```
- Redeploy previous image/tag.
- Restore database from Neon point-in-time if schema/data rollback is required.
