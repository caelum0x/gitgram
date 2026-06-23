# AI Time Machine - Quick Start Guide

> 🕐 **Like macOS Time Machine, but for AI coding sessions!**

When AI makes a mistake, go back in time and fix it - just like restoring your Mac from a backup.

## 🚀 Quick Commands

### Undo Last Mistake
```bash
# AI broke something? One command to fix:
aitm undo

# Undo last 3 changes:
aitm undo -n 3
```

### Go Back Before a Specific Change
```bash
# "Go back to before the Docker changes"
aitm before "docker" --restore

# Find when API was changed
aitm before "api"
```

### See What Changed
```bash
# Quick summary of recent changes
aitm changes

# Diff a specific file
aitm quick-diff src/api.ts
```

### Find When Things Broke
```bash
# Smart error detection
aitm find-error

# Auto-fix: find error and restore
aitm find-error --restore
```

### Restore Specific Files
```bash
# Restore all TypeScript files
aitm restore-files "*.ts"

# Restore entire src folder
aitm restore-files "src/**"

# Preview without restoring
aitm restore-files "*.ts" --dry-run
```

### Browse Old Checkpoints
```bash
# See all checkpoints
aitm list

# Browse files at a checkpoint
aitm browse abc123

# View old file content
aitm cat src/api.ts abc123
```

---

## 🤖 For AI (MCP Tools)

When integrated with Claude or other AI, these MCP tools are available:

| Tool | Description |
|------|-------------|
| `tm_undo_last` | Quick undo (like Mac's Restore button) |
| `tm_go_back` | Go back to checkpoint by ID, time, or search |
| `tm_before_action` | Find state before specific action |
| `tm_diff_file` | Line-by-line file diff |
| `tm_diff_summary` | Summary of all changes |
| `tm_restore_files` | Restore files by glob pattern |
| `tm_find_error_point` | Smart error detection |
| `tm_show_timeline` | Visual timeline of checkpoints |

### Example AI Conversation

```
User: "Undo the Docker changes, they broke everything"

AI: I'll find and undo the Docker changes.

[Calls tm_before_action with query="docker"]

Found checkpoint before Docker changes:
- Action: "Added Docker config" 
- State before: "Initial API setup" (2 hours ago)

[Calls tm_go_back with checkpointId="..."]

✅ Done! Restored to state before Docker changes:
- 15 files restored
- 3 files removed
- Chat context preserved

What would you like to do now?
```

---

## 🌐 API Endpoints

For programmatic access:

```bash
# Undo last action
curl -X POST http://localhost:3001/api/restore/undo \
  -H "Content-Type: application/json" \
  -d '{"steps": 1}'

# Go back in time
curl -X POST http://localhost:3001/api/restore/to-time \
  -H "Content-Type: application/json" \
  -d '{"minutesAgo": 30}'

# Get change summary
curl http://localhost:3001/api/diff/summary

# Browse checkpoint
curl http://localhost:3001/api/browse/abc123
```

---

## 💡 Pro Tips

1. **Automatic Checkpoints**: Every AI action creates a checkpoint automatically
2. **Safe Mode**: By default, a backup is created before any restore
3. **Pattern Matching**: Use glob patterns like `*.ts`, `src/**/*.js`
4. **Smart Search**: Search checkpoints by description, not just ID

---

## 🔧 Setup

```bash
# Initialize in your project
cd your-project
aitm init

# Create CLAUDE.md (project-local instructions) and optionally register MCP globally
aitm setup

# Optional: also add MCP to your global Claude config (~/.claude.json)
aitm setup --global
```

That's it! Now every AI action is tracked and can be undone.
