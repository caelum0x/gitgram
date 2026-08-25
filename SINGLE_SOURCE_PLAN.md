# gitgram-ai Single Source Plan (v1)

Last updated: 2026-06-21

## The Mission

Git is 20 years old. GitHub is a web UI bolted on top.
Neither was built for AI agents generating 35 PRs a day,
social-first development, or deterministic workflow restore.

**GitGram is the social layer for GitHub repositories.** Every repository can
become a social account with posts, reels, stories, team photos, product videos,
screenshots, followers, and publishing workflows. GitGram uses GitHub APIs and
webhooks; it does not replace Git hosting, repository permissions, object
storage, refs, packfiles, or the Git wire protocol.

**AITM is deterministic workflow time travel for AI coding.** It captures and
restores agent actions, context, messages, tool calls, and checkpoints. It does
not claim to implement or replace Git. The separate Rust Git Forge product owns
the future Rust Git implementation and self-hostable forge boundary.

See `INTEGRATION_PLAN.md` for how the 8 cloned external repos
get merged into the actual product source trees.

Launch operations note (2026-05-09):
- The canonical launch contract is now the manual single-host runbook in `docs/runbook.md`.
- Historical references in this file to Vercel, Railway, or unfinished GitHub deploy workflows should be treated as planning notes, not launch instructions.

Reference intake note (2026-05-12):
- `docs/can be fork.md` is the maintained reference-clone inventory for external upstream repos under `external/`.
- Launch-critical external reference adoption is complete; this file remains the canonical execution plan.

## 1) Purpose

This document is the canonical execution plan for v1. It merges:
- Product/architecture decisions from `NORTH_STAR_PRD_ARCHITECTURE_V1.md`
- Delivery sequencing from `PLAN.md`

If any document conflicts with this one, this plan wins for implementation order.

## 2) Product Scope (Locked)

Products:
- `gitgram`: repository-first social network for developers (posts, reels, stories, comments, reactions, follows, trending).
- `aitimemachine` (AITM): deterministic restore and timeline system for AI coding workflows.

Out of scope for v1:
- Enterprise SSO/SAML hardening beyond scaffolding.
- Autonomous research/oracle workflows as primary UX.
- Private repo ingest without explicit legal and security controls.

## 3) Architecture and Policy Decisions (Locked)

1. Source of truth:
- Backend DB + object storage are authoritative.
- Local `.aitimemachine/` is cache/offline buffer only.

2. Storage model:
- `blobs`, `trees`, `checkpoints`, precomputed `diffs`, plus linked `messages`, `tool_calls`, `contexts`.

3. Capture model per AI action:
- `before_action` checkpoint.
- tool call metadata + initiating message link.
- `after_action` checkpoint.
- diff generation/classification.
- optional async indexing/embeddings.

4. Privacy and training:
- Training export is opt-in per workspace/org.
- Default is operational capture only.
- Redaction required before export.

5. Security minimums:
- Tenant isolation.
- Scoped auth and per-project authorization.
- Encryption at rest/in transit.
- Audit logs for restore/export/delete.
- Retention + hard-delete workflows.
- PII/secret redaction before training export.

## 4) Current State (As of 2026-03-17)

- Both products are **fully implemented, compiled, tested, and production-ready** at the code level.
- All core features verified end-to-end (see Section 4a and 4b below).
- Payment provider migrated from Stripe to Polar.sh (Stripe unavailable in Turkey).
- Only deployment/infrastructure work remains for launch.

### Completed (prior to 2026-03-02):
  - Route duplication removed in Gitgram.
  - Socket service migration completed.
  - Logging standardized with Winston.
  - API response helper foundation added in AITM.
  - Disk-full handling added in AITM ContentStore writes.
  - MCP rate limiting added.
  - Abuse detection moved to Redis-backed store (with fallback).
  - AITM backend URL alignment fixes completed.
  - TypeScript strict mode confirmed in both backends.

### Completed (2026-03-02 to 2026-03-09):

**Rebranding & Core Fixes:**
  - AITM rebranded from legacy "gitmind" references across CLI, API server, extensions.
  - CLI modularized from monolithic `cli-v2.ts` into per-command files under `src/cli/`.
  - MCP server consolidated from 3 separate packages into single unified package.
  - AITM API server error responses standardized via `wrapErrorMessage()` middleware.

**Test Coverage (1130+ tests, all passing):**
  - AITM Core: 520/520 (35 suites) — CLI commands, smart-restore, core engine.
  - AITM API Server: 538/538 + 19 skip (45 suites) — all integration/service tests.
  - AITM VS Code Extension: 62/62.
  - Gitgram Web: 72/72 (7 suites) — auth, post, user, component tests.
  - Test infrastructure: fixed supertest/listen mock conflict, fixed error format across 18 test files.

**Security Hardening:**
  - Advertisement endpoints: added rate limiting, UUID validation, ad-exists check before tracking.
  - Advertisement creation: added input validation (URL, budget, type, dates, content length).
  - Repository claim: added GitHub ownership verification via Octokit permissions check.
  - Webhook signature: fixed timing-unsafe comparison to use `crypto.timingSafeEqual`.
  - Gitgram auth already uses httpOnly cookies (JWT primary method).
  - AITM OAuth: CSRF state tokens verified in SSO tests.

**Type Safety:**
  - AITM API server `db` export: fixed root cause `any` → `NeonHttpDatabase<typeof schema>` (eliminated ~30 implicit any errors).
  - Fixed 21 explicit `any` types in AITM services (retention, webhookDelivery, sessionManager, data-pipeline).
  - Fixed `any` types in Gitgram paymentService, aitmService, mobile storeService, messages, notifications.
  - All type checks pass with zero errors across all products.

**Bug Fixes:**
  - Mobile store: fixed call to non-existent `getProducts()` → `getItems()`.
  - Mobile create post: replaced stubbed console.log handler with real `postService.createPost`.
  - Docker: fixed postgres version, port mappings, added missing env vars to AITM Dockerfile.
  - Removed dead code (unused `mock.ts` service file).

**CI/CD (already in place):**
  - 7 GitHub Actions workflows: ci.yml, tests.yml, integration-tests.yml, smoke-tests.yml, migrations.yml, verify-production-db.yml, openapi-validation.yml.
  - `.env.example` files for all products (root + per-package).

### Completed (2026-03-17):

**Payment Migration:**
  - Stripe → Polar.sh across entire codebase (backend, frontend, mobile, docs).
  - `@polar-sh/sdk@0.46.4` replaces `stripe` package.
  - Webhook verification uses `validateEvent` from `@polar-sh/sdk/webhooks` (Standard Webhooks spec).
  - Prisma schema: `stripeCustomerId`/`stripeSubscriptionId` → `polarCustomerId`/`polarSubscriptionId`.
  - Env vars: `POLAR_ACCESS_TOKEN`, `POLAR_WEBHOOK_SECRET`, `POLAR_PREMIUM_PRODUCT_ID`, `POLAR_CREATOR_PRODUCT_ID`, `POLAR_MODE`.

### Completed (2026-05-12):

**Payment Launch Alignment From Local Polar Source:**
  - Added `docs/polar-payment-setup.md` using the cloned `external/polar` docs/source as the billing reference.
  - Confirmed service integrations should use Polar Organization Access Tokens, not OAuth/OpenID Connect.
  - Confirmed sandbox and production are isolated, and both Gitgram and AITM now honor `POLAR_MODE`.
  - AITM website billing routes now share a `POLAR_MODE`-aware Polar client instead of assuming one environment.
  - AITM API webhook verification now uses the SDK validator path and accepts both camelCase and snake_case event fields.
  - Gitgram backend webhook handling now uses the SDK validator flow through a CommonJS-compatible wrapper instead of ad hoc event-field assumptions.
  - AITM API env validation now includes `POLAR_MODE`, and remaining env examples were updated to document it.
  - `npm run verify:launch` is back to failing only on real missing secrets / placeholder values, not on Polar contract mismatches.
  - Launch tooling now supports env-specific operator files such as `.env.gitgram.staging` and `.env.aitm-api.staging`, so staging can use Polar sandbox values without conflicting with production `POLAR_MODE=production`.
  - Dedicated Neon databases now exist for Gitgram and AITM staging/production, and the root env files now contain real DB URLs plus generated app-owned secrets instead of placeholders.
  - Launch readiness is now split into `core` versus `full` integration gates, so deployability is no longer blocked on GitHub OAuth, Polar, Resend, or Sentry being configured on day zero.

### Completed (2026-05-13):

**Reference Clone Adoption Into Product Code:**
  - Gitgram adopted `external/repo2txt` / `external/repo-to-text` into a shipped repo-to-text surface: backend export endpoint, short-path text page, raw text route, queryable export sizing, and discovery-surface `Text` / `Raw` links.
  - Gitgram web now has real Playwright coverage for the public repo-routing and repo-to-text surface: short-path `/:owner/:repo`, legacy `github/.../text` canonicalization, queryable export sizing, and repo-page → text-view navigation.
  - AITM MCP adopted `external/a2a-js` into a real A2A contract layer: canonical `message/send` handling with legacy `tasks/send` compatibility, protocol-versioned agent cards, spec-shaped task responses, and a repeatable `scripts/a2a-smoke-test.sh` verification path.
  - AITM MCP adopted the core `external/pal-mcp-server` patterns: real stable-vs-experimental tool policy, `DISABLED_TOOLS` shutdown support, aligned A2A/HTTP capability reporting, modular category-based tool registration instead of a monolithic `src/index.ts`, shared tool-annotation/output helpers, and declarative `createToolRegistrar` / `defineTool` registration helpers across the extracted tool modules.
  - AITM MCP adopted `external/context7` transport-hardening patterns end to end: request-scoped HTTP context, stable request IDs exposed via `X-Request-Id`, structured parse/protocol error mapping, per-request logging across MCP/A2A/discovery/health routes, and nested request-ID propagation from A2A into the internal `/mcp` bridge.
  - Launch readiness now includes real CLI/MCP tarball inspection for npm publishability, not only `npm pack --dry-run`.

### 4a) AITM Feature Verification

All time-travel features verified as fully implemented:
  - **Checkpoint creation**: SHA256 content-addressable storage, lazy file reading.
  - **Restore**: Atomic 3-phase (delete/restore/context), auto-backup, rollback on failure.
  - **Diff**: 3 algorithms (Myers, Patience, Histogram), unified output.
  - **Cat**: View any file from any past checkpoint.
  - **Storage**: `.aitimemachine/store/` loose objects + pack files + SQLite metadata.
  - **Cloud Sync**: Checkpoint/blob upload with quota, efficient dedup via hash checking.
  - **Web UI**: 6-step restore flow with preview, selective restore, undo.
  - **VS Code Extension**: List/create/restore/diff commands with autocomplete.
  - **API Server**: Full REST API for restore, manifest, blobs, batch operations.

### 4b) Gitgram Feature Verification

All 12 core social features verified as fully implemented (backend + frontend + database):
  - Auth (JWT + 2FA + GitHub/Google OAuth)
  - Posts (media, code snippets, mentions, hashtags)
  - Feed (algorithm-driven, personalized)
  - Comments (nested) & Likes
  - User Profiles (avatar, bio, settings)
  - Follow/Unfollow (with notifications, private account support)
  - GitHub Integration (real Octokit OAuth, repo sync, claiming)
  - Reels (video upload, comments, reactions)
  - Stories (24hr expiry, analytics, highlights)
  - Direct Messages (WebSocket real-time, group chat, read receipts)
  - Search (multi-type, advanced filters, relevance ranking)
  - Notifications (WebSocket real-time, push support)

### 4c) App-Code Stub / Placeholder Audit (2026-05-12)

This audit overrides earlier "fully implemented" wording for the specific surfaces below. These routes/components exist in product code, but some were empty shells, wired to wrong endpoints, or claimed features that are not backed by schema/routes yet.

**Fixed in current remediation batches (2026-05-12)**
  - `gitgram/web/app/explore/trending/page.tsx`
    - Replaced the empty shell with live trending posts, repos, and creators.
  - `gitgram/web/services/storyService.ts` and story pages under `gitgram/web/app/story/**`
    - Rewired to the real `/api/v1/stories/*` contract, including archive, analytics, replies, grouped feeds, and reaction summary behavior.
  - `gitgram/web/app/story/highlights/**` and `gitgram/web/app/story/settings/page.tsx`
    - Backed by real Prisma models and backend routes for named highlights plus `allowReplies` / `hideFrom` settings.
  - `gitgram/web/app/reel/[id]/page.tsx`, `gitgram/web/app/reel/[id]/likes/page.tsx`, and `gitgram/web/app/reel/[id]/share/page.tsx`
    - Normalized against real like/share contracts and the added `GET /api/v1/reels/:id/likes` backend route.
  - `gitgram/web/app/reel/[id]/music/page.tsx`
    - Replaced the fake `/v1/reels/music` call with real `/api/v1/music/*` search plus `POST/DELETE /api/v1/reels/:id/music`.
  - `gitgram/web/app/reel/[id]/reactions/page.tsx` and `gitgram/mobile/app/reel/[id]/reactions.tsx`
    - Made truthful by presenting reel likes instead of pretending typed reel reactions exist.
  - `gitgram/backend/src/controllers/reelsController.ts`, `gitgram/backend/prisma/schema.prisma`, and reel players on web/mobile
    - Reel effect and trim metadata now persist (`effectId`, `trimStart`, `trimEnd`, `thumbnailTime`) and the actual players honor those saved values instead of dropping them after publish.
  - `gitgram/web/app/reel/[id]/effects/page.tsx`
    - Replaced the fake effects endpoint call with a real view over the persisted reel effect metadata.
  - `gitgram/web/app/reel/drafts/page.tsx`
    - Removed the fake drafts endpoint assumption; the route now 404s instead of pretending reel drafts exist.
  - `gitgram/mobile/app/reel/[id]/music.tsx`, `gitgram/mobile/app/(modals)/create-reel.tsx`, and `gitgram/mobile/app/create/reel.tsx`
    - Real music selection now persists through the reel editor flow and saves through the reel music contract instead of fake success fallbacks.
  - `gitgram/mobile/app/(modals)/create-reel.tsx`, `gitgram/mobile/app/create/reel.tsx`, and `gitgram/mobile/components/Reel/ReelTrimEditor.tsx`
    - Replaced the disabled trim placeholder with real persisted trim controls shared across both mobile reel creation flows, and added real device-camera capture plus library import instead of library-only intake.
  - `gitgram/mobile/app/map/explore.tsx`
    - Replaced the broken map placeholder/no-op filter screen with a real project explorer backed by trending repositories, working language filters, optional location-aware map context, and an honest explanation that repository coordinates are not stored yet.
  - `gitgram/web/app/reels/create/page.tsx`
    - Removed non-persisted text/code overlay authoring, added real saved effect selection, and limited the UI to the reel fields the backend actually stores today.

**Remaining web placeholder-backed surfaces**
  - None currently identified in the active remediation scope.

**Remaining mobile placeholder-backed surfaces**
  - `gitgram/mobile/app/reel/drafts.tsx`
    - Now explicitly reports that reel drafts are unsupported rather than calling fake endpoints; real reel draft persistence still does not exist.

**Immediate remediation batch — NEXT**
  - Decide whether reel drafts are a real product requirement or should stay removed until backed by schema/routes.
  - Decide whether dedicated in-app reel recording is required beyond the now-working device camera capture path.
  - Decide whether text/code overlays on reels are a real persisted feature worth adding back later with schema/routes and rendering support.

**Queued after current batch**
  - Align any future reel overlay authoring with a persisted backend contract before surfacing it again on mobile.

### 4d) External Reference Adoption Status

This section summarizes launch-state reference adoption. No launch-critical reference adoption remains; future uses below are post-launch enhancements only if the product needs them.

| Reference | Product | Status | Active plan |
|---|---|---|---|
| `repo2txt` + `repo-to-text` | Gitgram | `adopted` | No launch-critical follow-up remains. Revisit only if Gitgram adds compose/share/import workflows that need deeper repo-text embedding. |
| `a2a-js` | AITM MCP | `adopted` | No launch-critical follow-up remains. Revisit only if AITM adds true A2A streaming or additional task lifecycle methods beyond the current blocking `message/send` bridge. |
| `context7` | AITM MCP | `adopted` | No launch-critical follow-up remains. Revisit only if AITM later needs deeper user/auth context propagation across downstream remote calls. |
| `pal-mcp-server` | AITM MCP | `adopted` | No launch-critical follow-up remains. Revisit only if the MCP surface expands enough to justify automatic output-schema or capability-family generation. |

## 5) Unified Delivery Sequence

The sequencing below resolves prior ambiguity:
- Architecture/security gates remain mandatory.
- Launch blockers are prioritized first because they prevent external usability.
- Feature acceleration continues only after launch unblockers are complete.

### Stage A: Launch Unblockers (Immediate) — IN PROGRESS

Goal: make both products externally usable.

Stage A readiness helpers now in repo:
- `docs/runbook.md` remains the canonical manual launch path.
- `scripts/verify-launch-readiness.sh` is the one-command gate for PM2, env file presence, secret contract validation, and AITM package publishability.
- `npm run verify:aitm-packages` now goes beyond `npm pack --dry-run`: it also creates real CLI/MCP tarballs, unpacks them, and verifies published bin paths, packaged files, and the MCP dependency on `@gitgram/timemachine`.
- `npm run verify:a2a` is the standards smoke for AITM's HTTP A2A card and `message/send`/`tasks/send` behavior.
- `npm run verify:launch` runs the default `core` gate.
- `npm run verify:launch:full` runs the stricter third-party integration gate.
- `scripts/deploy-launch.sh` is the PM2-aligned scripted deploy path for Gitgram and AITM.
- `scripts/verify-public-launch.sh` is the public-domain smoke pass for `gitgram.app` and AITM endpoints after DNS/nginx cutover.

#### A1. Publish AITM packages to npm — TODO

Both packages are fully configured for publishing. CLI must be published first (MCP depends on it).

**Step-by-step publish plan:**

1. **Pre-publish checks:**
   ```bash
   cd aitimemachine && npm run build && npm test   # verify clean build + 520 tests pass
   cd mcp && npm run build                          # verify MCP builds
   ```

2. **Publish CLI first** (`@gitgram/timemachine@2.0.0`):
   ```bash
   cd aitimemachine
   npm publish --access public
   ```
   - Package: `@gitgram/timemachine`
   - Bin: `aitm`, `aitimemachine`
   - Entry: `lib/cli-v2.js`
   - Files: `lib/**/*`, `README.md`, `LICENSE`
   - Hooks: `prepack` → build, `prepublishOnly` → build + test

3. **Verify CLI install:**
   ```bash
   npx @gitgram/timemachine --version
   mkdir /tmp/aitm-test && cd /tmp/aitm-test
   npx @gitgram/timemachine init
   npx @gitgram/timemachine checkpoint --message "test"
   ```

4. **Publish MCP server** (`@gitgram/timemachine-mcp@2.0.0`):
   ```bash
   cd aitimemachine/mcp
   npm publish --access public
   ```
   - Package: `@gitgram/timemachine-mcp`
   - Bin: `aitm-mcp`, `aitm-mcp-client`
   - Entry: `dist/index.js`
   - Depends on: `@gitgram/timemachine@^2.0.0` (must be on npm first)
   - Files: `dist/**/*`, `server.json`, `README.md`, `LICENSE`

5. **Verify MCP install:**
   ```bash
   npx @gitgram/timemachine-mcp --help
   ```

6. **Automated releases (future tags):**
   - CI workflow (`aitimemachine/.github/workflows/ci.yml`) has a release job
   - Triggered on tag push matching `v*`
   - Uses GitHub secret `NPM_TOKEN`, passed to npm as `NODE_AUTH_TOKEN`
   - Current workflow publishes `@gitgram/timemachine`; MCP publish still requires a manual step until automation is aligned

**npm cost: $0** (public packages are free)

#### A2. Configure production secrets — TODO

| Secret | Product | Source |
|--------|---------|--------|
| `POLAR_ACCESS_TOKEN` | Gitgram | polar.sh > Organization Settings > Access Tokens |
| `POLAR_WEBHOOK_SECRET` | Gitgram | polar.sh > Organization Settings > Webhooks |
| `POLAR_PREMIUM_PRODUCT_ID` | Gitgram | polar.sh > Products (create Premium $9.99/mo) |
| `POLAR_CREATOR_PRODUCT_ID` | Gitgram | polar.sh > Products (create Creator $19.99/mo) |
| `POLAR_ACCESS_TOKEN` | AITM | polar.sh (same or separate org) |
| `GITHUB_CLIENT_ID` | Gitgram | github.com/settings/developers |
| `GITHUB_CLIENT_SECRET` | Gitgram | github.com/settings/developers |
| `GOOGLE_CLIENT_ID` | Gitgram | console.cloud.google.com |
| `GOOGLE_CLIENT_SECRET` | Gitgram | console.cloud.google.com |
| `CLERK_SECRET_KEY` | AITM | dashboard.clerk.com |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | AITM | dashboard.clerk.com |
| `RESEND_API_KEY` | Both | resend.com/api-keys |
| `SENTRY_DSN` (x2) | Both | sentry.io (one project per product) |
| `DATABASE_URL` | Gitgram | Neon console |
| `DATABASE_URL` | AITM | Neon console |
| `REDIS_URL` | Gitgram | Upstash console |
| `AWS_ACCESS_KEY_ID` | Gitgram | AWS IAM |
| `AWS_SECRET_ACCESS_KEY` | Gitgram | AWS IAM |
| `JWT_SECRET` | Gitgram | Generate: `openssl rand -base64 48` |
| `JWT_REFRESH_SECRET` | Gitgram | Generate: `openssl rand -base64 48` |

#### A3. Deploy production baseline — TODO

- Provision VPS (Hetzner CX32 recommended: 4 vCPU, 8 GB RAM, 80 GB NVMe).
- Configure DNS records (A/AAAA) for `gitgram.app`, `api.gitgram.app`, `aitm.gitgram.app`.
- TLS via Let's Encrypt / Caddy auto-HTTPS.
- Build the services and start them under PM2 on the launch host.
- Verify health endpoints and monitoring.

#### A4. Run E2E smoke tests — PARTIAL

- ~~AITM install/init/checkpoint/timeline path.~~ **DONE** — covered by 520 CLI tests.
- ~~Gitgram public repo routing + repo-to-text path.~~ **DONE** — covered by focused Playwright browser tests with mocked repository/export APIs.
- Gitgram signup/oauth/post/comment/notification path. **PARTIAL** — auth/post/comment/notification mocks, selectors, and a focused Playwright spec now exist; backend notification detail routes and checkpoint-aware post flows are wired. Local `next dev` browser execution still blanks on protected client pages, so deployment-backed verification is still required before treating this as closed.

Exit criteria:
- Both products are installable/deployable.
- All health checks pass.
- End-to-end flows complete without critical failure.

### Stage B: Security Closure — COMPLETE

1. ~~JWT storage migration to httpOnly cookies in Gitgram.~~ **DONE**
2. ~~OAuth callback URL hardening + redirect validation + CSRF state checks in AITM.~~ **DONE**
3. ~~Complete API response helper migration in AITM for consistent error/success semantics.~~ **DONE**
4. ~~Validate retention/delete/export audit paths in staging.~~ **DONE**

Additional security work completed beyond original plan:
- Advertisement tracking endpoints: rate limiting + ad-exists validation.
- Repository claim: GitHub ownership verification via Octokit.
- Webhook signature: timing-safe comparison fix.
- Input validation added on advertisement and claim routes.

Exit criteria: **ALL MET**

### Stage C: Reliability and Code Quality — COMPLETE

1. ~~Split AITM `cli-v2.ts` into modular command files.~~ **DONE**
2. ~~Reduce `any` usage in AITM by priority surfaces.~~ **DONE**
3. ~~Add Gitgram frontend unit/integration tests.~~ **DONE** — 72 tests.
4. Add Playwright critical-path E2E and CI gating. **PARTIAL** — repo routing/text coverage is in place and gated in CI. A second focused auth/comment/notification browser spec and CI job wiring are added, but protected-page browser verification still needs production-style validation because the local dev-server path is not stable enough to close the item.

Exit criteria: **3 of 4 MET** (repo-route coverage and CI gate added; broader protected live-flow coverage is implemented but not fully verified yet)

### Stage D: Cross-Product Integration — PARTIAL / POST-LAUNCH (New Feature Coding)

Note: This is **post-launch enhancement** work, not a gap in existing v1 functionality.

1. ~~Add checkpoint linkage in Gitgram posts (`aitm_checkpoint_id` / `checkpointRef`).~~ **PARTIAL** — checkpoint-aware post creation now works through Gitgram compose, the backend accepts checkpoint metadata, and checkpoint-only post publishing is covered by service/unit validation.
2. ~~Ship AITM "share as post" flow (connect existing UI to backend).~~ **PARTIAL** — AITM context replay now deep-links into Gitgram compose for post and change-story publishing with checkpoint/project context carried through.
3. ~~Add "Change Story" post type from AITM diffs.~~ **PARTIAL** — Gitgram compose accepts AITM diff/query params, Change Story publishing is live, and Creator Studio exposes repo-linked Change Story entry points. Trend-side surfacing is still open.
4. Launch trend ranking combining GitHub + platform social signals. **TODO**

### Stage E: Intelligence and Growth — PARTIAL / POST-LAUNCH (New Feature Coding)

Note: This is **post-launch enhancement** work, not required for v1.

1. ~~Semantic search over checkpoint/code history.~~ **PARTIAL** — AITM website now has a Semantic Search dashboard backed by new internal knowledge-base search/stats/artifact routes and passing integration coverage on the API layer.
2. ~~Training export pipeline with opt-in + redaction + audit traceability.~~ **PARTIAL** — AITM website now has Training Exports controls, project-level consent toggles, internal pipeline routes, and passing integration coverage for consent/pipeline happy paths plus denial enforcement. End-to-end artifact generation on deployed infra is still open.
3. ~~Creator tooling for repo owners (story/reel workflows).~~ **PARTIAL** — Gitgram Creator Studio now exposes repository creator tools, direct repo text/export entry points, post/change-story shortcuts, and AITM setup links. Expanded story/reel growth workflows remain open.

## 6) Priority Ticket Backlog (Ordered)

P0 (must complete first — deployment):
- Publish AITM CLI and MCP packages to npm.
- Production secrets setup for both products.
- Production infra deploy + DNS/TLS + monitoring.
- End-to-end smoke verification on live environment.

~~P1~~ **COMPLETE:**
- ~~Gitgram auth token migration to httpOnly cookies.~~ Done.
- ~~AITM OAuth callback and redirect hardening.~~ Done.
- ~~AITM response helper migration completion.~~ Done.
- ~~Retention/delete/export audit verification.~~ Done.

~~P2~~ **COMPLETE:**
- ~~AITM CLI modularization.~~ Done.
- ~~AITM `any` reduction campaign.~~ Done.
- ~~Gitgram frontend testing stack and CI enforcement.~~ Done.

P3 (post-deploy — new feature coding + testing):
- Finish deployment-backed verification for protected Gitgram auth/post/comment/notification browser flows.
- Complete trend ranking / discovery surfacing for checkpoint-linked posts and Change Story content (Stage D).
- Harden semantic search relevance and deployed training-export artifact generation (Stage E).
- Expand Creator Studio beyond repo quick actions into richer story/reel growth tooling (Stage E).

## 7) Infrastructure Cost Breakdown

### Per-Service Pricing (Monthly)

| Service | Product | Plan | Monthly Cost | Notes |
|---------|---------|------|-------------|-------|
| **npm** | AITM | Public packages | **$0** | Unlimited free public packages |
| **Hetzner VPS** | Both | CX32 (4 vCPU, 8 GB, 80 GB) | **~$7** | Docker compose for Gitgram backend + AITM API. ~$8/mo after Apr 2026 price increase |
| **Neon PostgreSQL** | Gitgram | Free → Launch | **$0–$5** | Free: 100 CU-hrs, 0.5 GB. Launch: $5/mo min, storage $0.35/GB-mo |
| **Neon PostgreSQL** | AITM | Free → Launch | **$0–$5** | Separate project. Same tiers |
| **Vercel** | Both (web) | Hobby (free) | **$0** | Free for non-commercial. Pro: $20/user/mo when needed |
| **Polar.sh** | Both | Transaction fees only | **$0 base** | 4% + $0.40 per transaction. No monthly fee. MoR handles taxes |
| **Clerk** | AITM | Free | **$0** | Free up to 50K MAU. Pro: $20/mo when needed |
| **Resend** | Both | Free | **$0** | 3,000 emails/mo free. Pro: $20/mo for 50K emails |
| **Sentry** | Both | Developer (free) | **$0** | 5K errors/mo, 1 user. Team: $26/mo when needed |
| **Upstash Redis** | Gitgram | Free | **$0** | 256 MB, 500K commands/mo free |
| **AWS S3** | Gitgram | Pay-as-you-go | **~$1–5** | $0.023/GB storage + $0.09/GB egress (first 100 GB free) |
| **Domain** | Both | .app domain | **~$2/mo** | ~$20–25/year for `.app` domain |
| **GitHub Actions** | Both | Free tier | **$0** | 2,000 min/mo free for public repos |

### Cost Scenarios

#### Minimum Launch (Free Tiers Only)

| Item | Cost |
|------|------|
| Hetzner CX32 | $7/mo |
| Domain (.app) | $2/mo |
| Everything else on free tiers | $0 |
| **Total** | **~$9/mo** |

#### Small Scale (100 users, light usage)

| Item | Cost |
|------|------|
| Hetzner CX32 | $7/mo |
| Neon Launch x2 | $10/mo |
| AWS S3 (10 GB) | $1/mo |
| Domain | $2/mo |
| Vercel Hobby | $0 |
| Clerk Free | $0 |
| Resend Free | $0 |
| Sentry Free | $0 |
| Upstash Free | $0 |
| Polar.sh (est. 20 txns) | ~$12/mo (fee on revenue) |
| **Total infra** | **~$20/mo** (+ Polar fees on revenue) |

#### Growth (1,000 users, moderate usage)

| Item | Cost |
|------|------|
| Hetzner CX42 (8 vCPU, 16 GB) | $18/mo |
| Neon Scale x2 | $40/mo |
| AWS S3 (100 GB + egress) | $12/mo |
| Vercel Pro (1 seat) | $20/mo |
| Clerk Pro | $20/mo |
| Resend Pro | $20/mo |
| Sentry Team | $26/mo |
| Upstash Pay-as-you-go | $5/mo |
| Domain | $2/mo |
| Polar.sh (est. 200 txns) | ~$120/mo (fee on revenue) |
| **Total infra** | **~$163/mo** (+ Polar fees on revenue) |

### Polar.sh Revenue Model

Polar.sh charges **4% + $0.40 per transaction** (no monthly fee). Revenue examples:

| Subscribers | Plan | Gross Revenue | Polar Fee (4% + $0.40) | Net Revenue |
|-------------|------|--------------|----------------------|-------------|
| 10 | Premium ($9.99) | $99.90/mo | $4.40 + $4.00 = $8.40 | $91.50/mo |
| 10 | Creator ($19.99) | $199.90/mo | $8.00 + $4.00 = $12.00 | $187.90/mo |
| 50 | Mixed | ~$750/mo | ~$50 | ~$700/mo |
| 100 | Mixed | ~$1,500/mo | ~$100 | ~$1,400/mo |
| 500 | Mixed | ~$7,500/mo | ~$500 | ~$7,000/mo |

Polar is the Merchant of Record — they handle tax calculation, collection, and remittance globally.

## 8) KPIs

Product:
- Weekly active developers.
- Restore actions per active AITM user.
- Social interactions per repository page.
- 7-day retention after first restore.

System:
- Restore success rate and latency percentiles.
- Diff generation latency.
- Checkpoint ingestion throughput.
- Sync lag (local cache to backend).

Safety:
- Consent coverage.
- Redaction precision/recall.
- Mean deletion-request resolution time.

## 9) Governance Rule

Before starting any new feature stream, verify:
1. It does not violate Section 3 locked decisions.
2. It does not bypass P0/P1 launch and security gates.
3. It has measurable exit criteria tied to KPIs in Section 8.

## 10) Status Summary (2026-03-17)

| Stage | Status | Work Type |
|-------|--------|-----------|
| v1 Core Coding | **COMPLETE** | All features implemented and tested (1130+ tests passing) |
| Payment Migration | **COMPLETE** | Stripe → Polar.sh (all code, config, docs updated) |
| Stage A (Deploy) | **TODO** | npm publish (CLI + MCP), secrets, VPS, DNS/TLS, DB |
| Stage B (Security) | **COMPLETE** | All exit criteria met |
| Stage C (Quality) | **COMPLETE** | 3/4 met; Playwright deferred to post-deploy |
| Stage D (Cross-Product) | **PARTIAL / POST-LAUNCH** | Enhancement work; not a launch blocker |
| Stage E (Growth) | **PARTIAL / POST-LAUNCH** | Enhancement work; not a launch blocker |

**Bottom line:**
- Zero coding needed for v1 launch — only deployment/infrastructure remains.
- Minimum launch cost: **~$9/mo** (Hetzner + domain, everything else free tier).
- Stage D and E are post-launch enhancements, not v1 gaps.

  Tests — All Passing

  ┌─────────────────┬───────────────────────┬───────────┐
  │      Suite      │         Tests         │  Status   │
  ├─────────────────┼───────────────────────┼───────────┤
  │ AITM Core       │ 520/520               │ PASS      │
  ├─────────────────┼───────────────────────┼───────────┤
  │ AITM API Server │ 538/538 (+19 skipped) │ PASS      │
  ├─────────────────┼───────────────────────┼───────────┤
  │ Gitgram Web     │ 72/72                 │ PASS      │
  ├─────────────────┼───────────────────────┼───────────┤
  │ Total           │ 1,130                 │ ALL GREEN │
  └─────────────────┴───────────────────────┴───────────┘

  npm Packages — Ready to Publish

  ┌───────────────────────────────┬─────────┬────────────────────────────────────────────────────────┐
  │           Package             │ Version │                       Details                          │
  ├───────────────────────────────┼─────────┼────────────────────────────────────────────────────────┤
  │ @gitgram/timemachine          │ 2.0.0   │ CLI: aitm, aitimemachine. 23 commands, core engine     │
  ├───────────────────────────────┼─────────┼────────────────────────────────────────────────────────┤
  │ @gitgram/timemachine-mcp      │ 2.0.0   │ MCP server: aitm-mcp. Depends on CLI ^2.0.0           │
  └───────────────────────────────┴─────────┴────────────────────────────────────────────────────────┘
 Polar.sh fee on $20 subscription           
                                                                                                                                  
  ┌─────────────┬─────────────────┐                                                                                                                          
  │             │ Per Transaction │                                                                                                                          
  ├─────────────┼─────────────────┤                                                                                                                          
  │ Gross       │ $20.00          │                                                                                                                          
  ├─────────────┼─────────────────┤                                                                                                                          
  │ 4% fee      │ -$0.80          │
  ├─────────────┼─────────────────┤                                                                                                                          
  │ Fixed fee   │ -$0.40          │
  ├─────────────┼─────────────────┤                                                                                                                          
  │ You receive │ $18.80          │                               
  └─────────────┴─────────────────┘                                                                                                                          
  
  Scaled out:                                                                                                                                                
                                                                  
  ┌─────────────┬──────────┬───────────┬────────────┐                                                                                                        
  │ Subscribers │ Gross/mo │ Polar Fee │  You Get   │
  ├─────────────┼──────────┼───────────┼────────────┤                                                                                                        
  │ 1           │ $20      │ $1.20     │ $18.80     │             
  ├─────────────┼──────────┼───────────┼────────────┤
  │ 10          │ $200     │ $12.00    │ $188.00    │                                                                                                        
  ├─────────────┼──────────┼───────────┼────────────┤                                                                                                        
  │ 50          │ $1,000   │ $60.00    │ $940.00    │                                                                                                        
  ├─────────────┼──────────┼───────────┼────────────┤                                                                                                        
  │ 100         │ $2,000   │ $120.00   │ $1,880.00  │             
  ├─────────────┼──────────┼───────────┼────────────┤                                                                                                        
  │ 500         │ $10,000  │ $600.00   │ $9,400.00  │
  ├─────────────┼──────────┼───────────┼────────────┤                                                                                                        
  │ 1,000       │ $20,000  │ $1,200.00 │ $18,800.00 │             
  └─────────────┴──────────┴───────────┴────────────┘                                                                                                        
   
  What each scenario includes                                                                                                                                
                                                                  
  Minimum Launch — ~$9/mo                                                                                                                                    
   
  What you get:                                                                                                                                              
  - 1 VPS running both Gitgram backend + AITM API server (4 vCPU, 8 GB RAM)
  - PostgreSQL with 0.5 GB storage per project (auto-scales to zero when idle)                                                                               
  - Redis with 256 MB cache, 500K commands/mo                                 
  - 3,000 emails/mo (password reset, notifications)                                                                                                          
  - 5K error tracking events/mo                                                                                                                              
  - 50K auth users (AITM via Clerk)                                                                                                                          
  - Frontend hosted on Vercel free tier                                                                                                                      
  - Media stored locally on VPS (80 GB NVMe)                                                                                                                 
                                                                                                                                                             
  Limits you'll hit first:                                                                                                                                   
  - 0.5 GB database (enough for ~5K-10K users)                                                                                                               
  - No S3 (media on VPS disk, 80 GB cap)                                                                                                                     
  - 3K emails/mo (enough for ~500 active users)                                                                                                              
  - No CDN, no custom email domain                                                                                                                           
  - Vercel hobby = non-commercial only                                                                                                                       
                                                                                                                                                             
  Good for: Development, beta testing, first users                                                                                                           
                                                                                                                                                             
  ---                                                                                                                                                        
  Small Scale — ~$20/mo (100 users)                                                                                                                          
                                                                  
  What you get (on top of minimum):
  - Neon Launch x2 ($5 each) — real production databases, auto-scaling compute, more storage                                                                 
  - AWS S3 for media uploads (10 GB) — proper file storage, not VPS disk                                                                                     
  - Everything else still on free tiers                                                                                                                      
                                                                                                                                                             
  Limits:                                                                                                                                                    
  - S3 egress: first 100 GB/mo free                                                                                                                          
  - 3K emails/mo still (upgrade to Resend Pro at $20/mo if needed)                                                                                           
  - Single VPS (no redundancy)                                    
                                                                                                                                                             
  Good for: Soft launch, early adopters, getting first paying subscribers                                                                                    
                                                                                                                                                             
  ---                                                                                                                                                        
  Growth — ~$163/mo (1,000 users)                                                                                                                            
                                                                                                                                                             
  What you get (on top of small):
  - Bigger VPS (8 vCPU, 16 GB RAM) — handles concurrent WebSocket connections, video processing                                                              
  - Neon Scale x2 — higher connection limits, read replicas, compliance features                                                                             
  - Vercel Pro — commercial use allowed, 1 TB bandwidth, team collaboration                                                                                  
  - Clerk Pro — SSO, enterprise auth features, unlimited orgs                                                                                                
  - Resend Pro — 50K emails/mo                                                                                                                               
  - Sentry Team — 100K errors/mo, multiple users, performance monitoring                                                                                     
  - Upstash paid — more Redis capacity for rate limiting, sessions, caching                                                                                  
  - AWS S3 100 GB + egress                                                                                                                                   
                                                                                                                                                             
  Limits:                                                                                                                                                    
  - Single VPS still (for HA, add second VPS +$18/mo)                                                                                                        
  - No dedicated DB (Neon Scale is still serverless)                                                                                                         
                                                                  
  Good for: Active community, real revenue, hundreds of daily active users                                                                                   
                                                                                                                                                             
  ---                                                                                                                                                        
  Break-even math                                                                                                                                            
                                                                                                                                                             
  With $9/mo minimum infra and $18.80 net per subscriber:
                                                                                                                                                             
  ┌─────────────────────────────┬────────────────────┐                                                                                                       
  │                             │ Subscribers needed │                                                                                                       
  ├─────────────────────────────┼────────────────────┤                                                                                                       
  │ Cover minimum infra ($9/mo) │ 1 subscriber       │            
  ├─────────────────────────────┼────────────────────┤
  │ Cover small scale ($20/mo)  │ 2 subscribers      │                                                                                                       
  ├─────────────────────────────┼────────────────────┤                                                                                                       
  │ Cover growth ($163/mo)      │ 9 subscribers      │                                                                                                       
  └─────────────────────────────┴────────────────────┘                                                                                                       
 
  ┌─────────────────┬───────────────────────────────┬────────┐
  │     Product     │             Check             │ Result │
  ├─────────────────┼───────────────────────────────┼────────┤
  │ AITM CLI        │ Build (tsc)                   │ PASS   │
  ├─────────────────┼───────────────────────────────┼────────┤
  │ AITM CLI        │ Tests (520/520)               │ PASS   │
  ├─────────────────┼───────────────────────────────┼────────┤
  │ AITM CLI        │ Runtime (--version → 2.0.0)   │ PASS   │
  ├─────────────────┼───────────────────────────────┼────────┤
  │ AITM CLI        │ Help (23 commands listed)     │ PASS   │
  ├─────────────────┼───────────────────────────────┼────────┤
  │ AITM MCP        │ Build (tsc)                   │ PASS   │
  ├─────────────────┼───────────────────────────────┼────────┤
  │ AITM MCP        │ Runtime (stdio server starts) │ PASS   │
  ├─────────────────┼───────────────────────────────┼────────┤
  │ AITM API Server │ Type-check                    │ PASS   │
  ├─────────────────┼───────────────────────────────┼────────┤
  │ AITM API Server │ Tests (538/538, +19 skip)     │ PASS   │
  ├─────────────────┼───────────────────────────────┼────────┤
  │ AITM VS Code    │ Tests (62/62)                 │ PASS   │
  ├─────────────────┼───────────────────────────────┼────────┤
  │ AITM Website    │ Next.js build                 │ PASS   │
  ├─────────────────┼───────────────────────────────┼────────┤
  │ Gitgram Backend │ Type-check (0 errors)         │ PASS   │
  ├─────────────────┼───────────────────────────────┼────────┤
  │ Gitgram Web     │ Next.js build                 │ PASS   │
  ├─────────────────┼───────────────────────────────┼────────┤
  │ Gitgram Web     │ Tests (72/72)                 │ PASS   │
  └─────────────────┴───────────────────────────────┴────────┘                                                                 

   we can fork bd https://github.com/upstash/context7.git https://github.com/BeehiveInnovations/pal-mcp-server.git for aitm mcp and aitm stuff and for        
  gitgram we can clone some openourse social media stuff becuase gitgram is social media layer for github repositories    we can fork bd https://github.com/upstash/context7.git https://github.com/BeehiveInnovations/pal-mcp-server.git for aitm mcp and aitm stuff and for        
  gitgram we can clone some openourse social media stuff becuase gitgram is social media layer for github repositories   vvv
  ---                                                
  Repos to Fork/Clone                                
                                                        
  For AITM MCP                                          
                                                                                                                                                             
  ┌───────────────────────────────────┬───────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐  
  │               Repo                │                                                   What to Adapt                                                   │  
  ├───────────────────────────────────┼───────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤  
  │ upstash/context7                  │ Streamable HTTP transport (AITM is stdio-only), AsyncLocalStorage per-request context, tool description           │  
  │                                   │ engineering, multi-agent setup CLI (aitm setup --claude --cursor), SDK client pattern with retry                  │
  ├───────────────────────────────────┼───────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤  
  │ BeehiveInnovations/pal-mcp-server │ ToolAnnotations (readOnlyHint/destructiveHint) for all 40 tools, modular tool class architecture (extract from    │  
  │                                   │ monolithic index.ts), DISABLED_TOOLS env var, standardized output envelope, path validation for restore safety    │
  ├───────────────────────────────────┼───────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ abhigyanpatwari/GitNexus          │ Zero-server knowledge graph + Graph RAG agent over repos. Adapt for AITM code-context indexing, checkpoint        │
  │ → external/gitnexus               │ knowledge graphs, and Gitgram repo explore/visualisation surface. Cloned 2026-06-21.                              │
  ├───────────────────────────────────┼───────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ gastownhall/beads                 │ Git-native DAG issue tracker for AI agents. `bd ready` shows dependency-unblocked work with hash-based IDs.       │
  │ → external/beads                  │ Reference for AITM task/issue tracking integration and multi-agent coordination. Cloned 2026-06-21.               │
  └───────────────────────────────────┴───────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘  
                                                                                                                                                           
  For Gitgram (Social Layer)        
                                                                                                                                                             
  ┌─────┬──────────────────────────────────┬───────┬─────────┬───────────────────────────────────────────────────────────────────────────────────────────┐
  │  #  │               Repo               │ Stars │ License │                                             Why                                            │  
  ├─────┼──────────────────────────────────┼───────┼─────────┼───────────────────────────────────────────────────────────────────────────────────────────┤
  │ 1   │ codinginflow/nextjs-15-social-   │ 417   │ --      │ Exact same stack (Next.js + Prisma + PG). Prisma schema maps 1:1 to Gitgram. Infinite     │  
  │     │ media-app → external/nextjs-15-  │       │         │ scroll, optimistic updates, notifications. Cloned 2026-06-21.                             │
  │     │ social-media-app                 │       │         │                                                                                           │
  ├─────┼──────────────────────────────────┼───────┼─────────┼───────────────────────────────────────────────────────────────────────────────────────────┤
  │ 2   │ leandronorcio/munia              │ 293   │ MIT     │ Most complete features: GitHub OAuth, @mentions, hashtags, nested comments, drag-drop      │  
  │     │ → external/munia                 │       │         │ media, S3 uploads, accessibility. Cloned 2026-06-21.                                      │
  ├─────┼──────────────────────────────────┼───────┼─────────┼───────────────────────────────────────────────────────────────────────────────────────────┤  
  │ 3   │ TomDoesTech/t3-twitter-clone     │ 189   │ MIT     │ Only one with Express branch — matches Gitgram's Express backend. Type-safe tRPC          │
  │     │ → external/t3-twitter-clone      │       │         │ patterns. Cloned 2026-06-21.                                                              │
  ├─────┼──────────────────────────────────┼───────┼─────────┼───────────────────────────────────────────────────────────────────────────────────────────┤
  │ 4   │ karanpratapsingh/Proximity       │ 360   │ GPL-3   │ Best React Native social app with Prisma. Real-time messaging via GraphQL subscriptions.  │  
  │     │ → external/proximity             │       │         │ Reference only (GPL). Cloned 2026-06-21.                                                  │
  ├─────┼──────────────────────────────────┼───────┼─────────┼───────────────────────────────────────────────────────────────────────────────────────────┤  
  │ 5   │ bluesky-social/social-app        │ 17.8K │ MIT     │ Production-scale feed algorithms, notifications, moderation. Architecture reference.      │
  │     │ → external/bluesky-social-app    │       │         │ Cloned 2026-06-21.                                                                        │
  ├─────┼──────────────────────────────────┼───────┼─────────┼───────────────────────────────────────────────────────────────────────────────────────────┤
  │ 6   │ abhigyanpatwari/GitNexus         │ --    │ --      │ Client-side knowledge graph + Graph RAG over any repo. Reference for Gitgram repo         │
  │     │ → external/gitnexus             │       │         │ explore/visualisation. Also useful for AITM. Cloned 2026-06-21.                           │
  └─────┴──────────────────────────────────┴───────┴─────────┴───────────────────────────────────────────────────────────────────────────────────────────┘  
                                                                                                                                                             
  Quick-win bonus                                 
                                                                                                                                                             
  - amirfakhrullah/gh-social (MIT) — The only "GitHub Social Platform" found. Syncs GitHub follows/stars to a social feed. Next.js + tRPC + Clerk +
    Drizzle + Neon. Closest concept to Gitgram. Cloned 2026-06-21 → external/gh-social.
  - gastownhall/beads (MIT) — Git-native DAG issue tracker by Steve Yegge for AI agents. Cloned 2026-06-21 → external/beads.                                                                                                                                                   
                                                                                                                                                             
  ---                               
  Top Actionable Items from Research                                                                                                                         
                                                                                                                                                           
  AITM MCP (high priority, small effort):                                                                                                                    
  1. Add ToolAnnotations to all 40 tools — readOnlyHint: true for read tools, destructiveHint: true for restore
  2. Add Streamable HTTP transport (from context7 pattern) — enables web/VS Code clients                                                                     
  3. Extract tools from monolithic index.ts into modular files                                                                                             
                                                  
  Gitgram (reference patterns to study):                                                                                                                     
  1. Prisma schema design from nextjs-15-social-media-app
  2. @mentions + hashtag system from munia                                                                                                                   
  3. Feed pagination (cursor-based infinite scroll) from both                                                                                                
  4. GitHub API integration from gh-social                   
                                                                                                                                                                                                                                            
  │ BloopAI/vibe-kanban       │ 24.6k │ Kanban for AI agents, MCP server+client, git worktree isolation, diff review. Best task board     │  
  │                           │       │ foundation.                                                                                       │  
  ├───────────────────────────┼───────┼───────────────────────────────────────────────────────────────────────────────────────────────────┤  
                                                                                                                                             
  │ gastownhall/beads (bd!)   │ 20.4k │ Git-native DAG issue tracker made for AI agents. This is what bd is.                              │  
  ├───────────────────────────┼───────┼───────────────────────────────────────────────────────────────────────────────────────────────────┤  
                                                                                                                                             
  │ a2aproject/a2a-js         │ 509   │ Official A2A TypeScript SDK. Needed for standards compliance.                                     │  
  ├───────────────────────────┼───────┼───────────────────────────────────────────────────────────────────────────────────────────────────┤  
                                                                                                                                             
  │ agentgateway/agentgateway │ 2.3k  │ Rust proxy for A2A + MCP traffic. Security/observability built in.                                │  
                                                                                                                                             
  ├───────────────────────────┼───────┼───────────────────────────────────────────────────────────────────────────────────────────────────┤  
  │ GongRzhe/A2A-MCP-Server   │ 147   │ Bridges MCP ↔ A2A so Claude can talk to A2A agents.                                               │  
                                                                                                                                             
  ├───────────────────────────┼───────┼───────────────────────────────────────────────────────────────────────────────────────────────────┤  
                                                                                                                                             
  │ Open-ACP/OpenACP          │ 58    │ Connects 28+ AI agents to Telegram, Discord, Slack. Real-time messaging.                          │  
  └───────────────────────────┴───────┴───────────────────────────────────────────────────────────────────────────────────────────────────┘  
                                                                                                                                             
                                                                                                                                             
  Key insight about bd (Beads)                                                                                                               
                                                                                                                                             
                                                                                                                                             
  Beads by Steve Yegge is exactly what you're already using for task tracking! It's a git-native graph issue tracker designed for AI agents. 
                                                                                                                                             
  bd ready shows unblocked work, dependency DAGs, hash-based IDs for concurrent agents. 20k+ stars, MIT.                                     
                                                                                                                                                                                                                                                       
  │ BloopAI/vibe-kanban       │ 24.6k │ Kanban for AI agents, MCP server+client, git worktree isolation, diff review. Best task board     │  
  │                           │       │ foundation.                                                                                       │  
  ├───────────────────────────┼───────┼───────────────────────────────────────────────────────────────────────────────────────────────────┤  
                                                                                                                                             
  │ gastownhall/beads (bd!)   │ 20.4k │ Git-native DAG issue tracker made for AI agents. This is what bd is.                              │  
  ├───────────────────────────┼───────┼───────────────────────────────────────────────────────────────────────────────────────────────────┤  
                                                                                                                                             
  │ a2aproject/a2a-js         │ 509   │ Official A2A TypeScript SDK. Needed for standards compliance.                                     │  
  ├───────────────────────────┼───────┼───────────────────────────────────────────────────────────────────────────────────────────────────┤  
                                                                                                                                             
  │ agentgateway/agentgateway │ 2.3k  │ Rust proxy for A2A + MCP traffic. Security/observability built in.                                │  
                                                                                                                                             
  ├───────────────────────────┼───────┼───────────────────────────────────────────────────────────────────────────────────────────────────┤  
  │ GongRzhe/A2A-MCP-Server   │ 147   │ Bridges MCP ↔ A2A so Claude can talk to A2A agents.                                               │  
                                                                                                                                             
  ├───────────────────────────┼───────┼───────────────────────────────────────────────────────────────────────────────────────────────────┤  
                                                                                                                                             
  │ Open-ACP/OpenACP          │ 58    │ Connects 28+ AI agents to Telegram, Discord, Slack. Real-time messaging.                          │  
  └───────────────────────────┴───────┴───────────────────────────────────────────────────────────────────────────────────────────────────┘  
                                                                                                                                             
                                                                                                                                             
  Key insight about bd (Beads)                                                                                                               
                                                                                                                                             
                                                                                                                                             
  Beads by Steve Yegge is exactly what you're already using for task tracking! It's a git-native graph issue tracker designed for AI agents. 
                                                                                                                                             
  bd ready shows unblocked work, dependency DAGs, hash-based IDs for concurrent agents. 20k+ stars, MIT.                                     
                                                                                                              
                                                                                                               # Unified Manual Launch Plan for Gitgram + AITM

  ## Summary

  Prepare both products for a parallel launch using a single server / operator-managed deployment model as the source of truth. The plan should treat the
  existing repo as mostly implementation-complete, but should not trust the docs blindly: first reconcile deployment artifacts, environment contracts, and
  stale references, then execute a manual launch path that does not depend on unfinished CI/CD automation.

  Success means:

  - AITM npm packages are published and installable.
  - Gitgram backend/web and AITM API are deployable from documented manual commands.
  - Production secrets/env contracts are complete and validated.
  - Health checks, rollback steps, and operator runbooks match the actual repo layout.
  - Stale or conflicting deployment guidance is removed or explicitly deprecated.

  ## Implementation Changes

  ### 1. Establish one canonical launch topology

  - Make the manual-ops path the primary launch contract: single operator-managed host, Docker/PM2/systemd as applicable, no dependency on unfinished
    GitHub Actions deployment flows.
  - Standardize the production target as:
      - Gitgram backend: long-running Node service on the server.
      - Gitgram web: long-running Next.js service on the server.
      - AITM API: long-running Node service on the server.
      - Shared infra: PostgreSQL + Redis on the same host or tightly coupled managed services, but documented as one operational unit.
  - Demote GitHub Actions deploy workflows to “future automation” unless they fully match the manual launch path.

  ### 2. Reconcile repo truth with docs before launch execution

  - Audit and fix contradictions between SINGLE_SOURCE_PLAN.md, docs/deploy-pipeline.md, docs/ops-quickref.md, docs/runbook.md, compose files, and actual
    workflow filenames.
  - Remove or clearly mark stale deployment variants that conflict with the chosen topology.
  - Resolve broken references in docs, especially any paths/services that do not exist in the tree.
  - Normalize naming so the same service names, ports, health endpoints, workflow names, and env var conventions are used everywhere.
  - Treat docs/can be fork.md as the maintained reference-clone inventory; use SINGLE_SOURCE_PLAN.md as the canonical execution plan for launch sequencing.

  ### 3. Lock the manual launch path per product

  - AITM:
      - Verify package publish order and prerequisites for @gitgram/timemachine and @gitgram/timemachine-mcp.
      - Define the exact manual publish checklist, post-publish verification, and rollback/version bump procedure.
      - Define the exact API deployment procedure, including build, env validation, migration application, service restart, and health verification.
  - Gitgram:
      - Define the exact backend deployment procedure, including Prisma generation/migration, build, restart, and health verification.
      - Define the exact web deployment procedure, including build, runtime env injection, restart, and smoke verification.
  - Shared:
      - Choose one restart/control mechanism per service and document it as canonical. If both PM2 and systemd are kept, assign one as primary and one as
        fallback, not equal-status alternatives.

  ### 4. Harden secrets and env contracts for launch

  - Use docs/secrets-contract.md and docs/environment-matrix.md as the starting point, but reconcile them with actual runtime/package needs.
  - Produce one canonical required-vars list for:
      - Gitgram backend
      - Gitgram web
      - AITM API
      - AITM package publish/release flow
  - Validate that production-only integrations needed for launch are present and named consistently, especially database, Redis, JWT, Polar, S3/storage,
    email, and any internal auth secrets.
  - Ensure validation scripts and runbooks match the chosen unprefixed/prefixed env convention and the manual deployment path.
  - Explicitly document which secrets are required before first launch vs optional post-launch integrations.

  ### 5. Define launch-day operations and rollback

  - Convert the runbook into an operator-focused launch sequence with:
      - preflight checks
      - ordered deploy steps
      - health gates
      - smoke checks
      - rollback commands
      - post-launch monitoring window
  - Rollback should be manual-first and concrete:
      - previous package version for npm artifacts
      - previous app build/image/tag for server services
      - DB migration rollback policy or “restore from backup only” policy where down-migrations are not supported
  - Require a backup/checkpoint step before applying production migrations.

  ## Public Interfaces / Contracts

  - No product API redesign is planned.
  - Public-facing contract changes are limited to:
      - canonical deployment/runbook docs
      - explicit deprecation of stale deployment paths and references
  - If any current docs mention missing components such as non-existent service paths, update the documentation contract rather than inventing new
    components for launch.

  ## Test Plan

  - Verify repo-level build/test/typecheck commands for the launch-critical services still pass.
  - Dry-run the manual deployment commands in a staging-like environment for:
      - Gitgram backend
      - Gitgram web
      - AITM API
      - AITM package publish verification flow
  - Validate health endpoints after each service restart.
  - Run minimal smoke scenarios:
      - Gitgram auth and basic API reachability
      - Gitgram web load and API connectivity
      - AITM API health/readiness and one representative core flow
      - npm install plus basic CLI/MCP invocation for published AITM packages
  - Test rollback instructions at least once in staging-like conditions.

  ## Assumptions and Defaults

  - Launch is for both products in parallel, not a staggered product strategy.
  - The delivery path is manual operations first, with CI/CD treated as non-blocking unless brought into alignment.
  - The hosting model is single server / operator-managed, not a multi-platform redesign.
  - Existing code is assumed largely complete; the main launch risk is operational inconsistency, stale docs, and deployment drift.
  - Any workflow or doc that conflicts with the chosen manual launch path should be updated, deprecated, or ignored rather than preserved for symmetry.
