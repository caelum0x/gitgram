# AI Tools — Architecture & Reference

This document is the single-source reference for every AI tool integrated into the
`gitgram-ai` monorepo. All tools live under `aitimemachine/` and are wired together
through the AITM MCP server.

---

## Table of Contents

1. [Architecture overview](#1-architecture-overview)
2. [Starting each tool](#2-starting-each-tool)
3. [Analyzing codebases with GitNexus](#3-analyzing-codebases-with-gitnexus)
4. [A2A protocol — how it works and how to register agents](#4-a2a-protocol)
5. [MCP tools reference](#5-mcp-tools-reference)
6. [Quick-start guide](#6-quick-start-guide)

---

## 1. Architecture Overview

```
gitgram-ai/
├── aitimemachine/
│   ├── mcp/                 # AITM MCP server — central hub, exposes all tools
│   ├── api-server/          # REST API for TimeMachine state (Drizzle/Neon)
│   ├── gitnexus/            # Graph-powered code intelligence, 17 MCP tools
│   ├── a2a/                 # A2A protocol types & JSON-RPC helpers
│   ├── context7/packages/mcp/  # Context7 MCP — up-to-date library docs
│   ├── beads/               # Go CLI for distributed graph issue tracking (bd)
│   ├── pal-mcp-server/      # PAL MCP — multi-model AI orchestration
│   └── tools/
│       ├── repo2txt/        # React/Vite UI: convert repos to LLM-readable text
│       └── repo-to-text/    # Python CLI: same conversion, CLI variant
└── scripts/
    ├── setup-aitm-tools.sh  # One-shot build of all companion tools
    └── start-all-dev.sh     # Start core dev services with concurrently
```

### How the pieces connect

```
Claude Code / Cursor / any MCP client
          │
          ▼
  ┌───────────────────────────────────────┐
  │         AITM MCP server               │
  │  aitimemachine/mcp  (port: stdio)     │
  │                                       │
  │  Tool groups:                         │
  │  • tm_*          — TimeMachine core   │
  │  • gn_* proxy    — GitNexus tools     │
  │  • tm_docs_*     — Context7 tools     │
  │  • a2a_*         — A2A agent tools    │
  │  • before/after_action                │
  └──────────┬──────────────┬────────────┘
             │              │
             ▼              ▼
  ┌──────────────┐  ┌──────────────────┐
  │   GitNexus   │  │    Context7 MCP  │
  │  :3001/msg   │  │    :3100/msg     │
  └──────────────┘  └──────────────────┘
```

The AITM MCP server is the single entry point for AI clients. It embeds the
TimeMachine engine directly and proxies GitNexus and Context7 over HTTP/JSON-RPC.
PAL MCP and Beads run as independent services alongside it.

### Tool inventory

| Tool | Location | Language | Purpose |
|------|----------|----------|---------|
| AITM MCP server | `aitimemachine/mcp` | TypeScript | Central MCP hub; checkpoint, restore, session, file, worktree, S3, Docker capsule tools |
| GitNexus | `aitimemachine/gitnexus` | TypeScript | Code knowledge graph: query, impact, trace, rename, route/tool maps |
| PAL MCP Server | `aitimemachine/pal-mcp-server` | Python | Multi-model AI orchestration (chat, code review, debug, plan, consensus) |
| Context7 | `aitimemachine/context7/packages/mcp` | TypeScript | Up-to-date library documentation injected into LLM context |
| Beads (`bd`) | `aitimemachine/beads` | Go | Distributed graph issue tracker for AI agents (Dolt-powered) |
| A2A protocol | `aitimemachine/a2a` | TypeScript | JSON-RPC 2.0 agent-to-agent protocol types and SDK |
| repo2txt | `aitimemachine/tools/repo2txt` | TypeScript/React | UI to convert a GitHub repo or local directory to LLM-readable text |
| repo-to-text | `aitimemachine/tools/repo-to-text` | Python | CLI to convert a directory to structured XML/text for LLM prompts |

---

## 2. Starting Each Tool

All commands below are root-level npm scripts. Run them from the monorepo root
(`/Users/arhansubasi/gitgram-ai/` or wherever you cloned the repo).

### AITM MCP server

```bash
npm run dev:aitm-mcp
# Starts aitimemachine/mcp in watch mode (stdio transport)
```

Configure your MCP client to launch it via the `mcp.json` at
`aitimemachine/mcp/mcp.json`. The `aitm` server entry uses `node dist/index.js`.

Environment variables recognised by the server:

| Variable | Default | Purpose |
|----------|---------|---------|
| `GITNEXUS_URL` | `http://localhost:3001` | Where to proxy GitNexus tool calls |
| `CONTEXT7_URL` | `http://localhost:3100` | Where to proxy Context7 tool calls |
| `AITM_A2A_AGENTS` | `[]` | JSON array of `{ name, url }` to register A2A agents |
| `AITM_EXPERIMENTAL_TOOLS` | `0` | Set to `1` to enable experimental tools |
| `DISABLED_TOOLS` | — | Comma-separated list of tool names to disable |

### AITM API server

```bash
npm run dev:aitm-api        # standard dev mode
npm run dev:aitm-api:clean  # dev mode with a clean database
```

Serves the TimeMachine REST API at `http://localhost:3001` by default.

### GitNexus

```bash
npm run dev:gitnexus        # starts the GitNexus HTTP server at :3001
npm run dev:gitnexus-web    # starts the GitNexus web UI
```

GitNexus must have at least one repo indexed before it can answer queries.
See [Section 3](#3-analyzing-codebases-with-gitnexus) for indexing instructions.

### PAL MCP Server

```bash
npm run dev:pal-mcp
# Runs aitimemachine/pal-mcp-server/run-server.sh (activates Python venv, starts server)
```

Configure providers by creating a `.env` in `aitimemachine/pal-mcp-server/` based
on the `requirements.txt` instructions. At minimum set one of:
`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, or `GEMINI_API_KEY`.

### Context7

```bash
npm run dev:context7
# Starts aitimemachine/context7/packages/mcp/dist/index.js
# (falls back to node directly if the package has no dev script)
```

Listens on port `3100` by default. No API key required for public libraries;
set `CONTEXT7_API_KEY` for higher rate limits and private repositories.

### Beads (`bd`)

```bash
npm run build:beads
# Compiles Go binary to aitimemachine/beads/bd
```

After building, use the binary directly:

```bash
aitimemachine/beads/bd init          # initialise in any project
aitimemachine/beads/bd setup claude  # install Claude Code hooks
aitimemachine/beads/bd ready         # list unblocked tasks
aitimemachine/beads/bd prime         # print agent workflow context
```

### repo2txt (React/Vite UI)

```bash
npm run dev:repo2txt
# Vite dev server for the repo2txt web UI
```

### repo-to-text (Python CLI)

```bash
npm run dev:repo-to-text
# python -m repo_to_text from aitimemachine/tools/repo-to-text
```

Install the Python package once before first use:

```bash
pip install repo-to-text
```

### Start all core services at once

```bash
bash scripts/start-all-dev.sh
# Requires: npm install -g concurrently
# Starts: gitgram/backend (:3000), gitgram/web (:3002), aitimemachine/api-server (:3001)
```

Port overrides:

```bash
GITGRAM_BACKEND_PORT=3000 GITGRAM_WEB_PORT=3002 AITM_API_PORT=3001 \
  bash scripts/start-all-dev.sh
```

---

## 3. Analyzing Codebases with GitNexus

GitNexus builds a queryable knowledge graph (nodes = symbols, edges = calls/imports/
inheritance) from a TypeScript or JavaScript codebase. You must index a repo before
the graph tools return useful results.

### Using the convenience script

```bash
# From monorepo root
bash scripts/analyze-with-gitnexus.sh <REPO>
```

Supported `<REPO>` aliases:

| Alias | Path |
|-------|------|
| `gitgram-backend` | `gitgram/backend` |
| `gitgram-web` | `gitgram/web` |
| `aitm-api` | `aitimemachine/api-server` |
| `aitm-mcp` | `aitimemachine/mcp` |

The script auto-builds the GitNexus CLI if `dist/cli/index.js` is missing, then
calls `gitnexus analyze <path> --name <name>`.

### Using the CLI directly

```bash
cd aitimemachine/gitnexus

# Index a repo (run from its root, or pass --root)
node dist/cli/index.js analyze /absolute/path/to/repo --name my-repo

# Start the query server
npm run serve          # or: node dist/cli/index.js server
# Default: http://localhost:3001

# Query via CLI
node dist/cli/index.js query "authentication flow"
node dist/cli/index.js context validateUser
node dist/cli/index.js impact AuthService
```

### Using GitNexus through the AITM MCP server

Once the GitNexus server is running and `GITNEXUS_URL` points at it, all `gn_*`
tools become available inside the AITM MCP server automatically. Example in Claude
Code:

```
list all indexed repos → calls gn_list_repos
query "how does checkout work" → calls gn_query
impact analysis for PaymentService → calls gn_impact
```

### Using GitNexus with MCP directly (without AITM)

```bash
# Claude Code
claude mcp add gitnexus -- npx -y gitnexus@latest mcp

# or add to .mcp.json
{
  "mcpServers": {
    "gitnexus": {
      "command": "node",
      "args": ["aitimemachine/gitnexus/dist/cli/index.js", "mcp"]
    }
  }
}
```

---

## 4. A2A Protocol

The A2A (Agent-to-Agent) protocol is a Google-authored open standard for agents to
delegate tasks to other agents over HTTP using JSON-RPC 2.0. The implementation in
`aitimemachine/a2a` provides TypeScript types and the `a2a_*` MCP tools.

### How it works

1. Every A2A agent exposes a `POST /a2a` endpoint that accepts JSON-RPC 2.0 requests.
2. The caller sends a `tasks/send` request with a `message` (array of `Part` objects).
3. The agent executes the task and returns a `Task` object with a `status` field
   (`submitted`, `working`, `completed`, `failed`, or `canceled`).
4. The caller can poll with `tasks/get` using the same `id` until the task completes.

```
Caller                               Agent
  │                                    │
  │  POST /a2a                         │
  │  { method: "tasks/send",           │
  │    params: { id, message } }  ──► │
  │                                    │  (executes)
  │  ◄─── { result: Task }            │
  │                                    │
  │  POST /a2a                         │
  │  { method: "tasks/get",            │
  │    params: { id } }           ──► │
  │  ◄─── { result: Task{status} }    │
```

### Registering agents

Set the `AITM_A2A_AGENTS` environment variable before starting the AITM MCP server.
It must be a JSON array of `{ name, url }` objects:

```bash
export AITM_A2A_AGENTS='[
  { "name": "code-reviewer", "url": "http://localhost:4001" },
  { "name": "planner",       "url": "http://localhost:4002" }
]'
npm run dev:aitm-mcp
```

Or set it in `aitimemachine/mcp/mcp.json`:

```json
{
  "mcpServers": {
    "aitm": {
      "command": "node",
      "args": ["dist/index.js"],
      "env": {
        "AITM_A2A_AGENTS": "[{\"name\":\"code-reviewer\",\"url\":\"http://localhost:4001\"}]"
      }
    }
  }
}
```

### Using A2A tools inside Claude Code

```
# List registered agents
a2a_list_agents

# Dispatch a task to an agent
a2a_send_task
  agentUrl: "http://localhost:4001"
  taskId: "review-pr-42"
  message: "Review the auth module for security issues"

# Poll for completion
a2a_get_task
  agentUrl: "http://localhost:4001"
  taskId: "review-pr-42"
```

### Building an A2A-compatible agent

Any HTTP server that implements `POST /a2a` accepting JSON-RPC 2.0 qualifies. Import
the shared types from the monorepo package:

```typescript
import type { Task, TaskStatus, Part, TextPart } from 'aitimemachine/a2a';
```

The `aitimemachine/a2a` package also exports `AGENT_CARD_PATH` (`/.well-known/agent.json`)
and the `AgentCard` schema for agent discovery.

---

## 5. MCP Tools Reference

The AITM MCP server registers tools in eight groups. All tools are available to any
MCP-compatible client pointing at `aitimemachine/mcp`.

### 5.1 TimeMachine core tools

| Tool | Description |
|------|-------------|
| `tm_project_init` | Initialize or register a project for time tracking |
| `tm_set_project` | Set the current working project |
| `tm_checkpoint_create` | Create a checkpoint (snapshot of current state) |
| `tm_checkpoint_list` | List all checkpoints/timepoints |
| `tm_checkpoint_restore` | Restore project to a checkpoint |
| `tm_checkpoint_preview` | Preview what restore would change |
| `tm_diff` | Show diff between two checkpoints or checkpoint and current state |
| `tm_diff_checkpoints` | Detailed diff between two checkpoints (files + chat + terminal) |
| `tm_event_append` | Append an event to the project timeline |
| `tm_timeline` | Get timeline of events for a project |
| `tm_search` | Search across conversations and checkpoints |
| `tm_find_restore` | Search conversations and find the best checkpoint to restore |
| `tm_log_message` | Log a conversation message |
| `tm_stats` | Get TimeMachine statistics |
| `tm_tag` | Tag a checkpoint with a label |
| `tm_ready` | Check if the TimeMachine daemon is ready |
| `before_action` | Call before making file changes — creates an automatic checkpoint |
| `after_action` | Call after making file changes — records what was done |

### 5.2 Session tools

| Tool | Description |
|------|-------------|
| `tm_session_capture` | Capture current state as a session (used by the daemon) |
| `tm_session_list` | List all captured sessions |
| `tm_bisect` | Binary search to find when a test started failing |

### 5.3 Integration/environment tools

| Tool | Description |
|------|-------------|
| `tm_container_state` | Get Docker/container state for a project |
| `tm_database_state` | Get database state for a project |
| `tm_gemini_sessions` | List Gemini CLI sessions |
| `tm_git_state` | Get git state for a project |
| `tm_env_state` | Get environment state (runtimes, package managers, dependencies) |
| `tm_aider_sessions` | List Aider sessions |
| `tm_cursor_workspaces` | List Cursor workspaces |
| `tm_claude_projects` | List Claude Code projects |
| `tm_claude_conversations` | Get Claude Code conversations for a project |

### 5.4 Storage / S3 / Docker capsule tools

| Tool | Description |
|------|-------------|
| `tm_s3_config` | Configure S3 backup credentials |
| `tm_s3_backup` | Backup all TimeMachine data to S3 |
| `tm_s3_restore` | Restore all TimeMachine data from S3 |
| `tm_capsule_create` | Create a Docker capsule for deterministic execution |
| `tm_capsule_exec` | Execute a command inside a capsule container |
| `tm_capsule_stop` | Stop and remove a capsule container |

### 5.5 File tools

| Tool | Description |
|------|-------------|
| `tm_restore_files` | Restore specific files from a session (glob patterns supported) |
| `tm_get_file_at` | Get file content at a specific checkpoint |
| `tm_file_history` | Get history of a file across checkpoints |
| `tm_prompt_debug_regression` | Generate a prompt to debug regressions between two checkpoints |
| `tm_prompt_write_postmortem` | Generate a prompt to write an incident postmortem |
| `tm_prompt_generate_repro_steps` | Generate reproduction steps from checkpoint history |
| `tm_repo_to_text` | Convert a repository or directory to a single text block for LLM context |

### 5.6 Worktree tools

| Tool | Description |
|------|-------------|
| `tm_worktree_list` | List active AITM worktrees for the current project |
| `tm_worktree_restore` | Restore a worktree to a checkpoint |
| `tm_worktree_cleanup` | Remove all AITM worktrees for the current project |

### 5.7 GitNexus proxy tools (prefix: none, routed to GitNexus server)

These tools forward calls to the GitNexus server at `GITNEXUS_URL`.

| Tool | Description |
|------|-------------|
| `list_repos` | List indexed repositories (paginated) |
| `query` | Query the code knowledge graph for execution flows related to a concept |
| `cypher` | Execute a Cypher query directly against the knowledge graph |
| `context` | 360-degree view of a single symbol: incoming/outgoing references, callers, callees |
| `detect_changes` | Analyze uncommitted git changes and find affected execution flows |
| `check` | Run read-only structural checks (circular imports, etc.) |
| `rename` | Multi-file coordinated rename using the knowledge graph |
| `impact` | Analyze the blast radius of changing a code symbol |
| `explain` | Explain persisted taint findings from `gitnexus analyze --pdg` |
| `pdg_query` | Query the Program Dependence Graph (control + data flow) |
| `route_map` | Show API route mappings: which components fetch which endpoints |
| `tool_map` | Show MCP/RPC tool definitions and their handlers |
| `shape_check` | Check API response shapes against their consumers |
| `api_impact` | Pre-change impact report for an API route handler |
| `group_list` | List configured repository groups |
| `group_sync` | Rebuild the Contract Registry for a group |
| `trace` | Find the shortest directed path between two symbols |

### 5.8 Context7 documentation tools

| Tool | Description |
|------|-------------|
| `tm_docs_resolve` | Resolve a library name (e.g. `"react"`) to its Context7 library ID |
| `tm_docs_query` | Query documentation for a resolved Context7 library ID |
| `tm_docs_for_imports` | Detect imports in a source file and fetch docs for each library |

### 5.9 A2A tools

| Tool | Description |
|------|-------------|
| `a2a_send_task` | Send a task to an A2A agent via `tasks/send` |
| `a2a_get_task` | Get the current status of an A2A task via `tasks/get` |
| `a2a_list_agents` | List agents registered in `AITM_A2A_AGENTS` |

---

## 6. Quick-Start Guide

### Step 1 — Build companion tools

Run this once after cloning the repo or pulling major updates:

```bash
bash scripts/setup-aitm-tools.sh
```

This script builds four tools in sequence (a failure in one does not abort the others):

| Tool | What it does |
|------|--------------|
| `beads` | `go build ./cmd/bd/...` → binary at `aitimemachine/beads/bd` |
| `gitnexus` | `npm install && npm run build` in `aitimemachine/gitnexus/gitnexus` |
| `pal-mcp-server` | Creates Python venv and installs `requirements.txt` |
| `context7-mcp` | `pnpm/npm install && build` in `aitimemachine/context7/packages/mcp` |

Prerequisites:
- Node.js 18+ and npm
- Python 3.10+ (for PAL MCP server)
- Go 1.21+ (for Beads; skipped gracefully if missing)
- pnpm (preferred for context7; falls back to npm)

### Step 2 — Start core dev services

```bash
bash scripts/start-all-dev.sh
```

Services started:

| Service | Default port |
|---------|-------------|
| `gitgram/backend` | 3000 |
| `aitimemachine/api-server` | 3001 |
| `gitgram/web` | 3002 |

Requires `concurrently` globally installed (`npm install -g concurrently`). Without it
the script prints manual commands for three separate terminals.

### Step 3 — Start the AI tool layer

In a separate terminal (or add to your `concurrently` invocation):

```bash
# AITM MCP server (required — hub for all AI tools)
npm run dev:aitm-mcp

# GitNexus server (required for gn_* tools)
npm run dev:gitnexus

# Context7 (optional — for tm_docs_* tools)
npm run dev:context7

# PAL MCP (optional — for multi-model AI)
npm run dev:pal-mcp
```

### Step 4 — Index your codebase with GitNexus

```bash
bash scripts/analyze-with-gitnexus.sh gitgram-backend
bash scripts/analyze-with-gitnexus.sh aitm-mcp
```

### Step 5 — Point your MCP client at the AITM server

Add the following to your MCP client config (e.g. `~/.claude/mcp.json` or Claude
Code's `claude mcp add` command):

```json
{
  "mcpServers": {
    "aitm": {
      "command": "node",
      "args": ["/absolute/path/to/aitimemachine/mcp/dist/index.js"],
      "env": {
        "GITNEXUS_URL": "http://localhost:3001",
        "AITM_A2A_AGENTS": "[]"
      }
    }
  }
}
```

Or use the pre-built `mcp.json` at `aitimemachine/mcp/mcp.json`, which also defines
standalone entries for `gitnexus`, `context7`, and `pal`.

### Step 6 — Verify everything is running

```bash
# Check the AITM API server
curl http://localhost:3001/health

# Check the GitNexus server
curl http://localhost:3001/health

# List indexed repos (from inside Claude Code)
# > list_repos
```
