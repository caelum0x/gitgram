# Backend Database Schema - Complete Reference

This document shows the complete Neon (Postgres) schema that stores **everything** for AITimeMachine.
Canonical reference: `../../NORTH_STAR_PRD_ARCHITECTURE_V1.md`.
Canonical SQL source: `../../CANONICAL_SQL_SCHEMA_V1.sql`.

Note:
- This file is kept as an explanatory AITM-focused reference.
- For implementation and migrations, use `../../CANONICAL_SQL_SCHEMA_V1.sql` as source of truth.

## 💾 Complete Database Schema

```sql
-- ============================================
-- USERS & AUTHENTICATION
-- ============================================

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  api_key TEXT UNIQUE NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  name TEXT NOT NULL,
  path TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- TIME LAYER: Files, Folders, Checkpoints
-- ============================================

-- All file content (content-addressable)
CREATE TABLE blobs (
  hash TEXT PRIMARY KEY,
  content BYTEA NOT NULL,
  size INTEGER NOT NULL,
  compression TEXT DEFAULT 'brotli'
);

-- Directory trees (Merkle trees)
CREATE TABLE trees (
  hash TEXT PRIMARY KEY,
  entries JSONB NOT NULL  -- [{name, type, hash, mode}]
);

-- Checkpoints (snapshots)
CREATE TABLE checkpoints (
  id TEXT PRIMARY KEY,
  project_id UUID REFERENCES projects(id),
  user_id UUID REFERENCES users(id),
  timestamp TIMESTAMP NOT NULL,
  description TEXT,
  parent_id TEXT REFERENCES checkpoints(id),
  tree_hash TEXT REFERENCES trees(hash),
  session_id TEXT,
  trigger_type TEXT,  -- 'manual', 'auto', 'before_action', 'after_action'
  linked_checkpoint_id TEXT REFERENCES checkpoints(id)  -- Links before/after
);

-- Files in each checkpoint
CREATE TABLE checkpoint_files (
  checkpoint_id TEXT REFERENCES checkpoints(id),
  file_path TEXT NOT NULL,
  blob_hash TEXT REFERENCES blobs(hash),
  size INTEGER,
  mode INTEGER,
  change_type TEXT,  -- 'added', 'modified', 'deleted', 'unchanged'
  PRIMARY KEY (checkpoint_id, file_path)
);

-- Pre-computed diffs (for speed)
CREATE TABLE diffs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_checkpoint_id TEXT REFERENCES checkpoints(id),
  to_checkpoint_id TEXT REFERENCES checkpoints(id),
  file_path TEXT,
  diff_content TEXT,
  stats JSONB,  -- {added: 10, removed: 5, ...}
  algorithm TEXT DEFAULT 'histogram'
);

-- ============================================
-- CONTEXT LAYER: Chats, Actions, Mental State
-- ============================================

-- All messages (every chat)
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id),
  session_id TEXT NOT NULL,
  checkpoint_id TEXT REFERENCES checkpoints(id),  -- Link to code state
  timestamp TIMESTAMP DEFAULT NOW(),
  role TEXT CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  thinking TEXT,  -- AI's internal reasoning
  metadata JSONB
);

-- All tool calls (every AI action)
CREATE TABLE tool_calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID REFERENCES messages(id),
  checkpoint_before_id TEXT REFERENCES checkpoints(id),
  checkpoint_after_id TEXT REFERENCES checkpoints(id),
  tool_name TEXT NOT NULL,
  arguments JSONB NOT NULL,
  result JSONB,
  success BOOLEAN,
  error TEXT,
  timestamp TIMESTAMP DEFAULT NOW()
);

-- Mental state snapshots
CREATE TABLE contexts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  checkpoint_id TEXT REFERENCES checkpoints(id),
  session_id TEXT,
  summary TEXT,
  active_files JSONB,  -- ["src/api.ts", "src/db.ts"]
  cursor_position JSONB,  -- {file: "api.ts", line: 42, col: 10}
  current_task TEXT,
  goals JSONB,  -- ["Implement auth", "Add tests"]
  timestamp TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- AUGMENTED LAYER: Search & Intelligence
-- ============================================

-- Code embeddings (for semantic search)
CREATE TABLE embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id),
  checkpoint_id TEXT REFERENCES checkpoints(id),
  file_path TEXT,
  chunk_text TEXT,
  chunk_start_line INTEGER,
  chunk_end_line INTEGER,
  embedding vector(1536),  -- OpenAI ada-002
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX ON embeddings USING ivfflat (embedding vector_cosine_ops);

-- Full-text search on messages
CREATE INDEX idx_messages_search 
  ON messages USING gin(to_tsvector('english', content));

-- Documentation index
CREATE TABLE indexed_docs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id),
  url TEXT NOT NULL,
  title TEXT,
  content TEXT,
  embedding vector(1536),
  metadata JSONB,
  indexed_at TIMESTAMP DEFAULT NOW()
);

-- Oracle research jobs
CREATE TABLE research_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id),
  user_id UUID REFERENCES users(id),
  query TEXT NOT NULL,
  status TEXT DEFAULT 'pending',  -- 'pending', 'running', 'completed', 'failed'
  result JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP
);

-- ============================================
-- INDEXES for Performance
-- ============================================

CREATE INDEX idx_checkpoints_project ON checkpoints(project_id);
CREATE INDEX idx_checkpoints_timestamp ON checkpoints(timestamp);
CREATE INDEX idx_checkpoints_session ON checkpoints(session_id);
CREATE INDEX idx_messages_project ON messages(project_id);
CREATE INDEX idx_messages_session ON messages(session_id);
CREATE INDEX idx_tool_calls_message ON tool_calls(message_id);
CREATE INDEX idx_diffs_from ON diffs(from_checkpoint_id);
CREATE INDEX idx_diffs_to ON diffs(to_checkpoint_id);
```

## 📝 Example: Complete Data Flow

When AI creates a file, here's **everything** that gets saved:

```sql
-- 1. USER MESSAGE
INSERT INTO messages VALUES (
  id: 'msg_abc123',
  project_id: 'proj_xyz',
  session_id: 'sess_001',
  role: 'user',
  content: 'Create an API endpoint'
);

-- 2. BEFORE_ACTION CHECKPOINT
INSERT INTO checkpoints VALUES (
  id: 'cp_before_def456',
  project_id: 'proj_xyz',
  description: 'Before create_file: src/api.ts',
  tree_hash: 'tree_old123',
  trigger_type: 'before_action'
);

-- 3. CURRENT FILES SAVED
INSERT INTO checkpoint_files VALUES
  ('cp_before_def456', 'src/index.ts', 'blob_aaa', 1024, 0644, 'unchanged'),
  ('cp_before_def456', 'package.json', 'blob_bbb', 512, 0644, 'unchanged');

-- 4. TOOL CALL RECORDED
INSERT INTO tool_calls VALUES (
  id: 'tool_ghi789',
  message_id: 'msg_abc123',
  checkpoint_before_id: 'cp_before_def456',
  tool_name: 'create_file',
  arguments: '{"path": "src/api.ts", "content": "..."}'
);

-- 5. NEW FILE CONTENT SAVED
INSERT INTO blobs VALUES (
  hash: 'blob_ccc',
  content: <compressed bytes>,
  size: 2048
);

-- 6. AFTER_ACTION CHECKPOINT
INSERT INTO checkpoints VALUES (
  id: 'cp_after_jkl012',
  project_id: 'proj_xyz',
  description: 'After create_file: src/api.ts',
  tree_hash: 'tree_new456',
  trigger_type: 'after_action',
  linked_checkpoint_id: 'cp_before_def456'  -- LINK!
);

-- 7. NEW FILES SAVED
INSERT INTO checkpoint_files VALUES
  ('cp_after_jkl012', 'src/index.ts', 'blob_aaa', 1024, 0644, 'unchanged'),
  ('cp_after_jkl012', 'package.json', 'blob_bbb', 512, 0644, 'unchanged'),
  ('cp_after_jkl012', 'src/api.ts', 'blob_ccc', 2048, 0644, 'added');  -- NEW!

-- 8. DIFF SAVED
INSERT INTO diffs VALUES (
  from_checkpoint_id: 'cp_before_def456',
  to_checkpoint_id: 'cp_after_jkl012',
  file_path: 'src/api.ts',
  diff_content: '@@ -0,0 +1,50 @@\n+export const api = ...',
  stats: '{"added": 50, "removed": 0}'
);

-- 9. CONTEXT SAVED
INSERT INTO contexts VALUES (
  checkpoint_id: 'cp_after_jkl012',
  session_id: 'sess_001',
  summary: 'Created API endpoint',
  active_files: '["src/api.ts"]',
  current_task: 'Implementing REST API'
);

-- 10. EMBEDDINGS GENERATED (async)
INSERT INTO embeddings VALUES (
  project_id: 'proj_xyz',
  checkpoint_id: 'cp_after_jkl012',
  file_path: 'src/api.ts',
  chunk_text: 'export const api = ...',
  embedding: [0.123, -0.456, ...]  -- 1536 dimensions
);

-- 11. TOOL RESULT UPDATED
UPDATE tool_calls SET
  checkpoint_after_id = 'cp_after_jkl012',
  result = '{"success": true}',
  success = true
WHERE id = 'tool_ghi789';
```

## 🔍 Query Examples

```sql
-- Get all messages in a session with their checkpoints
SELECT 
  m.content,
  m.role,
  c.description as checkpoint_desc,
  c.timestamp
FROM messages m
LEFT JOIN checkpoints c ON m.checkpoint_id = c.id
WHERE m.session_id = 'sess_001'
ORDER BY m.timestamp;

-- Find what changed in a file over time
SELECT 
  c.timestamp,
  c.description,
  d.stats
FROM diffs d
JOIN checkpoints c ON d.to_checkpoint_id = c.id
WHERE d.file_path = 'src/api.ts'
ORDER BY c.timestamp;

-- Search code semantically
SELECT 
  file_path,
  chunk_text,
  1 - (embedding <=> '[query_embedding]') as similarity
FROM embeddings
WHERE project_id = 'proj_xyz'
ORDER BY embedding <=> '[query_embedding]'
LIMIT 10;
```
