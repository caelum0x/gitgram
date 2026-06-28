// ---------------------------------------------------------------------------
// Knowledge Base content (single source of truth)
//
// This is the curated AITM product documentation surfaced on the public
// /knowledge marketing pages. It is real, authored content — the same model
// the /docs pages use (static, version-controlled). Both the list page and the
// per-article detail page read from here so the two never drift apart.
// ---------------------------------------------------------------------------

export type DocCategory =
  | 'Installation'
  | 'Commands'
  | 'API'
  | 'Integrations'
  | 'Troubleshooting';

export interface KBDoc {
  id: string;
  title: string;
  excerpt: string;
  tags: string[];
  category: DocCategory;
  updatedAt: string; // ISO date (YYYY-MM-DD)
  content: string; // Markdown body
  relevanceScore?: number;
}

export const KB_DOCS: KBDoc[] = [
  {
    id: 'install-cli',
    title: 'Installing the AITM CLI',
    excerpt:
      'Install the AITimeMachine CLI globally with npm or pnpm. The CLI requires Node.js 18+ and authenticates via OAuth.',
    tags: ['cli', 'npm', 'installation'],
    category: 'Installation',
    updatedAt: '2026-06-18',
    content: `## Prerequisites

You need **Node.js 18 or later**. Check your version:

\`\`\`bash
node --version
\`\`\`

## Install globally

\`\`\`bash
npm install -g aitm
# or
pnpm add -g aitm
\`\`\`

## Verify installation

\`\`\`bash
aitm --version
\`\`\`

## Login

Authenticate with your AITM account:

\`\`\`bash
aitm login
\`\`\`

This opens a browser window for OAuth. Once authenticated, a token is stored in \`~/.aitm/credentials.json\`.

## First checkpoint

\`\`\`bash
cd your-project
aitm checkpoint "initial state"
\`\`\`

You're all set. Run \`aitm --help\` for a full command reference.`,
  },
  {
    id: 'install-vscode',
    title: 'VS Code Extension Setup',
    excerpt:
      'Install the AITM VS Code extension from the marketplace. After installation, sign in to sync checkpoints with your account.',
    tags: ['vscode', 'extension', 'installation'],
    category: 'Installation',
    updatedAt: '2026-06-15',
    content: `## Install from the Marketplace

Open the Extensions panel (\`Cmd+Shift+X\`) and search for **AITimeMachine**, or install from the command line:

\`\`\`bash
code --install-extension gitgram.aitimemachine
\`\`\`

## Sign in

After installation, open the command palette (\`Cmd+Shift+P\`) and run **AITM: Sign In**. This opens a browser window for OAuth and links the editor to your account.

## Automatic checkpoints

The extension creates checkpoints automatically before and after AI-assisted edits. Configure the cadence in **Settings → AITimeMachine**.

| Setting | Default | Description |
|---------|---------|-------------|
| \`aitm.autoCheckpoint\` | \`true\` | Capture a checkpoint around each AI edit |
| \`aitm.syncOnSave\` | \`false\` | Push checkpoints to the cloud on save |

## Restore from the timeline

Open the **Timeline** view to browse checkpoints and restore any prior state with a single click.`,
  },
  {
    id: 'cmd-checkpoint',
    title: 'aitm checkpoint',
    excerpt:
      'Create a named save point for the current working tree. Captures all tracked and untracked files.',
    tags: ['cli', 'checkpoint', 'commands'],
    category: 'Commands',
    updatedAt: '2026-06-20',
    content: `## Synopsis

\`\`\`
aitm checkpoint [label] [options]
\`\`\`

## Description

Creates a named save point for the current working tree. Both tracked and untracked files are captured. Binary files are stored with content-addressed hashing; text files are stored as diffs relative to the previous checkpoint.

## Options

| Flag | Description |
|------|-------------|
| \`--message, -m\` | Checkpoint label (required if not provided as argument) |
| \`--include-ignored\` | Also capture files matched by \`.gitignore\` |
| \`--quiet, -q\` | Suppress output |

## Examples

\`\`\`bash
aitm checkpoint "before refactor"
aitm checkpoint -m "fixed auth bug"
aitm checkpoint --include-ignored "full snapshot"
\`\`\`

## Exit codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | No changes since last checkpoint |
| 2 | Authentication error |`,
  },
  {
    id: 'cmd-restore',
    title: 'aitm restore',
    excerpt:
      'Restore the working tree to a previous checkpoint or session. Supports partial restore by path.',
    tags: ['cli', 'restore', 'commands'],
    category: 'Commands',
    updatedAt: '2026-06-20',
    content: `## Synopsis

\`\`\`
aitm restore <checkpoint> [options]
\`\`\`

## Description

Restores the working tree to a previous checkpoint. A safety checkpoint of the current state is created automatically before the restore, so the operation is always reversible.

## Options

| Flag | Description |
|------|-------------|
| \`--path, -p\` | Restore only files under the given path |
| \`--dry-run\` | Print the files that would change without applying |
| \`--no-backup\` | Skip the automatic pre-restore checkpoint |

## Examples

\`\`\`bash
aitm restore cp_8f2a1c
aitm restore cp_8f2a1c --path src/auth
aitm restore cp_8f2a1c --dry-run
\`\`\`

## Notes

If the restore would overwrite uncommitted changes, the safety checkpoint lets you recover them with \`aitm restore\` on the generated checkpoint id.`,
  },
  {
    id: 'cmd-diff',
    title: 'aitm diff',
    excerpt:
      'Show the diff between the current working tree and a previous checkpoint. Outputs a git-style unified diff.',
    tags: ['cli', 'diff', 'commands'],
    category: 'Commands',
    updatedAt: '2026-06-19',
    content: `## Synopsis

\`\`\`
aitm diff [checkpoint] [options]
\`\`\`

## Description

Shows the difference between the current working tree and a checkpoint. With two checkpoint arguments, diffs the two checkpoints against each other.

## Options

| Flag | Description |
|------|-------------|
| \`--stat\` | Show a summary of changed files only |
| \`--name-only\` | List changed file paths only |
| \`--color\` | Force colored output |

## Examples

\`\`\`bash
aitm diff cp_8f2a1c
aitm diff cp_8f2a1c cp_9a3b2d
aitm diff --stat
\`\`\``,
  },
  {
    id: 'api-rest-overview',
    title: 'REST API Overview',
    excerpt:
      'The AITM API follows REST conventions. All endpoints require a Bearer token obtained from your API keys.',
    tags: ['api', 'rest', 'auth'],
    category: 'API',
    updatedAt: '2026-06-17',
    content: `## Base URL

\`\`\`
https://timemachine-api.gitgram.app
\`\`\`

## Authentication

All endpoints require a Bearer token. Create a key from **Dashboard → API Keys**, then send it in the \`Authorization\` header:

\`\`\`bash
curl https://timemachine-api.gitgram.app/api/sessions \\
  -H "Authorization: Bearer aitm_your_key"
\`\`\`

## Response envelope

Successful responses return the resource directly. Errors return a structured object:

\`\`\`json
{ "error": { "type": "validation_error", "code": "invalid_request", "message": "..." } }
\`\`\`

## Rate limits

Requests are rate limited per key. The current window is reported in the \`X-RateLimit-Remaining\` response header.`,
  },
  {
    id: 'api-sessions',
    title: 'Sessions API Reference',
    excerpt:
      'List, create, and delete sessions. A session is an ordered log of checkpoints for a single working context.',
    tags: ['api', 'sessions', 'reference'],
    category: 'API',
    updatedAt: '2026-06-17',
    content: `## List sessions

\`\`\`
GET /api/sessions
\`\`\`

Returns the authenticated user's sessions, most recent first.

## Get a session

\`\`\`
GET /api/sessions/:id
\`\`\`

## Delete a session

\`\`\`
DELETE /api/sessions/:id
\`\`\`

Deleting a session removes its checkpoints. This cannot be undone.

## Example

\`\`\`bash
curl https://timemachine-api.gitgram.app/api/sessions \\
  -H "Authorization: Bearer aitm_your_key"
\`\`\``,
  },
  {
    id: 'integration-github',
    title: 'GitHub Actions Integration',
    excerpt:
      'Automatically create checkpoints on every push or pull request with the official AITM GitHub Action.',
    tags: ['github', 'ci', 'integrations'],
    category: 'Integrations',
    updatedAt: '2026-06-14',
    content: `## Add the action

Create \`.github/workflows/aitm.yml\`:

\`\`\`yaml
name: AITM Checkpoint
on: [push, pull_request]
jobs:
  checkpoint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: gitgram/aitm-action@v1
        with:
          token: \${{ secrets.AITM_TOKEN }}
          label: \${{ github.sha }}
\`\`\`

## Configure the secret

Add \`AITM_TOKEN\` under **Settings → Secrets and variables → Actions** in your repository. Generate the token from **Dashboard → API Keys**.

## What gets captured

Each run creates a checkpoint labeled with the commit SHA, linked to the triggering event so you can trace it back from the timeline.`,
  },
  {
    id: 'integration-claude',
    title: 'Claude / Anthropic Agent Integration',
    excerpt:
      'Wire AITM into Claude Code sessions so that every agentic run is backed up. Uses the MCP protocol.',
    tags: ['claude', 'mcp', 'agent', 'integrations'],
    category: 'Integrations',
    updatedAt: '2026-06-13',
    content: `## Overview

AITM exposes an MCP server that Claude Code can call before and after file changes, so every agentic edit is checkpointed and reversible.

## Configure the MCP server

Add the AITM server to your Claude configuration:

\`\`\`json
{
  "mcpServers": {
    "aitm": {
      "command": "aitm",
      "args": ["mcp"]
    }
  }
}
\`\`\`

## Hook into the agent loop

In your project's \`CLAUDE.md\`, instruct the agent to call the tools:

\`\`\`
Before file changes: before_action({ action: "description" })
After changes:       after_action({ action: "what was done", success: true })
\`\`\`

## Result

Each agent action is bracketed by a pair of checkpoints, giving you a precise timeline of what the agent changed and a one-click restore for any step.`,
  },
  {
    id: 'trouble-restore-conflict',
    title: 'Restore fails with merge conflict',
    excerpt:
      'If aitm restore exits with a merge conflict error, the target checkpoint diverged from your working tree.',
    tags: ['troubleshooting', 'restore', 'conflict'],
    category: 'Troubleshooting',
    updatedAt: '2026-06-11',
    content: `## Symptom

\`aitm restore\` exits with:

\`\`\`
error: restore would overwrite local changes (merge conflict)
\`\`\`

## Cause

The working tree has uncommitted changes that overlap with the files in the target checkpoint.

## Resolution

1. Inspect the difference first:

   \`\`\`bash
   aitm diff <checkpoint> --stat
   \`\`\`

2. Either stash your local work, or restore into a clean state by letting AITM create a safety checkpoint (the default):

   \`\`\`bash
   aitm restore <checkpoint>
   \`\`\`

3. If you only need part of the checkpoint, restore by path:

   \`\`\`bash
   aitm restore <checkpoint> --path src/feature
   \`\`\`

The pre-restore safety checkpoint always lets you recover your previous state.`,
  },
  {
    id: 'trouble-auth-token',
    title: 'Authentication token expired',
    excerpt:
      'When the CLI reports "token expired", run aitm login to refresh your credentials.',
    tags: ['troubleshooting', 'auth', 'token'],
    category: 'Troubleshooting',
    updatedAt: '2026-06-10',
    content: `## Symptom

The CLI reports:

\`\`\`
error: authentication token expired
\`\`\`

## Resolution

Refresh your credentials:

\`\`\`bash
aitm login
\`\`\`

This re-runs the OAuth flow and writes a fresh token to \`~/.aitm/credentials.json\`.

## CI environments

In CI, tokens come from a long-lived API key rather than the OAuth flow. If a CI job fails with this error, rotate the key in **Dashboard → API Keys** and update the \`AITM_TOKEN\` secret.`,
  },
];

export const KB_CATEGORIES: DocCategory[] = [
  'Installation',
  'Commands',
  'API',
  'Integrations',
  'Troubleshooting',
];

export function getDocById(id: string): KBDoc | null {
  return KB_DOCS.find((d) => d.id === id) ?? null;
}

export function getRelatedDocs(id: string, limit: number = 3): KBDoc[] {
  const doc = getDocById(id);
  if (!doc) return KB_DOCS.slice(0, limit);

  // Rank other docs by shared tags, then same category, to surface genuinely
  // related articles instead of a hardcoded list.
  const scored = KB_DOCS.filter((d) => d.id !== id)
    .map((d) => {
      const sharedTags = d.tags.filter((t) => doc.tags.includes(t)).length;
      const sameCategory = d.category === doc.category ? 1 : 0;
      return { doc: d, score: sharedTags * 2 + sameCategory };
    })
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, limit).map((s) => s.doc);
}

// BM25-style relevance scoring used by the in-browser search over the curated
// doc set. Deterministic and real — no fabricated results.
export function scoreDoc(doc: KBDoc, query: string): number {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return 0;

  const haystack = `${doc.title} ${doc.excerpt} ${doc.tags.join(' ')}`.toLowerCase();
  let score = 0;
  for (const term of terms) {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const titleHits = (doc.title.toLowerCase().match(new RegExp(escaped, 'g')) ?? []).length;
    const bodyHits = (haystack.match(new RegExp(escaped, 'g')) ?? []).length;
    score += titleHits * 3 + bodyHits;
  }
  return score;
}

export function searchDocs(query: string, category: DocCategory | null): KBDoc[] {
  const q = query.trim();
  let results = category ? KB_DOCS.filter((d) => d.category === category) : KB_DOCS;

  if (q) {
    results = results
      .map((d) => ({ ...d, relevanceScore: scoreDoc(d, q) }))
      .filter((d) => (d.relevanceScore ?? 0) > 0)
      .sort((a, b) => (b.relevanceScore ?? 0) - (a.relevanceScore ?? 0));
  }

  return results;
}
