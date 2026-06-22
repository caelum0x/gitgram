# V1 90-Day Backlog -> GitHub Issues Format

Reference docs:
- `NORTH_STAR_PRD_ARCHITECTURE_V1.md`
- `V1_90_DAY_BACKLOG.md`
- `CANONICAL_SQL_SCHEMA_V1.sql`

Label conventions:
- Milestone: `m:A`, `m:B`, `m:C`, `m:X`
- Area: `area:data`, `area:time-machine`, `area:social`, `area:governance`, `area:search`, `area:platform`
- Priority: `p0`, `p1`, `p2`
- Type: `type:feature`, `type:infra`, `type:security`, `type:docs`

Use this per issue:
```bash
gh issue create --title "<TITLE>" --label "<comma-separated-labels>" --body-file /tmp/issue.md
```

## Milestone A (Days 1-30)

### [A1-1] Define migration baseline from canonical SQL
- Labels: `m:A,area:data,p0,type:infra`
- Depends on: none
- Body:
```md
## Objective
Create a stable migration baseline from `CANONICAL_SQL_SCHEMA_V1.sql`.

## Scope
- Establish migration ordering and rollback strategy.
- Validate extensions (`pgcrypto`, `vector`) and compatibility in staging.

## Acceptance Criteria
- Migrations apply cleanly in dev/staging.
- Rollback path is tested and documented.
```

### [A1-2] Implement repositories/services for core time-context tables
- Labels: `m:A,area:data,p0,type:feature`
- Depends on: `A1-1`
- Body:
```md
## Objective
Implement data access services for checkpoints, checkpoint_files, messages, tool_calls, contexts.

## Acceptance Criteria
- CRUD + list APIs pass integration tests.
- Pagination/filtering support for timeline use cases.
```

### [A1-3] Add idempotency for before/after action capture
- Labels: `m:A,area:time-machine,p0,type:infra`
- Depends on: `A1-2`
- Body:
```md
## Objective
Prevent duplicate checkpoints for repeated action submissions.

## Acceptance Criteria
- Duplicate requests do not create duplicate checkpoints.
- Idempotency key behavior is documented and tested.
```

### [A2-1] Implement restore endpoint for file/folder/project scope
- Labels: `m:A,area:time-machine,p0,type:feature`
- Depends on: `A1-2`
- Body:
```md
## Objective
Implement `POST /api/time/restore` for project, folder, and file scopes.

## Acceptance Criteria
- Supports checkpoint-id and time-based restore selectors.
- Returns deterministic restore summary payload.
```

### [A2-2] Implement undo-last via linked before/after checkpoints
- Labels: `m:A,area:time-machine,p0,type:feature`
- Depends on: `A2-1,A3-1`
- Body:
```md
## Objective
Implement `POST /api/time/undo` based on linked before/after checkpoints.

## Acceptance Criteria
- One-call rollback to previous good state.
- Handles missing links gracefully with actionable errors.
```

### [A2-3] Add restore preview endpoint with diff summary
- Labels: `m:A,area:time-machine,p1,type:feature`
- Depends on: `A3-2`
- Body:
```md
## Objective
Show preview diff and file impact before applying restore.

## Acceptance Criteria
- Preview includes added/modified/deleted counts and key file list.
- Clients can block restore when preview indicates risk.
```

### [A3-1] Implement before/after action APIs
- Labels: `m:A,area:time-machine,p0,type:feature`
- Depends on: `A1-2`
- Body:
```md
## Objective
Implement `POST /api/actions/before` and `POST /api/actions/after`.

## Acceptance Criteria
- Successful actions write linked checkpoints.
- Message/tool-call linkage is persisted.
```

### [A3-2] Compute/store unified diffs and file-level stats
- Labels: `m:A,area:time-machine,p0,type:feature`
- Depends on: `A3-1`
- Body:
```md
## Objective
Persist precomputed diffs for fast timeline and restore previews.

## Acceptance Criteria
- `GET /api/time/diff` reads precomputed diffs.
- Diff stats are persisted per file and per action.
```

### [A3-3] Add local-cache to backend sync worker
- Labels: `m:A,area:platform,p1,type:infra`
- Depends on: `A3-1`
- Body:
```md
## Objective
Implement resilient push/retry pipeline from local cache to canonical backend.

## Acceptance Criteria
- Backoff + retry enabled.
- Sync lag metric emitted.
```

### [A4-1] Implement consent model enforcement
- Labels: `m:A,area:governance,p0,type:security`
- Depends on: `A1-1`
- Body:
```md
## Objective
Enforce `operational_capture` and `training_export` consent by org/project scope.

## Acceptance Criteria
- Capture/export endpoints enforce consent checks.
- No export allowed without explicit valid consent.
```

### [A4-2] Implement retention policy execution job
- Labels: `m:A,area:governance,p1,type:security`
- Depends on: `A4-1`
- Body:
```md
## Objective
Enforce retention windows for governed data classes.

## Acceptance Criteria
- Expired records are processed with soft/hard delete policy.
- Job outputs audit trail.
```

### [A4-3] Implement immutable audit logging for governed actions
- Labels: `m:A,area:governance,p0,type:security`
- Depends on: `A4-1`
- Body:
```md
## Objective
Audit restore/export/delete/security actions with actor and target metadata.

## Acceptance Criteria
- Every governed action writes an audit row.
- Query API supports actor/date/action filters.
```

### [A5-1] Import public GitHub repos into social profiles
- Labels: `m:A,area:social,p1,type:feature`
- Depends on: none
- Body:
```md
## Objective
Implement `POST /api/repos/import` and create repo social profile shell.

## Acceptance Criteria
- Imported repo appears with basic profile/feed.
- Duplicate import is idempotent.
```

### [A5-2] Implement posts/comments/reactions/follows APIs
- Labels: `m:A,area:social,p1,type:feature`
- Depends on: `A5-1`
- Body:
```md
## Objective
Ship social primitives for interaction on repository content.

## Acceptance Criteria
- Authenticated users can create/read interactions.
- Ownership and visibility checks enforced.
```

### [A5-3] Implement trending scorer v1
- Labels: `m:A,area:social,p2,type:feature`
- Depends on: `A5-2`
- Body:
```md
## Objective
Compute `trend_scores` using GitHub and in-app engagement signals.

## Acceptance Criteria
- `GET /api/trending` returns ranked repositories.
- Signal contribution is included in debug metadata.
```

## Milestone B (Days 31-60)

### [B1-1] Add `change_story` post type linked to checkpoints
- Labels: `m:B,area:social,p1,type:feature`
- Depends on: `A2-3,A5-2`
- Body:
```md
## Objective
Allow posts that reference checkpoint IDs and render change summaries.

## Acceptance Criteria
- `change_story` posts resolve checkpoint + diff preview.
- Invalid checkpoint references are rejected.
```

### [B1-2] Add media upload pipeline for screenshots/videos
- Labels: `m:B,area:social,p1,type:feature`
- Depends on: `A5-2`
- Body:
```md
## Objective
Support signed uploads and moderation checks before publish.

## Acceptance Criteria
- Image/video uploads complete through signed URL flow.
- Moderation status gates publishing.
```

### [B1-3] Add repository timeline widget from AITM checkpoints
- Labels: `m:B,area:social,p2,type:feature`
- Depends on: `A3-2,B1-1`
- Body:
```md
## Objective
Display technical change timeline on repo profile pages.

## Acceptance Criteria
- Timeline endpoint includes actor/tool/file summaries.
- UI consumes paginated timeline API.
```

### [B2-1] Timeline API pagination/filtering
- Labels: `m:B,area:time-machine,p1,type:feature`
- Depends on: `A3-2`
- Body:
```md
## Objective
Add timeline filters by actor, tool, file, and date range.

## Acceptance Criteria
- Stable pagination cursors.
- Filtered results verified by integration tests.
```

### [B2-2] Optimistic restore flow with conflict checks
- Labels: `m:B,area:time-machine,p1,type:feature`
- Depends on: `A2-1`
- Body:
```md
## Objective
Improve restore UX while preventing unsafe apply when local state diverges.

## Acceptance Criteria
- Conflict responses include actionable metadata.
- Client can retry with explicit override.
```

### [B2-3] SLO dashboards and alerts for restore/diff/sync
- Labels: `m:B,area:platform,p1,type:infra`
- Depends on: `A2-1,A3-3`
- Body:
```md
## Objective
Track restore latency/success, diff latency, and sync lag SLOs.

## Acceptance Criteria
- Dashboards and alert thresholds exist.
- On-call runbook references these alerts.
```

### [B3-1] Implement organizations, memberships, role matrix
- Labels: `m:B,area:governance,p1,type:feature`
- Depends on: `A1-1`
- Body:
```md
## Objective
Ship owner/admin/member authorization checks for org-scoped resources.

## Acceptance Criteria
- Role matrix enforced on protected endpoints.
- Membership management endpoints are tested.
```

### [B3-2] Scoped API keys and rotation
- Labels: `m:B,area:governance,p1,type:security`
- Depends on: `B3-1`
- Body:
```md
## Objective
Enforce read/write/admin key scopes and key rotation policy.

## Acceptance Criteria
- Scope violations return 403 with traceable audit events.
- Rotation flow supports zero-downtime cutover.
```

### [B3-3] Project-level policy binding and inheritance
- Labels: `m:B,area:governance,p1,type:feature`
- Depends on: `A4-1,B3-1`
- Body:
```md
## Objective
Bind capture/export/retention policies to org/project with deterministic inheritance.

## Acceptance Criteria
- Effective policy resolution API implemented.
- Override precedence tested.
```

## Milestone C (Days 61-90)

### [C1-1] Embedding worker for code/message chunks
- Labels: `m:C,area:search,p1,type:feature`
- Depends on: `A1-2`
- Body:
```md
## Objective
Generate embeddings asynchronously for eligible checkpoints/messages/docs.

## Acceptance Criteria
- Worker persists embeddings with retry logic.
- Backfill mode supports historical checkpoints.
```

### [C1-2] Semantic search APIs for code and chats
- Labels: `m:C,area:search,p1,type:feature`
- Depends on: `C1-1`
- Body:
```md
## Objective
Implement `POST /api/search/code` and `POST /api/search/chats`.

## Acceptance Criteria
- Returns ranked results with relevance score.
- Meets baseline latency target in staging.
```

### [C1-3] Hybrid search (keyword + vector rerank)
- Labels: `m:C,area:search,p2,type:feature`
- Depends on: `C1-2`
- Body:
```md
## Objective
Improve quality by combining lexical retrieval with vector reranking.

## Acceptance Criteria
- Evaluation set shows improved relevance over keyword baseline.
- Explainability metadata included for debugging.
```

### [C2-1] Training export jobs with consent/policy gates
- Labels: `m:C,area:governance,p0,type:security`
- Depends on: `A4-1,B3-3`
- Body:
```md
## Objective
Fail-closed export flow requiring valid consent and effective policy.

## Acceptance Criteria
- Jobs are blocked when gates fail.
- Gate decisions are logged in audit records.
```

### [C2-2] Redaction pipeline for secrets/PII/license-sensitive text
- Labels: `m:C,area:governance,p0,type:security`
- Depends on: `C2-1`
- Body:
```md
## Objective
Redact sensitive data before export artifact creation.

## Acceptance Criteria
- Precision/recall quality gates defined and met on sampled audits.
- Redaction report attached to export job summary.
```

### [C2-3] Signed export artifacts with full traceability
- Labels: `m:C,area:governance,p1,type:feature`
- Depends on: `C2-2`
- Body:
```md
## Objective
Ship signed artifact output and trace links to consent/job/actor.

## Acceptance Criteria
- Artifact metadata includes consent_id, job_id, actor_id.
- Download access enforces authorization.
```

### [C3-1] Reels/stories authoring flow for repo owners
- Labels: `m:C,area:social,p2,type:feature`
- Depends on: `B1-2`
- Body:
```md
## Objective
Creator workflow for publishing reels/stories tied to repositories.

## Acceptance Criteria
- Repo owners can draft, preview, publish.
- Visibility rules enforced.
```

### [C3-2] Follow recommendations (repo + developer graph)
- Labels: `m:C,area:social,p2,type:feature`
- Depends on: `A5-2`
- Body:
```md
## Objective
Recommend repositories/developers to follow based on activity graph.

## Acceptance Criteria
- Recommendation endpoint returns scored candidates.
- CTR beats random baseline.
```

### [C3-3] Anti-abuse moderation queue and enforcement actions
- Labels: `m:C,area:social,p1,type:security`
- Depends on: `B1-2`
- Body:
```md
## Objective
Moderation queue for flagged social content with auditable actions.

## Acceptance Criteria
- Flag -> review -> action lifecycle is tracked.
- Moderator actions are auditable.
```

## Cross-Cutting

### [X-1] End-to-end test strategy for capture/restore/social/governance
- Labels: `m:X,area:platform,p0,type:infra`
- Depends on: none

### [X-2] Observability with correlation IDs and tracing
- Labels: `m:X,area:platform,p1,type:infra`
- Depends on: `A3-1`

### [X-3] Security threat model and tenant-isolation verification
- Labels: `m:X,area:governance,p0,type:security`
- Depends on: `A4-1`

### [X-4] API/runbook/incident documentation
- Labels: `m:X,area:platform,p1,type:docs`
- Depends on: `A1-1`
