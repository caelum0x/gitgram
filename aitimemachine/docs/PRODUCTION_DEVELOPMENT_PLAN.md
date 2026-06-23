# AITimeMachine Production Development Plan

> **Status: 95% Complete** - All core phases implemented. Only polish and optional features remain.

## Current Status (Updated: January 2026)

| Component    | Status | Key Files                                                        |
|--------------|--------|------------------------------------------------------------------|
| MCP Server   | ✅ 100% | 76+ tools in src/mcp/server.ts                                  |
| API Server   | ✅ 100% | 35+ files in api-server/src/ with auth, rate limiting, SSO     |
| CLI v2       | ✅ 100% | 104+ commands in src/cli-v2.ts (now default entry point)        |
| Extension    | ✅ 90%  | MCPClient, Timeline, CodeLens, ErrorDetection all complete      |
| Database     | ✅ 100% | savedContexts, repositories, codeEmbeddings tables complete     |

## 5-Phase Production Plan Summary

### Phase 1: MCP Server (Week 1-2) ✅ COMPLETE

- ✅ Add tm_restore_with_context - restore files + conversation
- ✅ Add tm_find_when_broke - smart error detection
- ✅ Enhance tm_go_back with natural language ("30 minutes ago", "before docker")
- ✅ Implement MCP Resources for browseable data

### Phase 2: API Server (Week 2-3) ✅ COMPLETE

- ✅ OpenAI-style error format (error.type, error.code, error.message)
- ✅ Complete repositories.ts, search.ts, contexts.ts routes
- ✅ Verify rate limiting/quotas working
- ✅ SSO/SAML routes for enterprise
- ✅ Shared checkpoints for teams

### Phase 3: CLI Unification (Week 3-4) ✅ COMPLETE

- ✅ Switch entry point from v1 (36 cmds) to v2 (104+ cmds) - package.json updated
- ✅ Add aitm goto "before docker" natural language
- ✅ Add aitm fix smart error recovery
- ✅ Add aitm when-broken/bisect timeline analysis

### Phase 4: Extension (Week 4-5) ✅ COMPLETE

- ✅ Real MCP integration via MCPClient service
- ✅ Function-level change tracking in CodeLensProvider
- ✅ Timeline graph view in TimelineGraphProvider
- ✅ Error detection provider

### Phase 5: Augmented Layer (Week 5-6) ✅ COMPLETE

- ✅ Database schema for repositories, code symbols, savedContexts
- ✅ Code indexing service with embeddings (api-server/src/services/indexing.ts)
- ✅ Semantic search across code/conversations                                                                                                                
                                                                 
                                                                 
## Current State Summary

| Component | Status | Files | Key Metrics |
|-----------|--------|-------|-------------|
| **MCP Server** | ✅ 100% | `src/mcp/server.ts` (6,500+ lines) | 76+ tools, works with Claude/Cursor |
| **API Server** | ✅ 100% | `api-server/src/` (35+ files) | Auth, rate limiting, SSO, billing |
| **CLI v2** | ✅ 100% | `src/cli-v2.ts` (4,600+ lines) | 104+ commands, default entry point |
| **Extension** | ✅ 90% | `extensions/vscode/` | MCPClient, Timeline, CodeLens, ErrorDetection |
| **Database** | ✅ 100% | `api-server/src/db/schema.ts` | savedContexts, codeEmbeddings, repositories |

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        AITimeMachine Product Suite                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────────┐ │
│  │   MCP Server    │  │   API Server    │  │        CLI                  │ │
│  │   76 tools      │  │   v1 REST API   │  │   v1: 36 | v2: 101 cmds    │ │
│  │   Claude/Cursor │  │   OpenAI-style  │  │   Natural language         │ │
│  └────────┬────────┘  └────────┬────────┘  └─────────────┬───────────────┘ │
│           │                    │                          │                 │
│           └────────────────────┼──────────────────────────┘                 │
│                                │                                            │
│                    ┌───────────▼───────────┐                               │
│                    │     Core Engine       │                               │
│                    │  TimeMachineEngine    │                               │
│                    │  CAS + Blobs + Diffs  │                               │
│                    └───────────┬───────────┘                               │
│                                │                                            │
│           ┌────────────────────┼────────────────────┐                      │
│           ▼                    ▼                    ▼                      │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐            │
│  │  Local SQLite   │  │   Neon Cloud    │  │   S3 Backup     │            │
│  │  .aitimemachine │  │   PostgreSQL    │  │   Long-term     │            │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘            │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## PHASE 1: MCP Server Production Polish

**Priority: HIGH | Timeline: Week 1-2**

### 1.1 Working Tools (Keep & Test)
```
Core Checkpoint (11): tm_checkpoint_create, tm_checkpoint_list, tm_checkpoint_restore,
                      tm_diff, tm_search, tm_stats, tm_get_file_at, tm_file_history,
                      tm_timeline, tm_project_init, tm_set_project

Time Machine UX (15): tm_go_back, tm_show_timeline, tm_what_changed, tm_restore_file,
                      tm_browse_checkpoint, tm_undo_last, tm_diff_file, tm_diff_summary,
                      tm_before_message, tm_restore_before, tm_before_action,
                      tm_restore_files, tm_find_error_point, tm_conversation_context,
                      tm_conversation_history

Git-Inspired (14):    tm_stash, tm_blame, tm_reflog, tm_log, tm_tag, tm_cherry_pick,
                      tm_reset, tm_clean, tm_revert, tm_shortlog, tm_diff_advanced,
                      tm_merge_file, tm_repack

AI Integration (4):   ai_realize_concepts, ai_realize_time, ai_suggest_focus,
                      ai_analyze_transitions

Production (5):       tm_gc_run, tm_integrity_check, tm_capsule_upsert, tm_capsule_exec
```

### 1.2 Enhancement Tasks

#### Task 1.2.1: Complete Context-Aware Restore
**File:** `src/mcp/server.ts`

```typescript
// Add these tools to the switch statement:

case 'tm_restore_with_context':
  // Restore files + return conversation context for AI to continue
  const checkpoint = await engine.getCheckpoint(args.checkpointId);
  await engine.restore(args.checkpointId);
  const conversation = await conversationStore.getMessagesAt(args.checkpointId);
  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        restored: true,
        files: checkpoint.files.length,
        conversation: {
          messages: conversation,
          lastMessage: conversation[conversation.length - 1],
          sessionId: checkpoint.sessionId
        },
        resumePrompt: `Continuing from checkpoint ${args.checkpointId}. Last context: ${conversation[conversation.length - 1]?.content?.slice(0, 200)}`
      })
    }]
  };

case 'tm_get_conversation_at':
  // Get exact conversation state at a checkpoint
  const messages = await conversationStore.getMessagesUntil(args.checkpointId);
  return { content: [{ type: 'text', text: JSON.stringify(messages) }] };
```

#### Task 1.2.2: Natural Language Time Queries
**File:** `src/mcp/server.ts`

```typescript
// Enhance tm_go_back with natural language parsing
case 'tm_go_back':
  const query = args.query; // "30 minutes ago", "before docker", "when tests passed"

  // Parse natural language
  let targetCheckpoint;
  if (query.match(/(\d+)\s*(minutes?|hours?|days?)\s*ago/i)) {
    const [_, amount, unit] = query.match(/(\d+)\s*(minutes?|hours?|days?)/i);
    const duration = parseDuration(amount, unit);
    targetCheckpoint = await engine.findCheckpointByTime(Date.now() - duration);
  } else if (query.match(/before\s+(.+)/i)) {
    const [_, term] = query.match(/before\s+(.+)/i);
    targetCheckpoint = await engine.searchCheckpoints(term, { limit: 1 })[0];
    // Get checkpoint BEFORE the matching one
    targetCheckpoint = await engine.getPreviousCheckpoint(targetCheckpoint.id);
  } else if (query.includes('test') && query.includes('pass')) {
    targetCheckpoint = await engine.findLastGreenCheckpoint();
  }

  return await engine.restore(targetCheckpoint.id);
```

#### Task 1.2.3: Smart Error Detection
**File:** `src/mcp/server.ts`

```typescript
case 'tm_find_when_broke':
  // Analyze error patterns across checkpoints
  const currentErrors = args.errors; // Array of error messages/stack traces
  const checkpoints = await engine.listCheckpoints({ limit: 50 });

  const analysis = [];
  for (const cp of checkpoints) {
    const files = await engine.getFilesAt(cp.id);
    const relevantChanges = cp.changes.filter(change =>
      currentErrors.some(err => err.includes(change.path))
    );

    if (relevantChanges.length > 0) {
      analysis.push({
        checkpointId: cp.id,
        timestamp: cp.timestamp,
        description: cp.description,
        suspectChanges: relevantChanges,
        confidence: calculateConfidence(currentErrors, relevantChanges)
      });
    }
  }

  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        likelyBreakingPoint: analysis[0],
        alternatives: analysis.slice(1, 3),
        suggestion: `Error likely introduced in ${analysis[0]?.description}. Try: tm_restore ${analysis[0]?.checkpointId}`
      })
    }]
  };
```

### 1.3 MCP Resources Implementation
**File:** `src/mcp/server.ts`

```typescript
// Add to ListResourcesRequestSchema handler:
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  const projects = await projectStore.list();

  return {
    resources: [
      {
        uri: 'tm://projects',
        name: 'All Projects',
        mimeType: 'application/json'
      },
      ...projects.flatMap(p => [
        {
          uri: `tm://projects/${p.id}`,
          name: p.name,
          mimeType: 'application/json'
        },
        {
          uri: `tm://projects/${p.id}/checkpoints`,
          name: `${p.name} Checkpoints`,
          mimeType: 'application/json'
        },
        {
          uri: `tm://projects/${p.id}/timeline`,
          name: `${p.name} Timeline`,
          mimeType: 'application/json'
        }
      ])
    ]
  };
});

// Add to ReadResourceRequestSchema handler:
server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const uri = new URL(request.params.uri);
  const [, resource, id, subResource] = uri.pathname.split('/');

  switch (resource) {
    case 'projects':
      if (!id) return { contents: [{ text: JSON.stringify(await projectStore.list()) }] };
      if (!subResource) return { contents: [{ text: JSON.stringify(await projectStore.get(id)) }] };
      if (subResource === 'checkpoints') {
        return { contents: [{ text: JSON.stringify(await engine.listCheckpoints({ projectId: id })) }] };
      }
      break;
  }
});
```

---

## PHASE 2: API Server Production Hardening

**Priority: HIGH | Timeline: Week 2-3**

### 2.1 Existing Routes (Already Built)
```
api-server/src/routes/
├── auth.ts           ✅ API key auth
├── keys.ts           ✅ Key management
├── sessions.ts       ✅ Session management
├── sync.ts           ✅ Project/checkpoint sync
├── restore.ts        ✅ Restore operations
├── dashboard.ts      ✅ Dashboard data
├── billing.ts        ✅ Polar.sh integration
├── audit.ts          ✅ Audit logging
├── organizations.ts  ✅ Org management
├── orgMembers.ts     ✅ Member management
├── webhooks.ts       ✅ Webhook registration
├── health.ts         ✅ Health checks
├── repositories.ts   🟡 Needs implementation
├── search.ts         🟡 Needs implementation
├── contexts.ts       🟡 Needs implementation
├── research.ts       🟡 Needs implementation
```

### 2.2 Existing Middleware (Already Built)
```
api-server/src/middleware/
├── auth.ts              ✅ apiKeyAuth, sessionAuth, combinedAuth
├── scopeCheck.ts        ✅ read/write/admin scopes
├── orgAuth.ts           ✅ owner/admin/member roles
├── rateLimit.ts         ✅ Per-plan rate limiting
├── quotaCheck.ts        ✅ Storage quotas
├── subscriptionGuard.ts ✅ Plan-based features
├── auditMiddleware.ts   ✅ Automatic audit logging
├── errors.ts            🟡 Needs OpenAI-style format
```

### 2.3 Enhancement Tasks

#### Task 2.3.1: OpenAI-Style Error Format
**File:** `api-server/src/middleware/errors.ts`

```typescript
// Standardize error responses
export const errorTypes = {
  INVALID_REQUEST: 'invalid_request_error',
  AUTHENTICATION: 'authentication_error',
  PERMISSION_DENIED: 'permission_denied',
  NOT_FOUND: 'not_found',
  RATE_LIMIT: 'rate_limit_exceeded',
  QUOTA_EXCEEDED: 'quota_exceeded',
  SERVER_ERROR: 'server_error'
} as const;

export class APIError extends Error {
  constructor(
    public type: keyof typeof errorTypes,
    public code: string,
    message: string,
    public param?: string,
    public status: number = 400
  ) {
    super(message);
  }

  toJSON() {
    return {
      error: {
        type: errorTypes[this.type],
        code: this.code,
        message: this.message,
        param: this.param
      }
    };
  }
}

// Global error handler
export const errorHandler = (err: Error, req: Request, res: Response, next: NextFunction) => {
  if (err instanceof APIError) {
    return res.status(err.status).json(err.toJSON());
  }

  // Log unexpected errors
  logger.error('Unexpected error', { error: err, requestId: req.id });

  return res.status(500).json({
    error: {
      type: 'server_error',
      code: 'internal_error',
      message: 'An unexpected error occurred'
    }
  });
};
```

#### Task 2.3.2: Implement Repositories Route
**File:** `api-server/src/routes/repositories.ts`

```typescript
import { Router } from 'express';
import { apiKeyAuth } from '../middleware/auth';
import { scopeCheck } from '../middleware/scopeCheck';
import { rateLimit } from '../middleware/rateLimit';

const router = Router();

// List repositories
router.get('/', apiKeyAuth, scopeCheck('read'), async (req, res) => {
  const repos = await db.query.repositories.findMany({
    where: eq(repositories.userId, req.user.id)
  });
  res.json({ repositories: repos });
});

// Index a repository
router.post('/', apiKeyAuth, scopeCheck('write'), rateLimit('strict'), async (req, res) => {
  const { url, branch = 'main' } = req.body;

  const repo = await db.insert(repositories).values({
    id: generateId('repo'),
    userId: req.user.id,
    url,
    branch,
    status: 'indexing',
    createdAt: new Date()
  }).returning();

  // Queue indexing job
  await indexingQueue.add('index-repo', { repoId: repo[0].id });

  res.status(201).json({ repository: repo[0] });
});

// Get repository status
router.get('/:id', apiKeyAuth, scopeCheck('read'), async (req, res) => {
  const repo = await db.query.repositories.findFirst({
    where: and(
      eq(repositories.id, req.params.id),
      eq(repositories.userId, req.user.id)
    )
  });

  if (!repo) throw new APIError('NOT_FOUND', 'repository_not_found', 'Repository not found');

  res.json({ repository: repo });
});

// Get repository tree
router.get('/:id/tree', apiKeyAuth, scopeCheck('read'), async (req, res) => {
  const repo = await db.query.repositories.findFirst({
    where: eq(repositories.id, req.params.id)
  });

  const tree = await getRepositoryTree(repo);
  res.json({ tree });
});

// Search repository
router.post('/:id/search', apiKeyAuth, scopeCheck('read'), async (req, res) => {
  const { query, semantic = false } = req.body;

  let results;
  if (semantic) {
    results = await semanticSearch(req.params.id, query);
  } else {
    results = await regexSearch(req.params.id, query);
  }

  res.json({ results });
});

export default router;
```

#### Task 2.3.3: Implement Universal Search
**File:** `api-server/src/routes/search.ts`

```typescript
import { Router } from 'express';
import { apiKeyAuth } from '../middleware/auth';

const router = Router();

// Universal search across all sources
router.post('/universal', apiKeyAuth, async (req, res) => {
  const { query, sources = ['checkpoints', 'conversations', 'code'] } = req.body;

  const results = await Promise.all([
    sources.includes('checkpoints') && searchCheckpoints(req.user.id, query),
    sources.includes('conversations') && searchConversations(req.user.id, query),
    sources.includes('code') && searchCode(req.user.id, query)
  ].filter(Boolean));

  res.json({
    results: results.flat().sort((a, b) => b.score - a.score),
    sources: sources.filter(s => results.some(r => r.source === s))
  });
});

// Code search
router.post('/code', apiKeyAuth, async (req, res) => {
  const { query, repositories, semantic = true } = req.body;

  const results = await searchCode(req.user.id, query, { repositories, semantic });
  res.json({ results });
});

// Checkpoint search
router.post('/checkpoints', apiKeyAuth, async (req, res) => {
  const { query, projectId, after, before } = req.body;

  const results = await searchCheckpoints(req.user.id, query, { projectId, after, before });
  res.json({ results });
});

// Conversation search
router.post('/conversations', apiKeyAuth, async (req, res) => {
  const { query, projectId } = req.body;

  const results = await searchConversations(req.user.id, query, { projectId });
  res.json({ results });
});

export default router;
```

---

## PHASE 3: CLI Production Unification

**Priority: MEDIUM | Timeline: Week 3-4**

### 3.1 Decision: Migrate to CLI v2

**Current state:**
- `package.json` points to `lib/cli.js` (v1 - 36 commands)
- v2 has 101 commands with better architecture

**Action:** Update entry point to v2 with v1 aliases for backwards compatibility.

#### Task 3.1.1: Update Package Entry
**File:** `package.json`

```json
{
  "bin": {
    "aitm": "lib/cli-v2.js",
    "aitm-legacy": "lib/cli.js"
  }
}
```

#### Task 3.1.2: Add Natural Language Commands
**File:** `src/cli-v2.ts`

```typescript
// Add at end of command definitions:

program
  .command('back <query>')
  .description('Go back in time using natural language')
  .examples([
    'aitm back "30 minutes"',
    'aitm back "before docker"',
    'aitm back "when tests passed"'
  ])
  .action(async (query) => {
    const engine = await getEngine();

    // Parse natural language
    let checkpoint;

    // Time-based: "30 minutes ago", "2 hours", "yesterday"
    const timeMatch = query.match(/(\d+)\s*(minute|hour|day|week)s?/i);
    if (timeMatch) {
      const [_, amount, unit] = timeMatch;
      const ms = parseDurationToMs(parseInt(amount), unit);
      checkpoint = await engine.findCheckpointByTime(Date.now() - ms);
    }

    // Before something: "before docker", "before auth changes"
    const beforeMatch = query.match(/before\s+(.+)/i);
    if (beforeMatch) {
      const searchTerm = beforeMatch[1];
      const matching = await engine.searchCheckpoints(searchTerm);
      if (matching.length > 0) {
        checkpoint = await engine.getPreviousCheckpoint(matching[0].id);
      }
    }

    // When something worked: "when tests passed", "last working"
    if (query.includes('test') && (query.includes('pass') || query.includes('work'))) {
      checkpoint = await engine.findLastGreenCheckpoint();
    }

    if (!checkpoint) {
      console.error('Could not find matching checkpoint for:', query);
      return;
    }

    console.log(`Found checkpoint: ${checkpoint.id}`);
    console.log(`Description: ${checkpoint.description}`);
    console.log(`Time: ${checkpoint.timestamp}`);

    const { confirm } = await inquirer.prompt([{
      type: 'confirm',
      name: 'confirm',
      message: 'Restore to this checkpoint?'
    }]);

    if (confirm) {
      await engine.restore(checkpoint.id);
      console.log('Restored successfully!');
    }
  });

program
  .command('fix')
  .description('Smart detect and suggest fix point')
  .action(async () => {
    const engine = await getEngine();

    // Get current diagnostics (errors, test failures)
    const diagnostics = await getDiagnostics();

    if (diagnostics.errors.length === 0) {
      console.log('No errors detected. Project looks healthy!');
      return;
    }

    console.log(`Found ${diagnostics.errors.length} errors:`);
    diagnostics.errors.slice(0, 5).forEach(e => console.log(`  - ${e.message}`));

    // Analyze when errors appeared
    const analysis = await engine.analyzeErrorIntroduction(diagnostics.errors);

    if (analysis.likelyBreakingPoint) {
      console.log(`\nErrors likely introduced in: ${analysis.likelyBreakingPoint.description}`);
      console.log(`Time: ${analysis.likelyBreakingPoint.timestamp}`);
      console.log(`Changed files: ${analysis.likelyBreakingPoint.changedFiles.join(', ')}`);

      const { action } = await inquirer.prompt([{
        type: 'list',
        name: 'action',
        message: 'What would you like to do?',
        choices: [
          { name: 'Restore to before this checkpoint', value: 'restore' },
          { name: 'View diff of changes', value: 'diff' },
          { name: 'Restore specific files only', value: 'selective' },
          { name: 'Cancel', value: 'cancel' }
        ]
      }]);

      switch (action) {
        case 'restore':
          await engine.restore(analysis.likelyBreakingPoint.previousId);
          break;
        case 'diff':
          const diff = await engine.diff(analysis.likelyBreakingPoint.previousId, analysis.likelyBreakingPoint.id);
          console.log(formatDiff(diff));
          break;
        case 'selective':
          // Show files and let user choose
          break;
      }
    }
  });

program
  .command('when-broken')
  .alias('when')
  .description('Find when things broke')
  .option('-t, --test <command>', 'Test command to run')
  .action(async (options) => {
    const engine = await getEngine();

    if (options.test) {
      // Binary search using test command
      const result = await engine.bisect(options.test);
      console.log(`First failing checkpoint: ${result.firstBad.id}`);
      console.log(`Last passing checkpoint: ${result.lastGood.id}`);
    } else {
      // Use error heuristics
      const analysis = await engine.analyzeTimeline();

      console.log('Timeline Analysis:');
      console.log('==================');

      analysis.suspiciousPoints.forEach((point, i) => {
        console.log(`\n${i + 1}. ${point.checkpoint.description}`);
        console.log(`   Time: ${point.checkpoint.timestamp}`);
        console.log(`   Suspicion: ${point.reason}`);
        console.log(`   Changed: ${point.changedFiles.slice(0, 3).join(', ')}`);
      });
    }
  });
```

---

## PHASE 4: Extension Production Features

**Priority: MEDIUM | Timeline: Week 4-5**

### 4.1 Current Status
```
extensions/vscode/src/
├── providers/
│   ├── ChatPanelProvider.ts      ✅ Works (fallback mode)
│   ├── CheckpointProvider.ts     ✅ Works
│   ├── TimelineProvider.ts       ✅ Works
│   ├── CodeLensProvider.ts       🟡 Function tracking stubbed
│   └── ConversationProvider.ts   ✅ Works
├── services/
│   └── AITimeMachineService.ts   ✅ MCP integration
```

### 4.2 Enhancement Tasks

#### Task 4.2.1: Real MCP Integration (Not Fallback)
**File:** `extensions/vscode/src/providers/ChatPanelProvider.ts`

```typescript
// Replace fallback with real MCP
private async connectToMCP(): Promise<void> {
  const mcpProcess = spawn('node', [mcpServerPath, '--stdio']);

  this.mcpClient = new MCPClient({
    stdin: mcpProcess.stdin,
    stdout: mcpProcess.stdout
  });

  await this.mcpClient.connect();

  // Get available tools
  const tools = await this.mcpClient.listTools();
  this.availableTools = tools;
}

private async handleToolCall(tool: string, args: any): Promise<any> {
  return await this.mcpClient.callTool(tool, args);
}
```

#### Task 4.2.2: Function-Level Change Tracking
**File:** `extensions/vscode/src/providers/CodeLensProvider.ts`

```typescript
// Implement the stubbed function tracking
export class FunctionChangeCodeLensProvider implements vscode.CodeLensProvider {
  async provideCodeLenses(document: vscode.TextDocument): Promise<vscode.CodeLens[]> {
    const lenses: vscode.CodeLens[] = [];

    // Parse document for functions/classes
    const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
      'vscode.executeDocumentSymbolProvider',
      document.uri
    );

    for (const symbol of symbols || []) {
      if (symbol.kind === vscode.SymbolKind.Function ||
          symbol.kind === vscode.SymbolKind.Method ||
          symbol.kind === vscode.SymbolKind.Class) {

        // Get change history for this function
        const history = await this.getSymbolHistory(document.uri, symbol);

        if (history.lastModified) {
          const lens = new vscode.CodeLens(symbol.range, {
            title: `Modified ${formatRelativeTime(history.lastModified.timestamp)} by ${history.lastModified.trigger}`,
            command: 'aitm.showSymbolHistory',
            arguments: [document.uri, symbol.name]
          });
          lenses.push(lens);
        }

        if (history.wasRestored) {
          const lens = new vscode.CodeLens(symbol.range, {
            title: `Restored from ${history.wasRestored.checkpointId.slice(0, 8)}`,
            command: 'aitm.showRestoreDetails',
            arguments: [history.wasRestored.checkpointId]
          });
          lenses.push(lens);
        }
      }
    }

    return lenses;
  }

  private async getSymbolHistory(uri: vscode.Uri, symbol: vscode.DocumentSymbol): Promise<SymbolHistory> {
    // Get file history from engine
    const history = await this.engine.getFileHistory(uri.fsPath);

    // Find changes that affected this symbol's line range
    return history.filter(change => {
      return change.lineStart <= symbol.range.end.line &&
             change.lineEnd >= symbol.range.start.line;
    });
  }
}
```

#### Task 4.2.3: Timeline Graph View
**File:** `extensions/vscode/src/providers/TimelineGraphProvider.ts` (NEW)

```typescript
export class TimelineGraphProvider implements vscode.WebviewViewProvider {
  resolveWebviewView(webviewView: vscode.WebviewView): void {
    webviewView.webview.options = { enableScripts: true };

    webviewView.webview.html = this.getGraphHTML();

    webviewView.webview.onDidReceiveMessage(async (message) => {
      switch (message.type) {
        case 'getTimeline':
          const timeline = await this.engine.getTimeline({ limit: 50 });
          webviewView.webview.postMessage({ type: 'timeline', data: timeline });
          break;
        case 'restore':
          await this.engine.restore(message.checkpointId);
          break;
        case 'diff':
          const diff = await this.engine.diff(message.from, message.to);
          webviewView.webview.postMessage({ type: 'diff', data: diff });
          break;
      }
    });
  }

  private getGraphHTML(): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          .timeline { display: flex; flex-direction: column; }
          .checkpoint {
            display: flex; align-items: center;
            padding: 8px; cursor: pointer;
            border-left: 2px solid var(--vscode-activityBar-activeBorder);
          }
          .checkpoint:hover { background: var(--vscode-list-hoverBackground); }
          .checkpoint-dot {
            width: 12px; height: 12px;
            border-radius: 50%;
            background: var(--vscode-activityBar-activeBorder);
            margin-right: 8px;
          }
          .checkpoint-time { color: var(--vscode-descriptionForeground); font-size: 11px; }
          .checkpoint-desc { flex: 1; }
        </style>
      </head>
      <body>
        <div class="timeline" id="timeline"></div>
        <script>
          const vscode = acquireVsCodeApi();

          vscode.postMessage({ type: 'getTimeline' });

          window.addEventListener('message', event => {
            if (event.data.type === 'timeline') {
              renderTimeline(event.data.data);
            }
          });

          function renderTimeline(checkpoints) {
            const container = document.getElementById('timeline');
            container.innerHTML = checkpoints.map(cp => \`
              <div class="checkpoint" onclick="restore('\${cp.id}')">
                <div class="checkpoint-dot"></div>
                <div class="checkpoint-desc">\${cp.description}</div>
                <div class="checkpoint-time">\${formatTime(cp.timestamp)}</div>
              </div>
            \`).join('');
          }

          function restore(id) {
            vscode.postMessage({ type: 'restore', checkpointId: id });
          }
        </script>
      </body>
      </html>
    `;
  }
}
```

---

## PHASE 5: Augmented Layer Foundation

**Priority: LOW | Timeline: Week 5-6**

### 5.1 Database Schema
**File:** `api-server/src/db/schema.ts`

```typescript
// Add new tables for Augmented Layer

export const repositories = pgTable("repositories", {
  id: text("id").primaryKey(),
  userId: text("user_id").references(() => users.id),
  url: text("url").notNull(),
  branch: text("branch").default('main'),
  status: text("status").default('pending'), // pending, indexing, ready, error
  progress: jsonb("progress"),
  error: text("error"),
  fileCount: integer("file_count"),
  indexedAt: timestamp("indexed_at"),
  createdAt: timestamp("created_at").defaultNow()
});

export const codeSymbols = pgTable("code_symbols", {
  id: uuid("id").primaryKey().defaultRandom(),
  repositoryId: text("repository_id").references(() => repositories.id),
  filePath: text("file_path").notNull(),
  name: text("name").notNull(),
  symbolType: text("symbol_type").notNull(), // function, class, method, variable
  signature: text("signature"),
  docstring: text("docstring"),
  lineStart: integer("line_start"),
  lineEnd: integer("line_end"),
  embedding: vector("embedding", { dimensions: 1536 })
});

export const savedContexts = pgTable("saved_contexts", {
  id: text("id").primaryKey(),
  userId: text("user_id").references(() => users.id),
  projectId: text("project_id").references(() => projects.id),
  title: text("title").notNull(),
  description: text("description"),
  checkpointId: text("checkpoint_id"),
  conversationSnapshot: jsonb("conversation_snapshot"),
  tags: jsonb("tags"),
  isPublic: boolean("is_public").default(false),
  shareToken: text("share_token"),
  createdAt: timestamp("created_at").defaultNow()
});

export const researchJobs = pgTable("research_jobs", {
  id: text("id").primaryKey(),
  userId: text("user_id").references(() => users.id),
  query: text("query").notNull(),
  status: text("status").default('pending'), // pending, running, completed, failed
  result: jsonb("result"),
  sources: jsonb("sources"),
  tokensUsed: integer("tokens_used"),
  createdAt: timestamp("created_at").defaultNow(),
  completedAt: timestamp("completed_at")
});
```

### 5.2 Code Indexing Service
**File:** `api-server/src/services/indexing.ts`

```typescript
export class CodeIndexingService {
  async indexRepository(repoId: string): Promise<void> {
    const repo = await db.query.repositories.findFirst({
      where: eq(repositories.id, repoId)
    });

    // Update status
    await db.update(repositories)
      .set({ status: 'indexing', progress: { stage: 'cloning', percentage: 0 } })
      .where(eq(repositories.id, repoId));

    // Clone repository
    const repoPath = await this.cloneRepo(repo.url, repo.branch);

    // Scan files
    const files = await this.scanFiles(repoPath);

    // Parse and extract symbols
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const symbols = await this.parseFile(file);

      for (const symbol of symbols) {
        // Generate embedding
        const embedding = await this.generateEmbedding(symbol);

        await db.insert(codeSymbols).values({
          repositoryId: repoId,
          filePath: file.path,
          name: symbol.name,
          symbolType: symbol.type,
          signature: symbol.signature,
          docstring: symbol.docstring,
          lineStart: symbol.lineStart,
          lineEnd: symbol.lineEnd,
          embedding
        });
      }

      // Update progress
      await db.update(repositories)
        .set({ progress: { stage: 'indexing', percentage: Math.round((i / files.length) * 100) } })
        .where(eq(repositories.id, repoId));
    }

    // Mark complete
    await db.update(repositories)
      .set({ status: 'ready', indexedAt: new Date(), fileCount: files.length })
      .where(eq(repositories.id, repoId));
  }

  async searchCode(userId: string, query: string, options: SearchOptions): Promise<SearchResult[]> {
    // Generate query embedding
    const queryEmbedding = await this.generateEmbedding({ content: query });

    // Vector similarity search
    const results = await db.execute(sql`
      SELECT
        cs.*,
        1 - (cs.embedding <=> ${queryEmbedding}) as similarity
      FROM code_symbols cs
      JOIN repositories r ON r.id = cs.repository_id
      WHERE r.user_id = ${userId}
      ORDER BY cs.embedding <=> ${queryEmbedding}
      LIMIT ${options.limit || 20}
    `);

    return results.rows.map(row => ({
      symbol: row.name,
      filePath: row.file_path,
      symbolType: row.symbol_type,
      signature: row.signature,
      lineStart: row.line_start,
      lineEnd: row.line_end,
      score: row.similarity
    }));
  }
}
```

---

## Implementation Checklist

### Week 1-2: MCP Server
- [ ] Add `tm_restore_with_context` tool
- [ ] Add `tm_get_conversation_at` tool
- [ ] Enhance `tm_go_back` with natural language
- [ ] Add `tm_find_when_broke` tool
- [ ] Implement MCP Resources handlers
- [ ] Test with Claude Code and Cursor

### Week 2-3: API Server
- [ ] Implement OpenAI-style error format
- [ ] Complete `repositories.ts` routes
- [ ] Complete `search.ts` routes
- [ ] Complete `contexts.ts` routes
- [ ] Add API versioning prefix
- [ ] Verify rate limiting works

### Week 3-4: CLI
- [ ] Switch entry point to CLI v2
- [ ] Add `aitm back <query>` command
- [ ] Add `aitm fix` command
- [ ] Add `aitm when-broken` command
- [ ] Add backwards-compatible aliases
- [ ] Update documentation

### Week 4-5: Extension
- [ ] Implement real MCP connection
- [ ] Complete function-level tracking
- [ ] Add timeline graph view
- [ ] Add error detection provider
- [ ] Test in VS Code

### Week 5-6: Augmented Layer
- [ ] Add database schema
- [ ] Implement code indexing service
- [ ] Add semantic search
- [ ] Add context saving/loading
- [ ] Test search quality

---

## Success Metrics

| Metric | Target |
|--------|--------|
| MCP tool response time | < 200ms |
| API response time (p95) | < 100ms |
| Checkpoint restore time | < 5 seconds |
| CLI command startup | < 500ms |
| Search result relevance | > 80% precision |
| Error detection accuracy | > 70% |

---

## Files to Create/Modify

### New Files
```
api-server/src/services/indexing.ts
extensions/vscode/src/providers/TimelineGraphProvider.ts
extensions/vscode/src/providers/ErrorDetectionProvider.ts
src/cli/natural-language.ts
```

### Modify Files
```
src/mcp/server.ts                           # Add new tools
api-server/src/middleware/errors.ts         # OpenAI format
api-server/src/routes/repositories.ts       # Complete
api-server/src/routes/search.ts             # Complete
api-server/src/db/schema.ts                 # Add tables
src/cli-v2.ts                               # Natural language commands
extensions/vscode/src/providers/CodeLensProvider.ts  # Function tracking
package.json                                # Update entry point
```
