# Manual Launch Runbook

Last updated: 2026-05-12

This file is the launch source of truth for Gitgram and AITM.

- Primary topology: one operator-managed host.
- Primary process manager: `pm2`.
- AITM `systemd` unit: fallback only.
- `docker-compose.prod.yml`, `deploy/DEPLOYMENT.md`, and GitHub deploy workflows are not the canonical launch path.

## Canonical Topology

| Service | Product | Runtime | Control Plane | Port | Health Gate |
|---------|---------|---------|---------------|------|-------------|
| `gitgram-api` | Gitgram | Node / Express | `pm2` | `4000` | `GET /health`, `GET /health/ready` |
| `gitgram-web` | Gitgram | Node / Next.js | `pm2` | `3000` | `GET /` returns `<500` |
| `aitm-api` | AITM | Node / Express | `pm2` primary, `systemd` fallback | `3001` | `GET /health`, `GET /health/ready` |
| `postgres` | Shared infra | PostgreSQL 16 | operator-managed | `5432` | `pg_isready` |
| `redis` | Shared infra | Redis 7 | operator-managed | `6379` | `redis-cli ping` |

Optional companion service:

| Service | Product | Runtime | Port | Notes |
|---------|---------|---------|------|------|
| `aitm-website` | AITM | Node / Next.js | `3002` | Self-host only if you want the hosted dashboard on the same machine. Not part of the launch-critical path in this repo. |

## Repo Paths

| Artifact | Path |
|---------|------|
| Gitgram PM2 config | `gitgram/ecosystem.config.js` |
| AITM PM2 config | `aitimemachine/deploy/ecosystem.config.cjs` |
| AITM `systemd` fallback unit | `aitimemachine/deploy/aitm-api.service` |
| Gitgram backend env template | `.env.gitgram.example` |
| Gitgram web env template | `.env.gitgram-web.example` |
| AITM API env template | `.env.aitm-api.example` |
| Optional AITM website env template | `.env.aitm-website.example` |
| Gitgram backend schema | `gitgram/backend/prisma/schema.prisma` |
| AITM API schema | `aitimemachine/api-server/src/db/schema.ts` |

## Preflight

Run these before any staging-like dry run or production launch:

```bash
node -v
npm -v
pm2 -v
```

Use Node 20.x for build and runtime consistency with the repo workflows.

Copy and fill the operator env files at repo root.

Preferred layout:

```bash
cp .env.gitgram.example .env.gitgram.production
cp .env.gitgram-web.example .env.gitgram-web.production
cp .env.aitm-api.example .env.aitm-api.production

cp .env.gitgram.example .env.gitgram.staging
cp .env.gitgram-web.example .env.gitgram-web.staging
cp .env.aitm-api.example .env.aitm-api.staging
# Optional:
cp .env.aitm-website.example .env.aitm-website
```

Fallback layout still works if you want one shared set of root files:

```bash
cp .env.gitgram.example .env.gitgram
cp .env.gitgram-web.example .env.gitgram-web
cp .env.aitm-api.example .env.aitm-api
```

Validate launch-critical env contracts:

```bash
bash scripts/validate-prod-secrets.sh staging core
bash scripts/validate-prod-secrets.sh production core
```

One-command readiness gate:

```bash
npm run verify:launch
```

This is the deployable core profile: database, app secrets, routing URLs, storage mode, and PM2/deploy artifacts.

Optional deeper gate:

```bash
npm run verify:launch:full
```

This adds third-party integrations that are not required just to boot the services:
- GitHub OAuth
- Polar billing
- Resend
- Sentry

Manual deploy helper:

```bash
bash scripts/deploy-launch.sh staging
```

To require the full integrations gate before deploy:

```bash
bash scripts/deploy-launch.sh staging --verify-profile full
```

Secret entry reference:

- `docs/launch-secrets-checklist.md`

Notes:

- The validator accepts both unprefixed vars and `GITGRAM_*` / `AITM_*` aliases.
- It prefers `.env.gitgram.<env>`, `.env.gitgram-web.<env>`, `.env.aitm-api.<env>`, and `.env.aitm-website.<env>` when those files exist, and falls back to the root files otherwise.
- `verify:launch` uses the `core` profile by default so you can deploy the stack before every external provider account is wired.
- `verify:launch:full` and `validate-prod-secrets.sh <env> full` enforce the full launch contract, including third-party integrations.
- `verify:launch` also checks PM2 availability, required deploy artifacts, operator env file presence, and AITM package publishability.
- `deploy-launch.sh` is the scripted PM2/manual deploy flow. It is the automation companion to this runbook, not a Docker deploy.

## Backup Gate

Take backups before any production migration.

Gitgram:

```bash
(
  set -a
  source .env.gitgram
  set +a
  cd gitgram
  ./scripts/backup-database.sh
)
```

AITM:

```bash
(
  set -a
  source .env.aitm-api
  set +a
  mkdir -p /var/backups/aitm
  pg_dump "$DATABASE_URL" | gzip > "/var/backups/aitm/aitm_$(date +%Y%m%d_%H%M%S).sql.gz"
)
```

Redis snapshot:

```bash
redis-cli -u "$(grep '^REDIS_URL=' .env.gitgram | cut -d= -f2-)" BGSAVE
```

## AITM Package Release

Publish order matters:

1. `@gitgram/timemachine`
2. `@gitgram/timemachine-mcp`

### Manual Publish Checklist

Core package:

```bash
cd aitimemachine
npm ci
npm run build
npm test
bash scripts/verify-npm-packages.sh
npm whoami
npm publish --access public
```

Post-publish verification:

```bash
npm view @gitgram/timemachine version
npx -y @gitgram/timemachine --version

tmpdir="$(mktemp -d)"
(
  cd "$tmpdir"
  npx -y @gitgram/timemachine init
  npx -y @gitgram/timemachine checkpoint "launch-smoke"
)
rm -rf "$tmpdir"
```

MCP package:

```bash
cd aitimemachine/mcp
npm ci
npm run build
npm publish --access public
```

Post-publish verification:

```bash
npm view @gitgram/timemachine-mcp version
npx -y @gitgram/timemachine-mcp --help
```

### Package Rollback Policy

Use manual deprecation plus a version bump. Do not rely on unpublish.

```bash
npm deprecate @gitgram/timemachine@<bad-version> "broken release; use >=<fixed-version>"
npm deprecate @gitgram/timemachine-mcp@<bad-version> "broken release; use >=<fixed-version>"
```

Then publish a new patch or minor release:

```bash
cd aitimemachine
npm version patch --no-git-tag-version

cd mcp
npm version patch --no-git-tag-version
```

Automation status:

- `aitimemachine/.github/workflows/ci.yml` has a tag-driven npm publish step.
- It currently publishes only `@gitgram/timemachine`.
- The MCP publish remains manual until the workflow is brought into line with the manual launch process.
- The GitHub secret name used there is `NPM_TOKEN`, passed to npm as `NODE_AUTH_TOKEN`.

## Gitgram Deploy

### Backend Build + Migrate

```bash
cd gitgram/backend
npm ci --legacy-peer-deps
npx prisma generate
npx prisma migrate deploy
npm run build
```

### Backend Start / Restart

Initial start:

```bash
(
  set -a
  source ../../.env.gitgram
  set +a
  pm2 start ../ecosystem.config.js --only gitgram-api
)
pm2 save
```

Redeploy:

```bash
(
  set -a
  source ../../.env.gitgram
  set +a
  pm2 restart gitgram-api --update-env
)
pm2 save
```

Scripted equivalent:

```bash
bash scripts/deploy-launch.sh staging --gitgram-only
```

### Backend Health Gate

```bash
curl -sf http://127.0.0.1:4000/health | jq .
curl -sf http://127.0.0.1:4000/health/ready | jq .
```

## Gitgram Web Deploy

### Build

`NEXT_PUBLIC_*` values are build-time inputs. Rebuild whenever they change.

```bash
(
  set -a
  source .env.gitgram-web
  set +a
  cd gitgram/web
  npm ci --legacy-peer-deps
  npm run build
)
```

### Start / Restart

Initial start:

```bash
(
  set -a
  source .env.gitgram-web
  set +a
  cd gitgram
  pm2 start ecosystem.config.js --only gitgram-web
)
pm2 save
```

Redeploy:

```bash
(
  set -a
  source .env.gitgram-web
  set +a
  pm2 restart gitgram-web --update-env
)
pm2 save
```

Scripted equivalent:

```bash
bash scripts/deploy-launch.sh staging --gitgram-only
```

### Web Health Gate

```bash
curl -sf -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000
```

## AITM API Deploy

### Build + Migrate

```bash
cd aitimemachine/api-server
npm ci
npm run db:migrate
npm run build
```

### Start / Restart With PM2

Initial start:

```bash
(
  set -a
  source ../../.env.aitm-api
  set +a
  pm2 start ../deploy/ecosystem.config.cjs --only aitm-api
)
pm2 save
```

Redeploy:

```bash
(
  set -a
  source ../../.env.aitm-api
  set +a
  pm2 restart aitm-api --update-env
)
pm2 save
```

Scripted equivalent:

```bash
bash scripts/deploy-launch.sh staging --aitm-only
```

### `systemd` Fallback

Use only if PM2 is unavailable or intentionally replaced.

```bash
sudo cp aitimemachine/deploy/aitm-api.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable aitm-api
sudo systemctl restart aitm-api
```

The checked-in unit assumes the repo lives at `/opt/aitimemachine/api-server`. Adjust `WorkingDirectory`, `ExecStart`, and `EnvironmentFile` if your server layout differs.

### API Health Gate

```bash
curl -sf http://127.0.0.1:3001/health | jq .
curl -sf http://127.0.0.1:3001/health/ready | jq .
```

If `ENABLE_WORKERS=true`, also check worker status:

```bash
(
  set -a
  source .env.aitm-api
  set +a
  curl -sf -H "X-Internal-Secret: ${INTERNAL_SECRET}" \
    http://127.0.0.1:3001/v1/workers/status | jq .
)
```

## Optional AITM Website

This repo includes `aitimemachine/website`, but it is not part of the launch-critical path defined here.

If you self-host it on the same machine:

```bash
(
  set -a
  source .env.aitm-website
  set +a
  cd aitimemachine/website
  npm ci
  PORT=3002 npm run build
  PORT=3002 npm start
)
```

## Launch-Day Order

1. Freeze merges and confirm the intended commit or tag.
2. Run `bash scripts/validate-prod-secrets.sh production`.
3. Take Gitgram and AITM database backups.
4. Publish `@gitgram/timemachine`.
5. Verify install + smoke.
6. Publish `@gitgram/timemachine-mcp`.
7. Verify install + smoke.
8. Deploy Gitgram backend.
9. Wait for Gitgram backend health gates.
10. Deploy Gitgram web.
11. Wait for Gitgram web health gate.
12. Deploy AITM API.
13. Wait for AITM API health gates.
14. Run smoke checks.
15. Monitor for at least 30 minutes before declaring success.

## Smoke Checks

### Gitgram

Required:

- `curl -sf http://127.0.0.1:4000/health`
- `curl -sf http://127.0.0.1:4000/health/ready`
- `curl -sf -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000`

Manual:

- Load the web app.
- Confirm it can reach the API.
- Exercise one login path.
- Create one basic post.

### AITM

Required:

- `curl -sf http://127.0.0.1:3001/health`
- `curl -sf http://127.0.0.1:3001/health/ready`
- `npx -y @gitgram/timemachine --version`
- `npx -y @gitgram/timemachine-mcp --help`

Manual:

- Create a temp project.
- Run `init`.
- Create a checkpoint.
- If workers are enabled, verify `/v1/workers/status`.

Public-domain smoke:

- `npm run verify:public-launch`

## Rollback

### npm Packages

1. Deprecate the bad version.
2. Bump the version.
3. Rebuild and republish.
4. Re-run the install smokes.

### Gitgram Backend / Web

Rollback is manual-first. Use the previous known-good git tag, commit, or release directory already present on the server.

Example with an in-place git checkout:

```bash
git checkout <previous-tag-or-commit>

cd gitgram/backend
npm ci --legacy-peer-deps
npx prisma generate
npm run build

cd ../web
npm ci --legacy-peer-deps
npm run build

pm2 restart gitgram-api --update-env
pm2 restart gitgram-web --update-env
```

### AITM API

```bash
git checkout <previous-tag-or-commit>

cd aitimemachine/api-server
npm ci
npm run build

pm2 restart aitm-api --update-env
```

### Database Rollback Policy

- Gitgram / Prisma: no automatic `down` migrations in this launch contract.
- AITM / Drizzle: no automatic `down` migrations in this launch contract.
- Production rollback policy is restore from backup or provider point-in-time restore unless you have already written and reviewed a reverse SQL plan.

If a migration fails after partial apply:

1. Stop the app deploy.
2. Do not keep rolling forward blindly.
3. Restore from the backup taken immediately before the migration, or use provider PITR.

## Monitoring Window

Watch for at least 30 minutes after launch:

```bash
pm2 ls
pm2 logs gitgram-api --lines 200
pm2 logs gitgram-web --lines 100
pm2 logs aitm-api --lines 200
```

Recommended external checks:

- Sentry error volume
- Polar webhook delivery success
- PostgreSQL connection count
- Redis availability
- repeated `curl` probes against `/health` and `/health/ready`
