# Secrets Contract

Last updated: 2026-05-09

This file describes secret ownership, storage, and rotation for the manual launch path.

## Storage Rules

Primary runtime storage:

- server-side env files generated from `.env.gitgram.example`, `.env.gitgram-web.example`, `.env.aitm-api.example`
- optional `.env.aitm-website` if you self-host the AITM dashboard

Optional storage for future automation:

- GitHub Actions secrets and environment variables

Rules:

1. Do not commit populated `.env` files.
2. Do not rely on GitHub Actions secrets as the only production source of truth for a manual launch.
3. Use separate values for staging and production.
4. Use separate product-scoped credentials where providers allow it.

## Launch-Critical Secrets

### Gitgram

| Secret | Purpose | Rotate |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection | on DB credential change |
| `REDIS_URL` | Redis connection | on Redis credential change |
| `JWT_SECRET` | access-token signing | every 90 days |
| `JWT_REFRESH_SECRET` | refresh-token signing | every 90 days |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth | on compromise |
| `POLAR_ACCESS_TOKEN` | billing API | on compromise |
| `POLAR_WEBHOOK_SECRET` | billing webhook verification | on endpoint re-creation |
| `RESEND_API_KEY` | transactional email | on compromise |
| `SENTRY_DSN` | error reporting | when project changes |

Conditional:

- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`

These are required only when `STORAGE_TYPE=s3`.

### Gitgram Web

The launch-critical web vars are mostly public build inputs, not secrets.

Non-secret public values:

- `NEXT_PUBLIC_API_URL`
- `NEXT_PUBLIC_WS_URL`
- `NEXT_PUBLIC_GITHUB_CLIENT_ID`

Optional public values:

- `NEXT_PUBLIC_GOOGLE_CLIENT_ID`
- `NEXT_PUBLIC_AITM_API_URL`
- `NEXT_PUBLIC_SENTRY_DSN`

### AITM API

| Secret | Purpose | Rotate |
|---|---|---|
| `DATABASE_URL` | PostgreSQL / Neon connection | on DB credential change |
| `INTERNAL_SECRET` | internal website-to-API auth | every 90 days |
| `POLAR_ACCESS_TOKEN` | billing API | on compromise |
| `POLAR_WEBHOOK_SECRET` | billing webhook verification | on endpoint re-creation |
| `RESEND_API_KEY` | transactional email | on compromise |
| `SENTRY_DSN` | error reporting | when project changes |

Optional after launch:

- `CLERK_WEBHOOK_SECRET`
- `OPENAI_API_KEY`
- `ANTHROPIC_API_KEY`
- `VOYAGE_API_KEY`
- `BRAVE_SEARCH_API_KEY`
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`

### AITM npm Release Flow

Manual publish:

- operator npm session from `npm login`

CI release:

- GitHub secret `NPM_TOKEN`

Note:

- the release workflow maps `NPM_TOKEN` into `NODE_AUTH_TOKEN`
- it currently covers `@gitgram/timemachine`, not the MCP package

### Optional Self-Hosted AITM Website

Only needed if you run `aitimemachine/website` yourself.

Secrets:

- `CLERK_SECRET_KEY`
- `INTERNAL_SECRET`
- `POLAR_ACCESS_TOKEN`

Public build inputs:

- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `NEXT_PUBLIC_API_URL`
- `API_URL`
- `NEXT_PUBLIC_APP_URL`
- `NEXT_PUBLIC_POLAR_PRO_PRODUCT_ID`
- `NEXT_PUBLIC_POLAR_TEAM_PRODUCT_ID`

## Shared Secret Policy

### AWS

Prefer separate IAM users:

- Gitgram S3 user: media bucket only
- AITM S3 user: knowledge-base bucket only

### Redis

A shared Redis instance is acceptable.

- Gitgram uses it for cache/session concerns.
- AITM uses it only when optional distributed rate limiting is enabled.

### Resend

Prefer separate API keys under the same account:

- one key for Gitgram
- one key for AITM

### Sentry

Use separate projects and DSNs for Gitgram and AITM.

## Rotation Checklist

JWT-style secrets:

```bash
openssl rand -base64 64
```

Recommended process:

1. rotate in staging first
2. redeploy staging and verify
3. rotate production
4. redeploy production
5. record the date and owner

Database URLs:

1. rotate credentials at the provider
2. update the server env file
3. restart the affected service
4. verify health endpoints

Webhook secrets:

1. recreate or rotate in the provider dashboard
2. update the matching env file
3. restart the service
4. verify one live webhook

## What Can Wait Until After Launch

These are explicitly not part of the first-launch blocker set:

- Google OAuth for Gitgram
- AITM AI provider keys
- AITM web-search provider keys
- AITM Redis
- AITM S3 / knowledge-base offload
- optional self-hosted AITM website

## Validation

Use:

```bash
bash scripts/validate-prod-secrets.sh production
```

That script is the repo-level preflight check for the manual launch contract.
