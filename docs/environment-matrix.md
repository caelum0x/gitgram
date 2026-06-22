# Environment Matrix

Last updated: 2026-05-09

This is the canonical launch-time environment contract for the manual single-host deployment path.

Rules:

- Runtime env files live at repo root: `.env.gitgram`, `.env.gitgram-web`, `.env.aitm-api`, optional `.env.aitm-website`.
- Service-local `.env.example` files remain the code-level reference for development.
- `scripts/validate-prod-secrets.sh` accepts both unprefixed runtime names and `GITGRAM_*` / `AITM_*` aliases for CI-style validation.

## Gitgram Backend

Required before first launch:

- `DATABASE_URL`
- `REDIS_URL`
- `JWT_SECRET`
- `JWT_REFRESH_SECRET`
- `FRONTEND_URL`
- `CORS_ORIGIN`
- `GITHUB_CLIENT_ID`
- `GITHUB_CLIENT_SECRET`
- `POLAR_ACCESS_TOKEN`
- `POLAR_WEBHOOK_SECRET`
- `POLAR_PREMIUM_PRODUCT_ID`
- `POLAR_CREATOR_PRODUCT_ID`
- `POLAR_MODE`
- `RESEND_API_KEY`
- `SENTRY_DSN`
- `STORAGE_TYPE`

Conditional requirements:

- `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_S3_BUCKET`, `AWS_REGION` when `STORAGE_TYPE=s3`

Optional after launch:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GITHUB_WEBHOOK_SECRET`
- `GITHUB_TOKEN`
- `CDN_URL`
- `AITM_API_URL`
- `AITM_ENCRYPTION_SECRET`
- analytics and feature-flag keys

Code reference:

- `gitgram/backend/ENV_MATRIX.md`
- `gitgram/backend/.env.example`
- `gitgram/backend/src/config/env-contract.ts`

## Gitgram Web

Required before first launch:

- `NEXT_PUBLIC_API_URL`
- `NEXT_PUBLIC_WS_URL` or legacy `NEXT_PUBLIC_SOCKET_URL`
- `NEXT_PUBLIC_GITHUB_CLIENT_ID`

Optional after launch:

- `NEXT_PUBLIC_GOOGLE_CLIENT_ID`
- `NEXT_PUBLIC_AITM_API_URL`
- `NEXT_PUBLIC_SENTRY_DSN`
- `NEXT_PUBLIC_GA_ID`
- `NEXT_PUBLIC_MAPBOX_TOKEN`

Operational note:

- `NEXT_PUBLIC_*` values are build-time inputs. Rebuild the web app whenever they change.

Code reference:

- `gitgram/web/.env.example`
- `gitgram/web/next.config.js`

## AITM API

Required before first launch:

- `DATABASE_URL`
- `INTERNAL_SECRET`
- `CORS_ORIGIN`
- `WEBSITE_URL`
- `POLAR_ACCESS_TOKEN`
- `POLAR_WEBHOOK_SECRET`
- `POLAR_PRO_PRODUCT_ID`
- `POLAR_TEAM_PRODUCT_ID`
- `RESEND_API_KEY`
- `SENTRY_DSN`

Optional after launch:

- `CLERK_WEBHOOK_SECRET`
- `REDIS_URL`
- `OPENAI_API_KEY`
- `ANTHROPIC_API_KEY`
- `VOYAGE_API_KEY`
- `BRAVE_SEARCH_API_KEY`
- `SERPAPI_KEY`
- `SERPER_API_KEY`
- `FIRECRAWL_API_KEY`
- `KB_S3_BUCKET`
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- worker toggles and cron expressions

Operational notes:

- `DATABASE_URL` must be valid before the API starts in `staging` or `production`.
- Without LLM/search keys, AI-heavy routes degrade gracefully instead of blocking startup.
- Worker env vars are only required if you enable the managed scheduler on launch day.

Code reference:

- `aitimemachine/api-server/.env.example`
- `aitimemachine/api-server/src/lib/validateEnv.ts`
- `aitimemachine/api-server/src/config/env-validation.ts`

## AITM npm Publish / Release Flow

Manual publish requires:

- authenticated npm session via `npm login` or `npm whoami`

Optional CI automation:

- GitHub secret `NPM_TOKEN`

Operational notes:

- The current CI release job publishes `@gitgram/timemachine`.
- `@gitgram/timemachine-mcp` still requires manual publish.

## Optional Self-Hosted AITM Website

Only required if you decide to run `aitimemachine/website` on the launch host.

Required for self-host:

- `NEXT_PUBLIC_API_URL`
- `API_URL`
- `INTERNAL_SECRET`
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `CLERK_SECRET_KEY`
- `NEXT_PUBLIC_APP_URL`
- `POLAR_ACCESS_TOKEN`
- `NEXT_PUBLIC_POLAR_PRO_PRODUCT_ID`
- `NEXT_PUBLIC_POLAR_TEAM_PRODUCT_ID`

Code reference:

- `.env.aitm-website.example`
- `aitimemachine/website/.env.example`

## Validation Commands

```bash
bash scripts/validate-prod-secrets.sh staging
bash scripts/validate-prod-secrets.sh production
```

These checks:

- validate the launch-critical variable set
- support both prefixed and unprefixed naming
- auto-load the root `.env.*` files when present
- fail on placeholder values
- enforce `POLAR_MODE=production` for a production Gitgram launch
