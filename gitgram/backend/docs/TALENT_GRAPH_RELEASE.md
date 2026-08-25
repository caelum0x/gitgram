# Talent Graph production release

This release candidate hardens the existing GitGram opportunity → referral →
pilot → public proof workflow. It does not authorize a database migration or
deployment.

## Wire contract

- Every Talent Graph `POST` and `PATCH` requires an `Idempotency-Key` containing
  8–128 visible ASCII characters.
- The key is scoped to authenticated actor and operation. Reusing it with the
  same JSON body replays the stored response; reuse with a different body
  returns `409`.
- Successful mutations return `Idempotency-Replayed` and
  `Idempotency-Key-Expires-In`. Receipts are retained for 30 days.
- Referral and pilot updates require the current positive `expectedRevision`.
  Concurrent writes from one revision produce one success and one `409`.
- Cookie-authenticated browser mutations require an exact `CORS_ORIGIN` match.
  Bearer-authenticated non-browser clients do not require an Origin header.

## Persistence and public boundary

`20260823000000_add_talent_opportunities` creates the domain tables, optimistic
revision columns, status-transition audit rows, durable mutation receipts, and
`TalentPublicProof`.

`TalentPublicProof` is the only pilot source used by public profile and matching
reads. It exposes an opaque public ID while retaining the internal pilot ID only
as a private projection key. It contains participant ID, normalized evidence
skills, completed time, and a validated public deliverable URL. Organization name, opportunity title,
problem, success metric, feedback, referral identity, and milestones remain in
private operational tables. The projection is inserted, updated, or deleted in
the same transaction as the pilot mutation that changes eligibility.

Public opportunity reads redact the creator identifier and all referral/pilot
operation counts. Authenticated opportunity owners receive those counts through
a private, non-cacheable response. If an institution changes a deliverable URL,
prior participant publication consent is reset and must be granted again.

## Required verification before release

1. Review and apply the Prisma migration to an empty temporary PostgreSQL
   database, then generate the Prisma client.
2. Confirm `CORS_ORIGIN` lists exact production web origins and the reverse
   proxy strips untrusted forwarding headers.
3. Exercise two accounts: institution creates an opportunity and referral;
   participant accepts; institution starts and completes; participant grants
   publication consent.
4. Replay every mutation with the same key/body and confirm one domain row plus
   one receipt. Reuse the key with a changed body and confirm `409`.
5. Race two referral decisions and two pilot updates from the same revision;
   confirm one write wins and the other returns `409`.
6. Confirm revoking consent, clearing the deliverable, cancelling, or leaving a
   pilot incomplete removes/withholds `TalentPublicProof`.
7. Inspect public profile and match responses for absence of institution-authored
   free text and private workflow identifiers.
8. Verify rollback from backup and document the migration rollback decision.

Build, typecheck, lint, tests, migration execution, server startup, and deploy
were not run while authoring this candidate. The repository-required
`before_action` and `after_action` hooks were unavailable in this environment.
