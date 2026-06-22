# V1 90-Day Backlog (Actionable)

Canonical product reference: `NORTH_STAR_PRD_ARCHITECTURE_V1.md`  
Canonical schema reference: `CANONICAL_SQL_SCHEMA_V1.sql`

## Milestone A (Days 1-30) - Core Reliability

### Epic A1 - Canonical Data Layer
- `A1-1` Define migration baseline from `CANONICAL_SQL_SCHEMA_V1.sql`.
  - Acceptance: migrations apply cleanly in dev/staging; rollback tested.
- `A1-2` Implement repository/service layer for `checkpoints`, `checkpoint_files`, `messages`, `tool_calls`, `contexts`.
  - Acceptance: CRUD + listing APIs pass integration tests.
- `A1-3` Add idempotency for action capture (`before_action`, `after_action`).
  - Acceptance: duplicate requests do not create duplicate checkpoints.

### Epic A2 - Deterministic Restore
- `A2-1` Implement `POST /api/time/restore` for project/file/folder scope.
  - Acceptance: restore supports exact checkpoint IDs and time-based selection.
- `A2-2` Implement `POST /api/time/undo` using linked before/after checkpoints.
  - Acceptance: undo returns previous good state in one operation.
- `A2-3` Add restore preview endpoint with diff summary.
  - Acceptance: clients can fetch preview before applying restore.

### Epic A3 - Capture Pipeline
- `A3-1` Implement `POST /api/actions/before` and `POST /api/actions/after`.
  - Acceptance: every successful action writes linked checkpoints.
- `A3-2` Compute/store unified diffs and file-level stats.
  - Acceptance: `GET /api/time/diff` returns precomputed diff + stats.
- `A3-3` Add sync worker for local cache to backend reconciliation.
  - Acceptance: sync lag metric reported; retries with backoff enabled.

### Epic A4 - Governance Baseline
- `A4-1` Implement consent model (`operational_capture`, `training_export`) with org/project scope.
  - Acceptance: capture/export endpoints enforce consent checks.
- `A4-2` Implement retention policy execution job.
  - Acceptance: expired records are soft-deleted then hard-deleted per policy.
- `A4-3` Implement audit logging for restore/export/delete actions.
  - Acceptance: every governed action emits immutable audit event.

### Epic A5 - Gitgram Baseline Social
- `A5-1` Implement `POST /api/repos/import` for public GitHub repos.
  - Acceptance: imported repo has profile and feed shell.
- `A5-2` Implement posts/comments/reactions/follows APIs.
  - Acceptance: end-to-end create/read flows work for authenticated users.
- `A5-3` Implement trending scorer v1 (GitHub + internal engagement).
  - Acceptance: `GET /api/trending` returns ranked repositories with reasons.

## Milestone B (Days 31-60) - Social + Time Integration

### Epic B1 - Checkpoint-Linked Content
- `B1-1` Add post type `change_story` referencing checkpoint IDs.
  - Acceptance: posts can render before/after diff summary.
- `B1-2` Add media upload pipeline for screenshots/videos.
  - Acceptance: signed upload + moderation scan before publish.
- `B1-3` Add repository timeline widget consuming AITM checkpoints.
  - Acceptance: repo profile shows ordered technical change events.

### Epic B2 - Timeline UX and Reliability
- `B2-1` Ship timeline endpoint pagination/filtering.
  - Acceptance: filters by actor, tool, file, and date range.
- `B2-2` Add optimistic restore flow with server-side conflict checks.
  - Acceptance: conflict paths return actionable error payloads.
- `B2-3` Add latency budgets and SLO dashboards for restore/diff/sync.
  - Acceptance: SLO alerts trigger on threshold breaches.

### Epic B3 - Org and Access Controls
- `B3-1` Implement organizations + memberships + role checks.
  - Acceptance: owner/admin/member role matrix enforced in APIs.
- `B3-2` Implement scoped API keys and key rotation.
  - Acceptance: read/write/admin scopes fully enforced and auditable.
- `B3-3` Add project-level policy binding (capture/export/retention).
  - Acceptance: policy inheritance and overrides are deterministic.

## Milestone C (Days 61-90) - Intelligence + Growth

### Epic C1 - Semantic Search
- `C1-1` Add embedding worker for code/message chunks.
  - Acceptance: embeddings persisted for eligible checkpoints/messages.
- `C1-2` Implement `POST /api/search/code` and `POST /api/search/chats`.
  - Acceptance: relevance and latency meet benchmark targets.
- `C1-3` Add hybrid search (keyword + vector rerank).
  - Acceptance: quality improves over keyword baseline in eval set.

### Epic C2 - Training Export Pipeline
- `C2-1` Implement export jobs with consent gate and policy checks.
  - Acceptance: exports fail closed when consent/policy is missing.
- `C2-2` Implement redaction pass for secrets/PII/license-sensitive text.
  - Acceptance: sampled audits meet precision/recall targets.
- `C2-3` Implement signed export artifacts + audit traceability.
  - Acceptance: each artifact maps to consent ID, job ID, and actor ID.

### Epic C3 - Creator Growth Features
- `C3-1` Add reels/stories authoring flows for repo owners.
  - Acceptance: owners can publish media content tied to repo/project.
- `C3-2` Add follow recommendations (repo + developer graph).
  - Acceptance: recommendation CTR beats random baseline.
- `C3-3` Add anti-abuse moderation queue and enforcement actions.
  - Acceptance: flagged content lifecycle is fully auditable.

## Cross-Cutting Tickets

- `X-1` Test strategy: unit + integration + e2e suites for capture/restore/social/governance APIs.
- `X-2` Observability: metrics, tracing, logs with request and checkpoint correlation IDs.
- `X-3` Security: threat model review and tenant-isolation verification tests.
- `X-4` Documentation: API reference + runbooks + incident handling guides.

## KPI Gates (Must Hit)

- `KPI-1` Restore success rate >= 99%.
- `KPI-2` P95 restore latency <= 2s (single file), <= 10s (medium project).
- `KPI-3` >= 25% of active repos receive at least one social interaction.
- `KPI-4` 100% training export jobs traceable to consent and audit records.
