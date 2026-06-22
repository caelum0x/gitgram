# External Repo Integration Plan

Last updated: 2026-06-21

## Mission

In the AI era, Git is a 20-year-old protocol and GitHub is a web UI bolted on top.
Neither was designed for AI agents, social-first development, or deterministic restore.

- **Gitgram** replaces GitHub — repository-first social network for developers.
- **AITM** replaces Git — AI-native, deterministic, time-travel version control.

This plan maps the 8 cloned reference repos into actual product source code.

---

## 0. Executive Summary

Both products are feature-complete with 1130 passing tests. This is **pattern/implementation uplift**, not a rebuild.

Three repos are **not source-copy candidates**:
- `beads` — Go + Dolt standalone binary. Adopt the dependency-DAG workflow model, not the code.
- `gitnexus` — PolyForm Noncommercial license + native tree-sitter deps. Wrap as dependency or federated MCP; do not vendor source into commercial product until licensed.
- `proximity` — GPL-3. Reference only, zero code copied.

Stack-mismatch correction: `t3-twitter-clone` is **Next.js + tRPC + Prisma**, NOT Express. It does not match `gitgram/backend`. Demoted to P2 reference.

---

## 1. Integration Map

### Priority legend
- **P0** — integrate first; highest value, lowest risk.
- **P1** — second pass; valuable but needs adaptation.
- **P2** — reference-grade or license-gated.

---

### 1.1 `bluesky-social-app` (MIT) → Gitgram web + backend + mobile — P0

| Source | Lands in | Strategy |
|---|---|---|
| `src/lib/api/feed/merge.ts`, `feed/utils.ts`, `lib/api/feed-manip.ts` (FeedTuner) | `gitgram/backend/src/services/feedAlgorithm.ts` | Extract `MergeFeedAPI` round-robin merge + `FeedTuner` dedup/threading into existing service |
| `src/state/queries/notifications/{feed,util,types}.ts` | `gitgram/web` notification hooks + backend notification grouping | Adopt notification grouping ("X and 3 others liked") + cursor pagination shape |
| `src/lib/moderation/` | `gitgram/backend/src/services/moderationEnforcementService.ts` | Adopt label/cause-description taxonomy only |
| TanStack Query `createQueryKey` + `useInfiniteQuery` cursor conventions | `gitgram/web` data layer | Adopt convention for infinite-scroll lists |

**Skip:** ALF design system, Lingui i18n, React Navigation, atproto agent layer, all view/screens UI.

---

### 1.2 `munia` (MIT) → Gitgram web + backend — P0/P1

| Source | Lands in | Strategy | Priority |
|---|---|---|---|
| `src/app/api/comments/[commentId]/replies/*` + `verifyAccessToComment.ts` | `gitgram/backend` comment routes / `gitgram/web` comment threads | Nested-comment reply pagination + access-verification guard | P0 |
| `src/app/api/posts/hashtag/[hashtag]/GET.ts` | `gitgram/web/app/hashtag/[tag]/page.tsx` + backend `tags.ts` | Adopt hashtag-query pagination if cleaner than current | P1 |
| Drag-drop media upload components | `gitgram/web/components/composer/DropZone.tsx` | Cherry-pick a11y/keyboard handling only | P1 |
| Accessibility helpers | `gitgram/web/components/Accessibility.tsx` | Extract a11y patterns | P1 |

**Skip:** NextAuth (conflicts with JWT auth), S3 upload (Gitgram has `uploadService.ts`), profile UI.

---

### 1.3 `gh-social` (MIT) → Gitgram backend + web — P1

Unique value: **syncing GitHub follows/stars into the social graph** — closest open-source concept to Gitgram.

| Source | Lands in | Strategy |
|---|---|---|
| `src/server/api/routers/github.ts` (profile/followers/following/repos sync) | `gitgram/backend/src/services/githubActivityService.ts` + `githubActivityFeedService.ts` | Port GitHub follow/star → social-feed sync; re-express as Express controllers (strip tRPC) |
| `src/server/caches/{followingsCache,usernameCache,oAuthCache}.ts` | `gitgram/backend/src/utils/cache.ts` / `redisStores.ts` | Redis cache key strategy for GitHub data |
| `src/server/helpers/trimGitHubData.ts` | `gitgram/backend/src/services` (new util) | Copy + adapt; pure function, low risk |

**Skip:** Clerk auth (hard conflict), Drizzle/Neon (Gitgram uses Prisma/PG), Pusher (Gitgram uses Socket.io), tRPC, all UI.

---

### 1.4 `nextjs-15-social-media-app` (codinginflow) → Gitgram web — P1

| Source | Lands in | Strategy |
|---|---|---|
| Infinite-scroll + React Query optimistic-update patterns | `gitgram/web/components/Feed.tsx`, `VirtualList.tsx`, infinite-scroll hooks | Adopt optimistic like/follow mutation patterns where Gitgram still does full refetch |
| Notification-system query/mutation shape | `gitgram/web` notification components | Cross-reference with bluesky §1.1 — pick the stronger |

**Skip:** Prisma schema (Gitgram schema is canonical), auth, UI primitives.

---

### 1.5 `t3-twitter-clone` (MIT) → reference only — P2

Stack mismatch: this is Next.js + tRPC + Prisma, not Express. Validate Gitgram's post data model against it; copy nothing structural.

---

### 1.6 `proximity` (GPL-3) → Gitgram mobile reference ONLY — P2

**Zero code copied.** GPL-3 is incompatible. Use only for behavioral reference (GraphQL subscriptions → mobile real-time). Implement any adopted idea clean-room in `gitgram/mobile` using the existing Socket.io layer. Document in commit messages.

---

### 1.7 `gitnexus` (PolyForm Noncommercial) → Gitgram repo explore + AITM — P1/P2

**License gate:** PolyForm Noncommercial likely incompatible with commercial products. Requires legal clearance before shipping. Two compliant integration modes:

| Use | Lands in | Strategy | Priority |
|---|---|---|---|
| Gitgram repo explore/visualization | `gitgram/web/components/repo/RepoGraphTab.tsx` | Wrap as external tool / call CLI out-of-process. Never import source. | P2 (license-gated) |
| AITM code-context indexing + checkpoint knowledge graph | `aitimemachine/mcp/src/tools/` + `aitimemachine/src/core/neon/indexer.ts` | Pattern reference + optional MCP federation. Adopt impact/context/clusters concept into AITM's existing graph. No source copy. | P1 |

**Action required:** legal review of PolyForm Noncommercial vs. commercial use before shipping either path.

---

### 1.8 `beads` (MIT) → AITM CLI/MCP — P1

Go + Dolt binary. Adopt the **dependency-DAG issue model and `bd ready` semantics** into AITM's existing `checkpoint-graph.ts`.

| Concept | Lands in | Strategy |
|---|---|---|
| Hash-based collision-free IDs (`bd-a1b2`) | `aitimemachine/src/core/checkpoint-graph.ts` | Add beads-style content-hash IDs for dependency nodes |
| `bd ready` = dependency-unblocked work detection | `aitimemachine/mcp/src/tools/` (new `ready`-style tool) | Expose "what work is unblocked" MCP tool over AITM's DAG |
| `relates_to`/`supersedes`/`replies_to` graph links | `aitimemachine/src/core/checkpoint-graph.ts` + `annotation-store.ts` | Map onto existing checkpoint relations |
| Optional: depend on beads binary | AITM agent workflow | Install `bd` as agent dev-tool (MIT permits) |

**Skip:** Dolt storage (AITM uses SQLite + CAS + Neon), all Go code, server mode.

---

## 2. Conflict Hotspots

| Area | Conflict | Resolution |
|---|---|---|
| **Authentication** (HIGH) | munia/gh-social bring NextAuth/Clerk; Gitgram uses httpOnly-cookie JWT | Do not import any external auth. Extract OAuth scope/flow ideas only. |
| **ORM/DB driver** (HIGH) | gh-social uses Drizzle+Neon; Gitgram uses Prisma+PG | Re-express all donor queries in Prisma. Never introduce Drizzle into `gitgram/backend`. |
| **Backend framework** (HIGH) | gh-social/t3 tRPC routers vs. Gitgram Express controllers | Strip tRPC; re-implement as Express route + controller pairs. |
| **Real-time transport** (MEDIUM) | Pusher, GraphQL subs, atproto firehose | Map all real-time ideas onto existing Socket.io. Copy no transport client. |
| **Feed algorithm** (MEDIUM) | bluesky FeedTuner vs. existing `feedAlgorithm.ts` | Surgical merge inside `feedAlgorithm.ts`. TDD first; feed scoring covered by backend tests. |
| **Comment threading** (MEDIUM) | munia nested replies vs. `CommentThread.tsx` / `commentActionsController.ts` | Diff data shapes; adopt reply-pagination only if it doesn't break existing API contract. |
| **Checkpoint graph identity** (MEDIUM) | beads hash-IDs vs. AITM SHA256 CAS | AITM already content-addresses. Add dependency-edge semantics without changing existing checkpoint IDs (referenced in 520 core tests). |
| **License contamination** (CRITICAL) | proximity (GPL-3), gitnexus (PolyForm Noncommercial) | Never copy source. Add CI check blocking GPL/noncommercial imports in product trees. |

---

## 3. Integration Order

Each step: **(a) write tests first → (b) merge pattern → (c) run affected suite → (d) commit.** Never batch two donors in one commit.

### Phase 0 — Guardrails (before any merge)
1. Add license-contamination CI check (block GPL/noncommercial imports in product trees).
2. Snapshot current suites as green baseline: AITM Core 520, AITM API 538, AITM VSCode 62, Gitgram Web 72.
3. Quarantine `external/` from product `tsconfig`/build paths.

### Phase 1 — Pure additive, zero-conflict (P0)
4. `gh-social` `trimGitHubData` helper → Gitgram backend util (pure function, new file, new tests).
5. `bluesky` notification grouping/aggregation → backend service + web hooks (new aggregation layer; old endpoints untouched).
6. `munia` nested-comment reply pagination → backend (additive route variant; keep old contract).

### Phase 2 — Surgical merges into existing services (P0/P1)
7. `bluesky` `FeedTuner`/merge logic → `feedAlgorithm.ts` (TDD around ranking).
8. `nextjs-15-social-media-app` + `bluesky` optimistic-update patterns → Gitgram web Feed.
9. `gh-social` GitHub follow/star→social-graph sync → `githubActivityService.ts`.
10. `munia` accessibility + drag-drop a11y → composer components.

### Phase 3 — AITM workflow adoption (P1)
11. `beads` dependency-DAG + `bd ready` semantics → `checkpoint-graph.ts` + new MCP "ready" tool.
12. `gitnexus` impact/context concepts → AITM graph OR federated MCP registration (no source copy).

### Phase 4 — License-gated / reference (P2)
13. `gitnexus` Gitgram repo-graph tab — only after legal clearance.
14. `proximity` mobile real-time ideas — clean-room reimplementation only.
15. `t3-twitter-clone` — data-model validation pass only.

---

## 4. What to Skip

| External | Skip because we already have it |
|---|---|
| `munia` S3 upload, NextAuth, profile UI | `uploadService.ts`, `mediaService.ts`, JWT auth, full profile pages |
| `gh-social` Clerk, Drizzle, Pusher, tRPC, all `components/` | own auth, Prisma, Socket.io, Express, 80+ web components |
| `t3-twitter-clone` entire backend + auth + UI | stack mismatch; Gitgram post/retweet done |
| `nextjs-15-social-media-app` Prisma schema, auth, UI primitives | canonical schema, auth, UI system exist |
| `bluesky` ALF, Lingui, React Navigation, atproto agent, `view/`/`screens/` | own design system, routing, transport |
| `beads` Dolt engine, Go code, server mode | SQLite + CAS + Neon; content-addressing exists |
| `gitnexus` ingestion/parser source, LadybugDB, embeddings pipeline | `neon/indexer.ts`, `search-engine.ts`, `checkpoint-graph.ts`; license blocks vendoring |
| `proximity` everything (source) | GPL-3; mobile features already implemented |

---

## 5. Key File Paths

### Gitgram integration targets
- `gitgram/backend/src/services/feedAlgorithm.ts`
- `gitgram/backend/src/services/githubActivityService.ts`
- `gitgram/backend/src/services/githubActivityFeedService.ts`
- `gitgram/backend/src/services/moderationEnforcementService.ts`
- `gitgram/backend/src/services/mentionService.ts`
- `gitgram/backend/src/controllers/commentActionsController.ts`
- `gitgram/web/components/Feed.tsx`
- `gitgram/web/components/CommentThread.tsx`
- `gitgram/web/components/composer/DropZone.tsx`
- `gitgram/web/components/repo/` (new `RepoGraphTab.tsx`)

### AITM integration targets
- `aitimemachine/src/core/checkpoint-graph.ts`
- `aitimemachine/src/core/neon/indexer.ts`
- `aitimemachine/src/core/search-engine.ts`
- `aitimemachine/mcp/src/tools/register-core-tools.ts`

### Key donor files
- `external/bluesky-social-app/src/lib/api/feed/merge.ts`
- `external/bluesky-social-app/src/state/queries/notifications/`
- `external/bluesky-social-app/src/lib/moderation/`
- `external/munia/src/app/api/comments/[commentId]/replies/`
- `external/gh-social/src/server/api/routers/github.ts`
- `external/gh-social/src/server/caches/`
- `external/beads/` (pattern reference)

---

## 6. Decisions Requiring Sign-off

1. **gitnexus license** — PolyForm Noncommercial likely incompatible with commercial Gitgram. Decide: commercial license, MCP-federation only, or drop. Blocks §1.7 Gitgram path.
2. **beads as dependency vs. pattern** — install `bd` binary (MIT, fine) for agent task tracking, or reimplement DAG semantics natively in AITM.
3. **Feed ranking changes** — any merge into `feedAlgorithm.ts` changes user-visible ordering. Confirm before Phase 2 step 7.
