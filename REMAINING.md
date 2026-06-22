# V1 Strict Execution Queue

Status legend: `DONE`, `IN_PROGRESS`, `TODO`, `BLOCKED`  
Ordering rule: highest dependency + launch risk first, then product acceleration.

## Queue (Strict Order)

1. `DONE` **[#20] Tenant isolation enforcement + tests across all data access paths**
   - Depends on: none
   - Why first: hard security gate for all products.
   - Progress: scoped reads/writes/events/stats and tree-storage isolation in sqlite_repo.ts. Finalized with 41 new tests in `tenant-isolation.test.ts` covering cloud sync paths (9), export paths (9), local API server routes (6), 15+ additional route file auth verification (14), and complete route coverage matrix (3).

2. `DONE` **[#21] Enforce org/project consent policies on every capture/export path**
   - Depends on: #20
   - Progress: consent enforcement on all capture/export paths with `assertConsent` + `handleApiError`. Cloud route stack enforces consent on writes and reads. Tests: `tests/consent-policy.test.ts`, `tests/consent-export-gates.test.ts`, `tests/api-server-authz.test.ts`, plus e2e pipeline test `tests/consent-pipeline-e2e.test.ts` (7 tests covering full denial, mid-pipeline revocation, selective consent, CloudSync blocking).

3. `DONE` **[#25] Formal authz/security review and close bypass findings**
   - Depends on: #20, #21
   - Progress: closed all high-risk API authz bypasses. Finalized with 10 new test cases in `api-server-authz.test.ts` covering cloud mutation (7 POST), cloud read (7 GET), sync/neon (5 POST), search sub-routes, timeline sub-routes, diff routes, internal API secret enforcement, public route accessibility, and consent route auth requirements.

4. `DONE` **[#24] Deletion/retention SLA metrics + alerting**
   - Depends on: #21
   - Progress: retention SLA evaluator with JSONL persistence, API endpoints (`/api/retention/sla`, `/api/retention/alerts`), CLI surface. 30 tests in `aitimemachine/tests/retention-sla-complete.test.ts` covering all 4 threshold types, multi-violation, env config, persistence, API response shape, checks structure.

5. `DONE` **[#23] Export traceability guarantees (consent ID + audit ID linkage 100%)**
   - Depends on: #21
   - Progress: strict export trace linkage (`exportId`, `consentSnapshotId`, `auditId`) integrated into all export entrypoints. 12 tests in `aitimemachine/tests/export-traceability-complete.test.ts` covering non-null fields, per-exporter trace validation, audit entries, deterministic consent snapshots.

6. `DONE` **[#22] Training export pipeline + redaction precision/recall measurement**
   - Depends on: #21, #23
   - Progress: redaction benchmark harness, privacy-redactor with P/R/F1 metrics, CI gate. 26 tests in `aitimemachine/tests/training-export-e2e.test.ts` covering e2e export+redaction, 18 PrivacyRedactor edge cases (API keys, emails, IPs, credit cards, JWTs, SSH keys), 5 benchmark custom sample tests.

7. `DONE` **[#26] Licensing/compliance guardrails for repo ingest + dataset export**
   - Depends on: #21, #22
   - Progress: SPDX license policy engine with dual-license OR/AND semantics, integrated into all export+ingest paths, compliance API endpoint. Enhanced `license-policy.ts` with `dualLicenseClasses` support. 60+ tests in `aitimemachine/tests/license-compliance-e2e.test.ts` covering unknown licenses, dual-license SPDX expressions, license changes, LICENSE file detection, restrictive blocking, all SPDX classifications, endpoint structure, legacy npm formats.

8. `DONE` **[#3] Implement canonical checkpoint tree storage (trees, not only blobs/checkpoints/diffs)**
   - Depends on: none
   - Progress: canonical tree persistence, wired into CLI/MCP. 7 tests including traversal, hash integrity, round-trip, deduplication.

9. `DONE` **[#4] Deterministic restore correctness tests for large/edge project states**
   - Depends on: #3
   - Progress: 51 tests across 3 files: `restore-correctness.test.ts` (16 tests - 150+ files, binary, symlinks, idempotency, deep nesting), `restore-edge-cases.test.ts` (18 tests - concurrent mods, CAS failures, round-trips, empty manifests), `restore-integrity.test.ts` (17 tests - hash verification, permissions, timestamps, audit trails, stress integrity).

10. `DONE` **[#9] End-to-end verification for before/after action chain integrity**
    - Depends on: #3, #4
    - Progress: added action-chain verifier (`aitimemachine/src/tools/action-chain-integrity.ts`) with checks for missing links, self-links, prefix mismatches, temporal ordering, event-link mismatches, and chain cycles. Added CLI surface `aitm verify-action-chains` in `aitimemachine/src/cli.ts` (supports `--project`, `--limit`, `--json`, exits non-zero on integrity failures). 12 tests in `aitimemachine/tests/action-chain-integrity.test.ts` covering broken chains, CLI exit codes.

11. `DONE` **[#7] Restore performance tuning to hit latency SLOs**
    - Depends on: #4
    - Progress: optimized restore validation hot path in `aitimemachine/src/core/restore.ts` to use CAS existence checks (`cas.has`) instead of fully loading each blob. 6 tests with SLO benchmarks (P95<=2s/10s) in `aitimemachine/tests/restore-validation-performance.test.ts`.

12. `DONE` **[#8] Retry/resume flow for failed restores with user diagnostics**
    - Depends on: #4, #11
    - Progress: `restoreWorkspaceWithRetry` with exponential backoff, diagnostics JSON, `resumeRestoreFromLatestTmp` with validation, `listRestoreDiagnostics` + `getRestoreDiagnosticsSummary`, CLI `aitm restore-diagnostics`. 22 tests covering resume, backoff, diagnostics schema, edge cases.

13. `DONE` **[#10] Benchmark dashboards (restore success, latency p95/p99, diff latency)**
    - Depends on: #4, #11
    - Progress: benchmark metrics pipeline (`aitimemachine/src/core/benchmark-metrics.ts`) with JSONL events, percentile calculations, dashboard aggregation. CLI `aitm benchmark-dashboard` command. 14 tests covering percentile accuracy and aggregation in `aitimemachine/tests/benchmark-metrics.test.ts`.

14. `DONE` **[#5] Semantic search relevance benchmark harness + acceptance thresholds**
    - Depends on: baseline search implementation
    - Progress: benchmark harness (`aitimemachine/src/core/search-relevance-benchmark.ts`) with top1/MRR/recall@3 metrics, env thresholds, CLI command `aitm search-relevance-benchmark`. 11 tests in `aitimemachine/tests/search-relevance-benchmark.test.ts` + CI gate in `aitimemachine/tests/search-relevance-gate.test.ts`.

15. `DONE` **[#1] Timeline UI with human-readable events + scoped filters**
   - Depends on: timeline API/filter readiness
   - Progress: timeline dashboard with humanized events, scoped filters, server-side propagation. Finalized with 40+ new action gerunds in utils.ts, enhanced trigger type labels (before/after AI, deploy, ci, webhook), keyboard shortcuts (1-5 filters, L linked, F expand, / search, R refresh, Esc close, ? help), FilteredEmptyState with contextual messages, polished TimelineSkeleton matching actual layout.

16. `DONE` **[#2] Restore preview UX + explicit confirm-before-apply flow**
   - Depends on: restore preview API reliability
   - Progress: finalized 3-step restore flow: Step 1 (preview with file stats + type icons), Step 2 (expandable per-file diff viewer + restore reason), Step 3 (warning panel + confirmation checkbox + typed RESTORE token), plus success animation screen. Visual step indicator, back/cancel navigation, enhanced loading/error states.

17. `DONE` **[#6] Checkpoint-linked context replay UX (messages + tool calls)**
   - Depends on: context retrieval API completeness
   - Progress: finalized with message threading (groupIntoThreads, ThreadedConversationView, MessageThread, ToolCallSequence, CheckpointMarkerInline), threaded/panel view toggle, ContextStatsBar (6 metrics), enhanced ToolCallViewer (duration display, args summary, 3-state status, file type icons, read file support), richer mock data (5 messages, 7 tool calls), share toast, polished loading/error/empty states.

18. `DONE` **[#13] Media pipeline hardening (validation, transcoding, abuse controls, lifecycle)**
    - Depends on: base composer APIs
    - Progress: hardened upload routes with media validation + rate limiting. Finalized with 51 tests in `mediaPipelineHardening.test.ts` (802 lines) covering media lifecycle management (15), transcoding config validation (5), abuse content size/MIME limits (7), magic byte + content validation (14), scheduler integration (4), and upload route hardening static analysis (6).

19. `DONE` **[#14] Moderation workflow (report, review queue, enforcement actions)**
    - Depends on: #13
    - Progress: full moderation system with enforcement service (warn/remove/suspend/ban + appeal reversal), auto-moderation pipeline (hate speech, spam, NSFW detection with dual thresholds), `ModerationAppeal` Prisma model, user suspension fields, priority/escalation on reports, 11 API endpoints, admin dashboard with review queue/stats/activity tabs, wired into post/comment/reel creation. Frontend moderation dashboard at `web/app/admin/moderation/page.tsx`.

20. `DONE` **[#19] Anti-spam/rate-limit policy + abuse detection gates**  
    - Depends on: #13, #14
    - Progress: implemented first enforcement slice in Gitgram moderation/report flows by adding dedicated per-user rate-limit tiers (`REPORTS`, `APPEALS`, `MODERATION_ACTIONS`) in `backend/src/config/rateLimitConfig.ts`, exporting new tiered middleware gates in `backend/src/middleware/tieredRateLimiter.ts`, and wiring them into report/appeal/moderation action routes (`backend/src/routes/reports.ts`, `backend/src/routes/admin.ts`). Extended abuse/rate-limit gates to additional report ingress routes (`backend/src/routes/posts.ts`, `backend/src/routes/reels.ts`, `backend/src/routes/messages.ts`, `backend/src/routes/privacy.ts`) and added spam checks for report/appeal text payloads in `backend/src/middleware/antiSpamMiddleware.ts` (including body-param target ID support). Fixed IPv6-safe rate-limit keying in `backend/src/middleware/rateLimiter.ts` to close express-rate-limit bypass warnings. Added persistent abuse telemetry (`backend/src/services/abuseTelemetryService.ts`) and wired violation/restriction/rate-limit/spam events into abuse middleware/services; exposed admin abuse counters via `GET /api/v1/admin/abuse/stats` and incidents feed `GET /api/v1/admin/abuse/incidents` in `backend/src/routes/admin.ts`. Added runtime-tunable abuse policy controls in `backend/src/services/abuseDetectionService.ts` and admin config endpoints (`GET/PUT /api/v1/admin/abuse/config`, `POST /api/v1/admin/abuse/config/reset`) with validation in `backend/src/validators/adminValidator.ts`. Added focused route-contract coverage for abuse admin paths in `backend/tests/adminAbuseRoutesAuthzValidation.test.ts` (`401/403/400/200` across config, reset, status, override endpoints).

21. `DONE` **[#15] Trending ranking quality tuning (signal weighting + anti-gaming)**  
    - Depends on: baseline trending signals
    - Progress: hardened ranking governance and anti-gaming correctness in Gitgram backend by enforcing admin-only access on trending signal config endpoints (`GET/PUT /api/v1/trending/config*`) via role checks in `backend/src/routes/trending.ts`, and fixed anti-gaming penalty mapping so `burst_comments` uses `postComments` penalty weight (instead of likes weight) in `backend/src/services/trendingScoring.ts`. Added focused coverage in `backend/tests/trendingConfigRouteAuthz.test.ts` (`401/403/200` authz assertions) and `backend/tests/trendingScoring.test.ts` (penalty-weight correctness and cap behavior).

22. `DONE` **[#18] Search/discovery UX for trending repositories and creators**
    - Depends on: #21
    - Progress: 3 pages fully rewritten - `trending/page.tsx` (924 lines: Hot Now/Today/Week/Rising tabs, language+topic filters, repo/creator/post grids, infinite scroll), `search/page.tsx` (917 lines: auto-suggestions, trending searches, recent history, parallel multi-type search, filter chips), `explore/page.tsx` (590 lines: featured repos, personalized recommendations, category browsing, language filters). Plus scoped discovery at `explore/repos/page.tsx`.

23. `DONE` **[#17] Follow/follower and engagement analytics surfaces**  
    - Depends on: baseline follow/interaction events
    - Progress: completed end-to-end analytics surface reliability by fixing API client pathing in `gitgram/web/services/analyticsService.ts` (migrated broken `/api/v1/*` calls to `/v1/*` against shared API base), so follower/engagement/content dashboards resolve correctly. Added route-level authz/validation hardening for user-specific analytics in `gitgram/backend/src/routes/userAnalytics.ts` with new validators in `gitgram/backend/src/validators/userAnalyticsValidator.ts` (`days`/`limit` bounds + `userId` checks) and focused route contract tests in `gitgram/backend/tests/userAnalyticsRoutesAuthzValidation.test.ts` (`401/400/200` assertions).

24. `DONE` **[#11] Repository profile UX (feed, media, interactions, checkpoint-linked posts)**
    - Depends on: none
    - Progress: backend pagination + snippets/media endpoints + tests. Frontend: RepoHero (topics, watchers), 6-tab nav (Feed/Media/Snippets/Activity/About/Settings), RepoSnippetsTab (language badges, code preview, infinite scroll), RepoActivityTab (GitHub timeline, AITM stories, filters), RepoCheckpointSection (diff stats, connector lines), Star+Share buttons.

25. `DONE` **[#12] Post/reel/story creation UX (screenshots/video/code snippets)**
    - Depends on: none
    - Progress: unified ContentComposer with POST/REEL/STORY tabs, MediaUploader (drag-and-drop), MediaPreview (multi-image carousel, video), CodeSnippetEditor (24 languages), RepoLinker (search + URL paste), SchedulePicker, DraftManager (auto-save + resume), DropZone. Updated create/story/post pages.

26. `DONE` **[#16] Repo-owner change-story workflow from AITM diffs**
    - Depends on: #11, #12
    - Progress: 7-step wizard at `web/app/create-change-story/page.tsx`, AITM API client (`web/services/aitmService.ts`), backend change story service with AES-256 key encryption + webhook auto-generation, `RepositoryAitmSettings` Prisma model, `Post.status` field (DRAFT/PUBLISHED), enhanced `AitmChangeStoryCard` component, repo settings UI for AITM integration, 3 AITM settings CRUD routes, change-stories webhook + publish routes.

27. `DONE` **[#27] Finalize production CI gates (build, migrations, service tests, integration-safe tests, smoke tests)**
    - Depends on: none
    - Progress: 4 workflow files across both products. Gitgram: ci.yml (9 jobs + gate), pr-check.yml (4 jobs). AITM: ci.yml (14 jobs + gate + release), pr-check.yml (6 jobs). Covers lint, tsc, build, Prisma/Drizzle migration validation, unit/integration tests, OpenAPI validation, redaction/search gates, smoke tests, Node 18/20 matrix.

28. `DONE` **[#28] Environment matrix + secrets contract for both products**  
    - Depends on: #27
    - Progress: completed cross-product environment/secrets contract documentation with unified index `docs/environment-matrix.md`, product matrices in `gitgram/backend/ENV_MATRIX.md` + `aitimemachine/ENV_MATRIX.md`, and shared secret ownership/rotation contract in `docs/secrets-contract.md`.

29. `DONE` **[#29] Deploy pipeline for API + workers with rollback policy**  
    - Depends on: #27, #28
    - Progress: completed deploy/rollback contract with product pipelines in `gitgram/.github/workflows/deploy.yml` and `aitimemachine/.github/workflows/deploy.yml` (pre-deploy gates, health checks, automatic rollback on failed gates, API+worker coverage), and added unified policy/runbook in `docs/deploy-pipeline.md`.

30. `DONE` **[#30] Managed scheduling wiring for retention/delete workers in production infra**
    - Depends on: #29
    - Progress: zero-dep cron scheduler with distributed locks, GC worker (stale checkpoint files + orphaned blobs), retention/delete/gc workers registered with configurable cron schedules, worker status API endpoints, opt-in via ENABLE_WORKERS=true, comprehensive tests. Production deploy wiring now enforces scheduler env propagation and worker health gates in `aitimemachine/.github/workflows/deploy.yml` (checks `GET /v1/workers/status` and rolls back on worker health failure), with contract updates in `aitimemachine/.env.example`, `aitimemachine/ENV_MATRIX.md`, and `docs/deploy-pipeline.md`.

31. `DONE` **[#31] Full OpenAPI contract validation in CI against implemented routes**
    - Depends on: #27
    - Progress: OpenAPI specs for both products (`aitimemachine/api-server/docs/openapi.yaml`, `gitgram/backend/docs/openapi.yaml`), route coverage validator (`scripts/validate-openapi-routes.ts`), spec structure validator (`scripts/validate-openapi-spec.ts`), CI integration.

32. `DONE` **[#32] Neon production verification job (schema probes + health probes + migration drift checks)**
    - Depends on: #27, #28
    - Progress: db-health.ts (connection, latency, replication, schema probes for 38 tables, migration drift), verify-neon.ts + verify-gitgram-db.ts standalone scripts, daily GitHub Actions workflow, GET /health/db + /health/schema endpoints, tests.

33. `DONE` **[#33] Unified cross-product runbook (Gitgram + AITM ops/incident/launch checklist)**
    - Depends on: #27, #29, #30, #31, #32
    - Progress: `docs/runbook.md` (1345 lines) covering service inventory, ops procedures, DB migration, backup/restore, health checks, worker management, P0-P3 incident response, launch checklist, maintenance. Plus `docs/ops-quickref.md` (247 lines) quick-reference card.

## Current Totals

- `IN_PROGRESS`: 0
- `TODO`: 0
- `DONE`: 33
- `BLOCKED`: 0
