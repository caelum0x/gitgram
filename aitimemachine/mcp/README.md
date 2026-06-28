# Gitgram TimeMachine MCP Server

MCP server exposing full Gitgram TimeMachine functionality to AI tools (Claude, Cursor, etc).

## Installation

### From npm (recommended)

```bash
# Zero-install via npx (no global install needed)
npx -y @gitgram/timemachine-mcp

# Or install globally
npm install -g @gitgram/timemachine-mcp
```

### From source (development)

```bash
cd mcp
npm install
npm run build
```

## Usage

### Claude Code

```bash
claude mcp add --transport stdio aitm -- npx -y @gitgram/timemachine-mcp
```

### stdio Transport (Default)

Add to `.mcp.json` in your project root:

```json
{
  "mcpServers": {
    "ai-time-machine": {
      "command": "npx",
      "args": ["-y", "@gitgram/timemachine-mcp"],
      "env": {
        "TM_DATA_DIR": "${HOME}/.aitimemachine-server"
      }
    }
  }
}
```

### Cursor / Windsurf

Add to MCP settings:

```json
{
  "mcpServers": {
    "ai-time-machine": {
      "command": "npx",
      "args": ["-y", "@gitgram/timemachine-mcp"]
    }
  }
}
```

### Claude Desktop

Add to `~/.claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "ai-time-machine": {
      "command": "npx",
      "args": ["-y", "@gitgram/timemachine-mcp"]
    }
  }
}
```

### HTTP (Streamable) Transport

The server selects its transport via flags (`--transport` / `-t`) and port via
`--port` / `-p`. The default transport is `stdio`; the default HTTP port is `3002`.
Only `stdio` and `http` are valid — there is no SSE transport.

```bash
# Streamable HTTP on the default port (3002)
node mcp/dist/index.js --transport http

# Streamable HTTP on a custom port
node mcp/dist/index.js --transport http --port 8080

# Short flags also work
node mcp/dist/index.js -t http -p 8080
```

Configure your MCP client for Streamable HTTP (match the port you started with):

```json
{
  "mcpServers": {
    "ai-time-machine": {
      "type": "http",
      "url": "http://localhost:3002/mcp"
    }
  }
}
```

### A2A JSON-RPC Endpoint

When running with `--transport http`, the MCP server also exposes an A2A-compatible discovery card and JSON-RPC endpoint:

```bash
curl http://127.0.0.1:3002/.well-known/agent-card.json

curl -X POST http://127.0.0.1:3002/a2a \
  -H 'content-type: application/json' \
  --data '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "message/send",
    "params": {
      "message": {
        "kind": "message",
        "messageId": "msg-1",
        "role": "user",
        "parts": [{ "kind": "text", "text": "create a checkpoint" }]
      },
      "metadata": {
        "skillId": "checkpoint",
        "description": "checkpoint before refactor"
      }
    }
  }'
```

Notes:
- canonical request method: `message/send`
- compatibility alias still supported: `tasks/send`
- current A2A scope: agent card discovery plus blocking task-style replies
- unsupported streaming requests return A2A error code `-32004`

### Claude Agent SDK

```typescript
import { query } from "@anthropic-ai/claude-agent-sdk";

for await (const message of query({
  prompt: "Create a checkpoint before refactoring",
  options: {
    mcpServers: {
      "ai-time-machine": {
        command: "node",
        args: ["/path/to/aitimemachine/mcp/dist/index.js"]
      }
    },
    allowedTools: [
      "mcp__ai-time-machine__tm_checkpoint_create",
      "mcp__ai-time-machine__tm_checkpoint_restore",
      "mcp__ai-time-machine__before_action",
      "mcp__ai-time-machine__after_action"
    ]
  }
})) {
  if (message.type === "result") console.log(message.result);
}
```

## MCP Tools (40 total)

### Project Management
| Tool | Description |
|------|-------------|
| `tm_project_init` | Initialize project for time tracking |
| `tm_set_project` | Set current working project |

### Checkpoints
| Tool | Description |
|------|-------------|
| `tm_checkpoint_create` | Create a checkpoint |
| `tm_checkpoint_list` | List all checkpoints |
| `tm_checkpoint_restore` | Restore to checkpoint |
| `tm_checkpoint_preview` | Preview restore changes |

### Event Sourcing
| Tool | Description |
|------|-------------|
| `tm_event_append` | Append event to timeline (chat/fs/terminal) |
| `tm_timeline` | Get timeline of events |

### Diff & Search
| Tool | Description |
|------|-------------|
| `tm_diff` | Diff between checkpoints |
| `tm_diff_checkpoints` | Detailed diff (files + chat + terminal) |
| `tm_search` | Search conversations/checkpoints |
| `tm_find_restore` | Search and find checkpoint to restore |
| `tm_bisect` | Binary search for breaking change |

### Sessions
| Tool | Description |
|------|-------------|
| `tm_session_capture` | Capture current state |
| `tm_session_list` | List captured sessions |

### AI Integration
| Tool | Description |
|------|-------------|
| `before_action` | Call before file changes |
| `after_action` | Call after file changes |
| `tm_log_message` | Log conversation message |

### File Operations
| Tool | Description |
|------|-------------|
| `tm_get_file_at` | Get file at checkpoint |
| `tm_file_history` | Get file history |
| `tm_restore_files` | Partial restore (glob patterns) |

### Environment State
| Tool | Description |
|------|-------------|
| `tm_container_state` | Get Docker state |
| `tm_database_state` | Get database state |
| `tm_git_state` | Get git state |
| `tm_env_state` | Get environment (runtimes, deps) |
| `tm_stats` | Get TimeMachine stats |

### AI Tool Integrations
| Tool | Description |
|------|-------------|
| `tm_gemini_sessions` | List Gemini CLI sessions |
| `tm_aider_sessions` | List Aider sessions |
| `tm_cursor_workspaces` | List Cursor workspaces |
| `tm_claude_projects` | List Claude Code projects |
| `tm_claude_conversations` | Get Claude conversations |

### Capsule (Docker)
| Tool | Description |
|------|-------------|
| `tm_capsule_create` | Create Docker container |
| `tm_capsule_exec` | Execute in container |
| `tm_capsule_stop` | Stop container |

### S3 Backup
| Tool | Description |
|------|-------------|
| `tm_s3_config` | Configure S3 backup |
| `tm_s3_backup` | Backup to S3 |
| `tm_s3_restore` | Restore from S3 |

### Prompts
| Tool | Description |
|------|-------------|
| `tm_prompt_debug_regression` | Generate debug prompt |
| `tm_prompt_write_postmortem` | Generate postmortem prompt |
| `tm_prompt_generate_repro_steps` | Generate repro steps |

## Optional tool groups & external dependencies

Several tool groups are only registered when their backing service is configured
via environment variables, and require that service to be running:

| Tool group | Enable with | External dependency |
|------------|-------------|---------------------|
| Workspace (`ws_*`) | `AITM_API_URL` or `AITM_WORKSPACE_ENABLED=1` | A running **AITM API server** (default `http://localhost:3001`). The `ws_*` tools are HTTP proxies to its `/workspace/*` endpoints. |
| Beads (`beads_*`) | `BEADS_BINARY` or `AITM_BEADS_ENABLED=1` | A running **AITM API server** (default `http://localhost:3001`). The `beads_*` tools are HTTP proxies to its `/beads/*` endpoints. |
| GitNexus (`gn_*`) | `GITNEXUS_URL` or `AITM_GITNEXUS_ENABLED=1` | The bundled GitNexus engine. |
| Context7 docs (`tm_docs_*`) | `CONTEXT7_API_KEY` or `AITM_CONTEXT7_ENABLED=1` | A Context7 API key. |
| PAL (`pal_*`) | `AITM_PAL_ENABLED=1` or `PAL_VENV_DIR` | A Python subprocess / venv. |
| GitHub (`gh_*`) | `GITHUB_TOKEN` | GitHub API. |
| Claude (`claude_*`) | `ANTHROPIC_API_KEY` | Anthropic API. |

> **Note:** Workspace and Beads tools do nothing without a separately-running
> AITM API server. If the server is unreachable, these tools return an
> actionable error naming the configured `AITM_API_URL` and how to start the
> server — rather than a raw `fetch failed`.

## Resources (4)

| Resource | URI | Description |
|----------|-----|-------------|
| Projects | `tm://projects` | List all projects |
| Sessions | `tm://sessions` | List all sessions |
| Checkpoints | `tm://checkpoints` | List checkpoints |
| Conversations | `tm://conversations` | List conversations |

## Test Client

Interactive CLI client for testing the MCP server:

```bash
# Build
cd mcp && npm run build

# Run test client (connects to server automatically)
npm run client

# Or specify a custom server path
node dist/client.js /path/to/server.js
```

### Client Commands

| Command | Description |
|---------|-------------|
| `list` | List all available tools |
| `call <tool> [json]` | Call a tool with optional JSON args |
| `init <path> [name]` | Initialize a project |
| `checkpoint [desc]` | Create a checkpoint |
| `timeline` | Show recent timeline |
| `stats` | Show statistics |
| `quit` | Exit |

### Example Session

```
> list
Available Tools:
────────────────────────────────────────────────────────────────
  tm_project_init
    └─ Initialize or register a project for time tracking...
  tm_checkpoint_create
    └─ Create a checkpoint...
  ...

> init /Users/me/myproject MyProject
{
  "content": [{ "type": "text", "text": "{\"projectPath\":\"/Users/me/myproject\"...}" }]
}

> checkpoint Before refactoring auth
{
  "content": [{ "type": "text", "text": "{\"id\":\"tp_...\"}" }]
}

> call tm_search {"query": "auth"}
{
  "content": [{ "type": "text", "text": "[...]" }]
}

> quit
```

## Programmatic Client Usage

### TypeScript/Node.js

```typescript
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const transport = new StdioClientTransport({
  command: 'node',
  args: ['./mcp/dist/index.js'],
});

const client = new Client({ name: 'my-app', version: '1.0.0' }, { capabilities: {} });
await client.connect(transport);

// List tools
const { tools } = await client.listTools();
console.log('Tools:', tools.map(t => t.name));

// Create checkpoint
const result = await client.callTool({
  name: 'tm_checkpoint_create',
  arguments: { description: 'Before refactor' }
});
console.log(result);

await client.close();
```

### With Claude (Anthropic SDK)

```typescript
import Anthropic from '@anthropic-ai/sdk';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

// Connect to MCP server
const transport = new StdioClientTransport({
  command: 'node',
  args: ['./mcp/dist/index.js'],
});
const mcp = new Client({ name: 'claude-app', version: '1.0.0' }, { capabilities: {} });
await mcp.connect(transport);

// Get tools for Claude
const { tools } = await mcp.listTools();
const claudeTools = tools.map(t => ({
  name: t.name,
  description: t.description,
  input_schema: t.inputSchema,
}));

// Chat with Claude using MCP tools
const anthropic = new Anthropic();
const response = await anthropic.messages.create({
  model: 'claude-sonnet-4-20250514',
  max_tokens: 1000,
  tools: claudeTools,
  messages: [{ role: 'user', content: 'Create a checkpoint before I refactor' }],
});

// Handle tool calls
for (const block of response.content) {
  if (block.type === 'tool_use') {
    const result = await mcp.callTool({ name: block.name, arguments: block.input });
    console.log('Tool result:', result);
  }
}
```
