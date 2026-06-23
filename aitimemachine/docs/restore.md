Yep — that’s the right way to think about it.

For IDEs (VSCode/Cursor/Windsurf), you **don’t need** deep “Claude UI rewind” work. The IDE is where the *real state* lives (files, terminals, tasks). So you can make time travel feel native by restoring the workspace and (optionally) materializing the past state as a **separate folder**.

There are two production patterns:

---

## 1) Two restore modes for IDE users

### A) In-place restore (true rewind)

* Overwrite the current project folder to the checkpoint state (atomic swap).
* Best for “I need to go back and keep working from there”.

**Pros:** exact, minimal clutter
**Cons:** risky if user forgets they overwrote; needs backups & clear UX

### B) Materialize-as-folder (your idea)

* Create a new folder like:

  * `TodoApp__2025-12-21__cp_123/`
* Put the checkpoint workspace there.
* Open that folder in a new VSCode window.
* Keep current folder untouched.

**Pros:** safest, easy mental model, great for diff/compare
**Cons:** uses disk space (but CAS makes it cheap to create)

**Production recommendation:** default to **Materialize-as-folder**, offer in-place as “hard rewind”.

---

## 2) How VSCode/Cursor “rewind” works (realistically)

MCP doesn’t need to rewrite IDE state. The extension does 3 things:

1. Calls MCP:

   * `tm_checkpoint_restore_to_dir({checkpointId, targetDir})`
2. Opens the restored folder:

   * `vscode.commands.executeCommand("vscode.openFolder", uri, true)`
3. Rehydrates context:

   * shows “Restored Context” panel
   * optionally injects into the AI chat as a message

So the IDE becomes the “time machine UI”.

---

## 3) Add a dedicated tool: `tm_checkpoint_materialize`

This avoids dangerous overwrites and matches your “folder like 21.12.2025 todo app” idea.

### Tool behavior

Input:

* `projectId`
* `checkpointId`
* `targetParentDir` (default: `<projectRoot>/.aitm/restored/`)
* `folderNameTemplate` (default: `{projectName}__{date}__{checkpointId}`)

Output:

* `materializedPath`
* `fileCount`
* `openHint` (VSCode openFolder command)

### Deterministic naming

Use ISO to avoid OS issues:

* `TodoApp__2025-12-21__05-12__cp_123`

---

## 4) Implementation sketch (server-side)

### New restore engine function

Instead of swapping the real project root, restore into a new dir:

* create `targetDir`
* materialize manifest into `targetDir`
* optional: write `.aitm/context.md` inside it

This is just your existing `restoreWorkspaceAtomic` without the swap step.

### Pseudocode

* `restoreToDir(projectRoot, manifest, targetDir)`
* no deletion needed (dir is empty)
* verify blobs exist
* write all files

---

## 5) VSCode/Cursor extension UX (what user clicks)

Command Palette:

* **AITM: Restore checkpoint as folder**
* **AITM: Rewind project in-place (hard)**
* **AITM: Diff current vs checkpoint**
* **AITM: Open restored context**

Timeline view:

* click a checkpoint → “Open snapshot” (materialize)
* right-click → “Hard rewind here”

This is how it becomes “Git-like but time-based”.

---

## 6) Why this is better than focusing on Claude CLI

Because most devs:

* edit in IDE
* run terminals there
* rely on workspace state

So as long as:

* the IDE extension records file saves + managed terminals + AI chat events
* the MCP server restores files deterministically

…then “go back in time” works even if Claude CLI is dumb.

Claude integration becomes optional:

* if user uses Claude CLI, wrapper captures it
* otherwise IDE integration covers 90% usage.

---

## 7) What tools you should add next (minimal)

### MCP tools

* `tm_checkpoint_materialize` ✅ (restore to folder)
* `tm_checkpoint_restore` ✅ (in-place)
* `tm_open_context_packet` (return context.md text/uri)
* `tm_diff_checkpoints`

### VSCode extension commands

* `aitm.restoreAsFolder`
* `aitm.rewindInPlace`
* `aitm.openContext`
* `aitm.diffWithCurrent`

---

