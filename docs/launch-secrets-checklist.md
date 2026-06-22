# Launch Secrets Checklist

Last updated: 2026-05-12

This file is the operator-facing checklist for filling the launch env files before deploy.

Preferred file layout:
- staging: `.env.gitgram.staging`, `.env.gitgram-web.staging`, `.env.aitm-api.staging`
- production: `.env.gitgram.production`, `.env.gitgram-web.production`, `.env.aitm-api.production`

Fallback layout:
- `.env.gitgram`
- `.env.gitgram-web`
- `.env.aitm-api`

Current gate:
- `npm run verify:launch` for deployable core readiness
- `npm run verify:launch:full` for all third-party integrations live

Polar reference:
- `docs/polar-payment-setup.md`

Current state:
- deploy/readiness scripts are in place
- AITM package dry-run verification passes
- dedicated Neon databases now exist for `gitgram_staging`, `gitgram_production`, `aitm_staging`, and `aitm_production`
- root staging/production env files now contain real database URLs and generated app-owned secrets
- full-integration launch is still blocked by provider-issued values, not local infra placeholders

## Gitgram Backend Env

App-owned values now set:
- `DATABASE_URL`
- `JWT_SECRET`
- `JWT_REFRESH_SECRET`

Still provider-issued:
- `REDIS_URL`
- `FRONTEND_URL`
- `CORS_ORIGIN`
- `GITHUB_CLIENT_ID`
- `GITHUB_CLIENT_SECRET`
- `POLAR_ACCESS_TOKEN`
- `POLAR_MODE`
- `POLAR_WEBHOOK_SECRET`
- `POLAR_PREMIUM_PRODUCT_ID`
- `POLAR_CREATOR_PRODUCT_ID`
- `RESEND_API_KEY`
- `SENTRY_DSN`

Optional depending on storage mode:
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `AWS_S3_BUCKET`
- `AWS_REGION`

Files:
- staging: `.env.gitgram.staging`
- production fallback: `.env.gitgram` or `.env.gitgram.production`

## Gitgram Web Env

Confirm or fill:
- `NEXT_PUBLIC_API_URL`
- `NEXT_PUBLIC_WS_URL`
- `NEXT_PUBLIC_GITHUB_CLIENT_ID`
- `NEXT_PUBLIC_GOOGLE_CLIENT_ID`
- `NEXT_PUBLIC_AITM_API_URL`
- `NEXT_PUBLIC_SENTRY_DSN`

Files:
- staging: `.env.gitgram-web.staging`
- production fallback: `.env.gitgram-web` or `.env.gitgram-web.production`

## AITM API Env

App-owned values now set:
- `DATABASE_URL`
- `INTERNAL_SECRET`

Still provider-issued:
- `CORS_ORIGIN`
- `WEBSITE_URL`
- `POLAR_ACCESS_TOKEN`
- `POLAR_MODE`
- `POLAR_WEBHOOK_SECRET`
- `POLAR_PRO_PRODUCT_ID`
- `POLAR_TEAM_PRODUCT_ID`
- `RESEND_API_KEY`
- `SENTRY_DSN`

Optional:
- `CLERK_WEBHOOK_SECRET`
- `REDIS_URL`
- `OPENAI_API_KEY`
- `ANTHROPIC_API_KEY`
- `VOYAGE_API_KEY`
- `BRAVE_SEARCH_API_KEY`

Files:
- staging: `.env.aitm-api.staging`
- production fallback: `.env.aitm-api` or `.env.aitm-api.production`

## Provider Mapping

GitHub OAuth:
- `GITHUB_CLIENT_ID`
- `GITHUB_CLIENT_SECRET`
- `NEXT_PUBLIC_GITHUB_CLIENT_ID`

Polar:
- Gitgram: `POLAR_ACCESS_TOKEN`, `POLAR_MODE`, `POLAR_WEBHOOK_SECRET`, `POLAR_PREMIUM_PRODUCT_ID`, `POLAR_CREATOR_PRODUCT_ID`
- AITM: `POLAR_ACCESS_TOKEN`, `POLAR_MODE`, `POLAR_WEBHOOK_SECRET`, `POLAR_PRO_PRODUCT_ID`, `POLAR_TEAM_PRODUCT_ID`

Email:
- `RESEND_API_KEY`

Monitoring:
- `SENTRY_DSN`
- `NEXT_PUBLIC_SENTRY_DSN`

Core infra:
- Gitgram: `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, `JWT_REFRESH_SECRET`
- AITM: `DATABASE_URL`, `INTERNAL_SECRET`

## Deploy Sequence

1. Run `npm run verify:launch` for the core deploy gate.
2. Run `bash scripts/deploy-launch.sh staging --gitgram-only`.
3. Run `bash scripts/deploy-launch.sh staging --aitm-only`.
4. Configure nginx and DNS if not already live.
5. Run `npm run verify:public-launch`.
6. Once OAuth, Polar, Resend, and Sentry are configured, run `npm run verify:launch:full`.
