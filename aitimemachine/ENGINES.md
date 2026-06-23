# AITM Engines

AITM merges seven vendored repos in as **first-party engines** — built, imported,
and managed as part of the product. There are no "assumed external service" seams
(`GITNEXUS_URL`, `CONTEXT7_URL`, `PAL_MCP_URL` are gone).

Build everything with:

```bash
bash aitimemachine/scripts/build-engines.sh
```

This produces bundled binaries under `aitimemachine/bin/` and a Python venv under
`aitimemachine/engines/pal/`, and builds the TS engine libraries. Both directories
are git-ignored.

## The three layers

### Memory — `beads` + `context7`
| Engine | What | How it's wired |
|---|---|---|
| **beads** (`beads/`, Go) | Task/issue DAG memory (Dolt-backed). | Built to `bin/bd`; `api-server/src/routes/beads.ts` spawns it. Task creates write through to AITM memory. |
| **context7** (`context7/`, TS) | Up-to-date library/framework docs. | In-process `@upstash/context7-sdk` (`Context7` client). Configured by `CONTEXT7_API_KEY`. |

Both feed AITM's unified memory: `services/memoryService.ts` ingests beads tasks
(`source='task'`) and context7 docs (`source='library'`) into `saved_contexts` with
embeddings, so `/v1/contexts/search/*` returns them alongside conversation memory.
Schema change: `saved_contexts.source` (migration `0005_add_saved_context_source.sql`).

### Git — vendored C `git` + `gitnexus`
| Engine | What | How it's wired |
|---|---|---|
| **git** (`git/`, C) | The real Git (upstream C source). The Rust `gitcore` crate is a non-functional stub and is **not** used. | Built to `bin/git`; `src/core/git-engine.ts` shells out (falls back to system `git`). Checkpoints mirror to a real git commit (`AITM_GIT_MIRROR`). `aitm git …` passthrough. |
| **gitnexus** (`gitnexus/` + `gitnexus-shared/`, TS) | Code-intelligence graph (Tree-sitter + LadybugDB). | In-process via the new `gitnexus` library entry (`gitnexus/src/index.ts` → `LocalBackend.callTool`). `gitNexusService.ts` calls it directly; `gn_*` MCP tools unchanged. |

### Agentic comms — `pal` + `a2a`
| Engine | What | How it's wired |
|---|---|---|
| **a2a** (`a2a/`, TS) | Agent-to-agent protocol. | Consolidated onto `@a2a-js/sdk` (`DefaultRequestHandler`, `InMemoryTaskStore`, `A2AClient`). The hand-rolled `a2aService` is replaced; registry backed by the SDK TaskStore. |
| **pal** (`pal-mcp-server/`, Python) | Agent Python execution / multi-model orchestration (MCP, stdio). | AITM-managed subprocess: `api-server/src/engines/palEngine.ts` spawns the bundled venv and speaks MCP over stdio. `pal_*` tools route through it. |

## Path resolution & health

- `api-server/src/services/engineManager.ts` resolves bundled engine paths
  (`bin/bd`, `bin/git`, `engines/pal`) with first-party defaults — no external URLs.
- `GET /v1/health/providers` reports each engine in-process/bundled:
  GitNexus → `gitNexusService.isAvailable()`; Context7 → `CONTEXT7_API_KEY`;
  PAL → `palEngine.health()`; beads → `bin/bd --version`; git → bundled/system.

## Environment

| Var | Purpose | Default |
|---|---|---|
| `CONTEXT7_API_KEY` | Enable Context7 (replaces `CONTEXT7_URL`). | — |
| `AITM_MEMORY_USER_ID` / `AITM_MEMORY_PROJECT_ID` | Target for memory write-through when a request has no user/project. | write-through skipped if unset |
| `AITM_GIT_BIN` | Override git binary. | `bin/git` → system `git` |
| `AITM_GIT_MIRROR` | `0` disables mirroring checkpoints to git. | enabled |
| `PAL_VENV_DIR` / `PAL_PYTHON` | PAL venv / interpreter. | `engines/pal` |
| `BEADS_BINARY` | Override beads binary. | `bin/bd` |

Removed: `GITNEXUS_URL`, `CONTEXT7_URL`, `PAL_URL`, `PAL_MCP_URL`, `AITM_A2A_AGENTS`.
