---
sidebar_position: 3
---

# Usage

## CLI Commands

### Initialize

```bash
aitm init [projectPath]
```

Initializes AITimeMachine for a project. Creates the `.aitimemachine` directory.

### Log Conversation

```bash
aitm log <role> <message>
```

Logs a conversation entry. Role can be `user` or `assistant`.

Example:
```bash
aitm log user "Create a login form"
aitm log assistant "Here's the React component..."
```

### Create Snapshot

```bash
aitm snapshot [filePath]
```

Creates a timestamped snapshot of the current code state and conversation.

### List Snapshots

```bash
aitm list
```

Displays all snapshots with timestamps and conversation counts.

### Revert to Snapshot

```bash
aitm revert <index>
```

Reverts code and conversation to the specified snapshot index.

### MCP Server

```bash
aitm mcp
```

Runs the MCP server for AI tool integrations.

## MCP Integration

For AI tools supporting MCP:

1. Start the MCP server: `aitm mcp`
2. Configure your AI tool to connect to the MCP endpoint.
3. Use tools like `create_snapshot` before edits and `log_conversation` for memory.

Available MCP Tools:
- `create_snapshot`: `{ filePath?: string }`
- `list_snapshots`: `{}`
- `revert_to_snapshot`: `{ index: number }`
- `log_conversation`: `{ role: "user" | "assistant", message: string }`
- `get_conversation`: `{}`