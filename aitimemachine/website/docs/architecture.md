---
sidebar_position: 4
---

# Architecture

## Core Components

- **TimeMachine Class**: Manages snapshots, conversations, and file watching.
- **CLI**: Command-line interface for user interaction.
- **MCP Server**: Protocol server for AI tool integrations.
- **Storage**: File-based persistence in `.aitimemachine/` directory.

## Data Flow

1. User/AI actions trigger logging.
2. Snapshots capture state at key moments.
3. MCP exposes tools for programmatic access.
4. Reverts restore from stored snapshots.

## File Structure

```
.aitimemachine/
├── snapshot-{timestamp}.json    # Individual snapshots
└── conversation.json            # Current conversation log
```