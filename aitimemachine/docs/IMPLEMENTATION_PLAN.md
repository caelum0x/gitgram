# AITimeMachine Complete Implementation Plan

## Vision
**"macOS Time Machine for AI Coding"** - When AI makes a mistake, go back in time and fix it.

Like when your computer gets a virus and you reset via macOS Time Machine - we do this for AI chats and code.

---

## Current State (Updated 2026-02-02)

### Phases 1-6: COMPLETE

| Component | Status | Notes |
|-----------|--------|-------|
| **Time Layer** | 98% | Checkpoints, CAS, diffs, restore, three-way merge all working |
| **MCP Server** | 98% | 83+ tools, unified server, before_action/after_action linked pairs, code intelligence tools |
| **CLI** | 98% | 105+ commands, natural language time travel, code intelligence (index, search, find-def, find-usages) |
| **API Server** | 98% | /v1/ versioning, rate limiting, OpenAI-style errors, 25+ route modules, real package search |
| **VSCode Extension** | 90% | Chat panel, timeline, CodeLens, function tracking, MCP integration |
| **Context Layer** | 85% | Messages linked to checkpoints, conversation grouping, context packets |
| **Augmented Layer** | 90% | CodeIndexer, symbol search, universal search, npm/PyPI package search |

### What Was Completed (Phases 1-5)

**Phase 1: MCP Server Unification** ✅
- Unified two MCP servers (simple 40-tool + full 78-tool) into one
- CLI `aitm mcp` now launches the full server with all tools
- Added `before_action`/`after_action` with linked checkpoint pairs
- Context layer wired: checkpoints include conversation context
- MCP Resources fixed (files array bug)
- `linkedCheckpointId` added to CheckpointRow and SQLite migration

**Phase 2: API Server** ✅
- /v1/ versioning with backwards-compatible /api/ routes
- Rate limiting middleware (tier-based)
- OpenAI-style error handling with structured error codes
- 25+ route modules: auth, keys, sessions, audit, sync, restore, dashboard, webhooks, repositories, search, contexts, research, billing, data-sources, oracle, package-search, shared-checkpoints, sso, universal-search, web-search, usage, research-papers, export, health
- Audit middleware, request logging, monitoring with Sentry integration
- Web search with Brave/SerpAPI/Serper/DuckDuckGo providers
- Web scraping with Firecrawl/Cheerio
- Export endpoints (training JSONL, analytics JSON/CSV, secret redaction)

**Phase 3: CLI** ✅
- Natural language time travel: `aitm back-to "before docker changes"`
- Function-level file history: `aitm file-history --functions --function <name>`
- `get-file`, `get-file-at`, `get-checkpoint`, `checkpoint-preview`, `find-green`
- `log-command`, `conversations`, `tasks` commands
- Enhanced `sessions --json --search`, `preview --json`
- Dual calling convention for `restore-files` (extension + CLI compatible)
- All commands support `--json` output for programmatic use

**Phase 4: VSCode Extension** ✅
- MCPClient spawns `aitm mcp` (unified server)
- CodeLensProvider calls CLI for function-level tracking
- All CLI commands that extension depends on are implemented
- TimelineGraphProvider, ChatPanelProvider, GhostService functional

**Phase 5: Data Capture & Export** ✅
- Training data export (OpenAI/Anthropic/generic JSONL formats)
- Analytics export (JSON/CSV with by-day, by-hour, by-type breakdowns)
- Secret redaction (API keys, GitHub tokens, AWS keys, JWT, passwords)
- API export endpoints with async job processing

---

## PHASE 6: Augmented Layer - COMPLETE

### Goal: Real code intelligence - index, search, and understand code

### 6.1 Code Indexer Service ✅

**Created: `src/services/code-indexer.ts`** (~560 lines)

- Regex-based parser for TypeScript/JavaScript and Python
- Extracts: functions, classes, interfaces, types, enums, methods, properties, exports, imports
- SQLite `code_symbols` table with indexes
- Methods: indexProject, searchSymbols, findDefinition, findUsages, getProjectStructure, getFileSymbols, getStats

### 6.2 MCP Tools for Code Intelligence ✅

**Added to: `src/mcp/server.ts`** - 5 tools with case handlers

| Tool | Status |
|------|--------|
| `tm_index_project` | ✅ Scans project, extracts symbols, stores in SQLite |
| `tm_search_code` | ✅ Exact/prefix/contains/regex search with scoring |
| `tm_find_definition` | ✅ Finds where symbol is defined |
| `tm_find_usages` | ✅ Finds imports and references |
| `tm_get_project_structure` | ✅ Project overview with top-level symbols |

### 6.3 Enhanced Universal Search ✅

**Updated: `src/mcp/server.ts` tm_universal_search handler**

- Uses code index for symbol-level search when available
- Falls back to glob-based grep if no index
- Searches checkpoint file paths (not just names)
- Results scored and sorted by relevance

### 6.4 CLI Commands for Code Intelligence ✅

**Added to: `src/cli-v2.ts`** - 5 new commands

| Command | Description |
|---------|-------------|
| `aitm index` | Index project source code for symbol search |
| `aitm search-code <query>` | Search code symbols by name |
| `aitm find-def <symbol>` | Find where a symbol is defined |
| `aitm find-usages <symbol>` | Find all files that import/reference a symbol |
| `aitm project-structure` | Show project overview with top-level symbols |

### 6.5 API Server Search Routes ✅

- `api-server/src/routes/search.ts` - 7 endpoints, uses IndexingService + codeEmbeddings via Drizzle ORM
- `api-server/src/routes/universal-search.ts` - 3 endpoints, multi-source search with scoring
- `api-server/src/services/indexing.ts` - Full indexing service with embedding support

### 6.6 Package Search ✅

**Updated: `api-server/src/routes/package-search.ts`** - 6 endpoints, real npm/pypi integration

| Endpoint | Status |
|----------|--------|
| `GET /info` | ✅ npm + PyPI registry API |
| `GET /files` | ✅ npm via unpkg |
| `POST /read-lines` | ✅ npm file content via unpkg |
| `POST /grep` | ✅ Regex search across npm package files |
| `POST /semantic` | ✅ Keyword-based symbol search in npm packages |
| `POST /hybrid` | ✅ Combined grep + semantic for npm |

---

## PHASE 7: GhostService AI Integration (Future)

### Goal: Real AI-powered inline suggestions in VSCode

**Update: `extensions/vscode/src/services/GhostService.ts`**

Currently uses pattern-based suggestions as fallback. Wire to:
1. MCP server for context-aware suggestions (knows about checkpoints, recent changes)
2. VS Code Language Model API (already has framework)
3. OpenAI API fallback (already has framework)

The key is passing checkpoint context to the AI so suggestions are aware of recent changes.

---

## PHASE 8: Production Hardening (Future)

### Goal: Production-ready deployment

| Item | Status | Notes |
|------|--------|-------|
| Sentry integration | Done | api-server/src/lib/monitoring.ts |
| Rate limiting | Done | Tier-based middleware |
| Geo-IP | Done | api-server/src/services/sessionManager.ts |
| Web search | Done | Brave/SerpAPI/Serper/DuckDuckGo |
| Three-way merge | Done | src/mcp/git-enhanced-handler.ts |
| Hybrid store local search | Done | searchLocalMessages with scoring |
| SSO | Route exists | Needs real SAML/OAuth provider |
| Billing | Route exists | Needs Polar.sh integration |
| Email webhook | Placeholder | api-server/src/routes/internal.ts:97 |

---

## Three-Layer Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    AUGMENTED LAYER                          │
│  Code Indexer | Symbol Search | Universal Search            │
│  Status: Phase 6 COMPLETE                                  │
├─────────────────────────────────────────────────────────────┤
│                     CONTEXT LAYER                           │
│  Chat History | Linked Checkpoints | Context Packets        │
│  Status: 85% COMPLETE                                      │
├─────────────────────────────────────────────────────────────┤
│                      TIME LAYER                             │
│  Checkpoints | CAS Blobs | Diffs | Manifests | Pack Files  │
│  Status: 98% COMPLETE                                      │
└─────────────────────────────────────────────────────────────┘
```

---

## Key Files Reference

### Core
- `src/mcp/server.ts` - Full MCP server (78+ tools)
- `src/store/sqlite_repo.ts` - SQLite repository (checkpoints, events, projects)
- `src/core/cas.ts` - Content-addressable store
- `src/cli-v2.ts` - CLI (100+ commands)
- `src/cli/repo-bridge.ts` - Unified bridge (local + MCP)
- `src/mcp/git-enhanced-handler.ts` - Advanced diff, timeline, three-way merge
- `src/context/context-packet.ts` - Context packets for restore

### API Server
- `api-server/src/index.ts` - Express app with 25+ route modules
- `api-server/src/routes/` - All API route handlers
- `api-server/src/middleware/` - Auth, rate limiting, errors, audit
- `api-server/src/services/` - Web search, session manager, monitoring

### Extension
- `extensions/vscode/src/mcp/MCPClient.ts` - MCP client (spawns `aitm mcp`)
- `extensions/vscode/src/providers/` - UI providers (Chat, Timeline, CodeLens, Ghost)

---

## Success Metrics

1. **Time Machine Experience** ✅
   - Restore to any point with `before_action`/`after_action` linked pairs
   - Chat context restored with files via context packets
   - Natural language: `aitm back-to "before docker changes"`

2. **API Quality** ✅
   - OpenAI-style errors, /v1/ versioning, rate limiting
   - 25+ route modules covering all planned endpoints

3. **Data Capture** ✅
   - All AI sessions captured via MCP before/after actions
   - Training data export in OpenAI/Anthropic JSONL formats
   - Secret redaction for safe data sharing

4. **Code Intelligence** ✅
   - [x] Index project symbols (functions, classes, interfaces)
   - [x] Search code by symbol name (exact, prefix, contains, regex)
   - [x] Find definitions and usages
   - [x] Universal search across code + conversations + checkpoints
   - [x] CLI commands: index, search-code, find-def, find-usages, project-structure
   - [x] Package search: npm/PyPI registry integration (info, files, grep, semantic, hybrid)
