I’ll do **both**: (1) wire the engine into real MCP tool handlers with **exact JSON schemas**, and (2) add **production features** as concrete modules + boundaries (GC, integrity, chunking, redaction, cloud-sync).

Below is a repo-ready drop-in that matches the earlier engine (`CasStore`, `restoreWorkspaceAtomic`, `DockerCapsuleManager`, locks).

---

# A) MCP tool handlers + exact JSON schemas (TypeScript)

## 1) Tool schemas (single source of truth)

Create `src/mcp/schemas.ts`:

```ts
import { z } from "zod";

export const zProjectId = z.string().min(1);
export const zCheckpointId = z.string().min(1);

export const zCheckpointScope = z.enum(["files", "files+chat", "files+chat+terminal", "full"]);
export const zRestoreMode = z.enum(["safe", "hard"]);
export const zRestoreScope = z.enum(["files", "files+chat"]);

export const zEnvMap = z.record(z.string());

export const zCheckpointCreateInput = z.object({
  projectId: zProjectId,
  name: z.string().min(1),
  scope: zCheckpointScope,
  mode: z.enum(["shallow", "full"]).default("shallow"),
  capsule: z
    .object({
      imageRef: z.string().min(1).optional(),
      // If you support pinning directly:
      imageDigest: z.string().min(1).optional(),
      workdir: z.string().min(1).optional(),
      env: zEnvMap.optional(),
    })
    .optional(),
});

export const zCheckpointRestoreInput = z.object({
  projectId: zProjectId,
  checkpointId: zCheckpointId,
  mode: zRestoreMode,
  restoreScope: zRestoreScope,
  backupCurrent: z.boolean().default(true),
  dryRun: z.boolean().default(false),
});

export const zCapsuleExecInput = z.object({
  projectId: zProjectId,
  capsuleId: z.string().min(1),
  command: z.string().min(1),
  cwd: z.string().optional(),
  timeoutMs: z.number().int().min(1000).max(10 * 60 * 1000).default(60_000),
});

// Optional for capsule upsert
export const zCapsuleUpsertInput = z.object({
  projectId: zProjectId,
  capsuleId: z.string().min(1),
  imageRef: z.string().min(1),
  workdir: z.string().min(1).default("/workspace"),
  env: zEnvMap.optional(),
});
```

> MCP SDK uses Zod schemas nicely (matches your earlier style).

---

## 2) Persistence contracts (minimal DB layer)

Create `src/store/repo.ts` (this is intentionally small and replaceable later):

```ts
export type Project = {
  projectId: string;
  rootPath: string;
  name: string;
  ignoreGlobs: string[];
};

export type CheckpointRow = {
  checkpointId: string;
  projectId: string;
  name: string;
  createdAt: string;
  scope: string;

  manifestBlobHash: string;

  chatHeadEventId?: string | null;
  terminalHeadEventId?: string | null;

  capsuleImageRef?: string | null;
  capsuleImageDigest?: string | null;
  capsuleWorkdir?: string | null;
  capsuleEnvJson?: string | null;
};

// You can back this by sqlite. For wiring demo, just define interface.
export interface Repo {
  getProject(projectId: string): Project | null;

  // store the manifest blob hash + pointers
  insertCheckpoint(input: Omit<CheckpointRow, "createdAt">): CheckpointRow;

  getCheckpoint(projectId: string, checkpointId: string): CheckpointRow | null;

  // head pointers (optional)
  getChatHeadEventId(projectId: string): string | null;
  getTerminalHeadEventId(projectId: string): string | null;

  // save terminal event (optional)
  appendEvent(projectId: string, type: string, tsIso: string, payload: any): { eventId: string };
}
```

You likely already have SQLite tables; wire your existing code to this interface.

---

## 3) Ignore resolver (gitignore-like)

Create `src/core/ignore.ts`:

```ts
import ignore from "ignore";

export function makeIgnoreMatcher(patterns: string[]) {
  const ig = ignore();
  ig.add(patterns);
  return (relPosix: string) => ig.ignores(relPosix);
}

// Sensible defaults for prod:
export const DEFAULT_IGNORES = [
  ".git/**",
  "node_modules/**",
  ".venv/**",
  "dist/**",
  "build/**",
  ".next/**",
  "target/**",
  "*.log",
  ".DS_Store",
];
```

Install: `npm i ignore`

---

## 4) Wire engine into MCP server

Create `src/mcp/server.ts`:

```ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import path from "node:path";

import { CasStore } from "../core/cas.js";
import { buildManifest, parseManifestJson } from "../core/manifest.js";
import { restoreWorkspaceAtomic } from "../core/restore.js";
import { ProjectLock } from "../core/lock.js";
import { DockerCapsuleManager } from "../core/capsule_docker.js";
import { TmError } from "../core/errors.js";
import { makeIgnoreMatcher, DEFAULT_IGNORES } from "../core/ignore.js";

import {
  zCheckpointCreateInput,
  zCheckpointRestoreInput,
  zCapsuleExecInput,
  zCapsuleUpsertInput,
} from "./schemas.js";

import type { Repo } from "../store/repo.js";

export function createTmMcpServer(opts: {
  repo: Repo;
  dataDir: string;
}) {
  const server = new McpServer({ name: "ai-time-machine-mcp", version: "0.1.0" });

  const blobsDir = path.join(opts.dataDir, "blobs");
  const cas = new CasStore(blobsDir);
  const capsuleMgr = new DockerCapsuleManager();

  function toToolError(e: unknown) {
    if (e instanceof TmError) {
      return { code: e.code, message: e.message, details: e.details ?? {} };
    }
    if (e instanceof Error) {
      return { code: "TM_IO_ERROR", message: e.message, details: {} };
    }
    return { code: "TM_IO_ERROR", message: "Unknown error", details: {} };
  }

  // -----------------------------
  // tm_checkpoint_create
  // -----------------------------
  server.tool(
    "tm_checkpoint_create",
    "Create a checkpoint (manifest + blob store) and store pointers to chat/terminal heads",
    zCheckpointCreateInput.shape,
    async (input) => {
      try {
        const project = opts.repo.getProject(input.projectId);
        if (!project) throw new TmError("TM_PROJECT_NOT_FOUND", "Project not found", { projectId: input.projectId });

        const lock = new ProjectLock(project.rootPath);
        lock.acquire();
        try {
          const ignoreMatcher = makeIgnoreMatcher([...(project.ignoreGlobs ?? []), ...DEFAULT_IGNORES]);

          // Build manifest + write file blobs into CAS
          const { manifest, fileCount } = await buildManifest(project.rootPath, cas, {
            ignore: ignoreMatcher,
            maxFileBytes: 25 * 1024 * 1024,
          });

          // Store manifest itself as a blob
          const manifestText = JSON.stringify(
            { ...manifest, ignore: [...(project.ignoreGlobs ?? []), ...DEFAULT_IGNORES] },
            null,
            2
          );
          const manifestBlob = cas.putBytes("application/json", Buffer.from(manifestText, "utf8"));

          // Capture head pointers (best-effort)
          const chatHead = input.scope.includes("chat") ? opts.repo.getChatHeadEventId(project.projectId) : null;
          const termHead = input.scope.includes("terminal") ? opts.repo.getTerminalHeadEventId(project.projectId) : null;

          // Capsule metadata (pin digest if imageRef provided)
          let capsuleImageRef: string | null = null;
          let capsuleImageDigest: string | null = null;
          let capsuleWorkdir: string | null = null;
          let capsuleEnvJson: string | null = null;

          if (input.capsule?.imageRef) {
            capsuleImageRef = input.capsule.imageRef;
            const { imageDigest } = await capsuleMgr.ensureImage(input.capsule.imageRef);
            capsuleImageDigest = imageDigest;
            capsuleWorkdir = input.capsule.workdir ?? "/workspace";
            capsuleEnvJson = input.capsule.env ? JSON.stringify(input.capsule.env) : null;
          } else if (input.capsule?.imageDigest) {
            // If you allow explicit digest pinning (advanced)
            capsuleImageDigest = input.capsule.imageDigest;
            capsuleWorkdir = input.capsule.workdir ?? "/workspace";
            capsuleEnvJson = input.capsule.env ? JSON.stringify(input.capsule.env) : null;
          }

          const row = opts.repo.insertCheckpoint({
            checkpointId: `cp_${cryptoRandomId()}`,
            projectId: project.projectId,
            name: input.name,
            scope: input.scope,
            manifestBlobHash: manifestBlob.hash,
            chatHeadEventId: chatHead,
            terminalHeadEventId: termHead,
            capsuleImageRef,
            capsuleImageDigest,
            capsuleWorkdir,
            capsuleEnvJson,
          });

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    checkpointId: row.checkpointId,
                    createdAt: row.createdAt,
                    fileCount,
                    manifestBlob,
                    chatHeadEventId: row.chatHeadEventId ?? null,
                    terminalHeadEventId: row.terminalHeadEventId ?? null,
                    capsule: capsuleImageDigest
                      ? { imageRef: capsuleImageRef, imageDigest: capsuleImageDigest, workdir: capsuleWorkdir }
                      : null,
                  },
                  null,
                  2
                ),
              },
            ],
          };
        } finally {
          lock.release();
        }
      } catch (e) {
        const err = toToolError(e);
        return {
          content: [{ type: "text", text: JSON.stringify({ error: err }, null, 2) }],
          isError: true,
        };
      }
    }
  );

  // -----------------------------
  // tm_checkpoint_restore
  // -----------------------------
  server.tool(
    "tm_checkpoint_restore",
    "Restore workspace (atomic) to checkpoint; optionally return chat head pointer for context rehydrate",
    zCheckpointRestoreInput.shape,
    async (input) => {
      try {
        const project = opts.repo.getProject(input.projectId);
        if (!project) throw new TmError("TM_PROJECT_NOT_FOUND", "Project not found", { projectId: input.projectId });

        const cp = opts.repo.getCheckpoint(input.projectId, input.checkpointId);
        if (!cp) {
          throw new TmError("TM_CHECKPOINT_NOT_FOUND", "Checkpoint not found", {
            projectId: input.projectId,
            checkpointId: input.checkpointId,
          });
        }

        const lock = new ProjectLock(project.rootPath);
        lock.acquire();
        try {
          // Load manifest blob
          const manifestBuf = cas.getBytes(cp.manifestBlobHash);
          const manifest = parseManifestJson(manifestBuf.toString("utf8"));

          if (input.dryRun) {
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(
                    {
                      dryRun: true,
                      willWriteFiles: manifest.files.length,
                      mode: input.mode,
                      backupCurrent: input.backupCurrent,
                    },
                    null,
                    2
                  ),
                },
              ],
            };
          }

          const res = restoreWorkspaceAtomic({
            projectRoot: project.rootPath,
            cas,
            manifest,
            mode: input.mode,
            backupCurrent: input.backupCurrent,
          });

          // Return chat head pointer (rehydrate) if requested and exists
          const chatHeadEventId =
            input.restoreScope === "files+chat" ? (cp.chatHeadEventId ?? null) : null;

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    restored: { filesWritten: res.filesWritten },
                    backupPath: res.backupPath ?? null,
                    chatHeadEventId,
                    capsule: cp.capsuleImageDigest
                      ? {
                          imageRef: cp.capsuleImageRef,
                          imageDigest: cp.capsuleImageDigest,
                          workdir: cp.capsuleWorkdir,
                          env: cp.capsuleEnvJson ? JSON.parse(cp.capsuleEnvJson) : null,
                        }
                      : null,
                  },
                  null,
                  2
                ),
              },
            ],
          };
        } finally {
          lock.release();
        }
      } catch (e) {
        const err = toToolError(e);
        return {
          content: [{ type: "text", text: JSON.stringify({ error: err }, null, 2) }],
          isError: true,
        };
      }
    }
  );

  // -----------------------------
  // tm_capsule_upsert (optional but needed for exec)
  // -----------------------------
  server.tool(
    "tm_capsule_upsert",
    "Create or reuse a project capsule container (pinned image digest) and mount workspace",
    zCapsuleUpsertInput.shape,
    async (input) => {
      try {
        const project = opts.repo.getProject(input.projectId);
        if (!project) throw new TmError("TM_PROJECT_NOT_FOUND", "Project not found", { projectId: input.projectId });

        const cap = await capsuleMgr.upsert({
          capsuleId: input.capsuleId,
          imageRef: input.imageRef,
          projectRoot: project.rootPath,
          workdir: input.workdir,
          env: input.env,
        });

        return {
          content: [{ type: "text", text: JSON.stringify(cap, null, 2) }],
        };
      } catch (e) {
        const err = toToolError(e);
        return {
          content: [{ type: "text", text: JSON.stringify({ error: err }, null, 2) }],
          isError: true,
        };
      }
    }
  );

  // -----------------------------
  // tm_capsule_exec
  // -----------------------------
  server.tool(
    "tm_capsule_exec",
    "Execute a command in a capsule and store stdout/stderr as blobs; also emit terminal events for replay",
    zCapsuleExecInput.shape,
    async (input) => {
      try {
        const project = opts.repo.getProject(input.projectId);
        if (!project) throw new TmError("TM_PROJECT_NOT_FOUND", "Project not found", { projectId: input.projectId });

        // Emit term.command event (optional but recommended)
        opts.repo.appendEvent(input.projectId, "term.command", new Date().toISOString(), {
          capsuleId: input.capsuleId,
          command: input.command,
          cwd: input.cwd ?? null,
        });

        const containerName = `aitm_${input.capsuleId}`;
        const r = await capsuleMgr.exec({
          containerNameOrId: containerName,
          command: input.command,
          cwd: input.cwd,
          timeoutMs: input.timeoutMs,
        });

        const stdoutBlob = cas.putBytes("text/plain", r.stdout);
        const stderrBlob = cas.putBytes("text/plain", r.stderr);

        // Emit term.exit + refs
        opts.repo.appendEvent(input.projectId, "term.exit", new Date().toISOString(), {
          capsuleId: input.capsuleId,
          command: input.command,
          exitCode: r.exitCode,
          stdoutHash: stdoutBlob.hash,
          stderrHash: stderrBlob.hash,
        });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  exitCode: r.exitCode,
                  stdoutBlob,
                  stderrBlob,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (e) {
        const err = toToolError(e);
        return {
          content: [{ type: "text", text: JSON.stringify({ error: err }, null, 2) }],
          isError: true,
        };
      }
    }
  );

  return server;
}

// tiny helper: no external dep needed
function cryptoRandomId() {
  // 16 hex chars
  return Array.from(crypto.getRandomValues(new Uint8Array(8)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
```

**Important note:** `crypto.getRandomValues` is Web Crypto API; in Node you can use `node:crypto`. Replace helper with Node version:

```ts
import crypto from "node:crypto";
function cryptoRandomId() {
  return crypto.randomBytes(8).toString("hex");
}
```

---

## 4) Entry point: `src/index.ts`

```ts
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createTmMcpServer } from "./mcp/server.js";
import { repo } from "./store/sqlite_repo.js"; // your sqlite implementation
import path from "node:path";

const DATA_DIR = process.env.TM_DATA_DIR ?? path.resolve(process.cwd(), ".tmdata");

async function main() {
  const server = createTmMcpServer({ repo, dataDir: DATA_DIR });
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("Fatal MCP server error:", err);
  process.exit(1);
});
```

---

## 5) Minimal dependencies you need for this wiring

Server:

* `@modelcontextprotocol/sdk`
* `zod`
* `dockerode`
* `ignore`
* plus your sqlite package (`better-sqlite3` recommended)

---

# B) Production features (GC, integrity, chunking, redaction, cloud sync boundaries)

This is the stuff that makes it **production** rather than “cool demo”.

## 1) GC (garbage collection) for blobs

### Problem

CAS will grow forever unless you remove unreferenced blobs.

### Approach (mark & sweep)

* **Roots**: all checkpoint manifest blobs + any “pinned” blobs (exports, user tags)
* Parse each manifest, mark each file blob hash as reachable
* Sweep: delete blob files not in reachable set and older than safety window

### Interface

* `tm_gc_run({ projectId?, dryRun })` (CLI is fine; MCP optional)

### Safety window

* Never delete:

  * blobs referenced by any checkpoint
  * blobs created in last N days (e.g. 7 days), even if unreferenced (crash recovery)

---

## 2) Integrity verification

### What to verify

* Every checkpoint’s `manifestBlobHash` exists and hashes correctly
* Every file entry blob exists
* Optional deep verify:

  * read blob bytes → re-hash → equals filename hash

### When

* On startup (light check)
* On demand (deep check)
* Before restore (verify manifest + referenced blobs)

### Tool

* `tm_integrity_check({ projectId, level: "light"|"deep" })`

---

## 3) Chunked blobs (for huge files / streaming outputs)

### Problem

Storing 200MB+ files as a single blob is slow and makes GC/transfer heavy.

### Solution: chunked CAS

* Split into fixed or content-defined chunks (e.g. 4MB)
* Store:

  * chunk blobs by SHA
  * a “meta-blob” listing chunk hashes in order
* File entry becomes:

  * either `hash` for small files
  * or `chunkedRef` for large files

### Format

```json
{
  "type": "chunked",
  "chunkSize": 4194304,
  "chunks": ["hash1","hash2", "..."],
  "totalSize": 987654321
}
```

### Threshold

* Enable chunking above 25–50MB.

---

## 4) Secret redaction (must-have)

### Problem

If you store `.env`, private keys, tokens, you’re dead.

### Minimum viable protection

* **Ignore patterns** + warnings
* **Secret scanner** before writing blobs:

  * if match → do not store, or store as redacted placeholder
* Record a redaction event for audit

### Redaction strategy

* Replace blob contents with:

  * `"REDACTED"` + metadata (filename, reason)
* Or encrypt “sensitive class” blobs with a separate key and restrict sync

### Tooling options

* Start with:

  * regex heuristics (AWS keys, Solana private keys, JWTs)
* Later:

  * run `gitleaks` as subprocess for better coverage

### MCP boundary

* MCP tools must never return raw secret blobs by default.
* `tm_fs_get_file` should have a `allowSensitive=false` default.

---

## 5) Cloud sync boundaries (how to avoid a nightmare)

You want cloud sync, but only if the boundaries are crisp.

### Rule: cloud is a replication layer, not the source of truth

Local is authoritative; cloud is:

* encrypted blob replication
* checkpoint metadata replication
* team sharing later

### What syncs

* blobs (CAS)
* manifests
* checkpoint rows
* minimal event index (not necessarily every raw terminal chunk unless needed)

### What doesn’t sync by default

* secret-class blobs
* massive artifacts (node_modules, caches)

### Encryption

* Generate per-project key:

  * encrypt each blob before upload
* Store keys locally (or user-managed, or KMS for teams)

### Sync protocol (simple & robust)

* “upload missing hashes”
* “download missing hashes”
* “checkpoint metadata is small; blobs are large”

### Consistency model

* Eventually consistent
* Checkpoints are immutable; edits become new checkpoints

---

# What I’d implement next (in order)

1. **Integrity verify before restore** (prevents corrupted restores)
2. **GC mark & sweep** (prevents infinite storage growth)
3. **Secret redaction** (prevents catastrophic leaks)
4. **Chunked blobs** (unlocks large repos + logs)
5. **Cloud sync boundaries** (encryption + hash replication)

---
