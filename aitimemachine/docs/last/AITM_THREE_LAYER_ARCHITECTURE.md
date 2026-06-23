# AITimeMachine: Three-Layer Architecture Plan

> **Vision**: macOS Time Machine for AI coding - restore code AND chat to any point in time.
Canonical reference: `../../../NORTH_STAR_PRD_ARCHITECTURE_V1.md`.
Canonical SQL source: `../../../CANONICAL_SQL_SCHEMA_V1.sql`.

---

## 🎯 The Core Vision

**When AI breaks your code:**
1. Open AITimeMachine
2. Select "before the error" 
3. **Both code AND chat context are restored**
4. Continue from the clean state

---

## �️ Backend-Heavy Architecture (Critical)

### The Core Principle
**The Backend is the Source of Truth. MCP/API act as thin clients with local cache/offline buffering.**

```
┌─────────────────────────────────────────────────────────────┐
│                    User's Environment                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   VSCode     │  │ Claude Code  │  │   Cursor     │      │
│  │  + AITM MCP  │  │  + AITM MCP  │  │  + AITM MCP  │      │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘      │
│         │                  │                  │              │
│         └──────────────────┴──────────────────┘              │
│                            │                                 │
│                            ▼                                 │
│         ┌──────────────────────────────────────┐            │
│         │      AITM MCP Server (Thin Client)   │            │
│         │  • No canonical database              │            │
│         │  • Local cache/offline buffer only    │            │
│         │  • Forwards writes/reads to backend   │            │
│         └──────────────────┬───────────────────┘            │
│                            │                                 │
└────────────────────────────┼─────────────────────────────────┘
                             │ HTTPS
                             ▼
         ┌───────────────────────────────────────────────────┐
         │           AITM Backend API Server                 │
         │  • Authentication                                 │
         │  • Business logic                                 │
         │  • All data processing                            │
         └───────────────────┬───────────────────────────────┘
                             │
                             ▼
         ┌───────────────────────────────────────────────────┐
         │              Neon Database (Postgres)             │
         │  ┌─────────────────────────────────────────────┐ │
         │  │ • All chats (every message)                 │ │
         │  │ • All code (every version)                  │ │
         │  │ • All files (full content)                  │ │
         │  │ • All folders (directory trees)             │ │
         │  │ • All changes (diffs)                       │ │
         │  │ • All contexts (mental states)              │ │
         │  │ • All embeddings (for search)               │ │
         │  └─────────────────────────────────────────────┘ │
         └───────────────────────────────────────────────────┘
```

### Why Backend-Heavy?

1. **Reliability**: User's machine can crash, backend stays up
2. **Cross-Device**: Access from anywhere
3. **No Local DB**: MCP doesn't manage databases
4. **Scalability**: Backend handles heavy operations
5. **Security**: Centralized auth and access control

### What Gets Saved (Everything!)

```typescript
// Every AI action triggers backend save
interface CaptureEvent {
  // Chat
  messages: Message[];           // Every user/AI message
  toolCalls: ToolCall[];         // Every tool invocation
  toolOutputs: ToolOutput[];     // Every result
  
  // Code
  files: FileSnapshot[];         // Full file content
  folders: FolderTree[];         // Directory structure
  diffs: FileDiff[];             // What changed
  
  // Context
  activeFiles: string[];         // What was open
  cursorPosition: Position;      // Where user was
  currentTask: string;           // What AI was doing
  
  // Metadata
  timestamp: Date;
  checkpointId: string;
  sessionId: string;
}
```

---

## �🏗️ Three-Layer Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    AITimeMachine Layers                      │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Layer 1: ⏳ TIME LAYER (Git-Quality Storage)               │
│  ├─ Checkpoints (every AI action)                           │
│  ├─ Content-addressable storage (deduplication)             │
│  ├─ Delta compression (Git packfiles)                       │
│  └─ Advanced diff algorithms (Myers, Histogram)             │
│                                                              │
│  Layer 2: 🧠 CONTEXT LAYER (The Memory)                     │
│  ├─ Full chat history (every message)                       │
│  ├─ Tool calls + outputs (what AI did)                      │
│  ├─ Mental state (active files, cursor, goals)              │
│  └─ Linked to checkpoints (restore chat with code)          │
│                                                              │
│  Layer 3: 🔮 AUGMENTED LAYER (The Intelligence)             │
│  ├─ Code search (semantic + regex)                          │
│  ├─ Oracle agent (ask about history)                        │
│  ├─ Documentation indexing                                  │
│  └─ Universal search (code + docs + history)                │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## 🔌 MCP/API → Backend Connection

### MCP Server (Thin Client)

The MCP server runs locally with cache/offline buffering only; canonical state is in the backend.

```typescript
// src/mcp-daemon.ts (Simplified)
class MCPDaemon {
  private apiClient: AITMBackendClient;
  
  constructor() {
    // Connect to backend
    this.apiClient = new AITMBackendClient({
      baseUrl: process.env.AITM_BACKEND_URL || 'https://timemachine-api.gitgram.app',
      apiKey: process.env.AITM_API_KEY
    });
  }
  
  async handleToolCall(tool: string, args: any) {
    switch (tool) {
      case 'tm_checkpoint':
        // Forward to backend
        return await this.apiClient.post('/checkpoints', {
          description: args.description,
          files: await this.scanCurrentFiles(),
          context: await this.getCurrentContext()
        });
        
      case 'tm_go_back':
        // Get data from backend
        const checkpoint = await this.apiClient.get(`/checkpoints/${args.id}`);
        // Restore locally
        await this.restoreFiles(checkpoint.files);
        return checkpoint.context;
        
      case 'before_action':
        // Capture state and send to backend
        const state = await this.captureCurrentState();
        return await this.apiClient.post('/actions/before', state);
        
      case 'after_action':
        // Capture changes and send to backend
        const changes = await this.captureChanges();
        return await this.apiClient.post('/actions/after', changes);
    }
  }
}
```

### Backend API Endpoints

```typescript
// Backend handles ALL data operations

// Checkpoints
POST   /api/checkpoints              // Create checkpoint
GET    /api/checkpoints              // List checkpoints
GET    /api/checkpoints/:id          // Get checkpoint details
POST   /api/checkpoints/:id/restore  // Restore to checkpoint
DELETE /api/checkpoints/:id          // Delete checkpoint

// Files (Full content storage)
POST   /api/files                    // Save file content
GET    /api/files/:hash              // Get file by hash
GET    /api/files/tree/:checkpoint   // Get directory tree
POST   /api/files/diff               // Get diff between versions

// Chats
POST   /api/chats/messages           // Save message
GET    /api/chats/messages           // Get messages
GET    /api/chats/sessions/:id       // Get session history
POST   /api/chats/context            // Save context snapshot

// Actions (Tool calls)
POST   /api/actions/before           // Before AI action
POST   /api/actions/after            // After AI action
GET    /api/actions/history          // Get action history

// Search & Intelligence
POST   /api/search/code              // Search code
POST   /api/search/chats             // Search conversations
POST   /api/oracle/ask               // Ask Oracle
POST   /api/oracle/research          // Start research job

// Time Travel
POST   /api/time/undo                // Undo last action
POST   /api/time/restore             // Restore to point
GET    /api/time/timeline            // Get timeline
GET    /api/time/diff                // Get diff
```

### Data Flow Example: AI Makes a Change

```
1. User: "Create an API endpoint"
   ↓
2. MCP captures message
   POST /api/chats/messages
   {
     role: "user",
     content: "Create an API endpoint",
     sessionId: "sess_123"
   }
   ↓
3. AI decides to use create_file tool
   ↓
4. MCP: before_action
   POST /api/actions/before
   {
     action: "create_file",
     args: {path: "src/api.ts"},
     currentFiles: [...],  // Full snapshot
     currentContext: {...}
   }
   → Backend saves checkpoint_before_abc123
   ↓
5. AI creates file
   ↓
6. MCP: after_action
   POST /api/actions/after
   {
     action: "create_file",
     result: "success",
     newFiles: [...],      // Full snapshot
     diff: {...}
   }
   → Backend saves checkpoint_after_abc123
   → Backend links: message → before → after
   ↓
7. Backend generates diff and saves
   POST /api/files/diff
   → Stores in diffs table
   ↓
8. Backend generates embeddings (async)
   → Stores in embeddings table
```

### Authentication Flow

```typescript
// User authenticates once
const apiKey = await login(email, password);
// Store in environment
process.env.AITM_API_KEY = apiKey;

// MCP uses API key for all requests
headers: {
  'Authorization': `Bearer ${process.env.AITM_API_KEY}`,
  'Content-Type': 'application/json'
}
```

---

## Layer 1: ⏳ Time Layer

### Goal
Store every version of every file with Git-quality efficiency.

### Components

#### 1.1 Local Storage (`.aitimemachine/`)
- **Content Store**: SHA-256 hashed blobs (deduplicated)
- **Packfiles**: Delta-compressed archives
- **Checkpoints**: JSON snapshots of project state
- **Index**: Fast lookup of what changed when

#### 1.2 Cloud Storage (Neon - Required)
```sql
-- Core tables
CREATE TABLE checkpoints (
  id TEXT PRIMARY KEY,
  project_id UUID,
  timestamp TIMESTAMP,
  description TEXT,
  parent_id TEXT,
  tree_hash TEXT  -- Merkle tree root
);

CREATE TABLE blobs (
  hash TEXT PRIMARY KEY,
  content BYTEA,
  size INTEGER,
  compression TEXT
);

CREATE TABLE trees (
  hash TEXT PRIMARY KEY,
  entries JSONB  -- [{name, type, hash, mode}]
);
```

### MCP Tools
- `tm_checkpoint(description)` - Create manual checkpoint
- `tm_go_back(time_or_id)` - Restore to checkpoint
- `tm_undo_last()` - Quick undo
- `tm_diff(from, to)` - Show changes
- `tm_restore_file(path, checkpoint)` - Selective restore

### CLI Commands
```bash
aitm checkpoint "Before refactor"
aitm back 5m
aitm undo
aitm diff HEAD~1
aitm restore src/api.ts --from abc123
```

### API Endpoints
```
POST /api/time/checkpoint
POST /api/time/restore
POST /api/time/undo
GET  /api/time/diff/:from/:to
GET  /api/time/timeline
```

---

## Layer 2: 🧠 Context Layer

### Goal
Capture and restore the AI's "mental state" - not just code, but the conversation and intent.

### Components

#### 2.1 Chat Storage
```sql
CREATE TABLE messages (
  id UUID PRIMARY KEY,
  project_id UUID,
  session_id TEXT,
  checkpoint_id TEXT,  -- Link to code state
  timestamp TIMESTAMP,
  role TEXT,  -- 'user' | 'assistant' | 'system'
  content TEXT,
  tool_calls JSONB,
  tool_outputs JSONB
);

CREATE TABLE contexts (
  id UUID PRIMARY KEY,
  checkpoint_id TEXT,
  summary TEXT,
  active_files JSONB,
  cursor_position JSONB,
  current_task TEXT
);
```

#### 2.2 Auto-Capture
Every AI action triggers:
1. **before_action**: Checkpoint BEFORE change
2. **Tool execution**: Capture inputs/outputs
3. **after_action**: Checkpoint AFTER change
4. **Link**: Connect chat message → checkpoint

### MCP Tools
- `tm_save_context(summary)` - Save mental state
- `tm_get_context(checkpoint_id)` - Retrieve context
- `tm_restore_with_context(checkpoint_id)` - Restore code + chat

### CLI Commands
```bash
aitm context save "API design phase"
aitm context load abc123
aitm back --with-context
```

### API Endpoints
```
POST /api/context/save
GET  /api/context/:checkpoint_id
POST /api/context/restore
GET  /api/context/search?q=authentication
```

---

## Layer 3: 🔮 Augmented Layer

### Goal
Intelligent search, research, and understanding (inspired by Nia but AITM-specific).

### Components

#### 3.1 Code Intelligence
```sql
CREATE TABLE embeddings (
  id UUID PRIMARY KEY,
  project_id UUID,
  checkpoint_id TEXT,
  file_path TEXT,
  chunk_text TEXT,
  embedding vector(1536),  -- pgvector
  metadata JSONB
);

CREATE INDEX ON embeddings USING ivfflat (embedding vector_cosine_ops);
```

#### 3.2 Oracle Agent
The "Oracle" knows:
- **Project history**: What changed when and why
- **Code context**: Where functions are defined
- **Chat history**: What you discussed with AI
- **External docs**: Indexed documentation

### MCP Tools (Nia-Inspired)
- `tm_oracle_ask(question)` - Ask about project
- `tm_search_code(query)` - Semantic code search
- `tm_index_docs(url)` - Index documentation
- `tm_universal_search(query)` - Search everything
- `tm_research(topic)` - Deep research agent

### CLI Commands
```bash
aitm ask "Where is the auth logic?"
aitm search "database connection"
aitm index https://docs.example.com
aitm research "best practices for API design"
```

### API Endpoints (Nia-Style)
```
POST /api/oracle/ask
POST /api/search/code
POST /api/search/universal
POST /api/index/docs
POST /api/research/start
GET  /api/research/:job_id
```

---

## 🔄 Data Flow: The Complete Picture

### Capture Flow
```
AI makes change
    ↓
1. before_action checkpoint
    ↓
2. Capture tool call + args
    ↓
3. Execute change
    ↓
4. Capture tool output
    ↓
5. after_action checkpoint
    ↓
6. Link: message → checkpoint → context
    ↓
7. Sync to Neon (async)
    ↓
8. Generate embeddings (background)
```

### Restore Flow
```
User: "Go back to before the error"
    ↓
1. Search checkpoints (by time/description)
    ↓
2. Load checkpoint metadata
    ↓
3. Fetch linked context from Neon
    ↓
4. Restore files from content store
    ↓
5. Return chat context to AI
    ↓
6. AI continues with restored state
```

---

## 📊 Implementation Priority

### Phase 1: Time Layer (Core) ✅
- [x] Content-addressable storage
- [x] Checkpoints
- [x] Diff engine
- [x] Packfiles
- [x] MCP tools (basic)

### Phase 2: Context Layer (Critical) 🔄
- [ ] Chat message storage
- [ ] Tool call tracking
- [ ] Context snapshots
- [ ] Checkpoint ↔ Context linking
- [ ] Restore with context

### Phase 3: Augmented Layer (Intelligence) 📋
- [ ] Code embeddings
- [ ] Oracle agent
- [ ] Documentation indexing
- [ ] Universal search
- [ ] Research agent

---

## 🎯 Key Differences from Nia

| Feature | Nia | AITimeMachine |
|---------|-----|---------------|
| **Focus** | External repos/docs | Your project history |
| **Time Travel** | ❌ No | ✅ Full restore |
| **Chat Context** | Limited | ✅ Full history |
| **Undo AI Mistakes** | ❌ No | ✅ Core feature |
| **Local-First** | ❌ Cloud-only | ✅ Hybrid |
| **Git Integration** | Basic | ✅ Deep (packfiles, trees) |

---

## 🚀 Success Criteria

1. ✅ **Instant Undo**: `aitm undo` restores in <1 second
2. ✅ **Chat Restore**: Going back includes conversation context
3. ✅ **Smart Search**: Find "before the Docker changes"
4. ✅ **Selective Restore**: Restore just `src/api.ts`
5. ✅ **Oracle Intelligence**: Ask "What did I change yesterday?"
6. ✅ **Heavy Backend**: All data synced to Neon for reliability

---

## 📁 File Structure

```
src/
├── core/
│   ├── engine.ts              # Main TimeMachine engine
│   ├── content-store.ts       # Blob storage
│   ├── diff-engine-v2.ts      # Advanced diff
│   └── git/
│       ├── tree.ts            # Merkle trees
│       └── pack/              # Packfile logic
├── neon/
│   ├── client.ts              # Drizzle + Neon
│   ├── schema.ts              # DB schema
│   ├── sync.ts                # Sync service
│   └── indexer.ts             # Embeddings
├── oracle/
│   └── agent.ts               # Oracle intelligence
├── mcp/
│   ├── mcp-daemon.ts          # MCP server
│   └── ai-time-concept-tools.ts
├── api/
│   └── server.ts              # REST API
└── cli/
    └── cli-v2.ts              # CLI commands
```

---

## 🔐 Environment Variables

```bash
# Required
DATABASE_URL=postgres://...neon.tech/...
OPENAI_API_KEY=sk-...

# Optional
AITM_AUTO_SYNC=true
AITM_CAPTURE_INTERVAL=300  # 5 minutes
```

---

## 📚 Next Steps

1. **Complete Context Layer**:
   - Implement chat storage in Neon
   - Link checkpoints ↔ contexts
   - Update `tm_go_back` to restore context

2. **Build Oracle**:
   - Implement embedding generation
   - Create Oracle agent
   - Add universal search

3. **Polish UX**:
   - Add visual timeline (TUI)
   - Improve error messages
   - Add progress indicators

4. **Documentation**:
   - User guide
   - API reference
   - Video tutorials
