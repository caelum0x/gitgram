Below is a **complete, copy-pasteable** technical plan + documentation for an **“AI Time Machine” MCP server**. It’s written like a README you can drop into a repo or docs site, with a working skeleton MCP server (TypeScript/stdio) and a concrete tool/resource design that matches your product goals: rewind **conversation + project folder + terminal history + capsule environment**.

---

# AI Time Machine MCP: Technical Implementation & Documentation

## Overview

**AI Time Machine** is an event-sourced “Time Machine” for AI coding workflows. It captures and restores:

* **Chat context** (threads, messages, tool outputs)
* **Workspace state** (full file tree snapshots, including untracked)
* **Terminal history** (commands + outputs + exit codes)
* **Capsule environment** (container image digest + run configuration)

This MCP server exposes those capabilities to MCP clients (Cursor/VSCode agents, Claude Desktop, ChatGPT desktop, etc.) via **tools** and **resources**.

### What this MCP server does (in one line)

It’s the standard interface for an AI client to: **record events**, **create checkpoints**, **diff**, **restore**, and **run inside a container capsule**.

---

## Goals (MVP-friendly)

### Must-have

* Append-only event log (auditability)
* Named checkpoints
* Workspace snapshot/restore
* Terminal session log capture
* Capsule mode: run commands in a pinned container image
* Diff checkpoint ↔ checkpoint (files + chat + commands)

### Not in MVP

* True process snapshot/restore (CRIU/VM)
* Team multi-user sync (can add later)
* OS-wide terminal capture (only managed terminals)

---

## Architecture

### Components

1. **MCP Server (`ai-time-machine-mcp`)**

   * Exposes tools/resources/prompts.
   * Validates inputs (Zod).
   * Writes to local store (SQLite + blob store).
   * Optionally controls containers (Docker).

2. **Local Store**

   * `events.db` (SQLite): event stream + indices.
   * `blobs/` (CAS): file contents, terminal outputs, chat attachments.
   * `manifests/` (snapshot manifests): path → blob hash + metadata.

3. **Client Integration (Cursor/VSCode)**

   * Captures:

     * file changes (on save / debounce)
     * chat messages + tool outputs
     * terminal commands + output streams
   * Calls MCP tools:

     * `tm_event_append`
     * `tm_checkpoint_create`
     * `tm_restore_checkpoint`
     * `tm_diff_checkpoints`

4. **Capsule Runtime (Container)**

   * Per-project container image digest pinned per checkpoint.
   * Workspace mount uses snapshot restore (deterministic FS).
   * Commands run inside capsule; outputs streamed back as events.

---

## Data Model (Event Sourcing + Materialized Checkpoints)

**Everything is an event.** Checkpoints are “materialized views” referencing blobs.

### Event stream (high level)

* `chat.message`
* `fs.change_batch`
* `term.command`
* `term.output_chunk`
* `capsule.state`
* `checkpoint.created`

### Why event sourcing

* Time-travel is trivial: replay to any point.
* Diffs are straightforward.
* Auditability and debugging are natural.

---

## Tooling Design (MCP)

### Tools (what the model can call)

#### 1) `tm_project_init`

Create or register a project.

**Input**

* `projectId` (string, stable id)
* `rootPath` (string, absolute path)
* `name` (string)

**Output**

* `{ projectId, createdAt }`

---

#### 2) `tm_event_append`

Append an event to the project timeline (chat/fs/terminal/capsule).

**Input**

* `projectId`
* `type` (enum)
* `timestamp` (ISO)
* `payload` (object)
* optional `blobs` (array of `{ mimeType, dataBase64 }` or `{ mimeType, text }`)

**Output**

* `{ eventId }`

> Use this from the IDE extension for *every* capture.

---

#### 3) `tm_checkpoint_create`

Create a named checkpoint.

**Input**

* `projectId`
* `name`
* `scope`: `"files" | "files+chat" | "files+chat+terminal" | "full"`
* optional `capsule`: `{ imageRef?, workdir?, env? }`

**Output**

* `{ checkpointId, createdAt }`

**Behavior**

* Builds a workspace manifest
* Stores any missing file blobs
* Links checkpoint to:

  * `workspace_manifest_ref`
  * `chat_head_event_id`
  * `terminal_head_event_id`
  * `capsule_image_digest` (if enabled)

---

#### 4) `tm_list_checkpoints`

List checkpoints for a project (supports timeline UI).

**Input**

* `projectId`
* optional `limit`, `cursor`

**Output**

* array of checkpoints with metadata + “summary” fields

---

#### 5) `tm_diff_checkpoints`

Return diffs between two checkpoints.

**Input**

* `projectId`
* `aCheckpointId`
* `bCheckpointId`

**Output**

* `fileDiffs`: list of `{ path, aHash, bHash, patch? }`
* `chatDiff`: summary of messages added/removed
* `terminalDiff`: commands executed between

---

#### 6) `tm_restore_checkpoint`

Restore workspace (and optionally chat pointer) to a checkpoint.

**Input**

* `projectId`
* `checkpointId`
* `mode`: `"safe" | "hard"`
* `restoreScope`: `"files" | "files+chat"`
* optional `backupCurrent`: boolean

**Output**

* `{ restoredPaths, backupPath?, chatHeadEventId }`

---

#### 7) Capsule tools

##### `tm_capsule_create_or_attach`

Create or re-use a capsule container for a project.

**Input**

* `projectId`
* `imageRef` (e.g. `node:20-bookworm@sha256:...`)
* `workdir`
* `env` (key/value)
* optional `ports`

**Output**

* `{ capsuleId, imageDigest }`

##### `tm_capsule_exec`

Run a command inside capsule.

**Input**

* `projectId`
* `capsuleId`
* `command` (string)
* `cwd` (string)
* optional `timeoutMs`

**Output**

* `{ exitCode, stdoutRef, stderrRef }`

> This should also automatically emit `term.command` and streamed `term.output_chunk` events.

##### `tm_capsule_stop`

Stop capsule for a project.

---

### Resources (browseable content)

Resources are ideal for timeline UI and “pull into context”.

#### `tm://projects`

List projects.

#### `tm://projects/{projectId}/timeline?from=...&to=...`

Timeline slices of events.

#### `tm://projects/{projectId}/checkpoints`

Checkpoint list.

#### `tm://projects/{projectId}/checkpoints/{checkpointId}/manifest`

Workspace manifest JSON.

#### `tm://blobs/{hash}`

Fetch blob content (text/binary base64).

---

### Prompts (optional but useful)

* `tm_prompt_debug_regression`: “Given checkpoint A and B diff, propose minimal fix.”
* `tm_prompt_write_postmortem`: “Generate incident report from timeline segment.”
* `tm_prompt_generate_repro_steps`: “Turn terminal history into deterministic repro steps.”

---

## MVP Repo Template

```
ai-time-machine-mcp/
  src/
    index.ts
    store/
      db.ts
      migrations.ts
      blobs.ts
      manifests.ts
    tools/
      projects.ts
      events.ts
      checkpoints.ts
      diff.ts
      restore.ts
      capsule.ts
    resources/
      resources.ts
    lib/
      schema.ts
      paths.ts
      hash.ts
      errors.ts
  blobs/            # CAS store (created at runtime)
  manifests/        # checkpoint manifests
  events.db         # sqlite
  package.json
  tsconfig.json
  README.md
```

---

## SQLite Schema (copy-paste)

### 1) `projects`

Stores project roots + display names.

```sql
CREATE TABLE IF NOT EXISTS projects (
  project_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  root_path TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_projects_root_path ON projects(root_path);
```

### 2) `events`

Append-only event log.

```sql
CREATE TABLE IF NOT EXISTS events (
  event_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  ts TEXT NOT NULL,
  type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  prev_event_id TEXT,
  FOREIGN KEY(project_id) REFERENCES projects(project_id)
);

CREATE INDEX IF NOT EXISTS idx_events_project_ts ON events(project_id, ts);
CREATE INDEX IF NOT EXISTS idx_events_project_type ON events(project_id, type);
```

> `prev_event_id` lets you maintain a per-project linked list head (optional). Otherwise compute heads by `MAX(ts)`.

### 3) `blobs`

Content-addressed storage index.

```sql
CREATE TABLE IF NOT EXISTS blobs (
  hash TEXT PRIMARY KEY,
  size_bytes INTEGER NOT NULL,
  mime_type TEXT NOT NULL,
  created_at TEXT NOT NULL,
  path_on_disk TEXT NOT NULL
);
```

### 4) `manifests`

A workspace snapshot manifest.

```sql
CREATE TABLE IF NOT EXISTS manifests (
  manifest_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  root_path TEXT NOT NULL,
  created_at TEXT NOT NULL,
  manifest_blob_hash TEXT NOT NULL,
  FOREIGN KEY(project_id) REFERENCES projects(project_id),
  FOREIGN KEY(manifest_blob_hash) REFERENCES blobs(hash)
);

CREATE INDEX IF NOT EXISTS idx_manifests_project_created ON manifests(project_id, created_at);
```

### 5) `checkpoints`

Materialized checkpoint pointers.

```sql
CREATE TABLE IF NOT EXISTS checkpoints (
  checkpoint_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  scope TEXT NOT NULL,

  manifest_id TEXT NOT NULL,
  chat_head_event_id TEXT,
  terminal_head_event_id TEXT,

  capsule_image_ref TEXT,
  capsule_image_digest TEXT,
  capsule_workdir TEXT,
  capsule_env_json TEXT,

  FOREIGN KEY(project_id) REFERENCES projects(project_id),
  FOREIGN KEY(manifest_id) REFERENCES manifests(manifest_id)
);

CREATE INDEX IF NOT EXISTS idx_checkpoints_project_created ON checkpoints(project_id, created_at);
```

### 6) Optional: `terminal_sessions`

If you want stable terminal session IDs.

```sql
CREATE TABLE IF NOT EXISTS terminal_sessions (
  session_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  label TEXT,
  FOREIGN KEY(project_id) REFERENCES projects(project_id)
);
```

---

## Blob Formats (CAS)

### Hashing

* `hash = sha256(content_bytes)` (hex)
* Blob file path: `blobs/aa/bb/<hash>`

### Blob payloads

* File contents: raw bytes
* Terminal stdout/stderr: raw bytes (UTF-8 text typically)
* Manifests: JSON text (UTF-8)

### Manifest JSON (stored as blob)

Example (`manifest_blob_hash` points to this JSON):

```json
{
  "version": 1,
  "rootPath": "/abs/path/project",
  "capturedAt": "2025-12-22T12:34:56.000Z",
  "files": [
    {
      "path": "src/index.ts",
      "hash": "sha256hex...",
      "size": 1234,
      "mode": 420,
      "mtimeMs": 1734867296000
    }
  ],
  "ignore": [
    "node_modules/**",
    ".git/**",
    ".venv/**",
    "dist/**"
  ]
}
```

---

## Capsule Design (exact restore without hacks)

“Exact restore” comes from **pinning the runtime** (image digest) and restoring the **workspace snapshot**.

### Rules

* Every checkpoint stores:

  * `capsule_image_ref` (human-readable)
  * `capsule_image_digest` (actual pin)
  * env vars (non-secret; secrets handled separately)
  * workdir

### Execution model

* Restore checkpoint → restore workspace files on host
* Start capsule with pinned digest
* Mount restored workspace into capsule at `/workspace`
* Run commands inside capsule
* Stream outputs back as `term.output_chunk` events

### Why this is “exact”

* Same image digest means same OS + toolchain
* Same workspace snapshot means same bytes
* Same recorded commands means same steps

> If you need “running server state,” store a “runbook” (commands to start services) and rerun it after restore.

---

## Working MCP Server Skeleton (TypeScript / stdio)

### Install

```bash
mkdir ai-time-machine-mcp
cd ai-time-machine-mcp
npm init -y
npm i @modelcontextprotocol/sdk zod better-sqlite3
npm i -D typescript ts-node @types/node
npx tsc --init
```

### `package.json`

```json
{
  "name": "ai-time-machine-mcp",
  "type": "module",
  "scripts": {
    "dev": "node --loader ts-node/esm src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js"
  }
}
```

### `src/index.ts` (minimal but real)

```ts
import { z } from "zod";
import Database from "better-sqlite3";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

const DATA_DIR = process.env.TM_DATA_DIR ?? path.resolve(process.cwd(), ".tmdata");
const DB_PATH = path.join(DATA_DIR, "events.db");
const BLOBS_DIR = path.join(DATA_DIR, "blobs");

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(BLOBS_DIR, { recursive: true });

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");

db.exec(`
CREATE TABLE IF NOT EXISTS projects (
  project_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  root_path TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS events (
  event_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  ts TEXT NOT NULL,
  type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  prev_event_id TEXT
);
CREATE INDEX IF NOT EXISTS idx_events_project_ts ON events(project_id, ts);
CREATE TABLE IF NOT EXISTS blobs (
  hash TEXT PRIMARY KEY,
  size_bytes INTEGER NOT NULL,
  mime_type TEXT NOT NULL,
  created_at TEXT NOT NULL,
  path_on_disk TEXT NOT NULL
);
`);

function nowIso() {
  return new Date().toISOString();
}

function sha256Hex(buf: Buffer) {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

function putBlob(mimeType: string, data: Buffer) {
  const hash = sha256Hex(data);
  const sub = path.join(BLOBS_DIR, hash.slice(0, 2), hash.slice(2, 4));
  const filePath = path.join(sub, hash);
  fs.mkdirSync(sub, { recursive: true });

  if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, data);

  const stat = fs.statSync(filePath);
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO blobs(hash, size_bytes, mime_type, created_at, path_on_disk)
    VALUES(?,?,?,?,?)
  `);
  stmt.run(hash, stat.size, mimeType, nowIso(), filePath);
  return { hash, sizeBytes: stat.size, mimeType };
}

const server = new McpServer({ name: "ai-time-machine-mcp", version: "0.1.0" });

server.tool(
  "tm_project_init",
  "Create or register a project in AI Time Machine",
  {
    projectId: z.string().min(1),
    name: z.string().min(1),
    rootPath: z.string().min(1),
  },
  async ({ projectId, name, rootPath }) => {
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO projects(project_id, name, root_path, created_at)
      VALUES(?,?,?,?)
    `);
    stmt.run(projectId, name, rootPath, nowIso());
    return { content: [{ type: "text", text: JSON.stringify({ projectId, createdAt: nowIso() }, null, 2) }] };
  }
);

server.tool(
  "tm_event_append",
  "Append an event to the project timeline (chat/fs/terminal/capsule)",
  {
    projectId: z.string().min(1),
    type: z.string().min(1),
    timestamp: z.string().min(1),
    payload: z.record(z.any()),
    blobs: z
      .array(
        z.union([
          z.object({ mimeType: z.string().min(1), text: z.string() }),
          z.object({ mimeType: z.string().min(1), dataBase64: z.string().min(1) }),
        ])
      )
      .optional(),
  },
  async ({ projectId, type, timestamp, payload, blobs }) => {
    const eventId = crypto.randomUUID();

    const blobRefs: Array<{ hash: string; mimeType: string; sizeBytes: number }> = [];
    if (blobs) {
      for (const b of blobs) {
        const data = "dataBase64" in b ? Buffer.from(b.dataBase64, "base64") : Buffer.from(b.text, "utf8");
        const ref = putBlob(b.mimeType, data);
        blobRefs.push(ref);
      }
    }

    const payloadWithBlobs = { ...payload, blobRefs };

    const stmt = db.prepare(`
      INSERT INTO events(event_id, project_id, ts, type, payload_json)
      VALUES(?,?,?,?,?)
    `);
    stmt.run(eventId, projectId, timestamp, type, JSON.stringify(payloadWithBlobs));

    return { content: [{ type: "text", text: JSON.stringify({ eventId }, null, 2) }] };
  }
);

server.resource(
  "tm_projects",
  "tm://projects",
  async () => {
    const rows = db.prepare(`SELECT project_id, name, root_path, created_at FROM projects`).all();
    return {
      contents: [
        {
          uri: "tm://projects",
          mimeType: "application/json",
          text: JSON.stringify(rows, null, 2),
        },
      ],
    };
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("Fatal MCP server error:", err);
  process.exit(1);
});
```

This already gives you:

* project registry
* append-only timeline events
* blob store
* resource browsing

Next, you add:

* checkpoint create/list/diff/restore
* capsule tools (Docker)

---

## Cursor/VSCode Extension Integration Plan (how the client uses MCP)

### What the extension should capture

1. **File changes**

   * Hook `workspace.onDidSaveTextDocument`
   * Debounce into a batch event every ~2–5 seconds
   * For each changed file, either:

     * send full content as blob, or
     * send patch (nice-to-have), plus full content at checkpoint time

2. **Chat messages**

   * If your chat is a webview, forward messages to extension host and call `tm_event_append` with type `chat.message`.

3. **Terminal commands + outputs**

   * Prefer managed terminals created by the extension.
   * Wrap commands via a small shim:

     * extension calls `tm_event_append(type=term.command)`
     * run command
     * stream output chunks into `tm_event_append(type=term.output_chunk)`
     * on completion: `tm_event_append(type=term.exit)` + maybe auto-checkpoint if matches patterns

4. **Checkpoint UX**

   * Command palette:

     * “Time Machine: Create Checkpoint”
     * “Time Machine: Restore Checkpoint”
   * Side panel timeline tree view.

### Minimal mapping: extension → MCP calls

* On project open: `tm_project_init`
* On every capture: `tm_event_append`
* On user command: `tm_checkpoint_create`
* On restore: `tm_restore_checkpoint`
* For UI: read `tm://projects/...` resources and/or `tm_list_checkpoints`

---

## Security & Safety (don’t ship without this)

### Path allowlist

* Never allow reading/writing outside `project.rootPath`
* Normalize and validate paths (`realpath` checks)

### Secrets

* Default ignore:

  * `.env`, `**/*.pem`, `id_rsa`, `**/wallet.json`, `**/*key*`
* Add a `tm_policy_set` tool later to configure ignore patterns
* Optional secret scanner before blob write

### Size limits

* Per blob max (e.g., 5–25MB)
* Per event payload max
* Reject huge output streams or chunk them with caps

### Timeouts

* Capsule exec timeout (default 60s, configurable)

---

## Next (recommended) MCP tool additions for “real product”

### Checkpoint + restore

* `tm_checkpoint_create` (build manifest from file system)
* `tm_list_checkpoints`
* `tm_restore_checkpoint` (write files from manifest)

### Diff

* `tm_diff_checkpoints` returning:

  * file patch (if text)
  * binary changed marker
  * chat and terminal segment summaries

### Capsule

* `tm_capsule_create_or_attach`
* `tm_capsule_exec` (streams output as events)
* `tm_capsule_stop`

---

If you want, I’ll generate the **next code drop** too (still copy-pasteable):

* full `tm_checkpoint_create`, `tm_list_checkpoints`, `tm_restore_checkpoint`
* manifest builder with ignore globs
* Docker-based capsule exec that streams output chunks into events

Just say whether you want **Docker required** in MVP or “capsule optional.”

Here’s the **full “shopping list” of libraries you’ll actually need** to build **AI Time Machine MCP** (server + VSCode/Cursor client + container capsule), with the MCP bits verified via web sources. ([npm][1])

---

## MCP server (TypeScript / Node)

### Required (core)

* **`@modelcontextprotocol/sdk`** — MCP server primitives + stdio transport. ([npm][1])
* **`zod`** — input validation + schemas (great with MCP tool schemas)
* **`typescript`, `ts-node`, `@types/node`** — dev/build

### Storage (local event store)

Pick **one** SQLite option:

**Option A (fastest to ship)**

* **`better-sqlite3`** — sync, fast, simple. (Common choice for local daemons)

**Option B (async)**

* **`sqlite3`** or **`@vscode/sqlite3`** — async style, more boilerplate

### Blob store / content addressing

* Node built-ins: **`crypto`**, **`fs`**, **`path`**
* Optional compression:

  * **`zstd-codec`** or **`@mongodb-js/zstd`** (if you want zstd blobs)
  * or just **`zlib`** (built-in gzip/deflate)

### Ignore patterns + file crawling

* **`fast-glob`** or **`globby`** — build manifests efficiently
* **`ignore`** — gitignore-style matching
* Optional watchers (server-side):

  * **`chokidar`** — file system watching (if you don’t rely only on extension capture)

### Diffs (checkpoint ↔ checkpoint)

* **`diff`** (npm: `diff`) — unified patches for text files
* Optional “git-style” polish:

  * **`isbinaryfile`** — detect binary files before attempting text diff
  * **`mime-types`** — infer mime type
  * **`js-yaml`** — if you store policy/config as YAML

---

## VSCode / Cursor extension (client capture)

### Required (extension)

* **`vscode`** (the API typings + runtime context)
* **`@modelcontextprotocol/sdk`** *(optional in extension)* — only if your extension talks MCP directly.
  Many setups let the host client manage MCP; but if you run MCP inside the extension, include it.

### Terminal capture (realistic)

VS Code removed the old `Terminal.onDidWriteData` and replaced it with a global event (`window.onDidWriteTerminalData`). ([Visual Studio Code][2])
So you’ll likely use:

* **VS Code API**: `window.onDidWriteTerminalData` for output capture (where available) ([Visual Studio Code][2])
* plus `Terminal.sendText()` to run commands (for managed terminals)

> Note: terminal data capture capabilities vary by VS Code version / environment, so for MVP it’s smart to prioritize **“managed command runner”** (run commands via Node child process or capsule exec and stream logs into a custom terminal).

### File capture

* Use VS Code workspace events:

  * `workspace.onDidSaveTextDocument`
  * `workspace.createFileSystemWatcher`
    (no extra libs needed unless you want advanced filtering)

### UI

* Tree view timeline: built-in VS Code TreeDataProvider
* Optional:

  * **`@vscode/webview-ui-toolkit`** for nicer panels

---

## Capsule (container-based “exact restore”)

### Docker control (Node)

* **`dockerode`** — the standard Node Docker API client. ([npm][3])
* Optional helper:

  * **`tar-fs`** or **`tar-stream`** — copying workspace into containers / exporting artifacts
  * **`stream`** (built-in) + Dockerode’s stream demux patterns (stdout/stderr)

Dockerode supports creating containers and attaching stdout/stderr. ([npm][3])

### Alternative approach (CLI)

If you don’t want Dockerode initially:

* call **`docker` CLI** via `child_process.spawn`
* parse output + exit codes
* still pin images by **digest**

This is often *easier to debug* in week 1–2.

---

## Optional but very useful (quality + safety)

### Performance + correctness

* **`p-limit`** — bound concurrency for hashing / snapshotting
* **`lru-cache`** — memoize blob existence checks
* **`xxhashjs`** — faster non-crypto hashing for internal chunking (keep SHA-256 for CAS identity)

### Security

* **`@dqbd/tiktoken`** (optional) — token estimation for chat retention rules
* **`trufflehog`** *(external tool)* or **`gitleaks`** *(external tool)* — secret scanning before writing blobs (run as subprocess)

### Logging

* **`pino`** — fast JSON logs
* **`uuid`** — though Node’s `crypto.randomUUID()` is enough

---

## MCP docs / SDK version note (important)

The MCP TypeScript SDK has a v2 line in development (pre-alpha) and recommends v1.x for production until v2 stabilizes. ([GitHub][4])
So for your MVP, target the current stable **`@modelcontextprotocol/sdk`** release on npm. ([npm][1])

---

## Minimal “week-1 MVP” dependency set (if you want to stay lean)

**MCP server**

* `@modelcontextprotocol/sdk` ([npm][1])
* `zod`
* `better-sqlite3`
* `fast-glob`
* `ignore`

**Capsule (optional week-1)**

* `dockerode` ([npm][3])

**Extension**

* `vscode` typings + standard API (no extra libs)

---

If you tell me whether you want **(A) Dockerode** or **(B) docker CLI spawn** for capsule MVP, I’ll lock the final dependency list and generate the exact `package.json` for both the MCP server and the VSCode/Cursor extension.

[1]: https://www.npmjs.com/package/%40modelcontextprotocol/sdk?utm_source=chatgpt.com "modelcontextprotocol/sdk"
[2]: https://code.visualstudio.com/updates/v1_39?utm_source=chatgpt.com "September 2019 (version 1.39)"
[3]: https://www.npmjs.com/package/dockerode?utm_source=chatgpt.com "dockerode"
[4]: https://github.com/modelcontextprotocol/typescript-sdk?utm_source=chatgpt.com "modelcontextprotocol/typescript-sdk"
