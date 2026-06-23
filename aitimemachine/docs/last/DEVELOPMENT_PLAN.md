# DEVELOPMENT PLAN

## Status: Phase 1-2 Complete ✅

### Completed Features:
- ✅ MCP Server with 25+ tools
- ✅ CLI with 70+ commands including JSON output
- ✅ VSCode Extension with Timeline UI
- ✅ Website with 3D visualization
- ✅ Search functionality (CLI + Extension)
- ✅ Selective file restore
- ✅ Visual diff (VSCode native diff editor)
- ✅ File content viewer (cat command + aitm:// protocol)
- ✅ Timeline filtering by date/file/pattern/trigger
- ✅ Conversation search with fuzzy matching
- ✅ WebSocket real-time file updates
- ✅ Interactive TUI timeline browser
- ✅ Smart auto-checkpoint (tests pass, build success)
- ✅ Checkpoint annotations/notes with tags
- ✅ Checkpoint comparison report (markdown)
- ✅ Enhanced error pattern detection

### Recently Added (v2.1):
- Timeline filtering: `--after`, `--before`, `--file`, `--pattern`, `--trigger`
- Enhanced search: fuzzy matching, n-gram indexing, context snippets, highlighting
- Real-time WebSocket: file change notifications, live search
- New CLI commands: `search`, `search-conv`, `tui`, `auto-checkpoint`, `annotate`, `tags`, `report`
- New API endpoints: `/api/search/*`, `/api/timeline/*`
- TUI timeline browser with vim-style navigation
- Smart auto-checkpoint rules (tests, build, lint, typecheck)
- Checkpoint annotations with notes and tags
- Markdown comparison reports
- 30+ error patterns for JS/TS/Python/Rust/Go

---

## Objective
Build macOS Time Machine for AI development:
1. Go back in time (restore files + chat context)
2. See what changed (visual diff)
3. Browse timeline (Time Machine UI)
4. Restore specific files (not just everything)

## Study References
- Git internals: /Users/arhansubasi/aitimemachine/git/
- Gemini CLI: patterns for MCP and CLI
- Kilo Code: patterns for extensions

---
1. MCP - Enhanced tools for selective restore, visual diff, timeline browsing
2. CLI - Interactive mode, selective restore, visual diff, timeline browser
3. API - RESTful endpoints, WebSocket, GraphQL
4. Core - Selective restore, efficient diff, timeline optimization, search
5. Website - 3D Time Machine UI with React + Three.js

Key technical decisions based on Git internals study:
- Use Myers diff algorithm
- Implement selective restore like git checkout
- Build in-memory checkpoint graph with indexes
- Use bloom filters for fast file lookup
---

## 1. MCP SERVER

### Current State
- Basic MCP tools exist (before_action, after_action, go_back)
- Conversation logging implemented
- Event store with JSONL

### Required Features

#### 1.1 Enhanced Tool Protocol
```
STUDY: git/object-file.c - how git stores objects
STUDY: gemini-cli/packages/core/src/mcp/ - MCP patterns

TODO:
- [ ] Add streaming support for large file operations
- [ ] Implement tool result caching
- [ ] Add progress reporting for long operations
- [ ] Handle concurrent tool calls safely
```

#### 1.2 Conversation Context Management
```
STUDY: git/refs.c - how git manages references
STUDY: gemini-cli/packages/core/src/agent/ - agent state tracking

TODO:
- [ ] Implement conversation threading (link related messages)
- [ ] Add conversation search by content
- [ ] Support conversation branching (multiple paths)
- [ ] Add conversation summarization for context window
```

#### 1.3 Selective File Restore
```
STUDY: git/checkout.c - how git checks out specific files
STUDY: git/tree-walk.c - how git walks trees

TODO:
- [ ] Add restore_file(path, checkpointId) tool
- [ ] Add restore_files(paths[], checkpointId) tool
- [ ] Support glob patterns for file selection
- [ ] Add dry-run mode for restore preview
```

#### 1.4 Visual Diff Support
```
STUDY: git/diff.c - how git generates diffs
STUDY: git/diff-lib.c - diff algorithms

TODO:
- [ ] Add get_file_diff(path, fromId, toId) tool
- [ ] Support unified diff format
- [ ] Support side-by-side diff format
- [ ] Add syntax highlighting metadata
```

#### 1.5 Timeline Browsing
```
STUDY: git/log-tree.c - how git shows history
STUDY: git/revision.c - revision walking

TODO:
- [ ] Add get_timeline(startDate, endDate) tool
- [ ] Support filtering by file path
- [ ] Support filtering by conversation content
- [ ] Add pagination for large timelines
```

---

## 2. CLI

### Current State
- 30+ commands implemented
- JSON/text output formats
- Basic error handling

### Required Features

#### 2.1 Interactive Mode
```
STUDY: git/builtin/add.c - interactive staging
STUDY: gemini-cli/packages/cli/src/ - CLI patterns

TODO:
- [ ] Add aitm interactive command
- [ ] Implement TUI with blessed/ink
- [ ] Show timeline with arrow key navigation
- [ ] Support vim-style keybindings
```

#### 2.2 Selective Restore
```
STUDY: git/builtin/checkout.c - file checkout

TODO:
- [ ] Add aitm restore --files <pattern> <checkpoint>
- [ ] Support multiple file patterns
- [ ] Add --dry-run flag
- [ ] Show preview before restore
```

#### 2.3 Visual Diff
```
STUDY: git/builtin/diff.c - diff command

TODO:
- [ ] Add aitm diff --visual <from> <to>
- [ ] Integrate with delta/diff-so-fancy
- [ ] Support --stat for summary
- [ ] Support --name-only for file list
```

#### 2.4 Timeline Browser
```
STUDY: git/builtin/log.c - log command

TODO:
- [ ] Add aitm timeline --interactive
- [ ] Show graph of checkpoints
- [ ] Support date range filtering
- [ ] Support file path filtering
```

#### 2.5 Search
```
STUDY: git/builtin/grep.c - content search
STUDY: git/builtin/log.c - commit search

TODO:
- [ ] Add aitm search <query>
- [ ] Search in conversation content
- [ ] Search in file content at checkpoints
- [ ] Support regex patterns
```

---

## 3. API SERVER

### Current State
- REST endpoints exist
- Basic CRUD operations

### Required Features

#### 3.1 RESTful API Design
```
STUDY: git/http-backend.c - git HTTP protocol

TODO:
- [ ] GET /api/checkpoints - list with pagination
- [ ] GET /api/checkpoints/:id - get details
- [ ] POST /api/checkpoints - create
- [ ] GET /api/checkpoints/:id/files - list files
- [ ] GET /api/checkpoints/:id/files/:path - get file content
- [ ] POST /api/restore - restore checkpoint
- [ ] POST /api/restore/files - restore specific files
- [ ] GET /api/diff/:from/:to - get diff
- [ ] GET /api/timeline - get timeline
- [ ] GET /api/search - search content
```

#### 3.2 WebSocket Support
```
STUDY: git/upload-pack.c - git protocol streaming

TODO:
- [ ] Add WebSocket endpoint for real-time updates
- [ ] Stream file changes as they happen
- [ ] Stream checkpoint creation progress
- [ ] Stream restore progress
```

#### 3.3 Authentication
```
TODO:
- [ ] Add API key authentication
- [ ] Add JWT token support
- [ ] Add rate limiting
- [ ] Add CORS configuration
```

#### 3.4 GraphQL API
```
TODO:
- [ ] Design GraphQL schema
- [ ] Implement resolvers
- [ ] Add subscriptions for real-time
- [ ] Add DataLoader for batching
```

---

## 4. CORE ENGINE

### Current State
- TimeMachineEngine with basic operations
- Content-addressable storage
- Pack files with compression

### Required Features

#### 4.1 Selective Restore
```
STUDY: git/unpack-trees.c - tree unpacking
STUDY: git/merge-recursive.c - merge logic

TODO:
- [ ] Implement restoreFiles(paths[], checkpointId)
- [ ] Support glob pattern matching
- [ ] Handle file conflicts (current vs checkpoint)
- [ ] Add merge strategies (ours, theirs, manual)
```

#### 4.2 Efficient Diff Generation
```
STUDY: git/diff.c - diff algorithms
STUDY: git/xdiff/ - low-level diff

TODO:
- [ ] Implement Myers diff algorithm
- [ ] Add patience diff algorithm
- [ ] Support histogram diff
- [ ] Cache diff results
```

#### 4.3 Timeline Query Optimization
```
STUDY: git/commit-graph.c - commit graph
STUDY: git/revision.c - revision walking

TODO:
- [ ] Build checkpoint graph in memory
- [ ] Index checkpoints by date
- [ ] Index checkpoints by file path
- [ ] Add bloom filters for fast file lookup
```

#### 4.4 Conversation Search
```
STUDY: git/grep.c - content search

TODO:
- [ ] Build inverted index for conversation content
- [ ] Support full-text search
- [ ] Add fuzzy matching
- [ ] Rank results by relevance
```

#### 4.5 Storage Optimization
```
STUDY: git/pack-objects.c - pack generation
STUDY: git/pack-bitmap.c - bitmap index

TODO:
- [ ] Implement bitmap index for fast queries
- [ ] Add multi-pack index
- [ ] Implement incremental pack generation
- [ ] Add pack reuse for faster operations
```

---

## 5. WEBSITE (Time Machine UI)

### Required Features

#### 5.1 Timeline Visualization
```
STUDY: macOS Time Machine UI
STUDY: kilocode/webview-ui/ - React patterns

TODO:
- [ ] Design 3D timeline like macOS Time Machine
- [ ] Use Three.js for 3D rendering
- [ ] Show checkpoints as windows in space
- [ ] Animate transitions between checkpoints
- [ ] Support mouse/keyboard navigation
```

#### 5.2 File Browser
```
TODO:
- [ ] Show file tree at checkpoint
- [ ] Highlight changed files
- [ ] Support file preview
- [ ] Show file history
```

#### 5.3 Diff Viewer
```
TODO:
- [ ] Side-by-side diff view
- [ ] Unified diff view
- [ ] Syntax highlighting
- [ ] Line-by-line navigation
```

#### 5.4 Conversation View
```
TODO:
- [ ] Show conversation timeline
- [ ] Link messages to checkpoints
- [ ] Show tool calls inline
- [ ] Support message search
```

#### 5.5 Restore Interface
```
TODO:
- [ ] Select files to restore
- [ ] Preview restore changes
- [ ] Confirm restore action
- [ ] Show restore progress
```

---

## Implementation Order

### Week 1: Core Enhancements
```
Priority: HIGH
- [ ] Selective file restore in core engine
- [ ] Efficient diff generation
- [ ] Timeline query optimization
```

### Week 2: MCP Enhancements
```
Priority: HIGH
- [ ] Add selective restore tools
- [ ] Add visual diff tools
- [ ] Add timeline browsing tools
```

### Week 3: CLI Enhancements
```
Priority: MEDIUM
- [ ] Interactive mode
- [ ] Selective restore command
- [ ] Visual diff command
- [ ] Timeline browser
```

### Week 4: API Development
```
Priority: MEDIUM
- [ ] RESTful API endpoints
- [ ] WebSocket support
- [ ] Authentication
```

### Week 5-6: Website Development
```
Priority: LOW (can be done later)
- [ ] Timeline visualization
- [ ] File browser
- [ ] Diff viewer
- [ ] Conversation view
```

---

## Technical Decisions

### Selective Restore Strategy
```
APPROACH: Git-like checkout
1. Read checkpoint manifest
2. Filter files by pattern
3. Check for conflicts with current state
4. Offer merge strategies
5. Restore selected files atomically

IMPLEMENTATION:
- Use minimatch for glob patterns
- Use three-way merge for conflicts
- Create backup before restore
- Support --force flag to skip conflicts
```

### Diff Algorithm
```
APPROACH: Myers algorithm with optimizations
1. Use Myers O(ND) algorithm for base diff
2. Add patience diff for better results
3. Cache diff results in pack files
4. Use histogram diff for large files

IMPLEMENTATION:
- Port git's xdiff library
- Add diff caching layer
- Support multiple diff formats
```

### Timeline Query
```
APPROACH: In-memory graph with indexes
1. Build checkpoint graph on startup
2. Create indexes: by date, by file, by content
3. Use bloom filters for fast file lookup
4. Cache query results

IMPLEMENTATION:
- Use adjacency list for graph
- Use B-tree for date index
- Use inverted index for content
- Use LRU cache for queries
```

### Website Architecture
```
APPROACH: React + Three.js + WebSocket
1. React for UI components
2. Three.js for 3D timeline
3. WebSocket for real-time updates
4. IndexedDB for client-side caching

IMPLEMENTATION:
- Use Next.js for SSR
- Use React Three Fiber for 3D
- Use Socket.io for WebSocket
- Use Zustand for state management
```

---

## Testing Strategy

### Unit Tests
```
- [ ] Core engine: restore, diff, timeline
- [ ] MCP tools: all tool functions
- [ ] CLI commands: all commands
- [ ] API endpoints: all routes
```

### Integration Tests
```
- [ ] End-to-end restore flow
- [ ] End-to-end diff flow
- [ ] End-to-end timeline flow
- [ ] MCP + Core integration
- [ ] CLI + Core integration
- [ ] API + Core integration
```

### Performance Tests
```
- [ ] Restore 10,000 files
- [ ] Diff 1,000 files
- [ ] Query 1,000 checkpoints
- [ ] Search 100,000 messages
```

---

## Success Criteria

### Functional
- [ ] Can restore specific files from any checkpoint
- [ ] Can view diff between any two checkpoints
- [ ] Can browse timeline with date/file filters
- [ ] Can search conversation and file content
- [ ] Can use via CLI, MCP, API, and Web UI

### Performance
- [ ] Restore 1,000 files in < 2 seconds
- [ ] Generate diff in < 500ms
- [ ] Query timeline in < 100ms
- [ ] Search in < 1 second

### User Experience
- [ ] Intuitive CLI commands
- [ ] Clear error messages
- [ ] Visual feedback for long operations
- [ ] Undo/redo support
- [ ] Help documentation

---

## Dependencies

### Core
- minimatch (glob patterns)
- diff (diff algorithms)
- fast-glob (file scanning)

### CLI
- blessed/ink (TUI)
- chalk (colors)
- ora (spinners)

### API
- express (HTTP server)
- socket.io (WebSocket)
- jsonwebtoken (auth)

### Website
- react (UI)
- next.js (framework)
- three.js (3D)
- react-three-fiber (React + Three.js)
- socket.io-client (WebSocket)
- zustand (state)

---

## Git Internals to Study

### Object Storage
- git/object-file.c - how objects are stored
- git/sha1-file.c - content addressing
- git/pack-objects.c - pack generation

### Tree Walking
- git/tree-walk.c - tree traversal
- git/tree-diff.c - tree comparison
- git/unpack-trees.c - tree unpacking

### Diff Generation
- git/diff.c - diff interface
- git/xdiff/ - diff algorithms
- git/diff-lib.c - diff helpers

### History Walking
- git/revision.c - revision walking
- git/log-tree.c - log display
- git/commit-graph.c - commit graph

### Checkout/Restore
- git/builtin/checkout.c - checkout command
- git/merge-recursive.c - merge logic
- git/unpack-trees.c - tree unpacking

---

## Notes

This plan focuses on the core functionality needed for a true Time Machine experience. The website is lowest priority and can be built after core features are solid. The key is to study git internals deeply to understand how to implement selective restore, efficient diff, and timeline browsing correctly.
