Got it. That earlier “kiro-cli” output is mixing **aspirational architecture** with **assumptions** that may be false (and even contradictory). Here’s a **spec of errors to fix** (call it a “delusion-buster spec”) plus the **correct, implementable reality** for MVP so your docs + product don’t drift.

---

# Kiro-CLI Delusion Fix Spec (AITimeMachine)

## 0) Ground-truth principles (what must be true)

* MCP server **cannot** “restore” anything by itself unless it has **permission + code** to write to the filesystem or capsule FS.
* “Restore chat” is **not** “rewrite the tool’s internal chat UI”; it’s “return historical messages + pointers so the client can rehydrate context”.
* “Global daemon auto-discovers everything” is risky: discovery must be **opt-in** and **sandboxed**.

---

## 1) False/unsafe claims in the chat output and fixes

### A) “Captures complete development state across Claude Code, Cursor, Aider, etc.”

**Problem**

* Each tool stores chats differently; some don’t expose APIs.
* Claiming “complete state” implies you can always read their chat DB/logs.

**Fix spec**

* Rephrase to:

  * “Captures workspace + terminal + AI interactions for supported clients.”
* Add compatibility matrix:

  * Cursor: ✅ via extension/webview capture + MCP
  * VSCode: ✅ extension capture
  * Claude Desktop/Claude Code: ✅ **via MCP tool calls**; ⚠️ “import history” only if local files exist and format supported
  * Aider: ✅ parse its chat logs if present, otherwise via wrapper

**MVP requirement**

* “Supported paths” are explicit and documented; anything else is “best-effort import”.

---

### B) “Global daemon auto-discovers projects and captures every 5 minutes”

**Problem**

* Auto-discovery can be invasive and wrong (privacy, performance).
* “Every 5 minutes” isn’t sufficient to capture *before error* moments; you need **event-based** capture too.

**Fix spec**

* Discovery is **opt-in**:

  * user runs `aitm init` inside project OR selects folder in UI
* Capture triggers:

  * **event-based** (file save, terminal command exit, tool result)
  * plus periodic snapshot (e.g. 5 min) as fallback

**MVP requirement**

* Must implement a per-project allowlist, not “scan home directory”.

---

### C) “Folder file diffs captured”

**Problem**

* Diffs don’t need to be captured; they can be computed later from manifests + blobs.
* Capturing diffs for all files every interval is expensive.

**Fix spec**

* MVP: store **full file content blobs** (CAS) + **manifests**.
* Diff computed on demand:

  * hash compare to find changed files
  * optional patch generation only for text files (bounded by size)

**MVP requirement**

* `tm_diff_checkpoints` returns hash-level diff; `includePatches=true` optional.

---

### D) “Claude Code: read from ~/.claude/projects/{id}/conversations/”

**Problem**

* This path is an assumption. May not exist, may differ by OS/version.
* Even if it exists, format may be binary/SQLite/encrypted.

**Fix spec**

* Remove hard-coded path from docs.
* Replace with:

  * **Primary**: Claude uses MCP calls in real-time (tool results are recorded)
  * **Optional Importers**: tool-specific import with feature flag and OS path mapping

    * `aitm import claude --path <dir>`

**MVP requirement**

* Do not claim file-based Claude history import unless verified + tested.

---

### E) “Cursor: MCP integration - real-time capture”

**Problem**

* Cursor supports MCP, but “message capture” depends on how Cursor exposes chat events.
* MCP itself doesn’t “capture messages”; it’s a tool interface.

**Fix spec**

* Cursor capture is done by:

  * Cursor invoking MCP tools (e.g., `tm_event_append`) for checkpoints/restore
  * PLUS an extension/webhook-like bridge if Cursor can emit chat events
* If chat events aren’t available:

  * Only capture tool calls and checkpoint metadata
  * For chat, you store “context packets” when AI requests restore

**MVP requirement**

* Document exactly what Cursor can capture in v0.1.

---

### F) “CLI with 40+ commands”

**Problem**

* Overpromises scope and adds maintenance burden early.

**Fix spec**

* MVP CLI commands (10 max):

  * `aitm init`
  * `aitm status`
  * `aitm checkpoint create/list/restore/diff`
  * `aitm projects list`
  * `aitm blobs gc`
  * `aitm mcp`
  * `aitm capsule up/exec/down` (optional)

**MVP requirement**

* Remove “40+” from docs until real.

---

### G) “Web UI for visualization”

**Problem**

* Web UI is optional; you can ship without it and still be valuable.

**Fix spec**

* MVP: VSCode/Cursor panel is the UI.
* Web UI postponed to Phase 2.

---

### H) “S3 backup capability”

**Problem**

* Phase 1 shouldn’t claim it unless implemented (auth, encryption, resumable uploads, retention).

**Fix spec**

* Phase 1: export/import archive:

  * `aitm export --project p1 --out backup.aitm.tar.zst`
* Phase 2: S3 sync.

---

### I) “Go back to before error version of chat”

**Problem**

* You usually cannot “rewind” the tool’s internal conversation thread.
* You *can* provide restored messages and force the AI to use them.

**Fix spec**

* Define **Context Rehydrate**:

  * `tm_checkpoint_restore` returns `chatSnapshot` or `chatHeadEventId`
  * Client creates a new thread message:

    * “Restored context at <time>: [messages…]”
  * or uses client-specific API if available

**MVP requirement**

* Add a “rehydrate mode” contract in the integration docs.

---

## 2) Missing details in the earlier explanation (must add)

### A) Atomic restore semantics

Without atomic restore you risk partial writes if crash occurs.

**Spec**

* restore writes into `.tm_tmp_restore/<id>`
* verify manifest integrity
* swap directories (POSIX rename; Windows safe move strategy)
* keep backup by default

### B) Concurrency + locking

Capturer and restorer must not run simultaneously.

**Spec**

* per-project lock: `.tm_lock`
* tools that mutate FS require lock

### C) Ignore rules

Not defining ignore rules kills performance & leaks secrets.

**Spec**

* default ignore:

  * `.git/**`, `node_modules/**`, `.venv/**`, `dist/**`, `target/**`, `.next/**`
  * `.env`, `**/*key*`, `**/*.pem`, `id_rsa`, `wallet*.json` (or at least warn)
* allow user override

### D) Terminal capture reality

You can’t capture every terminal in system reliably; only managed sessions.

**Spec**

* MVP: only capture terminals created/managed by the extension or `aitm run <cmd>`
* Future: OS-level capture is out of scope

---

## 3) Correct MVP story (the one you should document)

### Capture

* Files: manifest + CAS blobs (only changed files hashed each cycle)
* Chat: events from clients that can emit them; otherwise “context packets”
* Terminal: managed commands + outputs as events
* Checkpoints:

  * manual
  * auto on “tests passed/build succeeded”

### Store

* `events.db` indexes event stream
* `blobs/` CAS for file contents and outputs
* `manifest` blob per checkpoint

### Restore

* `tm_checkpoint_restore` reconstructs folder from manifest → atomic swap
* returns `chatHead`/`chatSnapshot` for rehydration
* optional capsule to ensure deterministic environment

---

## 4) Actionable “fix list” to apply to your README/docs

1. Replace “complete development state across all AI tools” with “supported integrations + best-effort imports”.
2. Replace “auto-discover projects” with “opt-in project registration”.
3. Replace “captures diffs” with “stores manifests + blobs; diffs computed on demand”.
4. Remove unverified Claude filesystem paths; add optional importer with flags.
5. Add explicit “restore chat = rehydrate context” wording.
6. Cut Phase-2 claims (S3, Web UI, 40+ commands) from Phase-1 README; keep them in roadmap.
7. Add compatibility matrix + integration contract.
8. Add atomic restore + locking + ignore rules section.

---

