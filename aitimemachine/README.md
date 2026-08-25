# Gitgram TimeMachine

**Git versions code. We version reality.**

> 🕐 **Like macOS Time Machine, but for AI coding!** When AI makes a mistake, go back in time and fix it.

Time Machine for AI-Assisted Development - Capture and restore your complete workspace state including files, terminal commands, AI tool interactions, and runtime environments through supported integrations.

## Quick Start - Time Machine Experience

```bash
# AI broke something? One command to fix:
aitm undo

# Go back to when tests were passing:
aitm back-to "when tests passed"

# Go back 30 minutes:
aitm back-to "30 minutes ago"

# Find when something broke:
aitm why "tests failing"

# Binary search for breaking change:
aitm bisect --test "npm test"
```

📖 **[Full Documentation →](https://timemachine.gitgram.app/docs)**

## The Problem

AI-assisted development creates a new kind of failure:
- **AI Temporal Confusion**: AIs don't understand "when" things happened or development rhythm
- **Lost Conceptual Context**: AIs forget what concepts are active, completed, or blocked  
- **No Causal Understanding**: AIs can't connect state changes to their causes
- Changes include: code, context, tool outputs, environment drift, terminal operations
- When something breaks, you need to recover the **entire state**, not just files
- Git can't answer:
  - "What exact terminal commands were run right before it broke?"
  - "What context did the AI have at that moment?"
  - "What environment (Node/Python/Docker image) was it using?"
  - "Can we restore the full working state instantly and reproduce the break deterministically?"

## What We Built

Gitgram TimeMachine is a **stateful, event-sourced layer** that captures:

- **File system state** via manifest + content-addressable storage
- **Terminal commands + outputs + exit codes** (for managed sessions)
- **AI tool interactions** via MCP protocol integration
- **Deterministic runtime** via Docker capsules with pinned image digests

Then it exposes **time travel as an API** so AI agents and developers can:

- ✅ Restore any checkpoint (atomic, safe, with backup)
- ✅ Compare any two moments (diffs computed on demand)
- ✅ Automatically bisect regressions
- ✅ Rehydrate AI context from checkpoints
- ✅ Run in deterministic Docker capsules

**NEW: AI Time & Concept Realization** - Solves AI temporal confusion:
- ✅ AIs understand "when" things happened
- ✅ AIs track active vs completed concepts  
- ✅ AIs get focus recommendations based on context
- ✅ AIs learn from development workflow patterns

## Why It's Different Than Git

| Capability | Git | Gitgram TimeMachine |
|------------|-----|---------------|
| Captures untracked files | ❌ | ✅ |
| Terminal command history | ❌ | ✅ (managed sessions) |
| AI context rehydration | ❌ | ✅ |
| Deterministic environment | ❌ | ✅ (Docker capsules) |
| Atomic restore with backup | ❌ | ✅ |
| Content deduplication | ❌ | ✅ |
| MCP protocol for AI tools | ❌ | ✅ |

## Installation

```bash
npm install -g @gitgram/timemachine
```

## Authentication

Gitgram TimeMachine uses API keys for authentication (like OpenAI/ChatGPT):

### 1. Get Your API Key
1. Sign up at [timemachine.gitgram.app](https://timemachine.gitgram.app)
2. Go to Dashboard → API Keys
3. Click "Create New Key"
4. Copy your key (shown only once!)

### 2. Login with CLI
```bash
# Login with your API key
aitm login --api-key aitm_xxxxxxxxxxxxx

# Or use browser-based login
aitm login

# Check your auth status
aitm whoami

# Logout
aitm logout
```

### 3. Use the API Directly
```bash
curl -H "X-API-Key: YOUR_API_KEY" \
  https://timemachine-api.gitgram.app/api/checkpoints
```

## Public adoption evidence

`GET /v1/adoption/summary` reports aggregate cloud adoption and maintainer evidence from first-party persisted records. Schema version 2 gives separate windows for product adoption and OSS coverage plus explicit `fresh`, `stale`, or `unmeasured` coverage health. A completed coverage batch can report zero; absent coverage returns `null` with `unmeasured`; query failures return HTTP 503 with `unavailable`.

Maintainers ingest external contribution coverage and linked restore cases through transactional, idempotent routes protected by a dedicated rotating collector secret. Public responses exclude account, repository, project, checkpoint, restore, contributor, and contribution identifiers. See [the methodology](api-server/docs/adoption-evidence.md) and [collector runbook](api-server/docs/maintainer-collector-runbook.md).

The public [`/maintainers`](https://timemachine.gitgram.app/maintainers) workflow reads the same aggregate through a same-origin, no-store proxy. It runtime-validates the response, separates loading and service failure from measured zero, preserves `unmeasured` nulls, labels stale coverage, and offers a manual refresh. It never sends `ADOPTION_INGESTION_SECRET` to the browser; collection remains a server-side operator task documented in the runbook.

## Quick Start

```bash
# Initialize in your project
cd your-project
aitm init

# AI automatically creates checkpoints via MCP
# (when using Claude Code, Cursor, etc.)

# View your timeline
aitm timeline

# See where you are
aitm where

# Go back in time
aitm restore <checkpoint-id>
# or
aitm back "before refactor"
```

## New! AI-Friendly Commands

### For Users (CLI)
```bash
aitm timeline          # Visual timeline with before/after pairs
aitm where             # Show current state and recent history
aitm back [query]      # Go back (ID, description, or time)
aitm show_changes      # What changed since last checkpoint
```

### For AI (MCP Tools)
```javascript
// AI automatically uses these:
where_am_i()           // 🧭 Show current state
go_back({ to: "before user store" })  // ⏪ Natural language restore
show_changes()         // 📊 What changed
undo_last()            // ↩️  Quick undo

// NEW: AI Time & Concept Realization
ai_realize_concepts()  // 🧠 Understand conceptual context
ai_realize_time()      // ⏰ Understand temporal context  
ai_suggest_focus()     // 🎯 Get focus recommendations
ai_analyze_transitions() // 🔄 Analyze workflow patterns
```

## CLI Commands

### Setup & Project Management
```bash
aitm init                    # Initialize project tracking (opt-in, per project)
aitm status                  # Show pending changes since last checkpoint
aitm whoami                  # Show authenticated user
```

### Checkpoints
```bash
aitm checkpoint "desc"       # Manual checkpoint
aitm list                    # List all checkpoints (--json for tools)
aitm show <id>               # Show checkpoint details
aitm diff <from> [to]        # Compare checkpoints (--json available)
aitm preview <id>            # Preview what restore would change
```

### Restore & Time Travel
```bash
aitm restore <id>            # Restore to checkpoint (atomic, with backup)
aitm rewind --to <id>        # Restore + generate context file for AI
aitm resume                  # Start Claude with restored context injection
aitm undo                    # Undo last restore (from backup)
```

### Natural Language Time Travel (NEW!)
```bash
aitm when "tests started failing"     # Find when something happened
aitm back-to "when tests passed"      # Natural language restore
aitm back-to "2 hours ago"            # Time-based restore
aitm back-to last-green               # Restore to last green state
aitm what-changed --since "1 hour ago" # Show what changed
aitm why "tests failing"              # Analyze why something broke
```

### File Operations
```bash
aitm file-history <file>     # Show checkpoint history for file
aitm get-file <id> <file>    # Get file content at checkpoint
aitm restore-file <id> <file> # Restore single file from checkpoint
aitm blame <file>            # Show which checkpoint introduced lines
```

### AI Tool Wrappers
```bash
aitm claude                  # PTY-based Claude wrapper with transcript capture
aitm run -- <command>        # Run command with auto-checkpoint (before/after)
```

### Search & Discovery
```bash
aitm search <query>          # Search checkpoint names (--natural for NL)
aitm conversation            # Show conversation history
aitm bisect --test "npm test" # Binary search for breaking change
aitm stats                   # Storage statistics
aitm kb-search <query>       # Unified knowledge base search (cloud)
```

### Cloud Sync
```bash
aitm login                   # Authenticate with cloud API
aitm logout                  # Clear cloud credentials
aitm sync                    # Sync checkpoints to cloud
aitm cloud                   # View cloud status and data
aitm pull <checkpoint-id>    # Pull checkpoint from cloud
```

### MCP Server
```bash
aitm mcp                     # Run MCP server for AI tools
```

### Maintenance
```bash
aitm gc                      # Garbage collection (reclaim storage)
aitm verify <project-id>     # Verify checkpoint/blob integrity
```

### Docker Capsules (Deterministic Environments)
Available via MCP tools - see API.md for details.

## AI Tool Integration (MCP)

Gitgram TimeMachine integrates with AI coding assistants via the Model Context Protocol (MCP). When an MCP-compatible tool calls our tools, we capture those interactions.

### Transport
- Default: **stdio** (`aitm mcp`)
- Optional: HTTP/SSE can be added for custom clients, but stdio is the supported v1 path.

### Compatibility Matrix

| Tool | MCP Support | Real-time Capture | Context Rehydration |
|------|-------------|-------------------|---------------------|
| Claude Code | ✅ Yes | ✅ Tool calls recorded | ✅ Via restore |
| Cursor | ✅ Yes (experimental) | ✅ Tool calls recorded | ✅ Via restore |
| Claude Desktop | ✅ Yes | ✅ Tool calls recorded | ✅ Via restore |
| Other MCP clients | ✅ Yes | ✅ Tool calls recorded | ✅ Via restore |

**Note**: We capture MCP tool calls in real-time. "Chat restore" means providing historical context to the AI, not modifying the tool's internal conversation UI.

### Setup for Claude Code

```bash
# One-line setup (recommended)
claude mcp add --transport stdio aitm -- npx -y @gitgram/timemachine-mcp

# Or with user-wide scope
claude mcp add --scope user --transport stdio aitm -- npx -y @gitgram/timemachine-mcp
```

### Setup for Cursor

```json
// .cursor/mcp.json
{
  "mcpServers": {
    "aitimemachine": {
      "command": "npx",
      "args": ["-y", "@gitgram/timemachine-mcp"]
    }
  }
}
```

### MCP Tools Available

#### AI-Friendly Navigation (NEW!)
- `where_am_i` - Show current state and recent timeline
- `go_back` - Natural language restore ("before user store", "30 minutes ago")
- `show_changes` - Show what changed since last checkpoint
- `undo_last` - Quick undo to previous checkpoint

#### AI Time & Concept Realization (NEW!)
- `ai_realize_concepts` - Understand current conceptual context (active/completed/blocked concepts)
- `ai_realize_time` - Understand temporal context (time patterns, velocity, intervals)
- `ai_suggest_focus` - Get AI-driven focus recommendations with reasoning
- `ai_analyze_transitions` - Analyze development state transitions and patterns

#### Checkpoint Management
- `before_action` - Create "before" checkpoint (auto-called by AI)
- `after_action` - Create "after" checkpoint with change summary
- `checkpoint` - Manual checkpoint creation
- `list_timepoints` - List all checkpoints
- `restore` - Restore to checkpoint
- `preview_restore` - Preview what restore will do

#### File Operations
- `tm_get_file_at` - Get file content at checkpoint
- `tm_file_history` - Get history of a file across checkpoints

#### Docker Capsules (Deterministic Execution)
- `tm_capsule_upsert` - Create/update Docker capsule with pinned digest
- `tm_capsule_exec` - Execute command in capsule

#### Search & Discovery
- `tm_search` - Search checkpoint names
- `tm_timeline` - Get timeline of events
- `tm_stats` - Get storage statistics

#### Advanced
- `tm_rewind_to_last_green` - Auto-rewind to last passing state
- `tm_prompt_debug_regression` - Generate debug prompt for regressions
- `tm_prompt_postmortem` - Generate incident postmortem
- `tm_prompt_repro_steps` - Generate reproduction steps

#### Production & Maintenance
- `tm_gc_run` - Garbage collection (mark & sweep to reclaim storage)
- `tm_integrity_check` - Verify checkpoint and blob integrity

## Architecture

### Content-Addressable Storage (CAS)
- **SHA-256 based** - Files stored by content hash
- **Massive deduplication** - Only unique content stored once
- **Sharded storage** - `blobs/aa/bb/aabbcc...`
- **Efficient** - Perfect for large projects with many similar files

### Manifest-Based Checkpoints
Each checkpoint is:
- **Manifest** - List of files with their hashes
- **Pointers** - Chat head, terminal head, capsule digest
- **Immutable** - Checkpoints never change
- **Lightweight** - Only manifests stored, blobs reused

### Atomic Restore Process

To ensure safety, restore operations are atomic and always create backups:

1. **Acquire lock** - Prevent concurrent operations via `.tm_lock`
2. **Build in temp** - Materialize files from CAS to `.tm_internal/tmp_restore/`
3. **Verify integrity** - Check all blobs exist and hashes match manifest
4. **Backup current** - Save current workspace to `.tm_internal/backups/` (timestamped)
5. **Atomic swap** - Move files from temp to workspace (Windows-safe strategy)
6. **Release lock** - Allow other operations
7. **Cleanup** - Remove temp directories

**Safety guarantees**:
- Never partially restore (all-or-nothing)
- Always backup before restore
- Windows-compatible file operations
- Project-level locking prevents conflicts

### Docker Capsules (Deterministic Environments)

Capsules provide deterministic execution environments:

- **Pin image digest** (not tag) - Guarantees exact same base image
- **Mount workspace** - Project files available inside container
- **Capture outputs** - Store stdout/stderr as blobs
- **Reproducible execution** - Re-run commands in identical environment

**Use cases**:
- Reproduce build/test failures exactly
- Verify behavior across different Node/Python versions
- Isolate environment-specific issues

## Storage Structure

```
~/.aitimemachine/
├── blobs/                # Content-addressable storage
│   ├── aa/               # Sharded by hash prefix (first 2 chars)
│   │   ├── bb/           # Second level shard (chars 3-4)
│   │   │   └── aabbcc... # File contents (SHA-256 hash)
│   └── ...
├── events.db             # SQLite database (projects, checkpoints, events)
└── .tm_lock              # Global lock file

<project-root>/.tm_internal/  # Per-project metadata
├── tmp_restore/          # Temp directory for atomic restore
├── backups/              # Current state backups (timestamped)
└── .tm_lock              # Project-level lock file
```

## Ignore Patterns

By default, Gitgram TimeMachine excludes common build artifacts and dependencies to optimize storage:

**Default exclusions**:
- `node_modules/**`, `.venv/**`, `venv/**`
- `.git/**`, `.svn/**`
- `dist/**`, `build/**`, `target/**`, `.next/**`
- `*.pyc`, `__pycache__/**`
- `.DS_Store`, `Thumbs.db`

**Security**: We do NOT automatically exclude secrets. You should:
1. Never commit `.env` files with real credentials
2. Use `.gitignore` patterns for sensitive files
3. Review checkpoint contents before sharing

To customize patterns, modify `ignoreGlobs` in the project configuration.

## Examples

### Scenario: Restore to Working State

```bash
# Search for the checkpoint you want
aitm search "before refactor"

# List all checkpoints
aitm list

# Go back in time (creates backup automatically)
aitm restore cp_abc123def456
```

### Scenario: Using from AI Tools

When an AI assistant uses our MCP tools:
1. Tool calls are automatically recorded as events
2. File changes are captured in checkpoints
3. On restore, we provide "context rehydration" data to the AI
4. AI can request debug prompts, postmortems, etc.

**Context Rehydration**: When restoring a checkpoint, the AI receives:
- Checkpoint metadata (name, timestamp, scope)
- List of files at that point
- Event timeline up to that checkpoint
- Suggested next steps

This allows the AI to understand "where we are" after a restore.

## Production Features (Current)

### Safety & Integrity
- ✅ **Project locking** - Prevents concurrent operations via `.tm_lock`
- ✅ **Atomic operations** - Never partially restore (all-or-nothing)
- ✅ **Backup before restore** - Always creates timestamped backup
- ✅ **Verify blobs** - Check hashes match before restore
- ✅ **Windows-safe operations** - Cross-platform compatibility

### Performance
- ✅ **Content deduplication** - SHA-256 based CAS stores unique content once
- ✅ **Sharded storage** - Fast lookups via aa/bb/hash directory structure
- ✅ **SQLite WAL mode** - Concurrent reads, safe writes
- ✅ **Indexed queries** - Fast checkpoint and event lookups

### Limitations
- ⚠️ **Terminal capture** - Only managed sessions (not all system terminals)
- ⚠️ **Chat capture** - Only via MCP tool calls (not native tool UI access)
- ⚠️ **No auto-discovery** - Projects must be initialized with `aitm init`

## Completed Features (v2.0)

### Natural Language Time Travel (NEW!)
- ✅ **Natural language queries** - "when tests started failing", "2 hours ago"
- ✅ **Smart restore** - `back-to` command with natural language support
- ✅ **Change analysis** - `what-changed` and `why` commands
- ✅ **Git bisect for checkpoints** - `bisect` to find breaking changes
- ✅ **File blame** - Track which checkpoint introduced each line

### Cloud & Collaboration
- ✅ **Cloud sync** - Sync checkpoints, sessions, and blobs to cloud API
- ✅ **API key authentication** - Secure API key based auth
- ✅ **Push/pull** - Push local checkpoints to cloud, pull from cloud
- ✅ **Webhooks** - Real-time notifications on checkpoint events
- ✅ **SSE events** - Server-sent events for live updates

### Advanced Features
- ✅ **Auto-checkpoint rules** - Create checkpoints on "tests pass", "build success"
- ✅ **PTY Claude wrapper** - Transcript capture with session tracking
- ✅ **Context injection** - Rewind to checkpoint and inject context for AI
- ✅ **JSON output** - All commands support `--json` for tool integration

## Roadmap (Future)

### Phase 3 - Enhanced Features
- 🔜 **Export/import** - Share checkpoints via compressed archives
- 🔜 **Team sharing** - Collaborate on checkpoints
- 🔜 **Incremental scanning** - Optimize for large monorepos
- 🔜 **Web dashboard** - Browser-based checkpoint explorer

## API Documentation

See the [online documentation](https://timemachine.gitgram.app/docs) for complete MCP tool reference.

## License

MIT

## Support

- 📖 [Documentation](https://timemachine.gitgram.app/docs)
- 🐛 [Issue Tracker](https://github.com/gitgram-ai/gitgram-ai/issues)
- 💬 [Discussions](https://github.com/gitgram-ai/gitgram-ai/discussions)
