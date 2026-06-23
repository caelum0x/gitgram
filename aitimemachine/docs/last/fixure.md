You’re asking the *right* question: **how can an MCP server “restore a folder”** if it’s just a tool interface? The answer is: MCP doesn’t magically roll back your disk—**it gives the AI a typed API to call**, and **your MCP server implements the restore by writing files to the real filesystem (or to a capsule filesystem)** using the checkpoint’s manifest + blob store.

Below is the *full mental model* + concrete mechanics (capture → store → restore) and how Claude Code / Cursor actually use it.

---

## 1) What “restore folder” means in practice

A checkpoint is not “a folder copy”. It’s:

1. **Manifest** = list of every file path + its SHA-256 hash + metadata
2. **Blob store** = file contents stored once by hash (deduped)

So “restore folder” means:

* For each file in manifest:

  * load blob by hash
  * write to `<projectRoot>/<relativePath>`
  * ensure parent dirs exist
  * set mode (optional)
* Delete files that exist now but didn’t exist in manifest (hard restore)
* Optionally restore chat “head pointer” (so the AI can load the chat snapshot that matches)

That’s it. MCP is just the way the AI triggers it.

---

## 2) Capture: how do we “get all files + diffs” without copying everything each time?

### A) Capture files (incremental)

On each capture interval (e.g. 5 minutes), you scan:

* file list (respect ignore rules)
* file stat (size, mtime)
* only read content if changed (mtime/size changed)
* compute sha256(content)
* store blob if not already present

**You store the *manifest every time*, not the full file contents every time.**
Contents dedupe via hash.

### B) Capture diffs (optional but nice)

You have two strategies:

**Strategy 1 (simple, MVP):**
Store only full-file blobs + manifests. Diff is computed later by comparing hashes.
If user wants a patch, you compute it on request.

**Strategy 2 (extra):**
Also store patch blobs per change batch (unified diff).
Faster “show me what changed”, but not required for restore.

MVP should do Strategy 1.

---

## 3) Store: content-addressable + manifests

### Blob store layout (CAS)

```
.tmdata/
  blobs/
    aa/bb/<sha256>
  manifests/
    <manifestId>.json   (or also stored as blob)
  events.db             (SQLite indices)
```

### Manifest example

```json
{
  "version": 1,
  "root": "/abs/path/project",
  "capturedAt": "2025-12-24T02:00:00.000Z",
  "files": [
    { "path": "src/api.ts", "hash": "aab3...", "size": 1024, "mode": 420, "mtimeMs": 1735005600000 }
  ],
  "ignore": ["node_modules/**",".git/**","dist/**"]
}
```

### Why this scales

If 100k files exist, but only 20 changed, you only write:

* one small manifest
* blobs for those 20 files

Everything else is just references by hash.

---

## 4) Restore: how MCP actually changes the folder

When AI calls `tm_checkpoint_restore`, your server does:

### Restore algorithm (hard restore)

1. Load checkpoint → get `manifestId` (or manifest blob hash)
2. Read manifest JSON
3. Build set of expected paths
4. For each file in manifest:

   * blobPath = `blobs/<hash[0:2]>/<hash[2:4]>/<hash>`
   * `mkdir -p dirname(target)`
   * write content bytes
   * set permissions (optional)
5. Scan current project tree
6. Delete files not in expected set (optional; only in hard mode)
7. Return summary (restored count, deleted count)

This is exactly how you “restore a folder”: **reconstruct folder state from hashes**.

### Restore modes (must-have)

* **safe restore**: only overwrite files that exist in checkpoint; don’t delete extras
* **hard restore**: overwrite + delete files not present in checkpoint

---

## 5) How Claude Code / Cursor “get back chat + context”

Two pieces:

### A) Chat capture

You’re storing chat messages as events in your DB:

* `chat.message` events with `{ tool: "cursor"|"claude", threadId, role, content, ts }`
* optionally attachments or tool results as blobs

### B) Chat restore

A checkpoint stores pointers:

* `chat_head_event_id` (or a chat snapshot id)
  So restore returns:
* the list of messages up to that head (or an ID the client can fetch via resource)

**Important:** The AI tool may not let you “replace its UI chat history.”
So the integration pattern is:

* On restore, you return the historical messages as data
* The extension/client rehydrates context by:

  * opening a “Restored Context” panel
  * or creating a new thread with “Here is the restored context…”
  * or injecting as “system/context” message if supported

So “restoring chat” means: *making the tool see the old conversation again*, not necessarily editing its built-in chat log.

---

## 6) How AI tools call it (real flow)

User says: “Go back to before the error.”

AI does:

1. `tm_list_checkpoints(projectId)`
2. chooses the right checkpoint (by timestamp/name/test status)
3. calls `tm_checkpoint_restore({ checkpointId, mode: "hard", restoreScope: "files+chat" })`
4. server restores files to disk
5. server returns chat snapshot/messages
6. extension shows restored chat or injects into the new context
7. AI continues with the recovered working state

That’s all MCP needs to do: provide these verbs.

---

## 7) What MCP “capabilities” you need for folder/files (tool list)

Minimum MCP tools for “restore folder”:

* `tm_checkpoint_create` → create manifest + pointers
* `tm_checkpoint_list` → list checkpoints
* `tm_checkpoint_restore` → write blobs back to filesystem
* `tm_fs_get_file` → fetch a file at checkpoint (debugging)
* `tm_diff_checkpoints` → compute hash diffs (and optional patches)

Optional but powerful:

* `tm_fs_list_tree` at checkpoint
* `tm_search_timeline` (“find when src/api.ts changed”)
* `tm_bisect` (auto find breaking checkpoint)

---

## 8) The “context” part (what you store besides files + chat)

If you want truly reproducible “before error”:

* terminal commands + outputs as events
* package manager lockfiles captured (they’re files)
* container image digest used (capsule)
* env metadata (node/python version, etc.)

**That’s the missing glue** between “files restored” and “project actually runs.”

---

## 9) Capsule mode makes restore actually deterministic

Without a capsule, host machine drift happens (Node version changes, global deps, etc.).

With capsule:

* checkpoint pins `imageDigest`
* restore starts container from that digest
* workspace restored + mounted
* commands run inside the same environment

So “go back before error” becomes:

* restore files
* run tests in capsule
* now it behaves the same as when captured

---

If you want, I’ll turn this into **a concrete spec for your MCP API**, with:

* exact JSON schemas for each tool
* error codes (path escapes, missing blob, permission errors)
* deterministic restore semantics (atomic temp dir swap)
* and a minimal “Cursor calls MCP” integration story (what the extension sends on save/command/chat).
