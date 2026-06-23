# How AITimeMachine Achieves "Time Machine for AI"

> **Vision**: Just like macOS Time Machine lets you restore your computer to before a virus, AITimeMachine lets you restore your code AND AI chat to before any mistake.
Canonical reference: `../../NORTH_STAR_PRD_ARCHITECTURE_V1.md`.

Architecture baseline used in this document:
- Backend is the source of truth.
- Local files are restored/materialized from canonical backend state.
- Local storage is cache/offline buffer, not canonical state.

---

## 🎯 The 7 Goals Explained

### Goal 1: Go Back in Time (Restore Files + Chat Context)

**How it works:**

```
User: "Go back to 2 hours ago"

MCP → Backend API → Neon Database
    ↓
Backend finds checkpoint from 2 hours ago
    ↓
Returns:
  - All file contents (exact state)
  - All chat messages (conversation history)
  - Context (what AI was working on)
    ↓
MCP restores files locally
    ↓
AI receives chat context and continues from that point
```

**Technical Implementation:**

```typescript
// MCP Tool: tm_go_back
async tm_go_back(timeOrId: string) {
  // 1. Query backend for checkpoint
  const checkpoint = await backend.get('/api/time/restore', {
    time: '2 hours ago'
  });
  
  // 2. Restore all files
  for (const file of checkpoint.files) {
    await fs.writeFile(file.path, file.content);
  }
  
  // 3. Return chat context to AI
  return {
    messages: checkpoint.messages,  // All previous chat
    context: checkpoint.context,    // What AI was doing
    summary: "Restored to 2 hours ago. You were implementing the auth system."
  };
}
```

**Database Query:**
```sql
-- Find checkpoint from 2 hours ago
SELECT c.*, 
       array_agg(m.*) as messages,
       ctx.summary
FROM checkpoints c
LEFT JOIN messages m ON m.checkpoint_id = c.id
LEFT JOIN contexts ctx ON ctx.checkpoint_id = c.id
WHERE c.timestamp >= NOW() - INTERVAL '2 hours'
ORDER BY c.timestamp DESC
LIMIT 1;
```

---

### Goal 2: See What Changed (Visual Diff)

**How it works:**

```
User: "What changed in the last hour?"

MCP → Backend API
    ↓
Backend queries pre-computed diffs
    ↓
Returns visual diff with:
  - Files added/modified/deleted
  - Line-by-line changes
  - Color-coded output
```

**Technical Implementation:**

```typescript
// MCP Tool: tm_what_changed
async tm_what_changed(since: string) {
  const diff = await backend.get('/api/time/diff', {
    from: 'HEAD~1',
    to: 'HEAD'
  });
  
  return {
    summary: {
      added: ['src/api.ts', 'src/auth.ts'],
      modified: ['package.json'],
      deleted: []
    },
    diffs: [
      {
        file: 'src/api.ts',
        changes: '+50 lines',
        preview: '@@ -0,0 +1,50 @@\n+export const api = ...'
      }
    ]
  };
}
```

**Database Storage:**
```sql
-- Pre-computed diffs stored for instant retrieval
CREATE TABLE diffs (
  from_checkpoint_id TEXT,
  to_checkpoint_id TEXT,
  file_path TEXT,
  diff_content TEXT,  -- Full unified diff
  stats JSONB         -- {added: 50, removed: 0}
);
```

---

### Goal 3: Go Back to Exact Time Before AI Error

**How it works:**

```
AI makes mistake in chat
    ↓
User: "Go back to before that error"
    ↓
MCP finds the checkpoint BEFORE the bad message
    ↓
Restores code + chat to that exact point
```

**Technical Implementation:**

```typescript
// MCP Tool: tm_before_error
async tm_before_error() {
  // 1. Find last checkpoint before error
  const checkpoint = await backend.get('/api/time/before-error');
  
  // 2. This checkpoint has:
  //    - linked_checkpoint_id pointing to "before_action"
  //    - All files from before the mistake
  //    - Chat history up to (but not including) the error
  
  // 3. Restore everything
  await this.restoreFiles(checkpoint.files);
  
  return {
    messages: checkpoint.messages,
    summary: "Restored to before the error. Last good state was: implementing auth."
  };
}
```

**Database Linking:**
```sql
-- Every AI action creates TWO checkpoints linked together
INSERT INTO checkpoints VALUES
  ('cp_before_abc', ..., trigger_type: 'before_action'),
  ('cp_after_abc', ..., trigger_type: 'after_action', 
   linked_checkpoint_id: 'cp_before_abc');  -- LINK!

-- To restore before error, just load the "before" checkpoint
SELECT * FROM checkpoints 
WHERE trigger_type = 'before_action' 
  AND linked_checkpoint_id IN (
    SELECT id FROM checkpoints WHERE description LIKE '%error%'
  );
```

---

### Goal 4: Restore Specific Files (Not Everything)

**How it works:**

```
User: "Just restore src/api.ts from yesterday"

MCP → Backend
    ↓
Backend finds file content from yesterday's checkpoint
    ↓
Returns ONLY that file
    ↓
MCP restores only src/api.ts
```

**Technical Implementation:**

```typescript
// MCP Tool: tm_restore_file
async tm_restore_file(path: string, checkpoint: string) {
  // 1. Get specific file from checkpoint
  const file = await backend.get('/api/files/at-checkpoint', {
    checkpoint: checkpoint,
    path: 'src/api.ts'
  });
  
  // 2. Restore only this file
  await fs.writeFile(path, file.content);
  
  return {
    restored: [path],
    size: file.size,
    from: checkpoint
  };
}
```

**Database Query:**
```sql
-- Get specific file from specific checkpoint
SELECT b.content, cf.size
FROM checkpoint_files cf
JOIN blobs b ON cf.blob_hash = b.hash
WHERE cf.checkpoint_id = 'cp_yesterday_abc'
  AND cf.file_path = 'src/api.ts';
```

---

### Goal 5: Restore Entire Folder/File/Project

**How it works:**

```
User: "Restore the entire src/ folder from last week"

MCP → Backend
    ↓
Backend finds all files in src/ from last week
    ↓
Returns entire directory tree
    ↓
MCP restores all files in src/
```

**Technical Implementation:**

```typescript
// MCP Tool: tm_restore_folder
async tm_restore_folder(pattern: string, checkpoint: string) {
  // 1. Get all files matching pattern
  const files = await backend.get('/api/files/tree', {
    checkpoint: checkpoint,
    pattern: 'src/**'  // Glob pattern
  });
  
  // 2. Restore all files
  for (const file of files) {
    await fs.writeFile(file.path, file.content);
  }
  
  return {
    restored: files.map(f => f.path),
    totalFiles: files.length,
    totalSize: files.reduce((sum, f) => sum + f.size, 0)
  };
}
```

**Database Query:**
```sql
-- Get all files in a folder from checkpoint
SELECT cf.file_path, b.content, cf.size
FROM checkpoint_files cf
JOIN blobs b ON cf.blob_hash = b.hash
WHERE cf.checkpoint_id = 'cp_lastweek_xyz'
  AND cf.file_path LIKE 'src/%';
```

---

### Goal 6: Capture Data for AI Model Training

**How it works:**

```
Every AI interaction is captured:
  ↓
User message → Saved
AI response → Saved
Tool calls → Saved
Code changes → Saved
Success/Failure → Saved
  ↓
All stored in Neon with metadata
  ↓
Can be exported for AI training
```

**What Gets Captured:**

```typescript
interface TrainingData {
  // Conversation
  userMessage: string;
  aiResponse: string;
  aiThinking: string;  // Internal reasoning
  
  // Actions
  toolCalls: {
    name: string;
    arguments: any;
    result: any;
    success: boolean;
    error?: string;
  }[];
  
  // Code Changes
  before: {
    files: FileSnapshot[];
    context: string;
  };
  after: {
    files: FileSnapshot[];
    diff: string;
  };
  
  // Metadata
  timestamp: Date;
  sessionDuration: number;
  projectType: string;
  success: boolean;
}
```

**Database Schema for Training Data:**

```sql
-- All data needed for AI training
CREATE TABLE training_sessions (
  id UUID PRIMARY KEY,
  user_id UUID,
  project_id UUID,
  
  -- Conversation
  messages JSONB,  -- Full chat history
  
  -- Actions
  tool_calls JSONB,  -- All tools used
  
  -- Code
  checkpoints_before JSONB,  -- State before
  checkpoints_after JSONB,   -- State after
  diffs JSONB,               -- What changed
  
  -- Outcomes
  success BOOLEAN,
  error_messages TEXT[],
  
  -- Metadata
  session_duration INTEGER,
  project_type TEXT,
  ai_model TEXT,
  timestamp TIMESTAMP
);

-- Export for training
SELECT 
  messages,
  tool_calls,
  diffs,
  success
FROM training_sessions
WHERE success = true  -- Only successful sessions
  AND timestamp > NOW() - INTERVAL '30 days'
LIMIT 10000;
```

---

### Goal 7: Git-Like Architecture with Full Capture

**How it works:**

```
┌─────────────────────────────────────────────────┐
│  User's Environment (VSCode/Claude/Cursor)      │
│                                                  │
│  ┌────────────────────────────────────────┐    │
│  │  AITM MCP Server (Thin Client)         │    │
│  │  • Captures every AI action            │    │
│  │  • Scans files before/after            │    │
│  │  • Sends everything to backend         │    │
│  └────────────┬───────────────────────────┘    │
└───────────────┼──────────────────────────────────┘
                │ HTTPS
                ▼
┌─────────────────────────────────────────────────┐
│  AITM Backend API Server                        │
│  • Receives all data                            │
│  • Computes diffs (Git algorithms)              │
│  • Generates embeddings                         │
│  • Stores in Neon                               │
└────────────┬────────────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────────────┐
│  Neon Database (Postgres)                       │
│                                                  │
│  Git-Like Storage:                              │
│  • Blobs (content-addressable)                  │
│  • Trees (directory structure)                  │
│  • Commits (checkpoints)                        │
│  • Diffs (pre-computed)                         │
│                                                  │
│  AI-Specific Storage:                           │
│  • Messages (all chats)                         │
│  • Tool Calls (all actions)                     │
│  • Contexts (mental states)                     │
│  • Embeddings (for search)                      │
└─────────────────────────────────────────────────┘
```

**Complete Capture Flow:**

```
1. User: "Create an API"
   → MCP captures message
   → POST /api/chats/messages
   
2. MCP: before_action
   → Scans all current files
   → Computes hashes
   → POST /api/actions/before
   → Backend creates checkpoint_before
   
3. AI: Creates src/api.ts
   → File written to disk
   
4. MCP: after_action
   → Scans all files again
   → Detects new file
   → POST /api/actions/after
   → Backend creates checkpoint_after
   
5. Backend Processing:
   → Computes diff (Git histogram algorithm)
   → Generates embeddings (OpenAI)
   → Links: message → before → after
   → Stores everything in Neon
   
6. Result:
   ✅ Full file content saved
   ✅ Diff computed and saved
   ✅ Chat history saved
   ✅ Tool call recorded
   ✅ Context captured
   ✅ Embeddings generated
```

---

## 🚀 The Complete System

### MCP Tools (What AI Can Use)

```typescript
// Time Travel
tm_go_back(time)           // "Go back 2 hours"
tm_undo_last()             // "Undo that"
tm_before_error()          // "Before the mistake"

// Inspection
tm_what_changed(since)     // "What changed?"
tm_diff(from, to)          // "Show me the diff"
tm_timeline()              // "Show history"

// Selective Restore
tm_restore_file(path, chk) // "Restore just api.ts"
tm_restore_folder(pattern) // "Restore src/ folder"

// Intelligence
tm_oracle_ask(question)    // "Where is the auth code?"
tm_search_code(query)      // "Find database connections"
```

### CLI Commands (What Users Can Run)

```bash
# Time Travel
aitm back 2h
aitm undo
aitm before-error

# Inspection
aitm diff
aitm timeline
aitm changes

# Selective Restore
aitm restore src/api.ts --from abc123
aitm restore "src/**" --from yesterday

# Intelligence
aitm ask "Where is the auth logic?"
aitm search "database connection"
```

### Backend API (What Stores Everything)

```
POST /api/chats/messages       # Save every message
POST /api/actions/before       # Before AI action
POST /api/actions/after        # After AI action
POST /api/checkpoints          # Create checkpoint
GET  /api/time/restore         # Restore to point
GET  /api/time/diff            # Get diff
POST /api/files                # Save file content
GET  /api/files/tree           # Get directory
POST /api/oracle/ask           # Ask Oracle
```

---

## ✅ Success: The Vision Realized

**macOS Time Machine:**
- Computer got virus → Time Machine → Select date → Restore → Clean computer

**AITimeMachine:**
- AI broke code → AITimeMachine → Select checkpoint → Restore → Clean code + chat

**Both restore to exact state before the problem!** 🎯
