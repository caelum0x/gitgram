# Gitgram TimeMachine - Quick Start Guide

## Installation

```bash
# Install globally
npm install -g @gitgram/timemachine

# Or use locally in your project
npm install @gitgram/timemachine
```

## Basic Usage

### 1. Initialize Your Project

```bash
cd your-project
aitm init
```

This creates a project registration in `~/.aitimemachine/db.sqlite`.

### 2. Create Your First Checkpoint

```bash
aitm checkpoint "Initial state"
```

This captures:
- All files in your project (excluding node_modules, .git, etc.)
- Content stored efficiently using SHA-256 deduplication
- Manifest stored in SQLite database

### 3. Make Some Changes

```bash
# Edit files, add features, etc.
# Then create another checkpoint
aitm checkpoint "Added authentication"
```

### 4. List Your Checkpoints

```bash
aitm list
```

Output:
```
Checkpoints for "your-project":

1. cp_1a2b3c4d5e6f7g8h... - Added authentication
   2025-12-24T10:30:00.000Z [files]

2. cp_9a8b7c6d5e4f3g2h... - Initial state
   2025-12-24T10:15:00.000Z [files]
```

### 5. Restore to a Previous State

```bash
# Show what will change
aitm show cp_9a8b7c6d5e4f3g2h

# Restore (creates backup first)
aitm restore cp_9a8b7c6d5e4f3g2h

# Or use hard mode (deletes files not in checkpoint)
aitm restore cp_9a8b7c6d5e4f3g2h --mode hard
```

### 6. Search Checkpoints

```bash
aitm search "authentication"
```

### 7. Search Knowledge Base (Cloud)

```bash
AITM_API_URL=... AITM_API_KEY=... aitm kb-search "vector index"
```

## AI Tool Integration (MCP)

### Claude Code Setup

Add to `~/.claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "aitimemachine": {
      "command": "aitm",
      "args": ["mcp"]
    }
  }
}
```

### Now Claude Can:

```
User: "Create a checkpoint before I refactor this"
Claude: [Uses tm_checkpoint_create tool]
✓ Checkpoint created: cp_abc123...

User: "Oh that broke things, go back!"
Claude: [Uses tm_checkpoint_restore tool]
✓ Restored to previous state
```

## Storage Location

All data is stored in `~/.aitimemachine/`:

```
~/.aitimemachine/
├── db.sqlite              # Projects, checkpoints, events
└── blobs/                 # Deduplicated file contents
    ├── aa/
    │   └── aab3c4...      # Content-addressable storage
    └── ...
```

Per-project metadata in `.tm_internal/`:

```
your-project/.tm_internal/
├── tmp_restore/           # Temp directory for atomic restore
├── backups/               # Backups created during restore
└── tmp_old/               # Old states (can be cleaned up)
```

## Production Features

### Safety First
- ✅ **Atomic restore** - Never leaves project in partial state
- ✅ **Backup before restore** - Always creates backup
- ✅ **Project locking** - Prevents concurrent operations
- ✅ **Path validation** - Prevents directory traversal attacks

### Performance
- ✅ **Content deduplication** - Only unique content stored
- ✅ **Sharded storage** - Fast lookups with `blobs/aa/bb/aabbcc...`
- ✅ **Incremental scanning** - Only hash changed files (future)

### Docker Capsules (Advanced)

Create deterministic execution environments:

```bash
# This would use Docker capsule tools via MCP
# (Requires Docker installed)
```

MCP tools available:
- `tm_capsule_upsert` - Create capsule with pinned image digest
- `tm_capsule_exec` - Run commands in isolated environment
- `tm_capsule_stop` - Stop capsule

## Common Workflows

### Before Big Refactor

```bash
aitm checkpoint "Before database refactor"
# ... make changes ...
# If it breaks:
aitm restore <checkpoint-id>
```

### Find When Something Broke

```bash
# List recent checkpoints
aitm list

# Search for specific changes
aitm search "database"

# Check details
aitm show <checkpoint-id>

# Restore
aitm restore <checkpoint-id>
```

### Regular Backups

```bash
# Create checkpoints at milestones
aitm checkpoint "Tests passing"
aitm checkpoint "Feature complete"
aitm checkpoint "Ready for review"
```

## MCP Tools Reference

### Checkpoint Management
- `tm_checkpoint_create` - Create new checkpoint
- `tm_checkpoint_list` - List all checkpoints
- `tm_checkpoint_restore` - Restore to checkpoint
- `tm_diff_checkpoints` - Compare two checkpoints

### Search & Discovery
- `tm_search` - Search checkpoints by name
- `tm_stats` - Get storage statistics

### Docker Capsules
- `tm_capsule_upsert` - Create/reuse capsule
- `tm_capsule_exec` - Execute in capsule
- `tm_capsule_stop` - Stop capsule

## Troubleshooting

### "Project not initialized"
```bash
aitm init
```

### "Checkpoint not found"
```bash
# List available checkpoints
aitm list

# Use correct ID (at least first 8 chars)
aitm restore cp_1a2b3c4d
```

### Large project taking too long
The initial checkpoint may take time for large projects. Subsequent checkpoints will be faster with incremental scanning (coming soon).

### Out of disk space
```bash
# Check storage usage
aitm stats

# Remove old checkpoints (manual cleanup for now)
# Future: automatic GC and retention policies
```

## Next Steps

- Read [README.md](README.md) for architecture details
- Check [API.md](API.md) for complete MCP tool reference
- See [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md) for roadmap

## Getting Help

- 🐛 [Report Issues](https://github.com/gitgram-ai/gitgram-ai/issues)
- 💬 [Discussions](https://github.com/gitgram-ai/gitgram-ai/discussions)
- 📖 [Documentation](https://github.com/gitgram-ai/gitgram-ai/wiki)
