# Maintainer evidence collector runbook

This runbook operates real adoption evidence. It does not authorize migration
or production deployment by itself.

## Inputs and privacy

Collector input must come from the repository host's real contribution records.
Hash repository, contributor, and contribution identifiers with a dedicated
HMAC-SHA-256 key before JSON reaches this API. Keep that HMAC key separate from
the database and from `ADOPTION_INGESTION_SECRET`. Never include login, name,
email, repository name, title, body, patch, or URL fields.

Each payload must include a version such as
`"collectorVersion": "github-coverage-1.0.0"`. Coverage payloads contain only
the bounded OSS window and opaque contribution rows. Case payloads contain an
opaque repository key plus existing AITimeMachine project, checkpoint, and
applied restore IDs.

## Preflight

1. Confirm migration `0009_add_oss_adoption_evidence` is approved, backed up,
   and applied before the new API process starts.
2. Confirm `GET /health/schema` recognizes all three OSS evidence tables.
3. Confirm `GET /health/adoption` is `degraded/unmeasured` before the first batch,
   not healthy and not a fabricated zero.
4. Set `ADOPTION_API_URL` to the exact API origin and
   `ADOPTION_INGESTION_SECRET` through the operator secret manager.
5. Choose one random idempotency key per logical batch or case and record it
   with the source run. Use the same key for every retry of that payload.

Validate the local file without sending it:

```sh
npm run collector:ingest -- coverage ./coverage.json --idempotency-key=coverage-2026-08-23T00:00Z --dry-run
```

## Ingest and verify

Send a coverage batch:

```sh
npm run collector:ingest -- coverage ./coverage.json --idempotency-key=coverage-2026-08-23T00:00Z
```

Send one verified restore case:

```sh
npm run collector:ingest -- case ./case.json --idempotency-key=case-restore-opaque-run-key
```

The first accepted request returns HTTP 201 and `replayed:false`. Repeating the
same key/body returns HTTP 200 and `replayed:true`. A changed body with the same
key must return 409. After coverage ingestion, confirm `/health/adoption` is
fresh and inspect `/v1/adoption/summary` for schema version 2, the intended
window, freshness, and aggregate-only fields.

Never retry a timeout with a new key. Retry the exact file with the original
key; the transaction receipt determines whether the first request committed.

## Secret rotation

1. Generate a new random secret of at least 32 characters in the secret manager.
2. Move the deployed current value to `ADOPTION_INGESTION_SECRET_PREVIOUS` and
   deploy the new value as `ADOPTION_INGESTION_SECRET`.
3. Update collectors. A response header
   `X-Collector-Key-Rotation: previous-key-accepted` means that operator still
   uses the old credential.
4. Observe one complete scheduled collection interval plus retry margin, capped
   at 24 hours.
5. Remove `ADOPTION_INGESTION_SECRET_PREVIOUS` and restart. Do not leave the
   overlap configured indefinitely.

## Failure and rollback

- HTTP 400: fix the source payload; keep the logical run's key only if the
  normalized body is unchanged.
- HTTP 401: stop and repair collector credentials. Do not print the secret.
- HTTP 409: compare the source run with the original request; never force a
  second record with a new key until the conflict is understood.
- HTTP 503 or timeout: retain the payload and retry with the same key.
- Stale health: investigate the scheduler/source API before publishing new
  claims. Historical aggregates remain labeled stale.

For rollback, stop collectors first. Roll back the API process, then follow the
approved database restore decision. Do not drop evidence tables merely to make
an older process start; retain source files, request IDs, and the backup until
the incident owner closes the review.
