# Adoption evidence methodology

`GET /v1/adoption/summary` reports aggregate product adoption, OSS contribution, maintainer response, and restore case evidence.

## Evidence sources

- Product adoption comes from the first-party `projects`, `checkpoints`, and `restore_events` tables.
- OSS metrics come from the latest completed `oss_coverage_batches` row and its `oss_contribution_records` rows.
- Case evidence comes from `oss_case_evidence` rows that passed server-side project, checkpoint, and applied restore checks.

The OSS ingestion route accepts external contributions only. It requires `contributorType: "external"` on each record and the database enforces the same value.

## Status rules

- `measured` with `0` means a completed coverage batch found no matching records.
- `unmeasured` with `null` means no completed coverage batch exists.
- `unavailable` means a database query failed. The public route returns HTTP 503 and no metrics.

Restore case evidence has no separate coverage batch. Until at least one checkpoint-to-applied-restore case passes the server consistency checks, its status is `unmeasured` and its counts are `null`; an OSS coverage batch cannot turn missing case evidence into a measured zero.

The response states adoption and OSS window start, end, day count, and status. Product adoption uses a rolling 30-day window. OSS metrics use the latest completed ingestion window.

## Internal ingestion

Both write routes require `X-Internal-Secret`, validated against the dedicated
`ADOPTION_INGESTION_SECRET`. Staging and production fail startup when that
secret is absent or shorter than 32 characters. Development alone may fall
back to `INTERNAL_SECRET`.

Every write also requires an `Idempotency-Key` with 8–128 visible characters
and a bounded `collectorVersion` in the JSON body. The server stores only the
key hash. Repeating the same key and normalized body returns the original row;
reusing a key with a changed body returns HTTP 409. Evidence rows retain their
key hash, so collector keys must never be reused for another logical run.
The same coverage window and collector version are also unique; a corrected
window requires a collector-version bump. For the same window, the latest
completed corrected batch is the deterministic public source.

`POST /v1/adoption/oss-coverage/batches` accepts one bounded coverage window, a positive measured repository count, and up to 5,000 contribution records. Repository, contributor, and contribution keys must be lowercase, secret-keyed HMAC-SHA-256 digests. The ingestion system must keep the HMAC key outside this database. Contribution open times must fall inside the coverage window. First response times cannot precede the contribution open time.

The server creates the batch, inserts every contribution, and marks the batch
completed inside one PostgreSQL transaction. Failure rolls back the entire
batch; no partial `collecting` row becomes visible. A completed batch with an
empty contributions array records a measured zero.

`POST /v1/adoption/case-evidence` accepts an opaque repository key plus existing project, checkpoint, and restore event identifiers. The server records the case only when:

- the checkpoint belongs to the supplied project;
- the restore belongs to the same project;
- the restore has `applied` status;
- the restore target equals the supplied checkpoint.

Case writes are transactional and idempotent by both explicit key and restore
event. A second payload cannot relabel a restore that already has evidence.

## Freshness and health

`oss.freshness` reports `fresh`, `stale`, or `unmeasured`, the age of the latest
completed coverage window, and the configured threshold. The default threshold
is 168 hours and can be changed with `OSS_COVERAGE_MAX_AGE_HOURS`.

`GET /health/adoption` exposes the same check. `/health/ready` is degraded for
stale or unmeasured coverage and unhealthy when the evidence schema/query is
unavailable. A stale batch remains historical measured evidence; it is never
presented as current coverage.

## Public privacy boundary

The public response contains counts, statuses, windows, and aggregate response hours. It never returns account, repository, project, checkpoint, restore, contributor, contribution, path, email, or name fields. Opaque keys remain private.

The website's `/maintainers` route reads this response through `/api/adoption/summary`. That same-origin route does not attach `X-Internal-Secret`, does not cache the response, and rejects malformed response shapes before the browser renders metrics. Internal ingestion stays outside the browser.

Operational collection, credential rotation, replay recovery, and rollback are
documented in `maintainer-collector-runbook.md`.
