# Polar Payment Setup

Last updated: 2026-05-12

This guide is based on the locally cloned Polar source in [external/polar](/Users/arhansubasi/gitgram-ai/external/polar).

Primary upstream references:
- [sandbox.mdx](/Users/arhansubasi/gitgram-ai/external/polar/docs/integrate/sandbox.mdx)
- [introduction.mdx](/Users/arhansubasi/gitgram-ai/external/polar/docs/integrate/oauth2/introduction.mdx)
- [delivery.mdx](/Users/arhansubasi/gitgram-ai/external/polar/docs/integrate/webhooks/delivery.mdx)
- [typescript.mdx](/Users/arhansubasi/gitgram-ai/external/polar/docs/integrate/sdk/typescript.mdx)
- [security.yml](/Users/arhansubasi/gitgram-ai/external/polar/sdk/overlays/security.yml)

## What To Use

Use an **Organization Access Token** for Gitgram and AITM service-to-Polar integration.

Do not use OAuth/OpenID Connect unless you are building a third-party app that acts on behalf of other Polar users.

From Polar’s own docs:
- service integrations should use an organization access token
- sandbox has its own separate token and separate organization
- the TS SDK should be configured with `server: 'sandbox'` or `server: 'production'`

This repo also now supports an optional `POLAR_SERVER_URL` override for Gitgram and AITM. Use it only if you are running a self-hosted/local Polar instance from the cloned source instead of hosted Polar.

## Staging Values

For staging/testing:
- set `POLAR_MODE=sandbox`
- create the token in the sandbox environment, not production
- use sandbox product IDs from the sandbox organization
- use the sandbox webhook secret from the sandbox endpoint config
- if you are running a local/self-hosted Polar fork, leave `POLAR_MODE` as documentation only and set `POLAR_SERVER_URL` to that instance instead

Sandbox dashboard/API references from local Polar docs:
- dashboard: `https://sandbox.polar.sh/start`
- API base: `https://sandbox-api.polar.sh`

Successful test card from Polar’s sandbox docs:
- `4242 4242 4242 4242`

## Production Values

For production:
- set `POLAR_MODE=production`
- use the live organization access token
- use live product IDs from the live organization
- use the live webhook secret from the production endpoint config

## Where Each Value Comes From

`POLAR_ACCESS_TOKEN`
- generate an organization access token from your organization settings

`POLAR_SERVER_URL`
- optional override for self-hosted/local Polar from `external/polar`
- when unset, the SDK uses hosted `sandbox` or `production` based on `POLAR_MODE`

`POLAR_MODE`
- `sandbox` for staging/test
- `production` for live deploy

`POLAR_WEBHOOK_SECRET`
- copy the webhook secret from the webhook endpoint setup in Polar
- when verifying through the SDK, pass the raw secret value
- Polar’s SDK handles the Standard Webhooks base64 requirement internally

`POLAR_*_PRODUCT_ID`
- copy the exact product IDs from the corresponding Polar environment
- sandbox and production product IDs are different because the environments are isolated

## Repo Mapping

Gitgram:
- `.env.gitgram.staging` or `.env.gitgram`
- `POLAR_ACCESS_TOKEN`
- `POLAR_MODE`
- `POLAR_WEBHOOK_SECRET`
- `POLAR_PREMIUM_PRODUCT_ID`
- `POLAR_CREATOR_PRODUCT_ID`

AITM API:
- `.env.aitm-api.staging` or `.env.aitm-api`
- `POLAR_ACCESS_TOKEN`
- `POLAR_MODE`
- `POLAR_WEBHOOK_SECRET`
- `POLAR_PRO_PRODUCT_ID`
- `POLAR_TEAM_PRODUCT_ID`

AITM website:
- `.env.aitm-website`
- `POLAR_ACCESS_TOKEN`
- `POLAR_MODE`
- `NEXT_PUBLIC_POLAR_PRO_PRODUCT_ID`
- `NEXT_PUBLIC_POLAR_TEAM_PRODUCT_ID`

## Testing Flow

1. Fill staging envs with sandbox values.
2. Run `npm run verify:launch:staging:full`.
3. Deploy with `bash scripts/deploy-launch.sh staging`.
4. Open the billing flow and complete a sandbox checkout with `4242 4242 4242 4242`.
5. Confirm webhook delivery updates the local subscription state.

If you are only validating deployability before billing is wired, `npm run verify:launch:staging` is enough. Use the `:full` gate when you expect checkout and webhooks to work.

## Current Code Alignment

This repo now aligns to the Polar source in two important ways:
- AITM and Gitgram Polar clients honor `POLAR_MODE`
- AITM and Gitgram webhook verification use the SDK webhook validator instead of custom signature logic
