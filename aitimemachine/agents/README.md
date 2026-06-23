# AITM Agent Cards

This directory contains **A2A agent cards** — machine-readable JSON manifests that describe what an agent can do, how to reach it, and which tools it exposes.

## What is an Agent Card?

An agent card follows the [A2A (Agent-to-Agent) protocol](https://google.github.io/A2A/) specification. It acts as a self-describing capability advertisement: any orchestrator or peer agent can read the card and know exactly what the agent offers without needing out-of-band documentation.

Each card includes:

| Field | Purpose |
|-------|---------|
| `name` | Human-readable agent name |
| `description` | What the agent does and why it exists |
| `version` | Semantic version of the agent card / agent implementation |
| `url` | The endpoint where the agent accepts A2A tasks |
| `capabilities` | Protocol-level feature flags (streaming, push notifications, state history) |
| `skills` | High-level capabilities the agent can perform, each with an `id`, `name`, `description`, and `tags` |
| `mcpTools` | Individual MCP tools the agent exposes, each with a `name` and `description` |

## Agent Cards in this Directory

### `gitgram-agent.json`

The primary Gitgram AI Agent. Covers four skill domains:

- **Checkpoint Management** — create and restore deterministic repo snapshots via AITimeMachine
- **Code Intelligence** — impact analysis, dependency tracing, context retrieval (GitNexus graph)
- **A2A Coordinator** — delegate tasks to peer agents, poll results, discover the agent network
- **Repository Analysis** — serialize repos to LLM-readable text, resolve and query docs

The agent listens at `http://localhost:3001/a2a` in local development.

## How to Use Agent Cards

### Discovery

Any A2A-compatible orchestrator fetches `GET /.well-known/agent.json` (or the URL embedded in the card) to auto-discover capabilities before routing tasks.

### Sending a Task

```json
POST http://localhost:3001/a2a
Content-Type: application/json

{
  "jsonrpc": "2.0",
  "id": "task-001",
  "method": "tasks/send",
  "params": {
    "id": "task-001",
    "message": {
      "role": "user",
      "parts": [{ "text": "Create a checkpoint before the refactor" }]
    }
  }
}
```

### Polling a Task

```json
POST http://localhost:3001/a2a
Content-Type: application/json

{
  "jsonrpc": "2.0",
  "id": "poll-001",
  "method": "tasks/get",
  "params": { "id": "task-001" }
}
```

### Listing Agents (via MCP tool)

Use the `a2a_list_agents` MCP tool to enumerate all registered agents at runtime — no manual card maintenance required.

## Adding a New Agent Card

1. Create `<agent-name>.json` in this directory.
2. Follow the schema used by `gitgram-agent.json`.
3. Register the agent's URL with the A2A discovery service so orchestrators can find it.
4. Document the new card in this README under "Agent Cards in this Directory".

## Schema Reference

The full A2A specification lives at: https://google.github.io/A2A/specification/
