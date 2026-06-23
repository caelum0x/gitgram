# Architecture

This document goes deeper than the front-door [README](../README.md): it covers the
end-to-end data flow, the unified memory layer, the git engine and checkpoint
mirroring, the agentic communication path (a2a registry + pal subprocess), and how
each MCP tool maps to an engine.

Two products live in one repo:

- **Gitgram** — a repository-first social network (the "new GitHub"). Every repo is a
  social profile with feeds, posts, and follows.
- **AITimeMachine (AITM)** — an AI-native version-control substrate (the "new Git")
  with a unified memory layer, real git underneath, code intelligence, and agent
  orchestration.

Gitgram is a product *on top of* AITM. AITM is the substrate that makes AI agents
making dozens of PRs per day deterministic and recoverable.

---

## 1. Layered Topology

```
   Clients
   ┌─────────────┐  ┌──────────────┐  ┌──────────┐  ┌──────────────────┐
   │ Gitgram web │  │ Gitgram      │  │ aitm CLI │  │ MCP clients      │
   │ (Next.js)   │  │ mobile (Expo)│  │          │  │ (Claude, IDEs)   │
   └──────┬──────┘  └──────┬───────┘  └────┬─────┘  └────────┬─────────┘
          │ GraphQL/tRPC/WS │               │  HTTP / MCP     │
          └────────┬────────┘               └────────┬────────┘
                   ▼                                  ▼
        ┌────────────────────┐            ┌────────────────────────┐
        │  Gitgram backend   │◀──bridge──▶│   AITM api-server      │
        │  Express 5 / Prisma│            │   Express / Drizzle    │
        └─────────┬──────────┘            └───────────┬────────────┘
                  ▼                                    ▼
        ┌───────────────────┐              ┌──────────────────────┐
        │ Postgres + Redis  │              │  engineManager.ts    │
        └───────────────────┘              └──────────┬───────────┘
                                                      ▼
                              ┌──────── 7 first-party engines ────────┐
                              │ memory : beads        · context7       │
                              │ git    : git (C)      · gitnexus       │
                              │ agentic: a2a          · pal            │
                              │ (+ gitnexus-shared support lib)        │
                              └────────────────────────────────────────┘
```

- **Gitgram backend** (`gitgram/backend`) is an Express 5 app exposing GraphQL
  (`@apollo/server`), tRPC (`@trpc/server`), and Socket.IO WebSockets over Prisma +
  Postgres, with Redis for caching/queues. Controllers, jobs, models, and services
  are split by domain under `src/`.
- **AITM api-server** (`aitimemachine/api-server`) is the HTTP surface over the
  engines, using Drizzle ORM (Neon / node-postgres dual driver). `engineManager.ts`
  resolves bundled engine paths (`bin/bd`, `bin/git`, `engines/pal`) with first-party
  defaults — no external URLs.
- The two products talk through a **bridge**: `services/gitgramBridgeService.ts` plus
  `routes/gitgram.ts` and `routes/gitgramWebhooks.ts`, so Gitgram repo events can
  drive AITM memory/checkpoints and AITM can surface intelligence back to Gitgram.

---

## 2. Data Flow

### Gitgram request path

1. Web (`Next.js`) or mobile (`Expo`/`react-native`) issues a GraphQL/tRPC call or
   opens a Socket.IO connection.
2. Express middleware authenticates and authorizes the request.
3. A domain controller/service reads or writes Postgres through Prisma; hot paths and
   pub/sub use Redis.
4. WebSocket events (`socket.io`) push feed updates to connected clients.
5. Repo-level events relevant to version control are forwarded to AITM via the bridge.

### AITM request path

1. A client (`aitm` CLI, an MCP client, or the Gitgram bridge) hits the api-server or
   speaks MCP over stdio/HTTP.
2. The route handler validates input, then calls a service.
3. The service resolves the relevant engine through `engineManager.ts` and either
   calls it in-process (context7, gitnexus, a2a) or spawns/shells out to a bundled
   binary or subprocess (beads, git, pal).
4. Side effects (tasks, docs, checkpoints) write through to the unified memory layer.
5. `GET /v1/health/providers` reports each engine's availability.

---

## 3. The Unified Memory Layer

AITM's defining feature is a single searchable memory that fuses three sources into
the `saved_contexts` table with vector embeddings.

```
   beads tasks ──► source='task'    ─┐
   context7 docs ─► source='library' ─┼─► memoryService.ts ─► saved_contexts
   conversations ─► source='memory'  ─┘        (embeddings via embeddings.ts)
                                                       │
                                                       ▼
                                           GET /v1/contexts/search/*
```

- **`services/memoryService.ts`** ingests beads tasks and context7 docs, tagging each
  row with `saved_contexts.source` (added in migration
  `0005_add_saved_context_source.sql`).
- **`services/embeddings.ts`** produces the vectors so semantic search spans all three
  sources at once.
- A search for "how does retention work" can therefore return a beads task, a
  context7 doc snippet, and a prior conversation memory in one ranked result set.
- When a request carries no user/project, write-through targets
  `AITM_MEMORY_USER_ID` / `AITM_MEMORY_PROJECT_ID`; if those are unset, write-through
  is skipped (reads still work).

This is what lets agents accumulate durable, queryable context across sessions instead
of re-deriving state every run.

---

## 4. The Git Engine + Checkpoint Mirroring

AITM uses the **real upstream Git** (vendored C source in `aitimemachine/git/`), not a
reimplementation. The Rust `gitcore` crate present in the tree is a non-functional stub
and is **not** used.

```
   aitm checkpoint / before_action
            │
            ▼
   git-engine.ts ──► bin/git (or system git fallback)
            │
            ├─► AITM session/checkpoint store (Drizzle)
            │
            └─► AITM_GIT_MIRROR=on ─► real git commit  ◄── deterministic restore
```

- **`src/core/git-engine.ts`** shells out to `bin/git` (built by
  `build-engines.sh`), falling back to the system `git` if the bundled binary is
  absent. `AITM_GIT_BIN` overrides the path; `aitm git …` is a passthrough.
- **Checkpoint mirroring**: every AITM checkpoint is mirrored to a real git commit
  when `AITM_GIT_MIRROR` is enabled (the default). This gives deterministic,
  inspectable restore points backed by ordinary git objects — restores are exact, not
  approximate.
- **`gitnexus`** (with `gitnexus-shared`) layers a code-intelligence graph over the
  repo using Tree-sitter parsing and LadybugDB. It runs in-process via
  `gitnexus/src/index.ts` → `LocalBackend.callTool`; `services/gitNexusService.ts`
  calls it directly. This powers impact analysis, call/route tracing, and structural
  queries.

---

## 5. Agentic Communication (a2a registry + pal subprocess)

The agentic layer is how AITM coordinates multiple agents and runs their code.

```
   ┌──────────── a2a (in-process) ────────────┐    ┌──── pal (subprocess) ────┐
   │ @a2a-js/sdk                               │    │ pal-mcp-server (Python)  │
   │  DefaultRequestHandler                    │    │  bundled venv (engines/  │
   │  InMemoryTaskStore  ◄── registry          │    │  pal), MCP over stdio    │
   │  A2AClient                                │    │  via palEngine.ts        │
   └───────────────────────────────────────────┘    └──────────────────────────┘
        agent ↔ agent messaging/tasks                 code execution / multi-model
```

- **a2a (agent-to-agent protocol)** is consolidated onto `@a2a-js/sdk`. The
  hand-rolled `a2aService` is replaced; the agent **registry is backed by the SDK's
  `InMemoryTaskStore`**, with `DefaultRequestHandler` serving requests and `A2AClient`
  for outbound calls. This standardizes how agents discover each other and exchange
  tasks/messages. The `AITM_A2A_AGENTS` external seam was removed.
- **pal (Python agent execution)** runs as an **AITM-managed subprocess**.
  `api-server/src/engines/palEngine.ts` spawns the bundled venv
  (`engines/pal`, override via `PAL_VENV_DIR` / `PAL_PYTHON`) and speaks MCP over
  stdio. It handles sandboxed code execution, notebooks, package installs, and
  multi-model orchestration. `pal_*` MCP tools route through it.

Together: a2a decides *who does what*, pal *runs the code*, and the memory layer
*remembers the outcome*.

---

## 6. MCP Tools → Engines

The MCP server (`aitimemachine/mcp`) registers tools in groups under
`src/tools/register-*.ts`. Each group maps to one engine or to AITM core.

| Tool group / prefix | Backing engine | Representative tools |
|---------------------|----------------|----------------------|
| `register-core-tools` / `register-session-tools` | AITM core (git engine + memory) | `before_action`, `after_action`, `create_checkpoint`, `restore_session`, `list_sessions` |
| `register-beads-tools` | **beads** (memory) | task/issue DAG create, list, link |
| `register-context7-tools` | **context7** (memory) | `context7` library-doc lookup |
| `register-gitnexus-tools` / `register-analysis-tools` | **gitnexus** (git) | `gn_query`, `gn_impact`, `gn_trace`, `gn_route_map`, `gn_explain`, `gn_cypher`, `gn_pdg_query`, `gn_api_impact`, `gn_rename`, `gn_check` |
| `register-a2a-tools` | **a2a** (agentic) | agent register, send-task, list-agents |
| `register-pal-tools` | **pal** (agentic) | `pal_execute`, `pal_analyze_code`, `pal_create_session`, `pal_install_package`, `pal_execute_notebook`, `pal_convert_notebook` |
| `register-file-tools` / `register-workspace-tools` / `register-worktree-tools` | AITM core (git engine) | file scan, workspace, worktree ops |
| `register-github-tools` / `register-integration-tools` / `register-storage-tools` / `register-claude-tools` | AITM core / integrations | GitHub, storage, and Claude-side glue |

Resolution flow for any tool call:

```
   MCP client → mcp/src/tools/register-<group>.ts → AITM service
        → engineManager.ts resolves engine
        → in-process call (context7/gitnexus/a2a)  OR  spawn (beads/git/pal)
        → optional memory write-through (memoryService.ts)
```

Core safety tools (`before_action` / `after_action` / `create_checkpoint`) wrap any
agent action in a checkpoint, so the git engine's mirroring guarantees the action is
recoverable — the foundation for letting agents make many PRs per day safely.

---

## 7. Health, Path Resolution, and First-Party Guarantees

- **`services/engineManager.ts`** is the single place that resolves engine locations,
  always preferring bundled, first-party defaults (`bin/bd`, `bin/git`,
  `engines/pal`).
- **`GET /v1/health/providers`** reports each engine independently:
  gitnexus → `gitNexusService.isAvailable()`; context7 → `CONTEXT7_API_KEY` presence;
  pal → `palEngine.health()`; beads → `bin/bd --version`; git → bundled-or-system.
- Removed external seams: `GITNEXUS_URL`, `CONTEXT7_URL`, `PAL_URL`, `PAL_MCP_URL`,
  `AITM_A2A_AGENTS`. Engines are part of the product, not assumed services.

See [aitimemachine/ENGINES.md](../aitimemachine/ENGINES.md) for the per-engine build
wiring and the full environment-variable table, and
[environment-matrix.md](environment-matrix.md) for per-environment values.

---

## 8. Build & Migration Order (why it matters)

The TS engine libraries (`gitnexus-shared`, `context7` SDK, `a2a`, `gitnexus`) must be
built **before** `api-server`/`mcp` can resolve their imports —
`build-engines.sh` enforces this order, then compiles the native engines
(`beads`, `git`) and provisions the `pal` venv, then links workspace deps. Database
migrations run independently per product: Prisma for Gitgram, Drizzle for AITM, both
driven by `scripts/dev.sh`.
