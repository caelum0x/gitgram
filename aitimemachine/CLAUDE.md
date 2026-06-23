# AITimeMachine Integration

This project uses AITimeMachine for automatic backup and restore.

## IMPORTANT: Before making ANY file changes

Call the `before_action` MCP tool with a description of what you're about to do:
```
before_action({ action: "description of changes" })
```

## After completing changes

Call the `after_action` MCP tool:
```
after_action({ action: "description of what was done", success: true })
```

## Available Commands

- `checkpoint` - Create a manual save point
- `list_sessions` - See all saved states
- `restore_session` - Go back to any previous state

This ensures all file changes are tracked and can be rolled back if needed.
