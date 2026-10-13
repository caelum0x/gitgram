# gitgram-ai

**GitGram** is a social layer for GitHub. It turns repositories into
Instagram-style accounts with posts, reels, stories, media, followers, feeds,
and publishing workflows. It connects to repositories through authenticated
APIs and webhooks; it does not replace GitHub's repository hosting or Git's
storage and protocol.

**AITimeMachine (AITM)** captures and restores AI coding workflows, including
checkpoints, messages, context, tool calls, and agent orchestration. It uses Git
where useful but does not claim to replace Git. A separate Rust Git Forge
product owns the Rust Git implementation and self-hostable forge boundary.

---

## Monorepo Map

```
gitgram-ai/
├── gitgram/                  # The GitHub repository social layer
│   ├── web/                  #   Next.js 14 + React 18 web app          (:3000)
│   ├── backend/              #   Express 5 + Prisma + GraphQL/tRPC/WS   (:4000)
│   └── mobile/               #   Expo 54 / React Native + expo-router
│
├── aitimemachine/            # AI workflow capture and deterministic restore
│   ├── api-server/           #   HTTP API over the engines (Drizzle ORM) (:3001)
│   ├── mcp/                  #   Model Context Protocol server (stdio/HTTP :3003)
│   ├── cli/  (src/cli*)      #   `aitm` command-line client
│   ├── website/              #   Marketing / docs site                  (:3002)
│   └── ─── 7 first-party engines (vendored, built in-tree) ───
│       ├── beads/            #   memory  — task/issue DAG (Go, Dolt-backed)
│       ├── context7/         #   memory  — up-to-date library docs (TS)
│       ├── git/              #   git     — real upstream Git (vendored C)
│       ├── gitnexus/         #   git     — code-intelligence graph (TS)
│       ├── a2a/              #   agentic — agent-to-agent protocol (TS)
│       └── pal-mcp-server/   #   agentic — Python agent execution (Python)
│                             #   (gitnexus-shared/ supports the gitnexus engine)
│
├── scripts/                  # Monorepo dev/ops scripts (dev.sh, smoke, verify)
├── docs/                     # Architecture, runbook, deploy, secrets, env matrix
└── docker-compose.yml        # Full local stack (Postgres + Redis + apps)
```

The seven engines are **first-party**: vendored, built, and managed as part of the
product. There are no "assumed external service" seams — the old `GITNEXUS_URL`,
`CONTEXT7_URL`, and `PAL_MCP_URL` environment seams have been removed.

---

## AITM's 7 Merged Engines

AITM merges seven vendored repos as engines across three layers. Full wiring details
live in **[aitimemachine/ENGINES.md](aitimemachine/ENGINES.md)**.

| Layer | Engine | Lang | What it does | How it's wired |
|-------|--------|------|--------------|----------------|
| **Memory** | `beads` | Go | Task/issue DAG memory (Dolt-backed) | Built to `bin/bd`; `routes/beads.ts` spawns it; tasks write through to memory |
| **Memory** | `context7` | TS | Up-to-date library/framework docs | In-process `@upstash/context7-sdk`; `CONTEXT7_API_KEY` |
| **Git** | `git` | C | The real upstream Git | Built to `bin/git`; `git-engine.ts` shells out; checkpoints mirror to real commits |
| **Git** | `gitnexus` | TS | Code-intelligence graph (Tree-sitter + LadybugDB) | In-process via `gitnexus/src/index.ts`; `gn_*` MCP tools |
| **Agentic** | `a2a` | TS | Agent-to-agent protocol | `@a2a-js/sdk` (`DefaultRequestHandler`, `InMemoryTaskStore`, `A2AClient`) |
| **Agentic** | `pal` | Python | Agent code execution / multi-model orchestration | AITM-managed subprocess (`palEngine.ts`) speaking MCP over stdio |

The seventh, `gitnexus-shared`, is a TS support library the `gitnexus` engine inlines
at build time.

Both memory engines feed AITM's **unified memory**: `services/memoryService.ts`
ingests beads tasks (`source='task'`) and context7 docs (`source='library'`) into
`saved_contexts` with embeddings, so `/v1/contexts/search/*` returns them alongside
conversation memory.

---

## Quick Start

### Prerequisites

| Tool | Version | Needed for |
|------|---------|-----------|
| Node.js | 20+ | all apps and engines |
| npm | 10+ | dependency install |
| Docker + Compose v2 | latest | Postgres, Redis, full stack |
| Go | 1.21+ | building the `beads` engine |
| `make` + `cc` | any | building the vendored `git` engine |
| Python | 3.10+ | building the `pal` engine venv |

> Engine builds **soft-fail**: a missing toolchain for one engine never blocks the
> others. `git` falls back to the system binary; missing engines simply report
> unavailable in the health endpoint.

### 1. Clone and bootstrap

```bash
git clone <repo-url> gitgram-ai && cd gitgram-ai

# One-shot dev setup: prereq checks, .env scaffolding, infra, deps, migrations
bash scripts/dev.sh
```

`scripts/dev.sh` copies every `.env.*.example` to its real counterpart (never
overwriting), starts Postgres + Redis, runs `npm ci` for each package, and applies
Prisma (Gitgram) and Drizzle (AITM) migrations.

Use `bash scripts/dev.sh --infra` to bring up only Postgres + Redis.

### 2. Build the AITM engines

```bash
bash aitimemachine/scripts/build-engines.sh
```

This builds the TS engine libraries, compiles `beads` → `aitimemachine/bin/bd` and
`git` → `aitimemachine/bin/git`, provisions the `pal` Python venv under
`aitimemachine/engines/pal`, and links workspace deps into `api-server` and `mcp`.
Both `bin/` and `engines/` are git-ignored. Verify with `GET /v1/health/providers`.

### 3. Run the dev stack

```bash
docker compose up                        # Postgres + Redis + Gitgram + AITM API
docker compose --profile tools up        # + GitNexus + Context7 helpers
```

Or run individual services natively (hot reload):

```bash
npm run dev:gitgram-backend   # → http://localhost:4000   (GET /health)
npm run dev:gitgram-web       # → http://localhost:3000
npm run dev:aitm-api          # → http://localhost:3001   (GET /health)
npm run dev:aitm-mcp          # → stdio / http://localhost:3003
```

The AITM website is intentionally **not** started by the root compose file (to avoid a
port clash with Gitgram web). Run it on `:3002` separately:

```bash
cd aitimemachine/website && cp .env.example .env.local && PORT=3002 npm run dev
```

### Environment variables

`dev.sh` scaffolds these from their `.example` siblings:

| File | Service |
|------|---------|
| `.env.gitgram` | Gitgram backend |
| `.env.gitgram-web` | Gitgram web |
| `.env.aitm-api` | AITM API server |
| `.env.aitm-website` | AITM website |
| `.env.postgres` | Postgres container |

Key AITM engine vars (see [ENGINES.md](aitimemachine/ENGINES.md) for the full matrix):
`CONTEXT7_API_KEY`, `AITM_GIT_BIN`, `AITM_GIT_MIRROR`, `BEADS_BINARY`,
`PAL_VENV_DIR` / `PAL_PYTHON`, `AITM_MEMORY_USER_ID` / `AITM_MEMORY_PROJECT_ID`.
The full per-environment matrix lives in [docs/environment-matrix.md](docs/environment-matrix.md).

---

## Architecture at a Glance

```
        ┌──────────────┐     ┌──────────────┐
        │  Gitgram web │     │ Gitgram      │
        │  (Next.js)   │     │ mobile (Expo)│
        └──────┬───────┘     └──────┬───────┘
               │     GraphQL / tRPC / WebSocket
               └───────────┬────────┘
                           ▼
                ┌──────────────────────┐
                │  Gitgram backend     │   Express 5
                │  (controllers, jobs) │   Prisma ORM
                └──────────┬───────────┘
                           ▼
                 ┌───────────────────┐
                 │  Postgres + Redis │
                 └───────────────────┘

  ──────────────────  AITM substrate  ──────────────────

   ┌──────────┐    ┌──────────┐
   │ aitm CLI │    │   MCP    │  (Claude, IDEs, agents)
   └────┬─────┘    └────┬─────┘
        │   HTTP / MCP   │
        └───────┬────────┘
                ▼
      ┌────────────────────────┐
      │   AITM api-server      │  Drizzle ORM
      │   engineManager.ts     │  resolves bundled engine paths
      └───────────┬────────────┘
                  ▼
   ┌──────── 7 first-party engines ────────┐
   │ memory : beads (bin/bd) · context7     │
   │ git    : git (bin/git) · gitnexus      │
   │ agentic: a2a (@a2a-js) · pal (venv)    │
   └────────────────────────────────────────┘

  Gitgram ↔ AITM bridge: gitgramBridgeService.ts + routes/gitgram*.ts
```

For data flow, the unified memory layer, checkpoint mirroring, and how each MCP tool
maps to an engine, see **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)**.

---

## Testing

Each package owns its test suite:

```bash
npm test --prefix gitgram/web                  # Vitest + Testing Library
npm test --prefix gitgram/backend              # needs live Postgres + Redis
npm test --prefix aitimemachine/api-server     # Vitest + supertest
npm test --prefix aitimemachine                # Vitest (core + engines)
```

Engine and integration smokes:

```bash
bash aitimemachine/scripts/mcp-smoke-test.sh   # MCP tools end-to-end
bash aitimemachine/scripts/cli-smoke-test.sh   # aitm CLI
bash aitimemachine/scripts/a2a-smoke-test.sh   # agent-to-agent protocol
npm run smoke:local-launch                     # whole-stack local smoke gate
```

---

## Deployment

Local and CI use Docker Compose (`docker-compose.yml`). Production runs on a single
VPS following the manual launch contract in [docs/runbook.md](docs/runbook.md);
`docker-compose.prod.yml` is a non-canonical full-docker reference.

Run release gates before any staging/production deploy:

```bash
npm run verify:aitm-packages
npm run verify:aitm-local
npm run verify:secrets:staging
npm run verify:secrets:production
```

Deploy pipeline and secrets contracts: [docs/deploy-pipeline.md](docs/deploy-pipeline.md),
[docs/secrets-contract.md](docs/secrets-contract.md).

---

## Contributing

1. Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and
   [aitimemachine/ENGINES.md](aitimemachine/ENGINES.md) to understand the layering.
2. Run `bash scripts/dev.sh` then `bash aitimemachine/scripts/build-engines.sh`.
3. Keep engines first-party — do not reintroduce external-URL seams.
4. Add tests with your change; run the relevant suite and smoke scripts above.
5. Run the verify/secrets gates before opening a deploy-bound PR.

### Docs index

- North-star PRD / architecture — [NORTH_STAR_PRD_ARCHITECTURE_V1.md](NORTH_STAR_PRD_ARCHITECTURE_V1.md)
- Deeper architecture — [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- Engine wiring — [aitimemachine/ENGINES.md](aitimemachine/ENGINES.md)
- Manual launch runbook — [docs/runbook.md](docs/runbook.md)
- Environment matrix — [docs/environment-matrix.md](docs/environment-matrix.md)
- Agents guide — [docs/AGENTS.md](docs/AGENTS.md)

## License

MIT for original GitGram and AITimeMachine code. Vendored third-party directories keep their own licenses, see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
