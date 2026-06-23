# AITimeMachine Data Storage Architecture

This document explains how AITimeMachine stores code snapshots, chat history, and related data from AI coding tools.
Canonical reference: `../../NORTH_STAR_PRD_ARCHITECTURE_V1.md`.

## Overview

AITimeMachine uses a **backend-canonical storage architecture**:

1. **Canonical Backend Storage** (Postgres + object storage; source of truth)
2. **Project-Level Local Cache** (`.aitimemachine/` folder in each project)
3. **Global Local Cache** (`~/.aitimemachine-server/` for fast lookup/offline buffering)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    AITimeMachine Storage Architecture                    │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────────────┐     ┌──────────────────────────────────────┐  │
│  │   AI Coding Tools   │     │          Global Daemon                │  │
│  │  ┌───────────────┐  │     │  ┌──────────────────────────────┐    │  │
│  │  │ Claude Code   │──┼────▶│  │ Auto-detect projects from:   │    │  │
│  │  │ Cursor        │  │     │  │ • Claude, Cursor, Aider      │    │  │
│  │  │ Aider         │  │     │  │ • Windsurf, Copilot, Zed     │    │  │
│  │  │ Windsurf      │  │     │  │ • Active terminals           │    │  │
│  │  │ VS Code       │  │     │  │ • Recent git repos           │    │  │
│  │  │ Copilot       │  │     │  └──────────────────────────────┘    │  │
│  │  └───────────────┘  │     │                │                      │  │
│  └─────────────────────┘     │                ▼                      │  │
│                              │  ┌──────────────────────────────┐    │  │
│                              │  │ Periodic Capture (5 min)     │    │  │
│                              │  │ • Incremental file scanning   │    │  │
│                              │  │ • Content-addressable store   │    │  │
│                              │  │ • Delta compression           │    │  │
│                              │  └──────────────────────────────┘    │  │
│                              └──────────────────────────────────────┘  │
│                                            │                           │
│                                            ▼                           │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                   Project-Level Storage                           │  │
│  │                   .aitimemachine/                                 │  │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌────────────┐  │  │
│  │  │   store/    │ │ timepoints/ │ │   content/  │ │  events.   │  │  │
│  │  │ (blobs by   │ │  (JSON      │ │ (messages,  │ │   jsonl    │  │  │
│  │  │  hash)      │ │  snapshots) │ │ code, diffs)│ │            │  │  │
│  │  └─────────────┘ └─────────────┘ └─────────────┘ └────────────┘  │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                            │                           │
│                                            ▼                           │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                   Cloud Storage (Neon)                            │  │
│  │                   postgres://...neon.tech                         │  │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌────────────┐  │  │
│  │  │  projects   │ │ timepoints  │ │  messages   │ │   blobs    │  │  │
│  │  │  (registry) │ │ (snapshots) │ │ (full-text  │ │  (content) │  │  │
│  │  │             │ │             │ │  search)    │ │            │  │  │
│  │  └─────────────┘ └─────────────┘ └─────────────┘ └────────────┘  │  │
│  │  Features: SQL queries, cross-device sync, Neon branching        │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 1. Project-Level Storage (`.aitimemachine/`)

Each project has a `.aitimemachine/` directory containing:

### 1.1 Content Store (`store/`)

**Git-like content-addressable storage** for all file content.

```
.aitimemachine/
└── store/
    ├── 7a/
    │   └── 7a343253936975ff77526dbbc56ff539  # SHA-256 hash (first 32 chars)
    ├── 85/
    │   └── 85a953d052d9cf2504d1adafc463c349
    └── ...
```

**Key Features:**
- **SHA-256 hashing** (truncated to 32 chars)
- **Deduplication**: Same content stored once regardless of filename
- **Two-level directory**: First 2 chars of hash = subdirectory (prevents filesystem limitations)

**Implementation** (`src/core/content-store.ts`):
```typescript
put(content: string | Buffer): string {
  const buffer = typeof content === 'string' ? Buffer.from(content, 'utf-8') : content;
  const hash = crypto.createHash('sha256').update(buffer).digest('hex').slice(0, 32);
  const filePath = this.getPath(hash);  // e.g., store/7a/7a343...
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, buffer);
  }
  return hash;
}
```

### 1.2 TimePoints (`timepoints/`)

**Complete project snapshots** stored as JSON files.

```
.aitimemachine/
└── timepoints/
    ├── tp_1703123456789_abc123.json
    ├── tp_1703123567890_def456.json
    └── ...
```

**TimePoint Structure:**
```typescript
interface TimePoint {
  id: string;                    // e.g., "tp_1703123456789_abc123"
  timestamp: Date;               // When captured
  description: string;           // User or auto-generated description
  
  trigger: {
    type: 'manual' | 'auto' | 'ai_action' | 'restore';
    tool?: string;               // "claude", "cursor", etc.
    action?: string;             // "create_file", "edit_file", etc.
  };
  
  linkedCheckpointId?: string;   // Links to conversation checkpoint
  
  conversation: {
    sessionId: string;
    messageCount: number;
    lastMessagePreview: string;
  };
  
  files: FileEntry[];            // All files at this point
  
  changes: {
    added: string[];             // New files since last timepoint
    modified: string[];          // Changed files
    deleted: string[];           // Removed files
  };
  
  stats: {
    totalFiles: number;
    totalSize: number;
  };
}

interface FileEntry {
  path: string;                  // Relative path
  hash: string;                  // Reference to content in store/
  size: number;
  mode: number;
  mtime: number;
}
```

### 1.3 Event Store (`events.jsonl`)

**Append-only log** of all events (JSONL format for streaming writes).

```
.aitimemachine/
└── events.jsonl
```

**Event Types:**
```typescript
type EventType =
  | 'user_message'           // User prompt to AI
  | 'assistant_message'      // AI response
  | 'tool_call'              // Tool invocation (create_file, edit, etc.)
  | 'tool_result'            // Tool execution result
  | 'checkpoint_created'     // Explicit checkpoint
  | 'code_change'            // File modification event
  | 'file_created'
  | 'file_modified'
  | 'file_deleted'
  | 'tool_error'
  | 'terminal_command'
  | 'error_occurred';

interface Event {
  id: string;
  timestamp: Date;
  sessionId: string;
  type: EventType;
  data: any;                 // Type-specific payload
}
```

**Example Events:**
```json
{"id":"event_1703123456_abcd","timestamp":"2024-12-21T10:30:00.000Z","sessionId":"sess_123","type":"user_message","data":{"content":"Create a REST API","fullSize":20}}
{"id":"event_1703123457_efgh","timestamp":"2024-12-21T10:30:01.000Z","sessionId":"sess_123","type":"tool_call","data":{"tool":"create_file","args":{"path":"src/api.ts"}}}
{"id":"event_1703123458_ijkl","timestamp":"2024-12-21T10:30:02.000Z","sessionId":"sess_123","type":"file_created","data":{"filePath":"src/api.ts","newSize":1024,"diffRef":"content/diffs/diff_1703123458.patch"}}
```

### 1.4 Content Storage (`content/`)

**Large content stored separately** from event log (referenced by pointer).

```
.aitimemachine/
└── content/
    ├── messages/              # Long AI messages
    │   └── msg_1703123456_abc.txt
    ├── code/                  # Code snapshots
    │   └── code_1703123457_def.ts
    ├── diffs/                 # Generated diffs
    │   └── diff_1703123458_ghi.patch
    └── outputs/               # Tool outputs
        └── out_1703123459_jkl.txt
```

**Why Separate Storage?**
- Event log stays small and fast to parse
- Large content only loaded on demand
- Easy garbage collection

### 1.5 Pack Files (`packs/`)

**Delta-compressed archives** for space efficiency.

```
.aitimemachine/
└── packs/
    ├── pack_1703123456.pack
    └── pack_1703123456.idx
```

**Pack Format:**
- Similar to Git pack files
- Delta compression between similar objects
- Index file for O(1) hash lookup

---

## 2. Global Server Storage (`~/.aitimemachine-server/`)

Centralized storage for cross-project management.

### 2.1 Sessions (`sessions/`)

**Complete project snapshots** with full metadata.

```typescript
interface Session {
  id: string;
  projectPath: string;
  projectName: string;
  createdAt: Date;
  updatedAt: Date;
  
  trigger: {
    type: 'auto' | 'manual' | 'ai_action' | 'restore';
    tool?: string;
    action?: string;
    description: string;
  };
  
  files: SessionFile[];
  diffs: SessionDiff[];
  conversation: SessionMessage[];
  
  stats: {
    totalFiles: number;
    totalSize: number;
    addedFiles: number;
    modifiedFiles: number;
    deletedFiles: number;
    messageCount: number;
  };
  
  git?: GitState;
  environment?: EnvironmentState;
}
```

### 2.2 Shared Blobs (`blobs/`)

**Deduplicated content** shared across all projects.

### 2.3 Projects Index (`projects.json`)

**Project registry** with metadata.

```typescript
interface Project {
  id: string;
  path: string;
  name: string;
  createdAt: Date;
  lastSessionAt: Date;
  sessionCount: number;
  totalSize: number;
}
```

### 2.4 Conversations (`conversations/`)

**Conversation logs** per session.

---

## 3. Conversation Logging

The `ConversationLogger` class orchestrates conversation capture:

```typescript
class ConversationLogger {
  private eventStore: EventStore;
  private contentStorage: ContentStorage;
  private sessionId: string;

  // Log user message
  logUserMessage(content: string): void {
    const contentRef = content.length > 500 
      ? this.contentStorage.storeMessage(content) 
      : undefined;
    
    this.eventStore.append({
      sessionId: this.sessionId,
      type: 'user_message',
      data: { 
        content: content.slice(0, 500),  // Preview
        contentRef,                       // Full content reference
        fullSize: content.length
      }
    });
  }

  // Log AI response
  logAssistantMessage(content: string, thinking?: string): void {
    // Similar pattern - store large content separately
  }

  // Log tool calls and results
  logToolCall(tool: string, args: any): string;
  logToolResult(callId: string, result: any): void;

  // Log code changes with automatic diff generation
  logCodeChange(filePath: string, oldContent: string | null, newContent: string | null): void {
    const changeType = !oldContent ? 'file_created' 
                     : !newContent ? 'file_deleted' 
                     : 'file_modified';
    
    // Store full content
    const oldContentRef = oldContent ? this.contentStorage.storeCode(oldContent) : undefined;
    const newContentRef = newContent ? this.contentStorage.storeCode(newContent) : undefined;
    
    // Generate and store diff
    if (oldContent && newContent) {
      const generatedDiff = diff.createPatch(filePath, oldContent, newContent);
      const diffRef = this.contentStorage.storeDiff(generatedDiff);
    }
    
    this.eventStore.append({
      sessionId: this.sessionId,
      type: changeType,
      data: {
        filePath,
        oldContentRef,
        newContentRef,
        diffRef,
        oldSize: oldContent?.length || 0,
        newSize: newContent?.length || 0,
        oldSnippet: oldContent?.slice(0, 500),
        newSnippet: newContent?.slice(0, 500),
      }
    });
  }
}
```

---

## 4. AI Tool Detection & Capture

The `GlobalDaemon` automatically discovers and captures from multiple AI tools:

### 4.1 Supported Tools

| Tool | Detection Method | Data Source |
|------|-----------------|-------------|
| **Claude Code** | `~/.claude/projects/` | Encoded project paths |
| **Cursor** | `~/Library/.../Cursor/workspaceStorage/` | workspace.json files |
| **Aider** | `~/.aider/` + `.aider.chat.history.md` | Chat history files |
| **Windsurf** | `~/.windsurf/` or `~/.codeium/` | Workspace storage |
| **VS Code** | `~/Library/.../Code/workspaceStorage/` | workspace.json files |
| **Copilot** | (via VS Code) | Same as VS Code |
| **Zed** | `~/Library/.../Zed/workspaces/` | JSON workspace files |

### 4.2 Active Detection

```typescript
// Scan active terminals using lsof
scanActiveTerminals(): void {
  const output = execSync(
    `lsof -c node -c python -c ruby -c cargo -c go 2>/dev/null | grep -E "cwd|txt"`
  );
  // Find project roots (package.json, Cargo.toml, etc.)
}

// Scan git repos with recent activity
scanRecentGitRepos(): void {
  // Check ~/Projects, ~/Developer, ~/dev, ~/code, ~/src
  // Look for .git directories with HEAD modified in last 24h
}
```

### 4.3 Capture Flow

```
┌─────────────┐     ┌───────────────┐     ┌────────────────┐
│ AI Tool     │────▶│ Global Daemon │────▶│ FastSession-   │
│ Activity    │     │ (detects)     │     │ Capture        │
└─────────────┘     └───────────────┘     └────────────────┘
                                                  │
                    ┌─────────────────────────────┘
                    ▼
    ┌───────────────────────────────────────────────────┐
    │ 1. Incremental file scan (mtime-based)            │
    │ 2. Hash only changed files                        │
    │ 3. Store new content to blobs                     │
    │ 4. Generate diffs from previous session           │
    │ 5. Save session with conversation context         │
    │ 6. Optional: Database & container state capture   │
    └───────────────────────────────────────────────────┘
```

---

## 5. Storage Optimization

### 5.1 Incremental Scanning

```typescript
// Only hash files that changed (by mtime)
for (const filePath of files) {
  const prev = previousFiles.get(relativePath);
  
  if (prev && prev.mtime === info.mtime && prev.size === info.size) {
    // File unchanged - reuse hash without reading content
    hash = prev.hash;
  } else {
    // File changed - read and store
    const content = this.fileScanner.readFile(filePath);
    hash = this.contentStore.put(content);
  }
}
```

### 5.2 Content Deduplication

Same file content across different files or timepoints is stored once:

```
File A: "hello world"  → hash: abc123
File B: "hello world"  → hash: abc123 (same blob reused)
```

### 5.3 Delta Compression

Pack files use delta encoding for similar files:

```typescript
class DeltaCompressor {
  compress(source: Buffer, target: Buffer): Buffer {
    // Find common prefix, sliding window matching, etc.
    return encodeDelta(instructions);
  }
}
```

### 5.4 Garbage Collection

```bash
tm gc  # Clean unreferenced blobs, pack loose objects
```

---

## 6. Data Access Patterns

### 6.1 Retrieve File at TimePoint

```typescript
engine.getFileAt(timepointId: string, filePath: string): string | null {
  const tp = this.timePointManager.load(timepointId);
  const fileEntry = tp.files.find(f => f.path === filePath);
  return this.contentStore.getString(fileEntry.hash);
}
```

### 6.2 Get Conversation Context

```typescript
conversationLogger.getContextForCheckpoint(checkpointId: string): ConversationContext {
  const events = this.eventStore.getEventsUntil(checkpointId);
  return {
    messages: events.filter(e => e.type === 'user_message' || e.type === 'assistant_message'),
    toolCalls: events.filter(e => e.type === 'tool_call'),
    codeChanges: events.filter(e => ['file_created', 'file_modified', 'file_deleted'].includes(e.type)),
    checkpoints: events.filter(e => e.type === 'checkpoint_created')
  };
}
```

### 6.3 Timeline Query

```typescript
// Get timepoints in range
timePointManager.getInRange(start: Date, end: Date): TimePoint[];

// Get timepoints by trigger
timePointManager.getByTrigger('ai_action'): TimePoint[];
```

---

## 7. File Paths Summary

| Path | Purpose |
|------|---------|
| `.aitimemachine/store/` | Content-addressable blob storage |
| `.aitimemachine/timepoints/` | JSON snapshot files |
| `.aitimemachine/events.jsonl` | Append-only event log |
| `.aitimemachine/content/` | Large content (messages, code, diffs) |
| `.aitimemachine/packs/` | Delta-compressed archives |
| `.aitimemachine/config.json` | Project configuration |
| `~/.aitimemachine-server/sessions/` | Global session storage |
| `~/.aitimemachine-server/blobs/` | Shared blob storage |
| `~/.aitimemachine-server/projects.json` | Project registry |

---

## 8. Related Components

- **MCP Server** (`src/mcp-daemon.ts`) - Exposes storage via MCP tools
- **CLI** (`src/cli-v2.ts`) - Command-line access to storage
- **API Server** (`src/api-server.ts`) - REST API for storage
- **Extension** (`extensions/vscode/`) - VS Code integration
- **Website** (`website/`) - Web UI for browsing history

---

## 9. Canonical Backend + Local Cache

Backend storage is required and is the source of truth for checkpoints, messages, contexts, diffs, and governance records.
Local storage (`.aitimemachine/` and `~/.aitimemachine-server/`) is a cache/offline buffer optimized for performance and resilience.

### 9.1 Canonical Schema

Use the canonical schema file:
- `../../CANONICAL_SQL_SCHEMA_V1.sql`

Schema notes:
- Social + time machine + governance tables are unified.
- `checkpoints/messages/tool_calls/contexts` are linked for deterministic restore-with-context.
- Consent, retention, audit, and export controls are first-class entities.

### 9.2 Sync Behavior

- Capture writes to local cache first for low latency.
- Sync service pushes to backend and reconciles by canonical checkpoint lineage.
- Restore operations always resolve from canonical backend state, then materialize locally.

### 9.3 Legacy Cloud Commands

Legacy `tm cloud ...` and `/api/cloud/...` interfaces are compatibility paths only.
New implementation should target canonical `time`, `actions`, `context`, and governance APIs defined in:
- `../../NORTH_STAR_PRD_ARCHITECTURE_V1.md`

---

## See Also

- [GIT_INTERNALS_INTEGRATION.md](./GIT_INTERNALS_INTEGRATION.md) - Git-like algorithms
- [GIT_INTEGRATION_COMPLETE.md](./GIT_INTEGRATION_COMPLETE.md) - Enhanced features
- [API.md](../API.md) - API documentation
