---
sidebar_position: 1
---

# Welcome to AITimeMachine

AITimeMachine is an open-source infrastructure tool that provides a "Time Machine" for AI coding assistants. It allows users to create timestamped snapshots of code and conversations, enabling easy reversion to past states and preventing data loss from AI memory resets.

## Key Features

- **Timestamped Snapshots**: Capture exact code states with timestamps.
- **Conversation Memory**: Persistent logging of AI interactions across sessions.
- **User Confirmation Gates**: Optional prompts before AI modifications.
- **Time Travel**: Browse and revert to any historical snapshot.
- **MCP Protocol Support**: Seamless integration with AI tools via Model Context Protocol.
- **Cross-Platform**: Works on Windows, Mac, and Linux.

## Quick Start

### Installation

```bash
npm install -g aitimemachine
```

### Basic Usage

1. Initialize in your project:
   ```bash
   aitm init .
   ```

2. Log conversations:
   ```bash
   aitm log user "Build a React component"
   aitm log assistant "Here's the code..."
   ```

3. Create snapshots:
   ```bash
   aitm snapshot
   ```

4. View history:
   ```bash
   aitm list
   ```

5. Revert if needed:
   ```bash
   aitm revert 0
   ```

## For AI Tool Integrators

Run the MCP server for AI assistants:
```bash
aitm mcp
```

This exposes tools for automatic snapshotting and conversation logging.
