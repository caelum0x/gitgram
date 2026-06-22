# Operations Quick Reference

Full source of truth: `docs/runbook.md`

## Validate Launch Env

```bash
bash scripts/validate-prod-secrets.sh staging
bash scripts/validate-prod-secrets.sh production
```

## Gitgram Deploy

```bash
cd gitgram/backend
npm ci --legacy-peer-deps
npx prisma generate
npx prisma migrate deploy
npm run build
```

```bash
(
  set -a
  source ../../.env.gitgram
  set +a
  pm2 restart gitgram-api --update-env || pm2 start ../ecosystem.config.js --only gitgram-api
)
```

```bash
(
  set -a
  source .env.gitgram
  source .env.gitgram-web
  set +a
  cd gitgram/web
  npm ci --legacy-peer-deps
  npm run build
  cd ..
  pm2 restart gitgram-web --update-env || pm2 start ecosystem.config.js --only gitgram-web
)
```

## AITM API Deploy

```bash
cd aitimemachine/api-server
npm ci
npm run db:migrate
npm run build
```

```bash
(
  set -a
  source ../../.env.aitm-api
  set +a
  pm2 restart aitm-api --update-env || pm2 start ../deploy/ecosystem.config.cjs --only aitm-api
)
```

## AITM Package Publish

```bash
cd aitimemachine
npm ci
npm run build
npm test
bash scripts/verify-npm-packages.sh
npm publish --access public
```

```bash
cd aitimemachine/mcp
npm ci
npm run build
npm publish --access public
```

## Health Checks

```bash
curl -sf http://127.0.0.1:4000/health | jq .
curl -sf http://127.0.0.1:4000/health/ready | jq .
curl -sf -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000

curl -sf http://127.0.0.1:3001/health | jq .
curl -sf http://127.0.0.1:3001/health/ready | jq .
```

Worker status when enabled:

```bash
(
  set -a
  source .env.aitm-api
  set +a
  curl -sf -H "X-Internal-Secret: ${INTERNAL_SECRET}" \
    http://127.0.0.1:3001/v1/workers/status | jq .
)
```

## Backups

```bash
(
  set -a
  source .env.gitgram
  set +a
  cd gitgram
  ./scripts/backup-database.sh
)
```

```bash
(
  set -a
  source .env.aitm-api
  set +a
  pg_dump "$DATABASE_URL" | gzip > "/var/backups/aitm/aitm_$(date +%Y%m%d_%H%M%S).sql.gz"
)
```

## Rollback

```bash
git checkout <previous-tag-or-commit>
```

```bash
pm2 restart gitgram-api --update-env
pm2 restart gitgram-web --update-env
pm2 restart aitm-api --update-env
```

Database rollback policy:

- Gitgram: restore from pre-migration backup or provider PITR.
- AITM: restore from pre-migration backup or provider PITR.

## Useful PM2 Commands

```bash
pm2 ls
pm2 logs gitgram-api --lines 200
pm2 logs gitgram-web --lines 100
pm2 logs aitm-api --lines 200
pm2 save
```
