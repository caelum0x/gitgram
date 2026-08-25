# GitGram — Deep Enterprise Architecture

> Planning document. Read-only analysis of the codebase as of 2026-08-25.
> Scope: the GitGram talent graph + social layer, and the AITimeMachine (AITM)
> substrate it rides on. This is the enterprise-target companion to
> [README.md](README.md), [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md),
> [NORTH_STAR_PRD_ARCHITECTURE_V1.md](NORTH_STAR_PRD_ARCHITECTURE_V1.md) and
> [INTEGRATION_PLAN.md](INTEGRATION_PLAN.md).

---

## 0. One-paragraph thesis

GitGram is an **evidence-based talent knowledge graph**: it connects an
organization's *need* to a *person* through that person's **real open-source
work** — repositories they demonstrably own or maintain, GitHub contribution
activity, and completed institutional pilots — never through a self-authored
résumé. On top of the graph sits an **"Instagram for repos"** social layer
(posts, reels, stories, feeds, follows, trending) that generates the engagement
and public proof surface. Underneath sits **AITimeMachine (AITM)**, an AI-native
version-control substrate that captures/restores agent coding workflows and, via
its **adoption-evidence** subsystem, turns checkpoints and restores into
privacy-preserving proof of real usage. The whole thing is a Zemin360 hackathon
product built as a TypeScript monorepo.

---

## 1. What it is + current state

### 1.1 The two products, honestly

| Product | What it actually is in the tree | Maturity |
|---|---|---|
| **GitGram** | GitHub-repos-as-social-profiles + an evidence-based **talent graph** (opportunities → matches → referrals → pilots → public proof). Express 5 + Prisma + Postgres + Redis backend; Next.js 14 web; Expo/React-Native mobile. | Feature-broad, build-clean, **not launched** (operational blockers). |
| **AITimeMachine (AITM)** | AI workflow capture + deterministic restore substrate. Express + Drizzle/Neon api-server, an MCP server (~127 tools), a CLI, 7 vendored first-party engines, and an **OSS adoption-evidence** API. | Deep, but CLI/MCP unpublished; heavy `any` debt. |

The North Star framing is "GitGram = new GitHub, AITM = new Git." The task's
framing — **talent graph + evidence matching + social proof** — is the layer
that monetizes GitGram, and it is real code, not a slide.

### 1.2 Stack (mostly TypeScript)

- **Language:** TypeScript across backend, web, mobile, AITM api-server/mcp/cli.
  Vendored engines add **Go** (`beads`), **C** (real `git`), **Python** (`pal`).
- **GitGram backend** (`gitgram/backend`): Express 5, Prisma ORM → Postgres,
  Redis (cache/queues/pubsub), Apollo GraphQL + tRPC + Socket.IO, Octokit REST
  for all GitHub calls, node-cron jobs, Winston logging.
- **GitGram web** (`gitgram/web`): Next.js 14 / React 18, TanStack Query
  conventions ported from Bluesky.
- **GitGram mobile** (`gitgram/mobile`): Expo 54 / React Native / expo-router.
- **AITM api-server** (`aitimemachine/api-server`): Express + Drizzle ORM,
  dual driver (`@neondatabase/serverless` in prod, `pg` Pool local), ~54 tables.
- **AITM MCP** (`aitimemachine/mcp`): 16 tool groups, `tm_*`-prefixed.
- **Data of record:** Postgres is authoritative; Redis is cache/hot-path;
  local `.aitimemachine/` is a performance cache only.

### 1.3 The real features that matter to the talent thesis

**A. Talent graph (evidence-first).**
`gitgram/backend/src/services/talentGraphService.ts` (520 LOC) is the core.
`getTalentGraph(userId, {publicView})` assembles a person's dossier from three
**evidence tiers**, ranked `verified > linked > recorded`:
- `verified` — repository ownership proven by confirmed GitHub write access at
  claim time (`Repository.claimedBy/claimedAt`), or a completed institutional
  pilot.
- `linked` — a project imported through the connected GitHub account.
- `recorded` — a self-entered project record with no external proof.

Each project carries a `TalentEvidence[]` list (`repository_claim`,
`github_sync`, `github_activity`, `project_record`, `institutional_pilot`) with
an `occurredAt` timestamp and a `sourceUrl` — i.e. **provenance is already
first-class on every fact.** The service is scrupulous about the
public/private boundary: public reads consume only a privacy-safe projection
(`TalentPublicProof`), never institution-authored free text.

**B. Evidence matching engine.**
`findTalentMatches(requiredSkills, limit)` (same file) is the matcher. Given an
org's required skills it: (1) pulls completed public pilot proofs whose
`evidenceSkills` overlap; (2) finds users whose interests, managed public-repo
topics/languages, or pilot participation intersect the skills; (3) scores each
`score = coverage*75 + min(verifiedProjects,2)*10 + min(projects,3)*5` capped at
100; (4) returns matched/missing skills, up to 4 evidence projects, and a
human-readable reason (currently Turkish-localized — Zemin360 artifact). The key
design property: **a match is only as strong as its verifiable evidence; interest
alone yields the weakest signal.**

**C. Org-need modeling + pilot lifecycle.**
Prisma models: `TalentOpportunity` (org need: `problem`, `requiredSkills[]`,
`successMetric`, `durationWeeks`, status `OPEN→MATCHING→PILOT→CLOSED`),
`TalentReferral` (`CONTACTED→ACCEPTED→DECLINED`), `TalentPilot`
(`PLANNED→ACTIVE→REVIEW→COMPLETED→CANCELLED`, with `milestones`,
`deliverableUrl`, `publicEvidenceConsent`), `TalentPilotStatusTransition` (an
append-only audit of every status change with actor + revision),
`TalentPublicProof` (the consented, privacy-scrubbed projection with a GIN index
on `evidenceSkills`), and `TalentMutationReceipt` (idempotency ledger).
All mutations go through `talentMutationService.ts` — **serializable-isolation,
idempotency-key-gated, replay-safe** writes with a 30-day receipt retention.
This is production-grade transactional discipline.

**D. The social / feed layer ("Instagram for repos").**
The engagement engine that produces public proof:
- **Ranking:** `trendingRankingService.ts` (1,294 LOC) — weighted signals,
  time decay, activity velocity, engagement momentum, burst detection, spam/
  new-account guards, Hot/Today/Week tiers, DB-overridable weights.
- **Feed assembly:** `feedService.ts` → `feedAlgorithm.ts` → `feedTuner.ts`
  (697 LOC, author-run limiting + content interleaving + sponsored injection +
  diversity penalty, ported from Bluesky's FeedTuner).
- **Content:** posts (`postController.ts`, 916), reels (`reelsController.ts`,
  1,024), stories (`storiesController.ts`, 1,053), plus video transcoding
  (1,083). Real-time via Socket.IO (`websocket/socket.ts`, 976).
- **GitHub ingestion:** inbound webhooks HMAC-verified
  (`middleware/githubWebhookAuth.ts`) → `githubActivityService.ts` (893,
  dedupe-by-delivery-id) → **`RepositoryActivity`** rows; read side aggregates
  those into contribution grids (`contributionService.ts`) and repo insights
  (`repoInsightsService.ts`). Social-graph import (`githubSyncService.ts`) maps
  GitHub followers/stars → GitGram follows.

**E. The AITM adoption-evidence endpoint** (the "AITM adoption endpoint").
`aitimemachine/api-server/src/routes/adoption.ts` (688 LOC) is a
**privacy-preserving proof-of-real-usage** subsystem, deeply on-thesis for an
evidence product:
- `GET /v1/adoption/summary` — **public aggregate** evidence: active/lifetime
  developers, projects, checkpoints, applied restores, plus an **OSS coverage
  window** (external contributors, repeat contributors, maintainer first-response
  load) and **case evidence** (applied-restore→checkpoint→project links). Emits
  a `methodology` block and contains **no** account/repo/contributor identifiers.
- `POST /v1/adoption/oss-coverage/batches` and `POST /v1/adoption/case-evidence`
  — idempotent, `Idempotency-Key`-gated ingestion from authenticated collectors,
  using **opaque 64-hex keys** (`repositoryKey`, `contributorKey`,
  `contributionKey`) so identities never leave the collector. Backed by Drizzle
  tables `oss_coverage_batches`, `oss_contribution_records`, `oss_case_evidence`.

**F. Gitgram ↔ AITM bridge (both directions).**
- GitGram → AITM: `aitmService.ts` validates checkpoints
  (`GET /v1/checkpoints/{id}`, graceful-degrade), and `POST /api/v1/posts/
  from-checkpoint` turns a checkpoint into a post; per-repo AITM settings live at
  `/api/v1/repositories/:owner/:name/aitm-settings`.
- AITM → GitGram: `gitgramBridgeService.ts` pushes commit/release/**restore**
  events to GitGram `POST /api/v1/posts`; checkpoint creation calls
  `POST /api/v1/change-stories/auto-generate` to draft a "Change Story" post.
- AITM also hosts a **full parallel Gitgram social API** at `/v1/gitgram/*`
  writing to its own Drizzle tables (`posts`, `reactions`, `follows`,
  `trend_scores`, …) — an alternative to the standalone GitGram backend. **This
  duplication is an owner decision (see §5.4).**

### 1.4 Honest maturity assessment

- **Strong:** talent transactional integrity (serializable + idempotency +
  status-transition audit), the evidence/provenance model, privacy boundaries on
  public projections, the adoption-evidence privacy design, feed ranking depth.
- **Weak / risk:** the talent "graph" is computed **on the fly from relational
  joins** — there is no graph store, no persisted edges, no multi-hop traversal,
  no entity fusion/dedup. Matching is a single-pass scoring heuristic (no
  structure-layer signal). Two separate social data planes (GitGram Prisma vs
  AITM Drizzle) risk divergence. AITM carries ~839 `any` and an unpublished
  CLI/MCP. Zero web/mobile tests. `drizzle.config.ts` points at a stale schema
  path. Match reasons are hard-coded Turkish strings.
- **Not launched:** npm publish, production secrets, VPS/DNS remain open
  ([PLAN.md](PLAN.md) Phase 3).

---

## 2. Target enterprise structure

The current split (GitGram Prisma world + AITM Drizzle world, with a duplicated
social plane) should converge on **one talent-graph domain** with clear module
seams. Proposed enterprise layout — a rich decomposition, not a rename:

```
gitgram-ai/
├── apps/
│   ├── web/                         # Next.js — social + talent-network + admin console
│   ├── mobile/                      # Expo/RN
│   ├── aitm-website/                # marketing/docs
│   └── admin/                       # (or web/app/admin) ops + moderation + evidence audit
│
├── services/
│   ├── gateway/                     # edge: authN, rate-limit, request-id, GraphQL/tRPC/WS fan-in
│   │
│   ├── ingestion/                   # GitHub → normalized events (source-typed extraction)
│   │   ├── github/
│   │   │   ├── octokitClient.ts          # pooled, rate-limit-aware Octokit REST
│   │   │   ├── graphqlClient.ts          # NEW: GitHub GraphQL for contributions/commits
│   │   │   ├── webhookReceiver.ts        # HMAC verify + delivery-id dedupe
│   │   │   ├── webhookNormalizer.ts      # payload → RepositoryActivity (typed)
│   │   │   ├── repoSync.ts               # repos.get → upsert (stars/forks/lang/topics)
│   │   │   ├── socialGraphImport.ts      # followers/stars → follows
│   │   │   └── contributionHarvester.ts  # commit/PR/review history → Contribution
│   │   └── collectors/                   # opaque-key OSS + case-evidence collectors (feed §1.3E)
│   │
│   ├── evidence/                    # extraction → typed Evidence facts (the KG feed)
│   │   ├── extractors/
│   │   │   ├── repositoryClaimExtractor.ts   # verified ownership
│   │   │   ├── githubActivityExtractor.ts    # contribution events → evidence
│   │   │   ├── pilotEvidenceExtractor.ts     # completed pilots → proof
│   │   │   └── skillInferencer.ts            # repo lang/topics + activity → Skill demonstrations
│   │   ├── provenance.ts                # source + timestamp + confidence on every fact
│   │   └── evidenceLedger.ts            # append-only, immutable facts
│   │
│   ├── talent-graph/               # THE talent knowledge graph (persisted)
│   │   ├── ontology/
│   │   │   ├── ontology.yaml            # single source of truth (§3)
│   │   │   └── competencyQuestions.md   # spec + test suite
│   │   ├── store/
│   │   │   ├── graphRepository.ts        # Repository-pattern facade over the store
│   │   │   ├── nodes/ edges/             # typed entity + edge writers
│   │   │   └── adapters/                 # pg-recursive-CTE | Apache AGE | Kùzu (§4)
│   │   ├── fusion/
│   │   │   ├── blocking.ts               # candidate grouping (never O(n²))
│   │   │   ├── matching.ts               # string+attribute+STRUCTURE layers
│   │   │   ├── mergePolicy.ts            # deterministic merge + merged_from undo
│   │   │   └── contradiction.ts          # keep-both + prefer-newer at read
│   │   ├── matching-engine/
│   │   │   ├── needSkillResolver.ts      # Need.requiredSkills → Skill nodes
│   │   │   ├── candidateRetrieval.ts     # blocking over the graph
│   │   │   ├── scorer.ts                 # coverage + verified-evidence + structure
│   │   │   ├── explanation.ts            # cited evidence paths (i18n)
│   │   │   └── ranker.ts
│   │   └── graphrag/                     # subgraph serialize → LLM context (§3.5)
│   │
│   ├── org-need/                   # opportunity modeling
│   │   ├── opportunityService.ts        # TalentOpportunity CRUD + status machine
│   │   ├── needTaxonomy.ts              # skill normalization/canonicalization
│   │   └── referralService.ts
│   │
│   ├── pilot/                      # pilot lifecycle (the verification loop)
│   │   ├── pilotService.ts              # PLANNED→…→COMPLETED state machine
│   │   ├── statusTransition.ts          # append-only audit (exists today)
│   │   ├── milestoneService.ts
│   │   ├── proofPublisher.ts            # consent-gated TalentPublicProof projection
│   │   └── mutationLedger.ts            # idempotency receipts (exists today)
│   │
│   ├── social/                    # the "Instagram for repos" plane (single source)
│   │   ├── feed/                        # feedService/algorithm/tuner (exists)
│   │   ├── ranking/                     # trending signals engine (exists)
│   │   ├── content/                     # posts/reels/stories/snippets
│   │   ├── graph/                       # follows/social graph
│   │   ├── notifications/               # dispatcher + adapters (slack/discord/push)
│   │   └── moderation/                  # label taxonomy + enforcement
│   │
│   ├── profiles/                  # Person/Repo public profiles + talent dossier read models
│   │
│   ├── aitm/                       # the substrate subsystem
│   │   ├── api-server/                  # checkpoints/restore/sessions/memory (Drizzle)
│   │   ├── mcp/                         # 16 tool groups
│   │   ├── engines/                     # beads · context7 · git · gitnexus · a2a · pal
│   │   ├── adoption/                    # OSS coverage + case-evidence + /summary
│   │   └── bridge/                      # gitgramBridgeService + change-story auto-gen
│   │
│   └── api/                        # public REST/GraphQL contract + OpenAPI
│
├── packages/                       # shared, versioned libs
│   ├── graph-core/                     # entity/edge/provenance types + graph client iface
│   ├── evidence-schema/                # zod schemas for every evidence kind
│   ├── contracts/                      # API envelope, error types, DTOs
│   ├── skills-taxonomy/                # canonical skill vocabulary + aliases
│   └── observability/                  # logger, metrics, tracing
│
├── admin/                          # evidence-audit console, pilot ops, moderation queue
├── infra/                          # docker-compose, deploy, migrations, secrets contract
└── docs/
```

Key structural moves vs today: (1) promote **talent-graph** to a first-class
persisted domain with an ontology file and a Repository-pattern store; (2)
extract **ingestion** and **evidence** as explicit stages (they're currently
tangled inside `githubActivityService`/`talentGraphService`); (3) collapse the
**two social planes** into one `social/` service with a single store; (4) keep
**AITM** as a bounded subsystem exposing checkpoints, memory, and the
adoption-evidence API.

---

## 3. Graph engineering — GitGram *is* a talent knowledge graph

Applying the graph-engineering discipline (ontology → extraction → fusion →
serving). Today GitGram sits at the **"typed edges in SQL"** representation
(appropriate for <50K nodes, single app) — the ontology below is *latent* in the
Prisma schema and the `talentGraphService` joins. The plan makes it explicit and
gives it a persistence + fusion + traversal path.

### 3.1 Competency questions (the spec AND the test suite)

1. Which people demonstrate skill X with **verified** (not merely claimed)
   evidence?
2. Which people match Need N, and *through what evidence path* (repo claim →
   contribution → skill), ranked by verifiability?
3. Who has completed a pilot for an org in domain D, with a public deliverable?
4. Which repos does person P **own vs maintain vs merely record**, and since when?
5. Who are P's real collaborators (shared-maintainer edges), and on what repos?
6. What is P's contribution trajectory over time on repo R (velocity, recency)?
7. Which needs are currently unmatched because no person covers skill set S?
8. For a completed pilot, what is the immutable status history and who acted?
9. Which external OSS contributors show up repeatedly (repeat-contributor signal)
   without leaking identity?
10. Given a checkpoint/restore, what real usage evidence supports an org's ROI?

Each must path through the schema on paper; any that can't = missing type/edge.

### 3.2 Entities (the ontology)

Canonical-form rule stated up front: **Person** keyed by GitHub identity
(`githubId`) when connected, else GitGram `username` (lowercased); **Repo** keyed
by lowercased `owner/name` (`fullName`); **Skill** keyed by normalized
lowercased token (matches `normalizeSkill()` today).

| Entity | Definition | Backing today | Key attributes |
|---|---|---|---|
| **Person** | A developer or manager | `User` | username, githubId, interests[], isPrivate |
| **Repo** | A GitHub repository as social+evidence object | `Repository` | fullName, language, topics[], stars, claimedBy, claimedAt |
| **Project** | A person-entered project record (weakest tier) | `Project` | fullName, githubId?, tags[] |
| **Org** | An organization posting needs | `Organization` / `TalentOpportunity.organizationName` | name |
| **Need** | An org's demand: problem + required skills + success metric | `TalentOpportunity` | requiredSkills[], successMetric, durationWeeks, status |
| **Skill** | A canonical capability token | *implicit* (strings in topics/interests/requiredSkills) | canonical name, aliases |
| **Contribution** | A single unit of demonstrated work (commit/PR/review/push) | `RepositoryActivity` | eventType, occurredAt, sha, actorLogin |
| **Evidence** | A typed, provenance-bearing fact linking Person→(Repo/Skill/Pilot) | `TalentEvidence` (computed) | kind, occurredAt, sourceUrl, verificationLevel |
| **Pilot** | A time-boxed engagement against a Need | `TalentPilot` | status, milestones, deliverableUrl, consent |
| **Referral** | A community intro of a Person to a Need | `TalentReferral` | status |
| **Proof** | Consented, privacy-scrubbed public projection of a Pilot | `TalentPublicProof` | evidenceSkills[], deliverableUrl, completedAt |
| **Checkpoint / RestoreEvent** | AITM usage-evidence events | AITM Drizzle | createdAt, status=applied |

Attributes-vs-entities call: **Skill must be promoted from an attribute (string)
to an entity** — it has its own relationships (`DEMONSTRATES_SKILL`,
`REQUIRES_SKILL`, alias edges) and is the join point of the whole matcher. This
is the single highest-value ontology change.

### 3.3 Relations (edges) — with domain/range, time + provenance

Every edge carries `{since, until?, source, extractedAt, confidence}` (already
true in spirit — `TalentEvidence.occurredAt/sourceUrl`).

| Edge | Domain → Range | Meaning | Provenance source today |
|---|---|---|---|
| `OWNS` | Person → Repo | verified write access at claim | `Repository.claimedBy/claimedAt` |
| `MAINTAINS` | Person → Repo | recorded maintainer role | `RepositoryManager.role` |
| `CONTRIBUTED_TO` | Person → Repo | a contribution event occurred | `RepositoryActivity` (actorLogin) |
| `DEMONSTRATES_SKILL` | Person → Skill | evidence supports a capability | derived from repo lang/topics + activity |
| `REQUIRES_SKILL` | Need → Skill | need's required skill | `TalentOpportunity.requiredSkills[]` |
| `POSTED` | Org → Need | org authored a need | `TalentOpportunity.createdById` |
| `MATCHES_NEED` | Person → Need | scored candidacy w/ evidence | computed by `findTalentMatches` |
| `REFERRED_TO` | Person → Need | community referral | `TalentReferral` |
| `PARTICIPATES_IN` | Person → Pilot | pilot participant | `TalentPilot.participantId` |
| `FULFILLS` | Pilot → Need | pilot addresses need | `TalentPilot.opportunityId` |
| `PROVES` | Proof → Person | public evidence of completion | `TalentPublicProof` |
| `COLLABORATES_WITH` | Person → Person | shared-maintainer structure edge | co-managers of a repo |
| `FOLLOWS` | Person → (Person\|Repo) | social edge | `Follow`/`RepositoryFollow` |
| `EVIDENCED_BY` | (any) → Evidence | reifies a fact + its provenance | `TalentEvidence` |

The `COLLABORATES_WITH` structure edge is what unlocks the **structure layer** of
fusion and matching that naive dedup misses (two "J. Smith" nodes sharing 3
co-maintainers are the same person).

### 3.4 Events (first-class, not flattened)

Dynamic domain → model events as nodes with typed argument schemas:
- **ContributionEvent** `{person, repo, type∈{push,pr,review,issue}, sha?, at}` —
  from `RepositoryActivity`; the raw material of `DEMONSTRATES_SKILL`.
- **PilotStatusTransition** `{pilot, actor, from, to, revision, at}` — already an
  append-only table; a textbook event-logic edge (`ACTIVE → COMPLETED`).
- **CheckpointCreated / RestoreApplied** `{project, checkpoint, at, status}` —
  AITM adoption evidence; feeds `/v1/adoption/summary`.

These are *event-logic graph* candidates: "pilot completed → proof published →
match score rises" is exactly the "what leads to what" pattern.

### 3.5 Serving the graph (GraphRAG) — the matcher, upgraded

Today's matcher is a one-pass scan + heuristic score. The graph-engineering
upgrade, staged:
1. **Entity-link** the Need → resolve `requiredSkills` to canonical Skill nodes.
2. **Blocking** (not O(n²)): candidates = people sharing ≥1 Skill node or in a
   pilot cluster (today's `interests.hasSome` + repo-topic filter is a crude
   block — formalize it).
3. **Path retrieval:** for each candidate, retrieve the *evidence path*
   `Person -CONTRIBUTED_TO-> Repo -DEMONSTRATES-> Skill <-REQUIRES- Need` rather
   than a bag of attributes. The path **is** the explanation.
4. **Score on layered evidence** (string skill-match + attribute + **structure**
   via collaborator overlap + verification tier), the way §1.3B already weights
   verified evidence, plus a structure term.
5. **Serialize** the winning subgraph as compact `(head)-[REL{since,source}]->
   (tail)` triples for an LLM to narrate the match reason (replaces the hard-coded
   Turkish strings with cited, provable text).

### 3.6 Task graph — ingest → extract-evidence → match → pilot → verify

The product pipeline is a DAG; draw an arrow only where a job needs a prior job's
result (delete fake edges → parallelize):

```
                          ┌─ repoSync ─────────┐
 GitHub webhook / OAuth ──┼─ contributionHarvest┼─→ evidenceExtract ─→ fuse ─┐
                          └─ socialGraphImport ─┘   (per source type)         │
                                                                             ▼
        Need posted ───────────────────────────────────────────────→  MATCH (GraphRAG)
                                                                             │
                                                                     ┌───────┴────────┐
                                                                  referral        direct match
                                                                     └───────┬────────┘
                                                                             ▼
                                                            PILOT lifecycle (state machine)
                                                                             │
                                                    ┌── deliverable ──┬── status audit ──┐
                                                    ▼                 ▼                  ▼
                                              VERIFY (separate)   consent gate      proof publish
                                              did it meet the      (HUMAN GATE)     (privacy scrub)
                                              success metric?           │
                                                                        ▼
                                                            AITM adoption evidence  → /summary
```

Graph-engineering rules applied:
- **Fan-out** the three GitHub ingest jobs (they don't read each other) — the
  "and then" between them is a *fake edge*.
- **Verify in a separate context:** pilot completion must be judged against the
  `successMetric` by a node that is *not* the matcher — a matcher grading its own
  candidate is the self-grading failure mode. Diverse skeptics: "did the
  deliverable meet the metric?" ≠ "is the evidence real?".
- **Human gate on irreversible edges:** `publicEvidenceConsent` before any Proof
  is published, and referral acceptance — placed exactly where a mistake is
  expensive to undo (publishing someone's institution-linked work). This gate
  **already exists** in the schema (`publicEvidenceConsent`, `TalentPublicProof`).
- **One writer per artifact:** talent mutations already funnel through a single
  serializable, idempotent writer (`talentMutationService`) — extend that
  invariant to graph writes.
- **Stop rule:** ingestion/extraction split cleanly → parallelize; the
  match→pilot→verify chain is sequential (each step needs the full picture) →
  keep it single-owner.

---

## 4. OSS foundations — fork / build-on

GitGram already vendors and adopts OSS deliberately (see
[docs/can be fork.md](docs/can%20be%20fork.md) and
[INTEGRATION_PLAN.md](INTEGRATION_PLAN.md)). This section covers the **graph +
search + feed** foundations the talent-graph target needs, with license and
reuse-vs-build calls. Verify every license at adoption time; flagged items are
copyleft/source-available and unsafe to vendor into a commercial product.

### 4.1 GitHub API tooling
| Option | License | Fit | Call |
|---|---|---|---|
| **Octokit** (`@octokit/rest`, `graphql`) | MIT | Already used everywhere for REST | **Keep.** Add `@octokit/graphql` for the contributions/commit-history harvest (GraphQL contributions collection) the evidence layer needs. |
| `@octokit/webhooks` | MIT | Typed webhook verify/parse | **Adopt** to replace hand-rolled HMAC + payload mapping in `githubActivityService`. |
| `octokit/plugin-throttling` + `plugin-retry` | MIT | Rate-limit correctness at scale | **Adopt** — ingestion is the scaling bottleneck. |

### 4.2 Graph store (the big decision)
| Option | License | Fit | Call |
|---|---|---|---|
| **Postgres + recursive CTEs** (status quo) | PostgreSQL (permissive) | Fine to ~50K nodes; no new infra | **Default now.** Formalize edges as tables; ontology in code. |
| **Apache AGE** (Postgres extension, openCypher) | **Apache-2.0** | Cypher on the *existing* Postgres; no second datastore | **Primary recommendation** when multi-hop queries get frequent/slow. Lowest-friction upgrade — keeps one source of truth. |
| **Kùzu** (embedded graph DB) | **MIT** | Fast analytical multi-hop, embeddable in Node | **Adopt for read-side analytics** (collaborator-overlap, path retrieval) as a projection; not system-of-record. |
| Neo4j Community | **GPL-3.0** ⚠️ | Mature Cypher/GDS | **FLAG** — GPL-3 core; GDS/enterprise proprietary. Avoid vendoring; only via network boundary if ever. |
| Memgraph | **BSL 1.1** ⚠️ | Fast in-mem | **FLAG** — source-available, not OSI; commercial-use limits. |
| pgvector | PostgreSQL (permissive) | Embedding similarity for blocking/GraphRAG | **Adopt** — already implied by AITM embeddings; use for the fusion blocking layer + skill-embedding matches. |

**Recommendation:** stay on Postgres now → **Apache AGE** for in-DB graph
queries → **Kùzu** as an embedded read projection for heavy traversal. This never
introduces a copyleft dependency and keeps Postgres authoritative.

### 4.3 Search / discovery
| Option | License | Fit | Call |
|---|---|---|---|
| **OpenSearch** | **Apache-2.0** | Full search + vector, enterprise-grade | **Primary** for talent/repo/skill search at scale. |
| **Meilisearch** | **MIT** | Fast, simple, typo-tolerant | **Adopt** for the near-term (lighter than OpenSearch, MIT-clean). |
| Typesense | **GPL-3.0** ⚠️ | Great DX | **FLAG** — GPL-3; avoid unless run purely as a separate service. |
| Elasticsearch | **AGPL/SSPL/Elastic** ⚠️ | Powerful | **FLAG** — SSPL/AGPL; do not vendor. |

### 4.4 Feed / social backends
GitGram already **ported** Bluesky's `FeedTuner`/merge logic (MIT) into
`feedTuner.ts`/`feedAlgorithm.ts` and gh-social's follow-cache pattern — the
right reuse posture. Remaining:
| Option | License | Fit | Call |
|---|---|---|---|
| `bluesky-social/social-app` | **MIT** | Feed merge, notification grouping, moderation taxonomy | **Continue porting** (already P0). |
| `amirfakhrullah/gh-social` | MIT-family (verify) | GitHub-follows→feed concept | Reference (already mined). |
| `karanpratapsingh/Proximity` | **GPL-3.0** ⚠️ | RN social + GraphQL subs | **FLAG — reference only, zero code copied** (already noted in INTEGRATION_PLAN). |
| Redis / BullMQ | BSD / MIT | Hot-path cache + queues | **Keep** (already used). |

### 4.5 The 7 AITM engines (already vendored) — license posture
| Engine | License | Note |
|---|---|---|
| `a2a-js` | **Apache-2.0** | Clean; adopted as contract layer. |
| `context7` | **MIT** | Clean; in-process SDK. |
| `beads` (Go/Dolt) | MIT (verify) | Adopted as *dependency/workflow*, not source-copied. |
| real `git` (vendored C) | **GPL-2.0** ⚠️ | Shipped as a **separate binary** invoked over a process boundary (not linked) — the correct way to use GPL git. Keep it a binary seam. |
| `pal-mcp-server` (Python) | Apache/permissive (verify) | Managed subprocess. |
| **`gitnexus`** | **PolyForm Noncommercial** ⚠️⚠️ | **Hard flag.** Non-OSI, **noncommercial** license. INTEGRATION_PLAN already says: do **not** vendor source into a commercial product until licensed. Treat as wrap/replace target. |

### 4.6 rithub (the separate Rust git forge) — future backend
GitGram's own [PLAN.md](PLAN.md)/North Star draw a boundary: **AITM is not a Git
reimplementation** — "a separate Rust Git Forge product owns the Rust Git
implementation and self-hostable forge boundary." **rithub** is that product.
Architecturally it is a **future backend GitGram integrates with over APIs**, not
a vendored dependency:
- **Seam:** the same `ingestion/github/*` abstraction (webhook receiver + repo
  sync + Octokit client) should be interface-first so a **rithub forge adapter**
  can be added alongside the GitHub adapter — GitGram then ingests contribution
  evidence from a self-hosted rithub forge exactly as it does from GitHub.
- **Why it matters for the talent graph:** rithub-hosted repos become another
  `CONTRIBUTED_TO`/`OWNS` provenance source; the evidence tiers and matcher are
  source-agnostic by design.
- **Boundary discipline:** keep it an **API integration** (network/process seam),
  mirroring how the vendored C `git` and GPL concerns are already isolated behind
  binary/URL boundaries — do not couple GitGram's Prisma/Drizzle stores to
  rithub's Rust internals.

### 4.7 Reuse-vs-build summary
- **Reuse (adopt/port):** Octokit stack, Bluesky feed logic, Apache AGE + Kùzu +
  pgvector for graph/vectors, OpenSearch/Meilisearch for search, a2a-js +
  context7. These are permissive and battle-tested.
- **Build (thin, owned):** the **ontology**, the **fusion pipeline** (blocking/
  matching/merge — domain-specific, no OSS fits), the **evidence extractors**,
  and the **GraphRAG match explanation**. These are GitGram's moat; keep them
  first-party and small.
- **Never vendor:** gitnexus (PolyForm NC), Neo4j/Memgraph/Typesense/ES cores,
  GPL git *source* (binary seam only).

---

## 5. Scale reality

### 5.1 Current size (TS/TSX, excludes node_modules/dist/.next)

| Area | Files | LOC |
|---|---:|---:|
| GitGram backend (`gitgram/backend/src`) | 339 | ~83.8K |
| GitGram web (`gitgram/web`) | 577 | ~128.9K |
| GitGram mobile (`gitgram/mobile`) | 542 | ~126.3K |
| AITM core (`aitimemachine/src`) | 197 | ~62.6K |
| AITM api-server (`api-server/src`) | 179 | ~80.4K |
| AITM MCP (`mcp/src`) | 50 | ~12.7K |
| **TS subtotal (these areas)** | **~1,884** | **~494.7K** |

Plus vendored engines (Go/C/Python — `beads`, `git`, `pal`, `gitnexus`,
`context7`, `a2a`) not counted above. Prisma schema: 2,320 LOC / ~70 models.
AITM Drizzle schema: ~1,521 LOC / ~54 tables. Backend: 55 controllers, ~95–102
services, 66 routes.

### 5.2 Talent-graph subsystem, per-module (today)
| File | LOC | Role |
|---|---:|---|
| `services/talentGraphService.ts` | 520 | dossier assembly + matcher |
| `controllers/talentGraphController.ts` | 511 | REST surface |
| `services/talentMutationService.ts` | 116 | serializable/idempotent writes |
| `routes/talentGraph.ts` | 41 | routing + CSRF-origin guard |
| Prisma talent models | ~150 | Opportunity/Referral/Pilot/Transition/Proof/Receipt |
| **Talent subtotal** | **~1,340** | — |

The talent graph is **~1.3K LOC riding on a 2.3K-line Prisma schema and the
~10K-LOC GitHub-ingestion + feed machinery** — small core, large substrate.

### 5.3 Enterprise-target incremental estimate
| New/expanded module | Est. LOC |
|---|---:|
| `packages/graph-core` + `evidence-schema` + ontology | 1.5–2.5K |
| `talent-graph/store` (AGE/Kùzu adapters + Repository facade) | 2–3K |
| `talent-graph/fusion` (blocking/matching/merge/contradiction) | 2–3K |
| `talent-graph/matching-engine` + GraphRAG serve | 2–3K |
| `ingestion` refactor (github adapters + contribution harvester + rithub seam) | 2–3K |
| `evidence` extractors + provenance | 1.5–2.5K |
| social-plane consolidation (dedupe GitGram/AITM) | -3 to +2K (net simplification) |
| tests to 80% (web/mobile currently ~0) | 8–15K |
| **Net new** | **~19–33K LOC** |

Target total lands GitGram+AITM around **~520–530K TS LOC** — mid-size
enterprise monorepo; the *risk* is not size but the **two-data-plane split** and
**test coverage**, not raw LOC.

### 5.4 Owner decisions (must resolve before enterprise build)
1. **One social plane or two?** GitGram Prisma social vs AITM Drizzle
   `/v1/gitgram/*` are duplicate implementations. Pick one system-of-record.
2. **Graph store path:** stay pg-CTE now, or commit to **Apache AGE** + **Kùzu**
   projection? (Recommendation: yes, in that order.)
3. **Promote Skill to a first-class entity** (highest-value ontology change) —
   requires a canonical skills taxonomy package.
4. **gitnexus licensing:** wrap/replace or license — it is PolyForm
   Noncommercial and cannot ship in a commercial product as-is.
5. **rithub integration seam:** make `ingestion` interface-first now so a rithub
   forge adapter drops in later without a rewrite.
6. **Matcher explanation:** replace hard-coded Turkish reason strings with
   GraphRAG-serialized, cited evidence paths (i18n).

### 5.5 Done-ladder

- **L0 — Compiles / feature-broad (DONE).** Both products build clean; talent
  graph, evidence tiers, pilot lifecycle, feed ranking, adoption evidence all
  exist and are transactionally sound.
- **L1 — Launchable (open, PLAN.md Phase 3).** Publish AITM CLI/MCP to npm;
  production secrets; VPS + DNS; fix stale `drizzle.config.ts`; end-to-end smoke.
- **L2 — Trustworthy talent graph.** Promote Skill to an entity; persist edges;
  add fusion (blocking/matching/merge) so no duplicate-person path breaks;
  contribution harvester via GitHub GraphQL; structure-layer collaborator signal.
- **L3 — Explainable matching.** GraphRAG path retrieval + cited, i18n match
  reasons; verify-in-separate-context pilot judging; unmatched-need gap analysis.
- **L4 — Enterprise.** Apache AGE/Kùzu store; OpenSearch; rithub adapter;
  one consolidated social plane; 80% test coverage; SSO/SAML; retention/audit.

### 5.6 Zemin360 readiness

- **Demo-ready today:** the end-to-end evidence story is compelling and *real* —
  post a Need → get evidence-ranked matches → start a pilot → complete it →
  publish consented public proof → that proof raises future match scores, with
  the AITM `/v1/adoption/summary` showing privacy-preserving real-usage evidence.
  Turkish-localized match reasons suit a Zemin360 (Turkish hackathon) audience.
- **Demo risks to pre-empt:** needs seeded data (matcher returns nothing on an
  empty graph); the "graph" is relational under the hood (fine for a demo, but
  don't over-claim multi-hop traversal); the two social planes can confuse a live
  walkthrough — demo the GitGram Prisma plane only.
- **Judge-facing framing:** lead with **evidence-based hiring** (people matched
  by real OSS work, not résumés) + **privacy-preserving proof** (opaque-key
  adoption evidence) + **the social proof loop** — three differentiators that are
  all backed by shipped code.
```

