# Deployment Pipeline Status

Last updated: 2026-05-09

## Canonical Launch Contract

Launch is manual-first.

- Canonical deploy path: `docs/runbook.md`
- Canonical control plane: `pm2`
- Canonical rollback model: operator-managed rollback to a previous checkout or release directory, plus database restore from backup when migrations are involved

No GitHub Actions workflow is required for launch readiness.

## Workflow Inventory

### Shared CI

Current root workflows:

- `.github/workflows/ci.yml`
- `.github/workflows/tests.yml`
- `.github/workflows/integration-tests.yml`
- `.github/workflows/smoke-tests.yml`
- `.github/workflows/migrations.yml`
- `.github/workflows/openapi-validation.yml`
- `.github/workflows/verify-production-db.yml`

These are build and verification workflows, not the manual launch source of truth.

### Gitgram Automation

Workflow files present in the repo:

- `gitgram/.github/workflows/deploy.yml`
- `gitgram/.github/workflows/deploy-production.yml`
- `gitgram/.github/workflows/deploy-staging.yml`
- `gitgram/.github/workflows/production-deploy.yml`

Status:

- `deploy.yml` is the newest automation candidate.
- `deploy-production.yml`, `deploy-staging.yml`, and `production-deploy.yml` are legacy or incomplete variants.
- None of the Gitgram deploy workflows should be treated as required for launch until they match the manual PM2 process-control path.

### AITM Automation

Workflow files present in the repo:

- `aitimemachine/.github/workflows/deploy.yml`
- `aitimemachine/.github/workflows/ci.yml`
- `aitimemachine/.github/workflows/pr-check.yml`

Status:

- `deploy.yml` is an automation candidate, not the launch source of truth.
- `ci.yml` currently contains a tag-driven npm release step for `@gitgram/timemachine`.
- The MCP package publish is still manual.

## Automation-Only Variables

These names exist in workflow files but are not part of the manual launch contract:

- `CURRENT_DEPLOY_TAG`
- `GITGRAM_DATABASE_URL`
- `GITGRAM_REDIS_URL`
- `AITM_DATABASE_URL`
- other workflow-scoped `GITGRAM_*` / `AITM_*` secrets

They are acceptable for future CI/CD, but the operator-managed launch path uses the root `.env.*` files and runtime process restarts described in `docs/runbook.md`.

## Rollback Policy

Rollback is manual-first.

Trigger rollback when any of these happen:

1. A service health gate fails after restart.
2. A smoke test fails.
3. A migration partially applies or produces broken behavior.
4. A package publish is broken after public verification.

Manual rollback actions:

1. Revert to the previous known-good tag, commit, or release directory.
2. Rebuild the affected service.
3. Restart the affected PM2 process with `--update-env`.
4. Re-run health gates.
5. Restore the database from the pre-deploy backup when schema state is unsafe.

For npm packages:

1. Deprecate the bad version.
2. Bump the version.
3. Rebuild and republish.
