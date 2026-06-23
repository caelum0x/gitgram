# AITimeMachine API Reference

## TimeMachine Class

### Constructor
```typescript
new TimeMachine(projectPath: string)
```

### Methods

#### `initialize(): Promise<void>`
Initializes the time machine, setting up git repo and loading existing data.

#### `createSnapshot(filePath?: string): Promise<void>`
Creates a timestamped snapshot of the current code state and conversation.

#### `revertToSnapshot(index: number): Promise<void>`
Reverts to the snapshot at the given index, with user confirmation if configured.

#### `getSnapshots(): Snapshot[]`
Returns array of all snapshots.

#### `getSnapshot(index: number): Snapshot | undefined`
Returns a specific snapshot by index.

#### `logConversation(role: 'user' | 'assistant', message: string): void`
Logs a conversation entry.

#### `getCurrentConversation(): ConversationEntry[]`
Returns the current conversation log.

#### `getDiff(fromIndex: number, toIndex?: number): string`
Returns a diff between the snapshot at fromIndex and toIndex (or current state if not specified).

#### `clearConversation(): void`
Clears the conversation log.

#### `startWatching(): void`
Starts file watching for automatic snapshots.

#### `stopWatching(): void`
Stops file watching.

---

## MCP Tools

### Core Snapshot Tools

#### `create_snapshot`
Create a timestamped snapshot of the current code state and conversation.
- **Input**: `{ filePath?: string }`
- **Output**: `"Snapshot created"`

#### `list_snapshots`
List all available snapshots.
- **Input**: `{}`
- **Output**: JSON array of snapshots with index, timestamp, conversationCount

#### `revert_to_snapshot`
Revert to a specific snapshot by index.
- **Input**: `{ index: number }`
- **Output**: Confirmation message

#### `get_diff`
Get diff between snapshots or current state.
- **Input**: `{ fromIndex: number, toIndex?: number }`
- **Output**: Text diff

### Conversation Tools

#### `log_conversation`
Log a conversation entry to persist AI memory.
- **Input**: `{ role: 'user' | 'assistant', message: string }`
- **Output**: Confirmation message

#### `get_conversation`
Get the current conversation log.
- **Input**: `{}`
- **Output**: JSON array of conversation entries

#### `search_history`
Search conversations and code across all snapshots.
- **Input**: `{ query: string, type?: 'all' | 'conversation' | 'code' }`
- **Output**: JSON array of matching snapshots with previews

### Cloud Sync Tools

#### `cloud_sync`
Sync snapshots with cloud storage (push and pull).
- **Input**: `{}`
- **Output**: Sync results (pushed/pulled counts)

#### `cloud_push`
Push local snapshots to cloud.
- **Input**: `{}`
- **Output**: Upload count

#### `cloud_pull`
Pull snapshots from cloud.
- **Input**: `{}`
- **Output**: Download count

#### `cloud_status`
Get cloud sync status and configuration.
- **Input**: `{}`
- **Output**: JSON with configured, endpoint, projectId, lastSync, syncedCount

#### `cloud_configure`
Configure cloud sync endpoint and API key.
- **Input**: `{ endpoint: string, apiKey: string }`
- **Output**: Confirmation with project ID

### Timeline Tools

#### `get_timeline`
Get a formatted timeline of all snapshots.
- **Input**: `{}`
- **Output**: Formatted text timeline

#### `restore_by_description`
Find and restore a snapshot by searching conversation history.
- **Input**: `{ description: string }`
- **Output**: Confirmation of restored snapshot

---

## CLI Commands

### Core Commands
| Command | Description |
|---------|-------------|
| `aitm init <path>` | Initialize project |
| `aitm snapshot [file]` | Create snapshot |
| `aitm list` | List snapshots |
| `aitm revert <index>` | Revert to snapshot |
| `aitm diff <from> [to]` | Show diff |
| `aitm log <role> <msg>` | Log conversation |

### Timeline & Search
| Command | Description |
|---------|-------------|
| `aitm timeline` | Interactive TUI browser |
| `aitm timeline -s` | Simple text timeline |
| `aitm search <query>` | Search all history |
| `aitm search -c <query>` | Search conversations only |
| `aitm search -f <query>` | Search code only |
| `aitm restore <desc>` | Find & restore by description |

### Cloud Sync
| Command | Description |
|---------|-------------|
| `aitm sync` | Sync with cloud |
| `aitm sync-config <url> <key>` | Configure cloud |
| `aitm sync-status` | Show sync status |
| `aitm export <file>` | Export to file |
| `aitm import <file>` | Import from file |

### UI & Integration
| Command | Description |
|---------|-------------|
| `aitm ui` | Start web UI |
| `aitm ui -p <port>` | Web UI on custom port |
| `aitm watch <cmd>` | Monitor AI CLI tool |
| `aitm mcp` | Run MCP server |
| `aitm config` | Show config |
| `aitm set-config <k> <v>` | Update config |

---

## Data Structures

### Snapshot
```typescript
interface Snapshot {
  timestamp: Date;
  codeState: string;
  conversationLog?: ConversationEntry[];
}
```

### ConversationEntry
```typescript
interface ConversationEntry {
  timestamp: Date;
  role: 'user' | 'assistant';
  message: string;
}
```

### SyncConfig
```typescript
interface SyncConfig {
  endpoint?: string;
  apiKey?: string;
  projectId?: string;
  autoSync?: boolean;
}
```

### SearchResult
```typescript
interface SearchResult {
  snapshotIndex: number;
  timestamp: Date;
  matches: SearchMatch[];
}
```

---

## MCP Integration Example

Add to your AI tool's MCP config:

```json
{
  "mcpServers": {
    "aitimemachine": {
      "command": "aitm",
      "args": ["mcp"],
      "cwd": "/path/to/your/project"
    }
  }
}
```

### Transport

AITimeMachine’s MCP server uses **stdio** by default:

```bash
aitm mcp
```

Optional HTTP/SSE transports can be layered for custom clients, but stdio is the supported v1 path.

The AI can then use tools like:
- `create_snapshot` before making changes
- `log_conversation` to persist memory
- `search_history` to recall past discussions
- `cloud_sync` to backup across devices
- `restore_by_description` to time travel
