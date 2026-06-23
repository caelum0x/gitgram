# AITimeMachine Development Guide

## For AI Contributors and Developers

This guide provides detailed context for understanding, extending, and contributing to AITimeMachine. The project is in early stages with much coding required. It aims to solve AI coding tool issues like memory loss and unasked changes through time travel and memory persistence.

### Project Context Recap
- **Problem**: AI tools modify code unexpectedly, lose conversation context, lack revert mechanisms.
- **Solution**: Time machine for code/conversations with MCP integration for AI tools.
- **Scope**: Infra-focused, cross-platform, open-source. Future: cloud sync, UI, enterprise features.
- **Status**: Core implemented; needs testing, features, optimizations.

### Core Concepts

#### Time Travel Mechanism
- **Snapshots**: Immutable captures of project state at a point in time.
- **Conversations**: Logged AI/user interactions with timestamps.
- **Reverts**: Restoration to previous snapshots, including code and memory.
- **Confirmation**: User gates to prevent unintended AI actions.

#### MCP Integration
- **Protocol**: Model Context Protocol for AI tool communication.
- **Tools**: Exposed functions (create_snapshot, revert, etc.) for AI to call.
- **Server**: Express-based server handling MCP requests over stdio/HTTP.

#### Git Integration
- **Purpose**: Provide git-based versioning for snapshots.
- **Implementation**: Uses isomorphic-git for commits on snapshot creation.
- **Fallback**: File-based storage if git fails.

### Code Structure

#### `src/index.ts` - Core Library
- `TimeMachine` class: Main API.
- Methods: `initialize()`, `createSnapshot()`, `revertToSnapshot()`, `logConversation()`.
- Handles file watching, snapshot persistence, conversation memory.

#### `src/cli.ts` - Command Line Interface
- Uses Commander.js for commands (init, snapshot, list, revert, log, mcp).
- Entry point for users.

#### `src/mcp-server.ts` - MCP Server
- Implements MCP with tools for AI integration.
- Handles requests like creating snapshots or logging conversations.

#### `src/server.ts` - REST Server
- Basic Express server for testing; may be expanded.

#### `website/` - Documentation
- Docusaurus site with guides, API docs.

### Key Files and Directories
- `.aitimemachine/`: Stores snapshots and conversations.
- `lib/`: Compiled output.
- `test/`: Unit tests (expand needed).
- `tsconfig.json`: TypeScript config for ESM.

### Development Workflow
1. **Setup**: `npm install`, `npm run build`.
2. **Code**: Edit `src/`, build with `npm run build`.
3. **Test**: `npm test` (fix ESM issues).
4. **Run**: `node lib/cli.js <command>`.
5. **Lint**: `npm run lint`.

### Universal Search Evaluation
Use the golden-set eval harness to measure MRR/Recall@K against your current data.

From `api-server/`:
- `EVAL_API_KEY=... EVAL_BASE_URL=http://localhost:3001/v1 npm run eval:universal-search`
- Fixture path: `tests/fixtures/universal-search-eval.json`

Adjust the fixture to match your datasets and expected targets.

Optional outputs:
- `EVAL_OUTPUT_JSON=eval.json` writes a JSON summary for dashboards
- `EVAL_OUTPUT_CSV=eval.csv` writes per-case CSV rows
- `EVAL_K=1,3,5,10` custom K values

CI thresholds (non-zero exit on failure):
- `EVAL_MIN_MRR=0.35`
- `EVAL_MIN_RECALL=0.60` (uses the first K in `EVAL_K`)
- `EVAL_MIN_WEIGHTED_MRR=0.40`
- `EVAL_MIN_WEIGHTED_RECALL=0.65`

### Detailed Implementation Notes
- **ESM Handling**: Package uses "type": "module"; imports must include .js extensions.
- **File Watching**: Chokidar monitors changes; triggers snapshots.
- **Persistence**: JSON files in .aitimemachine/; conversations in conversation.json.
- **Git Commits**: On snapshot; uses isomorphic-git for portability.
- **MCP Tools**: JSON-RPC over stdio; tools call TimeMachine methods.
- **Error Handling**: Try-catch with console.warn; graceful degradation.

### Outstanding Tasks (Much Coding Needed)
- **Testing**: Comprehensive Jest suite for all methods (fix ESM in Jest config).
- **Performance**: Optimize for large projects (selective watching, efficient diffs).
- **Features**:
  - Diff visualization (use diff library for colored diffs).
  - Cloud sync (add optional server for upload/download).
  - Advanced confirmations (UI prompts, auto-approve rules).
- **Integrations**:
  - More MCP tools (e.g., analyze_reverts).
  - AI tool partnerships (PRs to repos).
- **Docs**: API references (see API.md), tutorials, examples.
- **Security**: Encrypt sensitive data, audit logs.
- **UI**: Enhance website, add simple web UI for browsing.
- **Deployment**: CI/CD (GitHub Actions), npm publish, website hosting (Netlify).
- **Bug Fixes**: Handle edge cases (no git, permissions, large files).

### Best Practices
- **Error Handling**: Always catch and log errors (e.g., git failures).
- **Cross-Platform**: Use Node.js APIs; test on Windows/Mac/Linux.
- **Modularity**: Keep features in separate modules.
- **Documentation**: Comment code; update docs for changes.
- **Commits**: Use conventional commits; run tests before PR.

### Examples
#### Adding a New MCP Tool
1. Edit `src/mcp-server.ts` to add tool in `ListToolsRequestSchema`.
2. Implement handler in `CallToolRequestSchema`.
3. Update API.md.

#### Extending CLI
1. Add command in `src/cli.ts`.
2. Call TimeMachine method.
3. Update README usage.

### Contact
For questions, open issues or PRs on GitHub. See ROADMAP.md for priorities.
