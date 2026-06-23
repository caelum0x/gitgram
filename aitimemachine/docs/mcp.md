

---

# AI Time Machine MCP API Spec (v0.1)

## Design rules

1. **Project sandbox**: server only reads/writes inside `project.rootPath`.
2. **CAS blobs**: file contents stored by `sha256(bytes)`; manifest references blobs.
3. **Checkpoint = pointers**: `{manifestId, chatHead, termHead, capsule}`.
4. **Restore is atomic**: write to temp dir → verify → swap.
5. **Clients are dumb**: Cursor/Claude just call tools; server does filesystem work.

---

## Data primitives

### BlobRef

```json
{
  "hash": "hex_sha256",
  "sizeBytes": 1234,
  "mimeType": "text/plain"
}
```

### FileEntry (in a manifest)

```json
{
  "path": "src/api.ts",
  "hash": "hex_sha256",
  "size": 1024,
  "mode": 420,
  "mtimeMs": 1735005600000
}
```

### Manifest JSON (stored as blob)

```json
{
  "version": 1,
  "rootRel": ".",
  "capturedAt": "2025-12-24T05:00:00.000Z",
  "ignore": ["node_modules/**",".git/**","dist/**"],
  "files": [ /* FileEntry[] */ ]
}
```

---

## MCP Tools

### 0) `tm_health`

**Purpose**: basic health + version info.

**InputSchema**

```json
{ "type": "object", "properties": {}, "additionalProperties": false }
```

**Output**

```json
{ "ok": true, "version": "0.1.0", "dataDir": "/abs/.tmdata" }
```

---

### 1) `tm_project_register`

Create/update a project entry.

**InputSchema**

```json
{
  "type": "object",
  "required": ["projectId","name","rootPath"],
  "properties": {
    "projectId": { "type": "string", "minLength": 1 },
    "name": { "type": "string", "minLength": 1 },
    "rootPath": { "type": "string", "minLength": 1 },
    "ignore": { "type": "array", "items": { "type": "string" } }
  },
  "additionalProperties": false
}
```

**Output**

```json
{ "projectId": "p1", "createdAt": "ISO", "updatedAt": "ISO" }
```

---

### 2) `tm_event_append`

Append an event (chat/fs/terminal/tool output). Use this for real-time capture.

**Event types** (string enum):

* `chat.message`
* `fs.change_batch`
* `term.command`
* `term.output_chunk`
* `term.exit`
* `tool.call`
* `tool.result`
* `checkpoint.marker`

**InputSchema**

```json
{
  "type": "object",
  "required": ["projectId","type","ts","payload"],
  "properties": {
    "projectId": { "type": "string", "minLength": 1 },
    "type": { "type": "string", "minLength": 1 },
    "ts": { "type": "string", "minLength": 10 },
    "payload": { "type": "object" },
    "blobs": {
      "type": "array",
      "items": {
        "oneOf": [
          {
            "type": "object",
            "required": ["mimeType","text"],
            "properties": {
              "mimeType": { "type": "string" },
              "text": { "type": "string" }
            },
            "additionalProperties": false
          },
          {
            "type": "object",
            "required": ["mimeType","dataBase64"],
            "properties": {
              "mimeType": { "type": "string" },
              "dataBase64": { "type": "string" }
            },
            "additionalProperties": false
          }
        ]
      }
    }
  },
  "additionalProperties": false
}
```

**Output**

```json
{ "eventId": "uuid", "blobRefs": [ /* BlobRef[] */ ] }
```

---

### 3) `tm_checkpoint_create`

Create a checkpoint by scanning workspace and materializing a manifest + pointers.

**InputSchema**

```json
{
  "type": "object",
  "required": ["projectId","name","scope"],
  "properties": {
    "projectId": { "type": "string", "minLength": 1 },
    "name": { "type": "string", "minLength": 1 },
    "scope": {
      "type": "string",
      "enum": ["files","files+chat","files+chat+terminal","full"]
    },
    "mode": { "type": "string", "enum": ["shallow","full"], "default": "shallow" },
    "capsule": {
      "type": "object",
      "properties": {
        "imageRef": { "type": "string" },
        "imageDigest": { "type": "string" },
        "workdir": { "type": "string" },
        "env": { "type": "object", "additionalProperties": { "type": "string" } }
      },
      "additionalProperties": false
    }
  },
  "additionalProperties": false
}
```

**Semantics**

* `shallow`: only read file bytes if (mtime/size) changed since last manifest
* `full`: hash every file (slower, but safest)

**Output**

```json
{
  "checkpointId": "cp_123",
  "createdAt": "ISO",
  "manifestBlob": { "hash": "hex", "sizeBytes": 999, "mimeType": "application/json" },
  "fileCount": 470,
  "chatHeadEventId": "evt_...",
  "terminalHeadEventId": "evt_..."
}
```

---

### 4) `tm_checkpoint_list`

List checkpoints for timeline UI.

**InputSchema**

```json
{
  "type": "object",
  "required": ["projectId"],
  "properties": {
    "projectId": { "type": "string", "minLength": 1 },
    "limit": { "type": "integer", "minimum": 1, "maximum": 200, "default": 50 },
    "cursor": { "type": "string" }
  },
  "additionalProperties": false
}
```

**Output**

```json
{
  "items": [
    {
      "checkpointId": "cp_123",
      "name": "Before refactor",
      "createdAt": "ISO",
      "scope": "files+chat",
      "fileCount": 47,
      "capsuleImageDigest": "sha256:..."
    }
  ],
  "nextCursor": null
}
```

---

### 5) `tm_checkpoint_restore`

Restore workspace (and optionally return chat context) to checkpoint.

**InputSchema**

```json
{
  "type": "object",
  "required": ["projectId","checkpointId","mode","restoreScope"],
  "properties": {
    "projectId": { "type": "string", "minLength": 1 },
    "checkpointId": { "type": "string", "minLength": 1 },
    "mode": { "type": "string", "enum": ["safe","hard"] },
    "restoreScope": { "type": "string", "enum": ["files","files+chat"] },
    "backupCurrent": { "type": "boolean", "default": true },
    "dryRun": { "type": "boolean", "default": false }
  },
  "additionalProperties": false
}
```

**Deterministic restore semantics (atomic)**

* If `backupCurrent=true`, server first copies current root to:

  * `.tm_backups/<ts>_<checkpointId>/` (or a tar blob)
* Write restored tree into temp dir:

  * `.tm_tmp_restore/<checkpointId>/`
* Verify:

  * all manifest files exist
  * blob sizes match
* Swap:

  * rename current root to `.tm_tmp_old/<ts>/`
  * rename temp dir to root
  * on Windows: do “move out then move in” strategy; avoid non-atomic rename across volumes
* If `mode=hard`, delete any extra files not in manifest (during build temp tree, they won’t exist anyway)
* If `dryRun=true`, return plan only

**Output**

```json
{
  "restored": { "filesWritten": 47, "dirsCreated": 12 },
  "backupPath": ".tm_backups/2025-12-24T05-10-00_cp_123",
  "chatHeadEventId": "evt_...",
  "warnings": []
}
```

---

### 6) `tm_diff_checkpoints`

Compute file/chat/terminal differences between two checkpoints.

**InputSchema**

```json
{
  "type": "object",
  "required": ["projectId","aCheckpointId","bCheckpointId"],
  "properties": {
    "projectId": { "type": "string", "minLength": 1 },
    "aCheckpointId": { "type": "string", "minLength": 1 },
    "bCheckpointId": { "type": "string", "minLength": 1 },
    "includePatches": { "type": "boolean", "default": false },
    "maxPatchBytes": { "type": "integer", "default": 200000 }
  },
  "additionalProperties": false
}
```

**Output**

```json
{
  "fileDiffs": [
    {
      "path": "src/api.ts",
      "status": "modified",
      "aHash": "aaa...",
      "bHash": "bbb...",
      "patchBlob": null
    }
  ],
  "chatDiff": { "aHead": "evt_a", "bHead": "evt_b", "messagesDelta": 12 },
  "terminalDiff": { "commandsDelta": 5 }
}
```

> If `includePatches=true`, server generates unified diff and stores it as a blob, returning `patchBlob`.

---

### 7) `tm_fs_get_file`

Fetch file content at a checkpoint (debugging + “show me old code”).

**InputSchema**

```json
{
  "type": "object",
  "required": ["projectId","filePath"],
  "properties": {
    "projectId": { "type": "string", "minLength": 1 },
    "filePath": { "type": "string", "minLength": 1 },
    "checkpointId": { "type": "string" }
  },
  "additionalProperties": false
}
```

**Output**

```json
{
  "filePath": "src/api.ts",
  "hash": "hex",
  "mimeType": "text/plain",
  "text": "...."
}
```

---

## Capsule tools (optional in v0.1 but recommended)

### 8) `tm_capsule_upsert`

Create or re-use capsule for project (pinned digest).

**InputSchema**

```json
{
  "type": "object",
  "required": ["projectId","imageRef","workdir"],
  "properties": {
    "projectId": { "type": "string" },
    "imageRef": { "type": "string" },
    "workdir": { "type": "string" },
    "env": { "type": "object", "additionalProperties": { "type": "string" } },
    "ports": { "type": "array", "items": { "type": "integer" } }
  },
  "additionalProperties": false
}
```

**Output**

```json
{ "capsuleId": "c_123", "imageDigest": "sha256:..." }
```

### 9) `tm_capsule_exec`

Exec command inside capsule; stream output via `tm_event_append` or return blob refs.

**InputSchema**

```json
{
  "type": "object",
  "required": ["projectId","capsuleId","command"],
  "properties": {
    "projectId": { "type": "string" },
    "capsuleId": { "type": "string" },
    "command": { "type": "string" },
    "cwd": { "type": "string" },
    "timeoutMs": { "type": "integer", "default": 60000 }
  },
  "additionalProperties": false
}
```

**Output**

```json
{
  "exitCode": 0,
  "stdoutBlob": { "hash": "hex", "sizeBytes": 123, "mimeType": "text/plain" },
  "stderrBlob": { "hash": "hex", "sizeBytes": 0, "mimeType": "text/plain" }
}
```

---

# Resources (read-only URIs)

These are nice for clients to browse.

* `tm://projects`
* `tm://projects/{projectId}/checkpoints`
* `tm://projects/{projectId}/checkpoints/{checkpointId}/manifest`
* `tm://blobs/{hash}`
* `tm://projects/{projectId}/timeline?from=...&to=...`

---

# Error model

All tools return errors as MCP tool errors with a structured JSON payload.

### Error shape

```json
{
  "error": {
    "code": "TM_PATH_ESCAPE",
    "message": "filePath resolves outside project root",
    "details": { "filePath": "../secrets" }
  }
}
```

### Canonical error codes

* `TM_PROJECT_NOT_FOUND`
* `TM_CHECKPOINT_NOT_FOUND`
* `TM_MANIFEST_CORRUPT`
* `TM_BLOB_MISSING`
* `TM_PATH_ESCAPE`
* `TM_PERMISSION_DENIED`
* `TM_IO_ERROR`
* `TM_CONFLICT_LOCKED` (restore while capture running)
* `TM_TOO_LARGE` (blob/event exceeds limit)
* `TM_CAPSULE_NOT_AVAILABLE`
* `TM_CAPSULE_EXEC_FAILED`

---

# Deterministic restore details (implementation notes)

## Path safety

For every `filePath`:

* resolve `realpath(join(root, filePath))`
* assert it starts with `realpath(root)`

## Locking

* Use a per-project lock file:

  * `.tm_lock` (advisory)
* `tm_checkpoint_restore` fails with `TM_CONFLICT_LOCKED` if capture running.

## Atomic swap strategy

* Build restore tree in `.tm_tmp_restore/<checkpointId>/`
* Verify counts/hashes
* Swap directories:

  * POSIX: `rename(tmp, root)` after moving old root out
  * Windows: ensure moves happen on same volume; if not, do copy + replace
* Always write to temp first. Never partially overwrite the real tree.

---

# Cursor/VSCode integration contract (what the extension sends)

## On project open

1. `tm_project_register({projectId, name, rootPath, ignore})`

## On file save (debounced batch)

Extension collects within 2–5 seconds:

* list of changed paths
* for each, either:

  * send full text as blob in `tm_event_append` **or**
  * just send metadata and let server rescan on checkpoint

**Recommended MVP**: send metadata only, server hashes on checkpoint (less bandwidth and simpler).
Use:

```json
{
  "type": "fs.change_batch",
  "payload": {
    "changed": [{"path":"src/api.ts","reason":"save"}],
    "editor": "cursor"
  }
}
```

## On chat message

```json
{
  "type": "chat.message",
  "payload": {
    "tool": "cursor",
    "threadId": "t_abc",
    "role": "user|assistant",
    "content": "..."
  }
}
```

## On terminal command (managed terminal)

Before running:

* `tm_event_append(type=term.command, payload={sessionId, cwd, command})`

Stream outputs:

* `tm_event_append(type=term.output_chunk, blobs=[{mimeType:'text/plain', text:'...'}])`

On exit:

* `tm_event_append(type=term.exit, payload={exitCode})`

Auto-checkpoint rule in extension OR server:

* if command matches `/test|build|lint/` and exitCode==0:

  * call `tm_checkpoint_create(name="Tests passed", scope="files+chat+terminal")`

## When user says “go back”

Agent flow:

1. `tm_checkpoint_list`
2. choose checkpoint
3. `tm_checkpoint_restore(mode="hard", restoreScope="files+chat")`
4. client rehydrates restored chat context:

   * create a new thread message: “Restored context: …”
   * or show in a “Restored Context” panel

---

# What you should implement first (minimal set)

**Server MVP**

* `tm_health`
* `tm_project_register`
* `tm_event_append`
* `tm_checkpoint_create`
* `tm_checkpoint_list`
* `tm_checkpoint_restore`
* `tm_diff_checkpoints` (hash-level first; patches optional)

**Extension MVP**

* register project
* capture chat messages (Cursor UI hook)
* capture terminal commands (managed runner)
* create/restore checkpoints from command palette

---

