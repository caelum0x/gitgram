# North Star PRD + Architecture v1

## 1) Product Vision

Build a unified platform with two products:

- `gitgram`: a vertical GitHub social network where repositories become social profiles and feeds (posts, reels, stories, comments, reactions, follows, trending discovery).
- `aitimemachine` (AITM): a "Time Machine for AI coding" that can restore code and chat context to exact previous states, inspect diffs, undo mistakes, and restore file/folder/project selectively.

Core thesis:
- Social coding (`gitgram`) creates engagement around repositories and developers.
- Trust and recoverability (`aitimemachine`) makes AI coding safe enough for daily professional use.

## 2) Product Boundaries

`gitgram` v1 includes:
- Import and mirror public GitHub repositories into social repository pages.
- Post media (screenshots/videos) linked to repositories and code snippets.
- Comment/reaction/follow system for repositories and developers.
- Trending feed based on repository activity plus social engagement.

`aitimemachine` v1 includes:
- Point-in-time restore for full project, folder, or single file.
- Before/after checkpoints around AI actions.
- Code diff and timeline navigation.
- Chat + tool-call context restoration linked to checkpoints.
- Search across code history and conversation history.

Out of scope for v1:
- Enterprise SSO/SAML hardening beyond initial scaffolding.
- Fully autonomous research/oracle workflows as a primary UX.
- Private repo ingest without explicit legal + security controls.

## 3) Architecture Decisions (Locked)

### 3.1 Source of Truth

Decision:
- Backend database + object storage is the authoritative source of truth.
- Local `.aitimemachine/` storage is a performance cache and offline buffer, not the canonical state.

Why:
- Cross-device restore.
- Crash resilience.
- Centralized auth, audit, retention, and deletion controls.

### 3.2 Storage Model

Use a hybrid Git-like model:
- `blobs` for content-addressed file data.
- `trees` for directory states.
- `checkpoints` for commit-like snapshots.
- `diffs` precomputed for fast timeline UX.
- `messages`, `tool_calls`, `contexts` linked to checkpoints.

### 3.3 Capture Model

Every AI code action records:
1. `before_action` checkpoint.
2. tool call + args + initiating message link.
3. `after_action` checkpoint.
4. diff generation and change classification.
5. optional async indexing/embeddings.

This guarantees deterministic "go back before error" behavior.

### 3.4 Privacy + Training Data Policy

Decision:
- Data capture is opt-in per workspace/org for training export.
- Default mode: operational capture only (restore/search), no training export.
- Redaction pipeline required before any dataset export.

## 4) Unified Domain Model

Primary entities:
- `users`, `organizations`, `projects`, `repositories`.
- Social: `repo_profiles`, `posts`, `reels`, `stories`, `comments`, `reactions`, `follows`, `trend_scores`.
- Time machine: `checkpoints`, `checkpoint_files`, `blobs`, `trees`, `diffs`, `messages`, `tool_calls`, `contexts`, `restore_events`.
- Governance: `consents`, `retention_policies`, `audit_logs`, `export_jobs`.

Entity links:
- A `repository` can have a `repo_profile` on gitgram.
- A `project` in AITM can map to one or more repositories.
- AITM checkpoints can be referenced by gitgram posts (for "before/after reels" and explainable dev content).

## 5) API Surface v1 (High-Level)

Social APIs:
- `POST /api/repos/import`
- `GET /api/repos/:id/feed`
- `POST /api/posts`
- `POST /api/comments`
- `POST /api/reactions`
- `POST /api/follows`
- `GET /api/trending`

AITM APIs:
- `POST /api/actions/before`
- `POST /api/actions/after`
- `POST /api/time/restore`
- `POST /api/time/undo`
- `GET /api/time/timeline`
- `GET /api/time/diff`
- `POST /api/time/restore-file`
- `POST /api/time/restore-folder`
- `GET /api/context/:checkpointId`

Governance APIs:
- `POST /api/consent`
- `POST /api/export/training`
- `POST /api/data/delete-request`
- `GET /api/audit`

## 6) UX Principles

Gitgram UX:
- Repository-first profile pages.
- Media-native storytelling for code changes.
- Fast interaction loop: watch, react, comment, fork/follow.

AITM UX:
- "Restore confidence in one click."
- Timeline with human-readable events ("before create_file src/api.ts").
- Clear scope controls: restore file, folder, or full workspace.
- Always show preview diff before irreversible restore actions.

## 7) Security, Compliance, and Risk Controls

Minimum controls for production:
- Tenant isolation at query and storage layers.
- Scoped API keys and per-project authorization.
- Encryption at rest and in transit.
- Audit logging for restore/export/delete operations.
- Retention and hard-delete workflows.
- PII/secret redaction before training export.

Key risks:
- Capturing sensitive code/prompts without explicit consent.
- Licensing conflicts when combining public repo/social content and training datasets.
- Data poisoning and abuse in social media uploads.

## 8) 90-Day Execution Plan

### Milestone A (Days 1-30): Core Reliability
- Finalize canonical schema for checkpoints/messages/tool calls.
- Ship deterministic restore for file/folder/project.
- Add consent + retention enforcement paths.
- Stand up baseline social repo feed with comments/reactions/follows.

Exit criteria:
- Restore success rate >= 99%.
- P95 restore latency <= 2s for single file and <= 10s for medium project.
- 0 known auth bypasses in internal security review.

### Milestone B (Days 31-60): Social + Time Integration
- Link gitgram posts to AITM checkpoint references.
- Add "change story" post type from diff snapshots.
- Ship trending ranking combining GitHub + on-platform signals.
- Release org/project scoped policies.

Exit criteria:
- >= 25% of active repos receive at least one social interaction.
- >= 40% of restores initiated from timeline UI complete without retry.

### Milestone C (Days 61-90): Intelligence + Growth
- Add semantic search on code/checkpoint history.
- Add high-trust training export pipeline (opt-in + redaction + audit).
- Launch creator features for repo owners (story/reel workflow).

Exit criteria:
- Search relevance accepted by internal benchmark.
- 100% training exports traceable by consent + audit IDs.

## 9) KPIs

Product KPIs:
- Weekly active developers.
- Restore actions per active AITM user.
- Social interactions per repository page.
- 7-day retention for users who performed at least one restore.

System KPIs:
- Checkpoint ingestion throughput.
- Restore success/latency percentiles.
- Diff generation latency.
- Sync lag (local cache to backend).

Safety KPIs:
- Consent coverage.
- Redaction precision/recall on sampled exports.
- Mean time to resolve data deletion requests.

## 10) Immediate Next Actions

1. Treat this file as canonical for v1 decisions.
2. Update conflicting docs to reference these decisions (especially source-of-truth and privacy policy).
3. Create implementation tickets from sections 3, 7, and 8 first (architecture lock + security gates before feature acceleration).

## 11) Cleanup Completed (2026-03-02)

The following code quality issues from the original audit have been resolved:

### Gitgram - Fixed
- **Route duplication** - Removed 17 legacy `/api/` routes that duplicated `/api/v1/` endpoints
- **Socket.IO deprecated service still used** - Fully migrated to `useSocket` hook; deleted `socketService.ts`; removed from `authStore`, `notifications/page.tsx`, `messages/page.tsx`
- **40+ console.log in backend** - Replaced ~52 `console.*` calls with Winston logger across 10 controller/util files
- **125+ markdown clutter files** - Deleted 121 .md + 8 .txt status/completion files; kept only README, CLAUDE, COMMANDS, TROUBLESHOOTING
- **@types in wrong dependency section** - Moved `@types/node-cron`, `@types/qrcode` to devDependencies

### AITM - Fixed
- **No disk-full handling** - ContentStore.put() now uses atomic write (.tmp + rename) with ENOSPC catch and cleanup
- **No rate limiting on MCP tools** - Added sliding-window rate limiter (restore*: 5/min, execute_command: 30/min, before/after_action: 60/min, default: 120/min)
- **API response inconsistency** - Created `sendSuccess`/`sendError`/`sendPaginated` helpers; applied to dashboard + search routes as starting examples
- **44 markdown clutter files** - Deleted; kept only README, CLAUDE, CHANGELOG, API, MCP, DEVELOPMENT, QUICKSTART, ROADMAP
- **@types in wrong dependency section** - Moved `@types/chokidar`, `@types/jsonwebtoken`, `@types/pg` to devDependencies

### Fixed (Phases 7-10, 2026-03-02)
- **Centralized error handling** — ApiError class + Errors factory applied to all 50 controllers via asyncHandler
- **Route consolidation** — Merged authNew→auth, deleted dead postsNew/postsController/postControllerUpdate
- **Swagger/OpenAPI** — 6 new schemas, annotations on 5 route files
- **Backend test infrastructure** — Mocked Prisma/Redis/auth/external services; 6 new test files (205+ tests)
- **N+1 query fix** — analyticsController uses aggregate/count instead of findMany+JS reduce
- **Redis cache** — Unified cacheMiddleware (Redis primary + in-memory fallback, X-Cache headers)
- **WebSocket hardening** — Rate limiting, input validation, heartbeat config, map cleanup
- **Health endpoints** — Extracted to /health, /health/ready, /health/db
- **AITM CI** — Added api-server-tests job
- **Structured logging** — console.log→logger in env-contract/index, request correlation IDs
- **Monorepo tooling** — Root package.json (test:all, lint:all, build:all), shared ESLint/Prettier
- **AITM Sentry** — @sentry/node integrated in api-server
- **cli-v2.ts refactored** — Modularized from 4,381 LOC to 91 LOC (done in Phase 6)
- **httpOnly cookies** — Already implemented; frontend uses withCredentials:true, localStorage only caches user metadata

### Fixed (Tasks 9-11, 2026-03-02)
- **AITM API URL alignment** — corrected mismatched AITM routes in integration service (`/restore/projects`, `/time/diff`, `/context/:id`)
- **Abuse detection on Redis** — all three abuse layers now use Redis-backed stores with in-memory fallback (`RedisSlidingWindow` + `RedisHashStore`)
- **TypeScript strict mode** — Gitgram backend already runs with `strict: true` and compiles clean

### Remaining Issues (Not Yet Fixed)
- Zero web/mobile tests
- 839 uses of `any` in AITM
- ~~Cross-product linking (posts <-> checkpoints)~~ — ✅ ALREADY BUILT: 7-step wizard (create-change-story), AitmChangeStoryCard renderer, aitmService API client, RepoAitmSettings, RepoCheckpointSection, CHANGE_STORY post type, checkpointRef field, webhook auto-generation
