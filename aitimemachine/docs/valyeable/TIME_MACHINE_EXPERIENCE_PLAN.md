# AI Time Machine Experience Plan

> **Goal**: Make AITimeMachine work like macOS Time Machine for AI coding - the AI can go back in time, see what changed, undo mistakes, and restore specific files.

---

## 🎯 The Vision

### 🖥️ Mac Time Machine Experience
> Bilgisayarınıza virüs bulaştı → Time Machine'e git → "2 gün öncesine dön" → Bilgisayar temiz haliyle geri geldi!

### 🤖 AI Time Machine Experience (Our Goal)
> AI kodunuzu bozdu veya yanlış bir yöne gitti → AI Time Machine'e git → "Hata öncesine dön" → Kod VE sohbet temiz haline geri döndü!

---

## 📖 Real-World Scenario

**The Problem:**
1. You're developing a great project with AI
2. AI makes a wrong decision (e.g., starts using Kubernetes instead of Docker)
3. 50 files change, chat gets messy
4. You don't know where to start anymore 😱

**The Solution (AI Time Machine):**
```
You: "Go back to before the Docker changes"

AI: ✅ Found last change containing "Docker" (2 hours ago)
    📁 32 files will be restored
    💬 Chat will reset to that point
    
    Do you confirm? [Yes/No]

You: "Yes"

AI: ✅ Done! 
    - 32 files restored
    - Chat returned to "API design discussion" point
    - What would you like to do now?
```

---

## 📊 Feature Comparison

| Feature | Mac Time Machine | AI Time Machine | Status |
|---------|------------------|-----------------|--------|
| Auto backup | ✅ Every hour | ✅ Every AI action | ✅ Done |
| Timeline view | ✅ Visual timeline | ✅ Checkpoint list | ✅ Done |
| One-click restore | ✅ "Restore" button | ✅ `tm undo` / `tm_undo_last` | ✅ Done |
| Selective restore | ✅ Pick single file | ✅ `tm_restore_file` / `tm_restore_files` | ✅ Done |
| "Before error" finder | ❌ Manual | ✅ `tm_find_error_point` / `tm before` | ✅ Done |
| Chat restore | ❌ N/A | ✅ Full conversation restore | ✅ Done |
| Visual diff | ✅ Side-by-side | ✅ `tm_diff_file` / `tm_diff_summary` | ✅ Done |
| Pattern restore | ❌ N/A | ✅ Glob patterns (`*.ts`, `src/**`) | ✅ Done |

---

## Core Features

### 1. 🕐 Go Back in Time (Restore Files + Chat Context)

**What it does**: AI made a mistake? Go back to the exact moment before it happened.

**How it works**:
- Every AI action creates an automatic checkpoint
- Checkpoints include: files, chat context, tool calls, timestamps
- AI can say "go back 5 minutes" or "go back to before the Docker changes"

**MCP Tools**:
| Tool | Purpose |
|------|---------|
| `tm_go_back` | Restore to a checkpoint (by ID, time, or search) |
| `tm_undo_last` | Undo the last AI action (quick revert) |
| `tm_show_timeline` | Show all checkpoints with timestamps |

**CLI Commands**:
```bash
tm back                      # Go back to previous checkpoint
tm back 5m                   # Go back 5 minutes
tm back "before refactor"    # Search and go back
tm undo                      # Undo last action
```

**API Endpoints**:
```
POST /api/restore/to-time     # Restore to specific time
POST /api/restore/undo        # Undo last action
GET  /api/timeline            # Get checkpoint timeline
```

---

### 2. 🔍 See What Changed (Visual Diff)

**What it does**: Show exactly what changed between any two points in time.

**How it works**:
- Compare any two checkpoints or checkpoint vs current state
- File-level: added, modified, deleted files
- Line-level: actual code diff with context
- Supports multiple diff algorithms (Myers, Patience, Histogram)

**MCP Tools**:
| Tool | Purpose |
|------|---------|
| `tm_what_changed` | Show files added/modified/deleted |
| `tm_diff_file` | Show line-by-line diff for a file |
| `tm_diff_summary` | Quick summary of all changes |

**CLI Commands**:
```bash
tm diff                      # What changed since last checkpoint
tm diff HEAD~1               # Changes from previous checkpoint
tm diff abc123 def456        # Compare two checkpoints
tm diff --file src/api.ts    # Diff specific file
tm changes                   # Summary of recent changes
```

**API Endpoints**:
```
GET  /api/diff/:from/:to     # Compare two checkpoints
GET  /api/diff/current       # Changes since last checkpoint
GET  /api/changes            # Summary of recent changes
```

---

### 3. ⏪ Go Back to Exact Time Before AI Error

**What it does**: When AI makes a mistake in chat, go back to the exact state before that message/action.

**How it works**:
- Track every AI message and tool call with timestamps
- Link file changes to specific chat messages
- Find the checkpoint right before an error
- Restore both files AND provide chat context

**MCP Tools**:
| Tool | Purpose |
|------|---------|
| `tm_before_message` | Get state before a specific message |
| `tm_before_action` | Get state before a specific tool call |
| `tm_find_error_point` | Find when things went wrong |
| `tm_restore_before` | Restore to state before specific action |

**CLI Commands**:
```bash
tm before-action "create_file"    # State before last create_file
tm before-error                   # Find and restore before error
tm when "api.ts was created"      # Find when something happened
tm blame src/api.ts               # Who/when changed each line
```

**API Endpoints**:
```
GET  /api/before/action/:id       # State before specific action
GET  /api/before/message/:id      # State before specific message
POST /api/restore/before-error    # Smart restore before error
GET  /api/blame/:file             # Blame info for file
```

---

### 4. 📄 Restore Specific Files (Selective Restore)

**What it does**: Don't restore everything - just pick the files you want.

**How it works**:
- Browse files at any checkpoint
- Preview file content before restoring
- Restore single files or patterns (*.ts, src/**)
- Support merge strategies for conflicts

**MCP Tools**:
| Tool | Purpose |
|------|---------|
| `tm_restore_file` | Restore single file from checkpoint |
| `tm_restore_files` | Restore multiple files by pattern |
| `tm_browse_checkpoint` | Browse files at a checkpoint |
| `tm_preview_file` | Preview file content at checkpoint |

**CLI Commands**:
```bash
tm restore-file src/api.ts --from abc123
tm restore-files "src/**/*.ts" --from HEAD~2
tm browse abc123                  # Browse checkpoint
tm cat abc123:src/api.ts          # View file at checkpoint
tm restore --interactive          # Interactive file picker
```

**API Endpoints**:
```
POST /api/restore/file            # Restore single file
POST /api/restore/files           # Restore multiple files
GET  /api/browse/:checkpoint      # Browse checkpoint files
GET  /api/file/:checkpoint/:path  # Get file content
```

---

## Implementation Plan

### Phase 1: Core Time Travel (MCP + CLI)
**Priority: HIGH | Time: 2-3 days**

1. **Enhance `tm_go_back`**
   - Add "minutesAgo", "hoursAgo" parameters ✅ (exists)
   - Add "beforeAction" parameter to find checkpoint before specific action
   - Return chat context along with file restore
   - Create backup before restore

2. **Add `tm_undo_last`**
   - Find most recent checkpoint
   - Restore to it
   - Provide context about what was undone

3. **Enhance Timeline**
   - Include chat messages in timeline
   - Show which files changed at each point
   - Link checkpoints to AI actions

### Phase 2: Smart Diff System (MCP + CLI + API)
**Priority: HIGH | Time: 2-3 days**

1. **File-level Diff**
   - `tm_what_changed` - already exists ✅
   - Add file pattern filtering
   - Show size changes

2. **Line-level Diff**
   - `tm_diff_file` - use existing diff engine
   - Multiple algorithms (Myers, Patience, Histogram)
   - Context lines, unified format

3. **Diff Summary**
   - Quick stats: X files added, Y modified, Z deleted
   - Total lines changed
   - Most changed files

### Phase 3: Error Recovery (MCP + CLI + API)
**Priority: MEDIUM | Time: 2-3 days**

1. **Link Actions to Checkpoints**
   - Store action ID in checkpoint metadata
   - Index by action type (create_file, edit_file, etc.)

2. **Before-Action Restore**
   - Find checkpoint immediately before action
   - Restore with full context

3. **Smart Error Detection**
   - Look for error patterns in events
   - Find last "good" state
   - Suggest restore point

### Phase 4: Selective Restore (MCP + CLI + API)
**Priority: MEDIUM | Time: 2-3 days**

1. **Single File Restore**
   - `tm_restore_file` - already exists ✅
   - Add preview mode
   - Merge strategies (ours, theirs, merge)

2. **Pattern-based Restore**
   - Glob patterns (*.ts, src/**)
   - Interactive selection
   - Dry-run mode

3. **Browse & Preview**
   - `tm_browse_checkpoint` - already exists ✅
   - Tree view of files
   - Quick preview of file content

---

## MCP Tool Summary

### Existing Tools (Enhance)
| Tool | Status | Enhancement Needed |
|------|--------|-------------------|
| `tm_go_back` | ✅ Exists | Add beforeAction, return chat context |
| `tm_what_changed` | ✅ Exists | Add file patterns, size info |
| `tm_restore_file` | ✅ Exists | Add preview, merge strategies |
| `tm_browse_checkpoint` | ✅ Exists | Add tree view, content preview |
| `tm_show_timeline` | ✅ Exists | Include chat, link to actions |

### New Tools to Add
| Tool | Priority | Description |
|------|----------|-------------|
| `tm_undo_last` | HIGH | Quick undo last AI action |
| `tm_diff_file` | HIGH | Line-by-line diff for single file |
| `tm_diff_summary` | MEDIUM | Quick summary of all changes |
| `tm_before_action` | MEDIUM | State before specific action |
| `tm_restore_files` | MEDIUM | Pattern-based multi-file restore |
| `tm_find_error_point` | LOW | Smart error detection |

---

## CLI Command Summary

### Existing Commands (Enhance)
```bash
tm restore <checkpoint>     # Full restore
tm diff                     # Basic diff
tm timeline                 # Show checkpoints
```

### New Commands to Add
```bash
# Time Travel
tm back [time|query]        # Go back in time
tm undo                     # Undo last action
tm before <action>          # State before action

# Diff
tm changes                  # Change summary
tm diff-file <file>         # File-level diff

# Selective Restore
tm restore-file <file>      # Single file restore
tm restore-files <pattern>  # Multi-file restore
tm browse <checkpoint>      # Browse checkpoint
tm cat <checkpoint:file>    # View file at checkpoint
```

---

## API Endpoint Summary

### Existing Endpoints (Enhance)
```
POST /api/restore           # Full restore
GET  /api/diff/:from/:to    # Compare checkpoints
GET  /api/timeline          # Get timeline
```

### New Endpoints to Add
```
# Time Travel
POST /api/restore/undo             # Undo last action
POST /api/restore/to-time          # Restore to specific time
GET  /api/before/action/:type      # State before action

# Diff
GET  /api/diff/summary             # Change summary
GET  /api/diff/file/:from/:to/:path # Single file diff

# Selective Restore
POST /api/restore/file             # Single file restore
POST /api/restore/files            # Multi-file restore
GET  /api/browse/:checkpoint       # Browse files
GET  /api/browse/:checkpoint/:path # Get file content
```

---

## 🚀 Critical Features to Complete (Priority Order)

### 1. `tm_undo_last` - One-Click Undo (Like Mac's Restore Button)
**Priority: HIGHEST**

Single command to undo the last AI mistake - just like clicking "Restore" in Mac Time Machine.

```bash
tm undo
# → Instantly restores to the state before the last AI action
```

### 2. Chat Context Restoration
**Priority: HIGH**

Not just files - restore the AI's "memory" too. When you go back, the AI should:
- Know what it was working on at that point
- Remember the conversation context
- Continue from where it left off

### 3. Smart Error Detection
**Priority: HIGH**

Automatically find "when things went wrong":
- Detect error patterns in code
- Find the last "good" state
- Suggest the right restore point

---

## Success Criteria

1. **AI can undo mistakes**: "Go back 5 minutes" works instantly
2. **AI knows what changed**: Clear diff output with context
3. **AI can find error points**: "Before the Docker changes" finds right checkpoint
4. **AI can restore selectively**: "Just restore src/api.ts" works
5. **Everything is fast**: < 100ms for most operations
6. **Chat context preserved**: Restore includes conversation state

---

## Next Steps

1. [x] **Phase 1**: Enhance `tm_go_back` and add `tm_undo_last` ✅
2. [x] **Phase 2**: Implement `tm_diff_file` and `tm_diff_summary` ✅
3. [x] **Phase 3**: Add `tm_before_action` and action linking ✅
4. [x] **Phase 4**: Pattern-based restore with `tm_restore_files` ✅
5. [x] Update CLI commands ✅
6. [x] Update API endpoints ✅
7. [ ] Update documentation
8. [ ] Add tests for new features
9. [ ] Create demo/tutorial

---

## Files to Modify

### MCP Server
- `src/mcp/server.ts` - Add new tools, enhance existing
- `src/mcp/schemas.ts` - Add new schemas

### Core Logic
- `src/core/engine.ts` - Enhance restore, add undo
- `src/core/diff-engine-v2.ts` - File-level diff
- `src/core/selective-restore.ts` - Pattern restore

### CLI
- `src/cli-v2.ts` - Add new commands
- `src/cli/time-machine-commands.ts` - New file for TM commands

### API
- `src/api-server.ts` - Add new endpoints

### Cloud (Neon)
- `src/cloud/hybrid-store.ts` - Sync checkpoint metadata
- `src/mcp/cloud-mcp-handler.ts` - Cloud-enhanced time travel
