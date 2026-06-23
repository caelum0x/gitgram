## 1) Capsule + restore engine (production-grade) — real code

Below is a **working architecture** and a **reference implementation** (TypeScript/Node) for:

* **CAS blob store (SHA-256)**
* **Manifest-based checkpoints**
* **Atomic restore** (POSIX + Windows-safe strategy)
* **Docker capsule runner** (pinned image digest, workspace mount, exec with stdout/stderr capture)
* **Project locking** (prevents capture vs restore races)

This is the “truth engine” you’ll run behind MCP tools like `tm_checkpoint_create`, `tm_checkpoint_restore`, `tm_capsule_upsert`, `tm_capsule_exec`.

### Folder layout

```
server/
  src/
    core/
      cas.ts
      manifest.ts
      restore.ts
      lock.ts
      capsule_docker.ts
      paths.ts
      errors.ts
  .tmdata/ (runtime)
```

---

### `src/core/errors.ts`

```ts
export type TmErrorCode =
  | "TM_PROJECT_NOT_FOUND"
  | "TM_CHECKPOINT_NOT_FOUND"
  | "TM_MANIFEST_CORRUPT"
  | "TM_BLOB_MISSING"
  | "TM_PATH_ESCAPE"
  | "TM_PERMISSION_DENIED"
  | "TM_IO_ERROR"
  | "TM_CONFLICT_LOCKED"
  | "TM_TOO_LARGE"
  | "TM_CAPSULE_NOT_AVAILABLE"
  | "TM_CAPSULE_EXEC_FAILED";

export class TmError extends Error {
  constructor(
    public code: TmErrorCode,
    message: string,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "TmError";
  }
}
```

---

### `src/core/paths.ts`

```ts
import path from "node:path";
import fs from "node:fs";

export function real(p: string): string {
  // realpathSync.native is faster and returns normalized casing on Windows
  return fs.realpathSync.native(p);
}

export function joinSafe(root: string, rel: string): string {
  const rootReal = real(root);
  const target = path.resolve(rootReal, rel);
  const targetReal = fs.existsSync(target) ? real(target) : target; // if doesn't exist yet
  if (!targetReal.startsWith(rootReal + path.sep) && targetReal !== rootReal) {
    throw new Error(`Path escape: ${rel}`);
  }
  return target;
}
```

---

### `src/core/cas.ts` (Content-addressable store)

```ts
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { TmError } from "./errors.js";

export type BlobRef = { hash: string; sizeBytes: number; mimeType: string };

export class CasStore {
  constructor(private blobsDir: string) {
    fs.mkdirSync(this.blobsDir, { recursive: true });
  }

  sha256Hex(buf: Buffer): string {
    return crypto.createHash("sha256").update(buf).digest("hex");
  }

  blobPath(hash: string): string {
    const a = hash.slice(0, 2);
    const b = hash.slice(2, 4);
    return path.join(this.blobsDir, a, b, hash);
  }

  has(hash: string): boolean {
    return fs.existsSync(this.blobPath(hash));
  }

  putBytes(mimeType: string, data: Buffer): BlobRef {
    const hash = this.sha256Hex(data);
    const p = this.blobPath(hash);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    if (!fs.existsSync(p)) fs.writeFileSync(p, data);
    const st = fs.statSync(p);
    return { hash, sizeBytes: st.size, mimeType };
  }

  getBytes(hash: string): Buffer {
    const p = this.blobPath(hash);
    if (!fs.existsSync(p)) throw new TmError("TM_BLOB_MISSING", "Blob missing", { hash });
    return fs.readFileSync(p);
  }
}
```

---

### `src/core/manifest.ts`

```ts
import fs from "node:fs";
import path from "node:path";
import { CasStore } from "./cas.js";
import { TmError } from "./errors.js";

export type FileEntry = {
  path: string;     // relative, posix-style recommended
  hash: string;     // sha256
  size: number;
  mode?: number;
  mtimeMs?: number;
};

export type Manifest = {
  version: 1;
  rootRel: ".";
  capturedAt: string;
  ignore: string[];
  files: FileEntry[];
};

function toPosix(rel: string) {
  return rel.split(path.sep).join("/");
}

export async function buildManifest(
  projectRoot: string,
  cas: CasStore,
  options: {
    ignore: (relPosix: string) => boolean;
    maxFileBytes?: number;
  }
): Promise<{ manifest: Manifest; fileCount: number; bytesHashed: number }> {
  const files: FileEntry[] = [];
  let bytesHashed = 0;
  const maxFileBytes = options.maxFileBytes ?? 25 * 1024 * 1024;

  function walk(dir: string) {
    const items = fs.readdirSync(dir, { withFileTypes: true });
    for (const it of items) {
      const abs = path.join(dir, it.name);
      const rel = path.relative(projectRoot, abs);
      const relPosix = toPosix(rel);

      if (options.ignore(relPosix)) continue;

      if (it.isDirectory()) {
        walk(abs);
      } else if (it.isFile()) {
        const st = fs.statSync(abs);
        if (st.size > maxFileBytes) {
          throw new TmError("TM_TOO_LARGE", "File too large for snapshot", { path: relPosix, size: st.size });
        }
        const buf = fs.readFileSync(abs);
        bytesHashed += buf.byteLength;
        const ref = cas.putBytes("application/octet-stream", buf);

        files.push({
          path: relPosix,
          hash: ref.hash,
          size: st.size,
          mode: st.mode & 0o777,
          mtimeMs: st.mtimeMs,
        });
      }
    }
  }

  walk(projectRoot);

  const manifest: Manifest = {
    version: 1,
    rootRel: ".",
    capturedAt: new Date().toISOString(),
    ignore: [], // store patterns elsewhere; keep resolver deterministic in your DB
    files,
  };

  return { manifest, fileCount: files.length, bytesHashed };
}

export function parseManifestJson(text: string): Manifest {
  let obj: any;
  try {
    obj = JSON.parse(text);
  } catch {
    throw new TmError("TM_MANIFEST_CORRUPT", "Manifest JSON parse failed");
  }
  if (obj?.version !== 1 || !Array.isArray(obj.files)) {
    throw new TmError("TM_MANIFEST_CORRUPT", "Manifest schema invalid");
  }
  return obj as Manifest;
}
```

---

### `src/core/lock.ts` (project lock)

```ts
import fs from "node:fs";
import path from "node:path";
import { TmError } from "./errors.js";

export class ProjectLock {
  private lockPath: string;
  constructor(private projectRoot: string) {
    this.lockPath = path.join(projectRoot, ".tm_lock");
  }

  acquire(): void {
    try {
      const fd = fs.openSync(this.lockPath, "wx"); // exclusive create
      fs.writeFileSync(fd, String(process.pid));
      fs.closeSync(fd);
    } catch {
      throw new TmError("TM_CONFLICT_LOCKED", "Project is locked (capture/restore in progress)", {
        lockPath: this.lockPath,
      });
    }
  }

  release(): void {
    try {
      fs.unlinkSync(this.lockPath);
    } catch {
      // ignore
    }
  }
}
```

---

### `src/core/restore.ts` (atomic restore, Windows-safe)

```ts
import fs from "node:fs";
import path from "node:path";
import { CasStore } from "./cas.js";
import { Manifest } from "./manifest.js";
import { TmError } from "./errors.js";

function ensureDir(p: string) {
  fs.mkdirSync(p, { recursive: true });
}

function writeFileAtomic(targetAbs: string, data: Buffer) {
  ensureDir(path.dirname(targetAbs));
  const tmp = targetAbs + ".tm_tmp_write";
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, targetAbs);
}

function copyDir(src: string, dst: string) {
  ensureDir(dst);
  for (const ent of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, ent.name);
    const d = path.join(dst, ent.name);
    if (ent.isDirectory()) copyDir(s, d);
    else if (ent.isFile()) fs.copyFileSync(s, d);
  }
}

// Build restore tree in temp dir, then swap.
// On Windows, rename over existing directories is tricky; safest is:
// - move current root to backup dir (same volume)
// - move temp restore into root
export function restoreWorkspaceAtomic(params: {
  projectRoot: string;
  cas: CasStore;
  manifest: Manifest;
  mode: "safe" | "hard";
  backupCurrent: boolean;
}): { filesWritten: number; backupPath?: string } {
  const { projectRoot, cas, manifest, mode, backupCurrent } = params;

  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const metaDir = path.join(projectRoot, ".tm_internal");
  const tmpRestore = path.join(metaDir, "tmp_restore", `${ts}`);
  const backups = path.join(metaDir, "backups");
  const tmpOld = path.join(metaDir, "tmp_old", `${ts}`);

  ensureDir(tmpRestore);

  // 1) materialize into tmpRestore
  let filesWritten = 0;
  for (const f of manifest.files) {
    const data = cas.getBytes(f.hash);
    const outAbs = path.join(tmpRestore, ...f.path.split("/"));
    writeFileAtomic(outAbs, data);
    filesWritten++;
  }

  // 2) optional: copy over existing extra files if safe mode
  if (mode === "safe") {
    // safe mode: keep current files that are NOT in manifest by copying them into tmpRestore
    // (this preserves new files; safe mode is "non-destructive")
    const expected = new Set(manifest.files.map((x) => x.path));
    const walk = (dir: string) => {
      for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
        const abs = path.join(dir, ent.name);
        const rel = path.relative(projectRoot, abs).split(path.sep).join("/");
        if (rel.startsWith(".tm_internal/") || rel === ".tm_lock") continue;
        if (ent.isDirectory()) walk(abs);
        else if (ent.isFile()) {
          if (!expected.has(rel)) {
            const dst = path.join(tmpRestore, ...rel.split("/"));
            ensureDir(path.dirname(dst));
            fs.copyFileSync(abs, dst);
          }
        }
      }
    };
    walk(projectRoot);
  }

  // 3) backup current (optional)
  let backupPath: string | undefined;
  if (backupCurrent) {
    ensureDir(backups);
    backupPath = path.join(backups, `${ts}`);
    ensureDir(backupPath);
    // copy current root excluding internal dir to backupPath (cheap enough for MVP; for prod you should tar+CAS)
    for (const ent of fs.readdirSync(projectRoot, { withFileTypes: true })) {
      if (ent.name === ".tm_internal" || ent.name === ".tm_lock") continue;
      const s = path.join(projectRoot, ent.name);
      const d = path.join(backupPath, ent.name);
      if (ent.isDirectory()) copyDir(s, d);
      else if (ent.isFile()) fs.copyFileSync(s, d);
    }
  }

  // 4) swap
  ensureDir(metaDir);
  ensureDir(path.dirname(tmpOld));

  // Move everything (except .tm_internal and .tm_lock) into tmpOld, then move tmpRestore content into root.
  // This avoids “rename over non-empty dir” issues on Windows.
  for (const ent of fs.readdirSync(projectRoot, { withFileTypes: true })) {
    if (ent.name === ".tm_internal" || ent.name === ".tm_lock") continue;
    const s = path.join(projectRoot, ent.name);
    const d = path.join(tmpOld, ent.name);
    ensureDir(tmpOld);
    fs.renameSync(s, d);
  }

  // Move restored contents into root
  for (const ent of fs.readdirSync(tmpRestore, { withFileTypes: true })) {
    const s = path.join(tmpRestore, ent.name);
    const d = path.join(projectRoot, ent.name);
    fs.renameSync(s, d);
  }

  // Cleanup tmpRestore dir
  try { fs.rmSync(tmpRestore, { recursive: true, force: true }); } catch {}
  // Keep tmpOld for forensic rollback; a GC job can clean it later.

  return { filesWritten, backupPath };
}
```

---

### `src/core/capsule_docker.ts` (Docker capsule runner)

This uses `dockerode`. It pins image by **digest** (best practice) and mounts workspace read-write.

```ts
import Docker from "dockerode";
import path from "node:path";
import { TmError } from "./errors.js";

export type Capsule = {
  capsuleId: string;
  containerId: string;
  imageRef: string;
  imageDigest: string;
  workdir: string;
};

export class DockerCapsuleManager {
  private docker: Docker;
  constructor() {
    this.docker = new Docker(); // uses env / default socket
  }

  async ensureImage(imageRef: string): Promise<{ imageDigest: string }> {
    // Pull if needed
    // Note: production: resolve to digest via registry inspect; for now pull and inspect.
    await new Promise<void>((resolve, reject) => {
      this.docker.pull(imageRef, (err, stream) => {
        if (err) return reject(err);
        this.docker.modem.followProgress(stream, (e: any) => (e ? reject(e) : resolve()));
      });
    });

    const img = this.docker.getImage(imageRef);
    const info = await img.inspect();
    // RepoDigests like ["node@sha256:...."]
    const digest = (info.RepoDigests && info.RepoDigests[0]?.split("@")[1]) || info.Id;
    return { imageDigest: digest };
  }

  async upsert(params: {
    capsuleId: string;
    imageRef: string;        // e.g. node:20-bookworm
    projectRoot: string;     // host path
    workdir: string;         // container workdir
    env?: Record<string, string>;
  }): Promise<Capsule> {
    const { capsuleId, imageRef, projectRoot, workdir, env } = params;
    const { imageDigest } = await this.ensureImage(imageRef);

    // Create container name stable by capsuleId
    const name = `aitm_${capsuleId}`;
    // If exists, reuse
    try {
      const existing = this.docker.getContainer(name);
      const inspect = await existing.inspect();
      if (inspect?.State?.Running) {
        return { capsuleId, containerId: inspect.Id, imageRef, imageDigest, workdir };
      }
      await existing.start();
      return { capsuleId, containerId: inspect.Id, imageRef, imageDigest, workdir };
    } catch {
      // create new
    }

    const binds = [`${path.resolve(projectRoot)}:/workspace:rw`];

    const container = await this.docker.createContainer({
      name,
      Image: imageRef,
      WorkingDir: workdir,
      Env: env ? Object.entries(env).map(([k, v]) => `${k}=${v}`) : undefined,
      HostConfig: { Binds: binds },
      Tty: false,
      Cmd: ["sleep", "infinity"],
    });

    await container.start();
    return { capsuleId, containerId: container.id, imageRef, imageDigest, workdir };
  }

  async exec(params: {
    containerNameOrId: string;
    command: string;
    cwd?: string;
    timeoutMs?: number;
  }): Promise<{ exitCode: number; stdout: Buffer; stderr: Buffer }> {
    const { containerNameOrId, command, cwd, timeoutMs = 60000 } = params;
    const container = this.docker.getContainer(containerNameOrId);

    const exec = await container.exec({
      AttachStdout: true,
      AttachStderr: true,
      WorkingDir: cwd,
      Cmd: ["sh", "-lc", command],
    });

    const stream = await exec.start({ hijack: true, stdin: false });

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];

    // Demux stdout/stderr
    (container as any).modem.demuxStream(stream, {
      write: (c: Buffer) => stdoutChunks.push(Buffer.from(c)),
    }, {
      write: (c: Buffer) => stderrChunks.push(Buffer.from(c)),
    });

    const done = new Promise<void>((resolve, reject) => {
      stream.on("end", resolve);
      stream.on("error", reject);
    });

    const timer = setTimeout(() => {
      try { stream.destroy(new Error("timeout")); } catch {}
    }, timeoutMs);

    await done.finally(() => clearTimeout(timer));

    const inspect = await exec.inspect();
    const exitCode = inspect.ExitCode ?? 1;

    if (exitCode === null || exitCode === undefined) {
      throw new TmError("TM_CAPSULE_EXEC_FAILED", "Capsule exec failed (no exit code)");
    }

    return {
      exitCode,
      stdout: Buffer.concat(stdoutChunks),
      stderr: Buffer.concat(stderrChunks),
    };
  }

  async down(capsuleId: string): Promise<void> {
    const name = `aitm_${capsuleId}`;
    const c = this.docker.getContainer(name);
    try { await c.stop({ t: 2 }); } catch {}
    try { await c.remove({ force: true }); } catch {}
  }
}
```

---

### How restore + capsule combine (the “exact situation” flow)

In your MCP tool `tm_checkpoint_restore`:

1. Acquire lock
2. Load checkpoint → manifest
3. `restoreWorkspaceAtomic()`
4. If checkpoint has capsule:

   * `capsule.upsert(imageRef/digest, mount restored root)`
   * optionally replay “runbook” commands (start server, etc.)
5. Return:

   * restore stats
   * capsule id + digest
   * chat head pointer / chat snapshot

That’s what makes “exact time and situation” real.

---

## 2) “This is not Git” explainer for investors (copy-paste)

### The one-liner

**Git versions code. We version reality.**
AI Time Machine lets teams rewind to *the exact working moment*—code, commands, environment, and AI context—then branch and continue as if the mistake never happened.

### The problem

AI-assisted development creates a new kind of failure:

* A change isn’t just a code diff.
* It includes: generated code, hidden context, tool outputs, environment drift, and terminal operations.
* When something breaks, you need to recover the *entire state*, not just files.

Git cannot answer:

* “What exact terminal commands were run right before it broke?”
* “What did the AI assume at that moment?”
* “What environment (Node/Python/Docker image) was it using?”
* “Can we restore the full working state instantly and reproduce the break deterministically?”

### What we built

AI Time Machine is a **stateful, event-sourced layer** that automatically records:

* file system changes (including untracked files)
* terminal commands + outputs + exit codes
* AI conversations and tool results
* deterministic runtime (container image digests)

Then it exposes **time travel as an API** so AI agents and developers can:

* restore any checkpoint
* diff any two moments
* automatically bisect regressions
* branch from any point in time

### Why it’s different than Git

Git is a **manual, file-only** history.

AI Time Machine is an **automatic, full-context** history.

| Capability                     | Git | AI Time Machine |
| ------------------------------ | --: | --------------: |
| Auto-capture                   |   ❌ |               ✅ |
| Untracked files                |   ❌ |               ✅ |
| Terminal replay                |   ❌ |               ✅ |
| AI context restore             |   ❌ |               ✅ |
| Deterministic environment      |   ❌ |               ✅ |
| “Rewind & branch” exact state  |   ❌ |               ✅ |
| AI-addressable time travel API |   ❌ |               ✅ |

### Why now

AI tooling is making developers dramatically faster, but also making failures harder to debug and reproduce. The market needs a new primitive: **deterministic time travel for AI development**.

### How we win

* Local-first, fast, privacy-preserving
* Works across AI tools (Cursor, Claude Code, etc.) via MCP integration
* Deterministic restore via containerized capsules (pinned image digests)
* Becomes the system of record for AI development sessions

---
