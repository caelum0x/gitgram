# gitgram-ai (Monorepo)

Two products:

1. `gitgram` (GitHub social network)
2. `aitimemachine` (AITM, "Time Machine for AI coding")

This repo is organized as a monorepo for local development and ops docs. Each product has its own `README.md`, and the repo still contains historical automation artifacts that are not the launch source of truth.

## Quick Start (Local, Full Stack)

Runs Postgres + Redis + Gitgram backend + Gitgram web + AITM API via Docker Compose.

```bash
docker compose up
```

Service URLs (when running the full stack together):
- Gitgram web: `http://localhost:3000`
- Gitgram backend: `http://localhost:4000` (`GET /health`)
- AITM API: `http://localhost:3001` (`GET /health`)

Notes:
- AITM website is not started by the root `docker-compose.yml` (to avoid port conflicts with Gitgram web). Run it separately if needed.
- AITM database defaults to whatever `aitimemachine/api-server/.env` provides (`DATABASE_URL`). In production, use Neon; locally you can use a local Postgres if you want.

## Start AITM Website Locally

When Gitgram web is already on `:3000`, run AITM website on `:3002`:

```bash
cd aitimemachine/website
cp .env.example .env.local
PORT=3002 npm run dev
```

Open `http://localhost:3002`.

## Production Compose (Single VPS)

Use `docs/runbook.md` as the canonical manual launch contract.

`docker-compose.prod.yml` is retained as a non-canonical full-docker reference, not the launch source of truth.

## Release Gates

Run these before staging/production deploys:

```bash
npm run verify:aitm-packages
npm run verify:aitm-local
npm run verify:secrets:staging
npm run verify:secrets:production
```

AITM API local startup without external secret keys:

```bash
npm run verify:aitm-local
npm run dev:aitm-api:clean
```

Stage A local smoke gate:

```bash
npm run smoke:local-launch
```

Optional flags:
- `SKIP_HTTP=1 npm run smoke:local-launch`
- `AUTO_START=1 npm run smoke:local-launch`
- `RUN_AITM_CLI_SMOKE=1 npm run smoke:local-launch`
- `RUN_AITM_MCP_SMOKE=1 npm run smoke:local-launch`

## Docs Index

- Strict execution queue: `REMAINING.md`
- North star PRD/architecture: `NORTH_STAR_PRD_ARCHITECTURE_V1.md`
- Manual launch runbook: `docs/runbook.md`
- Deploy pipeline contract: `docs/deploy-pipeline.md`
- Env var matrix: `docs/environment-matrix.md`
- Secrets contract: `docs/secrets-contract.md`
