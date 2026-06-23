You’re bumping into the real truth: **your MCP server can restore reality, but Claude Code (or any CLI) won’t magically “rewind its UI” unless you build a workflow that *forces the model to use the restored past*.** So the trick is not “make Claude show old chat” — it’s **make Claude operate inside a restored capsule + inject the restored context**.

There are **three reliable ways** to achieve “go back in time” with a terminal/CLI AI like Claude Code. You can support all three; production systems usually do.

---

## 1) The core idea: “restore state” vs “restore UI”

### What you *can* restore perfectly

* Files/folders (byte-exact)
* Terminal commands + outputs (as logs)
* Container environment (image digest)
* A reconstructed “context packet” (messages + tool outputs)

### What you *cannot* rely on

* Rewriting Claude Code’s internal chat history UI
* Forcing Claude Code to “scroll back” or replace its conversation thread (unless Claude provides that API)

So the plan is:

> **Restore files + environment, then rehydrate the model context by feeding it the past conversation as an input.**

That works even if the client has no “rewind” feature.

---

## 2) Option A (most reliable): “Context packet injection” (works with any CLI)

### How it feels to the user

User runs:

```bash
aitm rewind --to "before-refactor"
```

Then they run Claude again and the system automatically prepends a **restored context packet** to the prompt.

### What it actually does

1. `aitm` restores workspace to checkpoint.
2. `aitm` loads chat snapshot from your DB for that checkpoint.
3. `aitm` generates a **context bundle** (markdown or JSON) like:

* summary of conversation up to checkpoint
* last N messages (bounded)
* the tool results and important outputs
* repo status at that time
* “current goal”

4. `aitm` starts Claude Code with that context in stdin or a file:

Example:

```bash
claude --context-file .aitm/context.md
```

If Claude Code doesn’t have `--context-file`, you still can do:

```bash
cat .aitm/context.md | claude
```

(or your wrapper can paste it automatically before the user’s next message)

### Why this works

The model doesn’t need UI rewind — it only needs **the same information** it had then.

**This is the production-safe universal method.**

---

## 3) Option B: “Claude runs inside your capsule” (best for “exact situation”)

This is how you make the *situation* truly identical.

### How it works

* Your tool becomes the thing that runs commands, including Claude:

  * `aitm capsule exec "claude ..."`

Now everything happens inside:

* pinned Docker image digest
* restored workspace mounted
* controlled env vars

You store:

* the prompt you sent to Claude
* Claude’s output
* any tool calls and results
* terminal output

So later, “rewind” gives you:

* exact files
* exact environment
* and the exact previous Claude conversation transcript (because you recorded it yourself)

### Key insight

If you run Claude through your wrapper/capsule, you don’t need to “read Claude’s internal chat storage” at all.

You’re effectively building **your own transcript** as the canonical record.

---

## 4) Option C: “Importer for native Claude history” (best-effort, not core)

Sometimes users already have history in a tool and want to import it.

This is possible only if:

* Claude Code stores conversations in a readable local format
* or prints them in logs
* or exposes an API

If not, you cannot reliably “get users past chats” automatically.

So production positioning should be:

* **Canonical capture**: from the moment they use AITM wrapper/extension (guaranteed)
* **Optional import**: best-effort for some clients/versions

This avoids delusional claims.

---

## 5) The concrete production solution for Claude Code (terminal CLI)

### You ship `aitm` as a wrapper command

User uses:

```bash
aitm claude
```

or:

```bash
aitm run -- claude
```

What your wrapper does:

1. Detect project root
2. Ensure project registered
3. Start/attach capsule
4. Intercept stdin/stdout
5. Append events:

   * `chat.message user`
   * `chat.message assistant`
   * `term.command`
   * `term.output`
6. Auto-checkpoint on meaningful boundaries (tests passed, build success, user named checkpoint)

#### Example wrapper flow

* User types: “refactor API…”
* Wrapper saves that as `chat.message(user)`
* Claude responds
* Wrapper saves as `chat.message(assistant)`
* Claude says “Run tests: npm test”
* User runs it via `aitm run npm test` (or from managed terminal)
* outputs stored
* if exit 0 → auto-checkpoint “Tests green”

### Now “go back in time” works like this:

User:

```bash
aitm rewind --to cp_123
```

AITM:

* restores files
* restores capsule image digest
* writes `.aitm/context.md` = last convo + state summary

Then user runs:

```bash
aitm claude
```

Wrapper automatically prepends:

* “Restored to checkpoint cp_123 at time X”
* plus context messages

So Claude continues as if it never moved forward.

---

## 6) What users see inside Claude Code (even without rewind UI)

They will see something like:

> **[AITM] Restored to cp_123 (2025-12-24 05:12)**
>
> **Context (restored conversation):**
>
> * User: …
> * Claude: …
> * Tool outputs: …
> * Terminal logs: …
>
> **Current workspace state restored. Continue from here.**

That is functionally “rewind chat” even if Claude can’t modify old threads.

---

## 7) The “exact situation” requirement: determinism

If you want truly exact:

* always run the project in capsule
* run Claude inside capsule (or at least with the same toolchain)
* store the digest + env snapshot per checkpoint
* store command outputs

Then “before error” is reproducible.

---

## 8) Bottom line (the answer to your question)

> If Claude Code doesn’t provide a built-in “rewind chat” feature, you don’t try to rewind its UI.
> You **restore the workspace + environment**, and you **rehydrate the model by injecting the saved conversation/context** through your wrapper/capsule.

That’s how you achieve it in production.

---

If you want, I’ll write the **exact `aitm claude` wrapper design** (stdin/stdout interception, message boundary detection, how to store messages reliably, how to handle streaming outputs), and the exact CLI commands:

* `aitm claude` (captures chat)
* `aitm rewind` (restores + writes context packet)
* `aitm resume` (starts claude with restored context automatically)
Below is a production-ready design for **`aitm claude`** (wrapper) + **rewind/resume** that works even if Claude Code has **no “rewind chat UI”**. This is the reliable way: **we become the canonical recorder and context injector**.

---

# 1) UX + Commands (what users run)

### Start a recorded Claude session (local or capsule)

```bash
aitm claude
# or
aitm run -- claude
# or (recommended)
aitm capsule claude
```

### Run commands so they’re recorded (and can trigger checkpoints)

```bash
aitm run -- npm test
aitm run -- pnpm build
```

### Create checkpoints

```bash
aitm checkpoint "before refactor"
aitm checkpoint --auto   # enable rules like tests green/build green
```

### Rewind + resume

```bash
aitm rewind --to "before refactor" --hard
aitm resume claude
```

What this actually does:

* `rewind`: restore files (+ capsule digest), generate `.aitm/context.md`
* `resume`: launches Claude and **pre-injects context** automatically

---

# 2) Canonical capture strategy (no dependency on Claude internals)

## Key decision

**Do not try to read Claude’s internal conversation storage.**
Instead, always capture via your wrapper:

* user prompt text
* assistant response text (streamed)
* tool outputs and terminal outputs
* checkpoint metadata

So “past chats” exist because **you recorded them**, not because the tool exposes them.

---

# 3) Architecture: 2 wrappers (you need both)

### A) `aitm run -- <cmd>`

A universal command runner that:

* runs any shell command (host or capsule)
* captures stdout/stderr + exit code
* creates auto-checkpoints on rules

### B) `aitm claude`

A specialized runner built on top of `aitm run` that:

* launches Claude in a pseudo-terminal (PTY)
* intercepts the interactive transcript
* extracts **user message** vs **assistant message**
* appends events into your DB

> For interactive CLI tools, you almost always need PTY.

---

# 4) Message boundary detection (the hard part)

Interactive CLIs rarely give “structured events” for messages. You need a robust strategy.

## Production approach: “We control the input”

Instead of trying to infer message boundaries from Claude’s output, you define them by:

* capturing **exact user input** (you know when user hits enter)
* capturing **assistant output** until next user input begins

So you store:

* `chat.message(user)` = the exact string user submitted
* `chat.message(assistant)` = the assistant output that occurred until next submit

### Important

This works for:

* any model
* any CLI
* even if output formatting changes

---

# 5) Restore logic: what “resume” actually injects

When you rewind to checkpoint `cp_123`, you generate a context bundle:

`.aitm/context.md` contains:

* checkpoint timestamp/name
* last N user/assistant messages (e.g., 20)
* summary of older conversation (LLM-made or heuristic)
* important tool outputs (tests, stack traces)
* exact commands run and their outputs (links/hashes)

Then `aitm resume claude` does:

* starts Claude (host or capsule)
* sends the context packet as the first user message:

  * “Restored context: …”
* then lets user continue normally

So Claude “feels” like it’s back in time.

---

# 6) Real code: `aitm run` (host runner)

This is the base. It captures command + output and stores blobs.

## `src/cli/run.ts`

```ts
import { spawn } from "node:child_process";
import { CasStore } from "../core/cas.js";
import type { Repo } from "../store/repo.js";

export async function runCommand(opts: {
  repo: Repo;
  cas: CasStore;
  projectId: string;
  command: string;
  cwd: string;
  env?: Record<string, string>;
  timeoutMs?: number;
}) {
  const ts = new Date().toISOString();
  opts.repo.appendEvent(opts.projectId, "term.command", ts, {
    command: opts.command,
    cwd: opts.cwd,
    envHash: null,
  });

  const child = spawn(opts.command, {
    cwd: opts.cwd,
    env: { ...process.env, ...(opts.env ?? {}) },
    shell: true,
    stdio: ["inherit", "pipe", "pipe"],
  });

  const stdoutChunks: Buffer[] = [];
  const stderrChunks: Buffer[] = [];

  child.stdout.on("data", (d) => {
    process.stdout.write(d);
    stdoutChunks.push(Buffer.from(d));
  });
  child.stderr.on("data", (d) => {
    process.stderr.write(d);
    stderrChunks.push(Buffer.from(d));
  });

  const exitCode: number = await new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (code) => resolve(code ?? 1));
  });

  const stdoutBlob = opts.cas.putBytes("text/plain", Buffer.concat(stdoutChunks));
  const stderrBlob = opts.cas.putBytes("text/plain", Buffer.concat(stderrChunks));

  opts.repo.appendEvent(opts.projectId, "term.exit", new Date().toISOString(), {
    command: opts.command,
    exitCode,
    stdoutHash: stdoutBlob.hash,
    stderrHash: stderrBlob.hash,
  });

  return { exitCode, stdoutBlob, stderrBlob };
}
```

---

# 7) Real code: `aitm claude` using PTY

## Needed library

* `node-pty` (for true interactive capture)

```bash
npm i node-pty
```

### `src/cli/claude.ts`

```ts
import pty from "node-pty";
import { CasStore } from "../core/cas.js";
import type { Repo } from "../store/repo.js";

/**
 * Production model:
 * - We capture user input as they type (line-buffered)
 * - We capture assistant output until next user submission
 * - Store both as chat.message events
 */
export async function runClaudeSession(opts: {
  repo: Repo;
  cas: CasStore;
  projectId: string;
  cwd: string;
  // command to launch claude code (might be "claude", or "claude --model ...")
  claudeCommand: string;
  injectedContext?: string; // context.md content to send as first message
}) {
  const tsStart = new Date().toISOString();
  const sessionId = `claude_${Date.now()}`;
  opts.repo.appendEvent(opts.projectId, "chat.session.start", tsStart, {
    tool: "claude-cli",
    sessionId,
    cwd: opts.cwd,
    cmd: opts.claudeCommand,
  });

  const term = pty.spawn(process.platform === "win32" ? "cmd.exe" : "bash", [], {
    name: "xterm-256color",
    cols: process.stdout.columns ?? 120,
    rows: process.stdout.rows ?? 40,
    cwd: opts.cwd,
    env: process.env as Record<string, string>,
  });

  // Launch Claude inside the shell
  term.write(`${opts.claudeCommand}\r`);

  // If we have context to inject, we’ll send it as the first user message once Claude is ready.
  // In practice, you may wait for a prompt marker. For v1, a short delay is acceptable.
  if (opts.injectedContext) {
    setTimeout(() => {
      recordUserMessage(opts, sessionId, opts.injectedContext!, true);
      term.write(opts.injectedContext!.replace(/\n/g, "\r\n") + "\r");
    }, 800);
  }

  // Stream output to screen + buffer assistant response
  let assistantBuffer = "";
  let currentUserLine = "";

  term.onData((data) => {
    process.stdout.write(data);

    // Heuristic: anything produced while user isn't typing a line contributes to assistantBuffer.
    // But since user typing also echoes, we treat assistantBuffer as "everything minus user submits".
    assistantBuffer += data;
  });

  // Capture user keystrokes from stdin and forward to PTY
  process.stdin.setRawMode?.(true);
  process.stdin.resume();
  process.stdin.on("data", (chunk: Buffer) => {
    const s = chunk.toString("utf8");
    term.write(s);

    // Maintain a line buffer to detect "Enter"
    // This is OS-dependent; handle \r or \n
    for (const ch of s) {
      if (ch === "\r" || ch === "\n") {
        const submitted = currentUserLine.trimEnd();
        if (submitted.length > 0) {
          // finalize previous assistant message BEFORE recording new user message
          flushAssistantMessage(opts, sessionId, assistantBuffer);
          assistantBuffer = "";

          recordUserMessage(opts, sessionId, submitted, false);
        }
        currentUserLine = "";
      } else if (ch === "\u0003") {
        // Ctrl+C
        term.write("\u0003");
      } else {
        currentUserLine += ch;
      }
    }
  });

  // Clean exit
  return await new Promise<void>((resolve) => {
    term.onExit(() => {
      flushAssistantMessage(opts, sessionId, assistantBuffer);
      opts.repo.appendEvent(opts.projectId, "chat.session.end", new Date().toISOString(), {
        tool: "claude-cli",
        sessionId,
      });
      resolve();
    });
  });
}

function recordUserMessage(
  opts: { repo: Repo; cas: CasStore; projectId: string },
  sessionId: string,
  content: string,
  isContextInjection: boolean
) {
  opts.repo.appendEvent(opts.projectId, "chat.message", new Date().toISOString(), {
    tool: "claude-cli",
    sessionId,
    role: "user",
    isContextInjection,
    content,
  });
}

function flushAssistantMessage(
  opts: { repo: Repo; cas: CasStore; projectId: string },
  sessionId: string,
  raw: string
) {
  const cleaned = normalizeAssistant(raw);
  if (cleaned.trim().length === 0) return;

  // store as blob too (useful for long streams)
  const blob = opts.cas.putBytes("text/plain", Buffer.from(cleaned, "utf8"));

  opts.repo.appendEvent(opts.projectId, "chat.message", new Date().toISOString(), {
    tool: "claude-cli",
    sessionId,
    role: "assistant",
    contentHash: blob.hash,
    contentPreview: cleaned.slice(0, 2000),
  });
}

// You’ll refine this per tool prompts. Start simple.
function normalizeAssistant(s: string): string {
  // remove common ANSI escapes
  return s.replace(/\x1B\[[0-9;]*[A-Za-z]/g, "");
}
```

### Important notes for production

* This PTY method records *exact transcripts* but boundary detection improves if Claude shows stable prompts like `You:` / `Assistant:`. If it does, switch to prompt-marker parsing.
* You also want window resize handling (`term.resize`) and clean raw-mode restore.

---

# 8) `aitm rewind` + `aitm resume` (the time travel UX)

## `aitm rewind`

* loads checkpoint
* restores workspace (atomic)
* writes `.aitm/context.md` from checkpoint’s stored chat head
* optionally ensures capsule image digest is available

## `aitm resume claude`

* reads `.aitm/context.md`
* starts `aitm claude` and injects it as first user message

### Context bundle format (what to inject)

Keep it consistent and “LLM-friendly”:

```md
# AITM Restored Context
Checkpoint: cp_123
Time: 2025-12-24 05:12
Project: /path/project

## What we were doing
- Goal:
- Constraints:
- Current status:

## Conversation (last 20 messages)
1) User: ...
2) Assistant: ...

## Important tool outputs
- npm test (exit 1): <summary> [stdoutHash=..., stderrHash=...]

## Repo state
- files changed since last green: ...
```

---

# 9) How to “get users past chats and codes” in real life

### Past codes: easy

If they made checkpoints earlier, you restore from manifest+blobs.

If they didn’t:

* you can still use git history as a fallback import, but it’s not “complete reality”.

### Past chats: only possible if one of these is true

1. They used `aitm claude` / extension while chatting → ✅ you have transcripts.
2. The tool has readable logs/history and you wrote an importer → ⚠️ best-effort.
3. They don’t have either → you cannot recover what never got recorded.

So production product messaging should be:

* “From the moment you start using AITM wrapper/extension, everything becomes rewindable.”

---

# 10) The “exact time & situation” promise (how you make it honest)

To be honest and still strong:

* **Exact state**: files + environment + terminal outputs + AI context packet
* **Exact UI thread rewind**: not required, not promised
* **Exact process memory**: not promised (unless you add VM snapshots later)

That’s what makes it production-grade and defensible.

---

If you want next, I’ll:

* add **prompt-marker parsing** (more accurate assistant/user split)
* integrate **auto-checkpoint rules** (tests green, build green, error detected)
* generate **MCP tools** that call `aitm rewind/resume` directly from Claude via MCP so user can say: “rewind to last green” and it just happens.
Below are **production-grade upgrades** for all 3:

1. **Prompt-marker parsing** (accurate user/assistant split)
2. **Auto-checkpoint rules** (tests green/build green/error detected)
3. **MCP tools for “rewind/resume”** so Claude can say “rewind to last green” and it happens

I’ll keep the code drop-in style so you can paste into your repo.

---

# 1) Prompt-marker parsing (reliable message boundaries)

## Strategy (robust)

Use a **state machine** that parses the PTY stream based on **known prompt markers** from the CLI tool.

You support multiple marker “profiles” (because tools differ and versions change):

* `ClaudeCodeProfileV1`
* `AiderProfile`
* `GenericFallback`

Each profile defines:

* `userPromptRegex`
* `assistantStartRegex`
* `assistantEndRegex` (optional)
* `stripAnsi: boolean`

Then your stream parser emits `onUserPrompt`, `onAssistantChunk`, `onAssistantDone`.

### `src/cli/markers.ts`

```ts
export type MarkerProfile = {
  name: string;
  userPrompt: RegExp[];        // markers that indicate user input prompt appears
  assistantStart: RegExp[];    // markers that indicate assistant response begins
  assistantStop?: RegExp[];    // optional markers that indicate response ended
};

export const PROFILES: MarkerProfile[] = [
  {
    name: "claude_code_guess",
    // Examples (you'll tune after capturing real output):
    userPrompt: [
      /(^|\n)\s*(You|User)\s*:\s*$/m,
      /(^|\n)\s*>\s*$/m,
    ],
    assistantStart: [
      /(^|\n)\s*(Claude|Assistant)\s*:\s*/m,
    ],
    assistantStop: [
      /(^|\n)\s*(You|User)\s*:\s*$/m,
      /(^|\n)\s*>\s*$/m,
    ],
  },
  {
    name: "generic",
    userPrompt: [/>\s*$/m],
    assistantStart: [/./m], // fallback: treat any output after submit as assistant
  },
];
```

### `src/cli/ansi.ts`

```ts
export function stripAnsi(s: string) {
  return s.replace(/\x1B\[[0-9;]*[A-Za-z]/g, "");
}
```

### `src/cli/transcript_parser.ts`

This parser consumes the continuous PTY output and emits clean segments.

```ts
import { MarkerProfile } from "./markers.js";
import { stripAnsi } from "./ansi.js";

export type ParserEvents = {
  onAssistantText: (text: string) => void;     // streaming chunks
  onAssistantDone: (full: string) => void;     // final message
  onPromptReady: () => void;                   // prompt shown (safe to inject)
};

export class TranscriptParser {
  private buf = "";
  private assistantBuf = "";
  private inAssistant = false;
  private promptReady = false;

  constructor(private profile: MarkerProfile, private events: ParserEvents) {}

  feed(rawChunk: string) {
    const chunk = stripAnsi(rawChunk);
    this.buf += chunk;

    // Detect prompt ready
    if (!this.promptReady && this.matchesAny(this.profile.userPrompt, this.buf)) {
      this.promptReady = true;
      this.events.onPromptReady();
    }

    // Detect assistant start
    if (!this.inAssistant && this.matchesAny(this.profile.assistantStart, this.buf)) {
      this.inAssistant = true;
      // optional: trim everything before assistant start marker
      this.buf = this.trimToAfterFirstMatch(this.profile.assistantStart, this.buf);
    }

    // If assistant streaming, emit text and accumulate.
    if (this.inAssistant) {
      // Stop marker means assistant is done
      if (this.profile.assistantStop && this.matchesAny(this.profile.assistantStop, this.buf)) {
        const full = this.assistantBuf + this.beforeFirstMatch(this.profile.assistantStop, this.buf);
        const cleaned = full.trim();
        if (cleaned) {
          this.events.onAssistantText(cleaned);
          this.events.onAssistantDone(cleaned);
        }
        // reset for next turn
        this.inAssistant = false;
        this.assistantBuf = "";
        // keep remainder after stop marker in buffer (prompt etc.)
        this.buf = this.trimToAfterFirstMatch(this.profile.assistantStop, this.buf);
        return;
      }

      // If no stop marker, just stream everything and keep buffer bounded
      // Emit only new text since last feed by using a moving window:
      const emit = this.buf;
      if (emit.trim()) {
        this.assistantBuf += emit;
        this.events.onAssistantText(emit);
      }
      this.buf = ""; // consume
      this.boundAssistant();
    } else {
      // Keep buffer bounded even when not in assistant
      if (this.buf.length > 50_000) this.buf = this.buf.slice(-10_000);
    }
  }

  forceFlushAssistant() {
    const cleaned = this.assistantBuf.trim();
    if (cleaned) this.events.onAssistantDone(cleaned);
    this.assistantBuf = "";
    this.inAssistant = false;
  }

  private boundAssistant() {
    if (this.assistantBuf.length > 2_000_000) {
      // hard bound: keep last 2MB, avoid memory blowups
      this.assistantBuf = this.assistantBuf.slice(-2_000_000);
    }
  }

  private matchesAny(res: RegExp[], s: string) {
    return res.some((r) => r.test(s));
  }

  private trimToAfterFirstMatch(res: RegExp[], s: string) {
    for (const r of res) {
      const m = r.exec(s);
      if (m && m.index !== undefined) {
        return s.slice(m.index + m[0].length);
      }
    }
    return s;
  }

  private beforeFirstMatch(res: RegExp[], s: string) {
    let best: number | null = null;
    let bestLen = 0;
    for (const r of res) {
      const m = r.exec(s);
      if (m && m.index !== undefined) {
        if (best === null || m.index < best) {
          best = m.index;
          bestLen = m[0].length;
        }
      }
    }
    if (best === null) return s;
    return s.slice(0, best);
  }
}
```

### Updating `runClaudeSession` to use parser

* Instead of “flush assistant on user Enter”, rely on markers for assistant boundaries.
* Inject context only after `onPromptReady()`.

This is *massively more stable* when the CLI echoes user input.

---

# 2) Auto-checkpoint rules (tests green/build green/error detected)

## Concept

You implement a small **rule engine** that listens to events:

* `term.exit`
* `chat.message`
* `tool.result`

and decides whether to call `checkpoint_create`.

### Rule types

* **Success rules**

  * `npm test` exit 0 → checkpoint “Tests green”
  * `pnpm build` exit 0 → checkpoint “Build green”
* **Failure rules**

  * test/build exit !=0 → checkpoint “Error: tests failed” (optional, but useful)
  * stderr matches `TypeError|panic|Segmentation fault|Unhandled|ERROR` → “Crash point”
* **Signal rules**

  * AI says “this should work now” + next command fails → checkpoint before failure (needs a “pre-run buffer”)

### Implementation: `src/rules/auto_checkpoint.ts`

```ts
import type { Repo } from "../store/repo.js";

export type AutoRule =
  | { kind: "term_success"; matchCmd: RegExp; name: (cmd: string) => string }
  | { kind: "term_failure"; matchCmd: RegExp; name: (cmd: string, code: number) => string }
  | { kind: "stderr_match"; match: RegExp; name: (line: string) => string };

export const DEFAULT_RULES: AutoRule[] = [
  { kind: "term_success", matchCmd: /\b(npm|pnpm|yarn)\s+test\b/i, name: () => "Tests green" },
  { kind: "term_success", matchCmd: /\b(npm|pnpm|yarn)\s+build\b/i, name: () => "Build green" },
  { kind: "term_failure", matchCmd: /\b(npm|pnpm|yarn)\s+(test|build)\b/i, name: (cmd, code) => `Fail (${code}): ${cmd}` },
  { kind: "stderr_match", match: /\b(TypeError|panic|Segmentation fault|Unhandled|FATAL|ERROR)\b/i, name: (x) => `Crash/Error detected: ${x.slice(0, 60)}` },
];

export async function evaluateAutoCheckpoint(params: {
  repo: Repo;
  projectId: string;
  eventType: string;
  payload: any;
  createCheckpoint: (name: string, scope: "files+chat+terminal") => Promise<void>;
  rules?: AutoRule[];
}) {
  const rules = params.rules ?? DEFAULT_RULES;

  if (params.eventType === "term.exit") {
    const cmd = String(params.payload.command ?? "");
    const code = Number(params.payload.exitCode ?? 1);

    for (const r of rules) {
      if (r.kind === "term_success" && code === 0 && r.matchCmd.test(cmd)) {
        await params.createCheckpoint(r.name(cmd), "files+chat+terminal");
        return;
      }
      if (r.kind === "term_failure" && code !== 0 && r.matchCmd.test(cmd)) {
        await params.createCheckpoint(r.name(cmd, code), "files+chat+terminal");
        return;
      }
    }
  }

  // If you store stderr as blob, you can load it and scan lines here.
  // For MVP, scan a preview string if present:
  if (params.eventType === "term.exit" && typeof params.payload.stderrPreview === "string") {
    const s = params.payload.stderrPreview as string;
    for (const r of rules) {
      if (r.kind === "stderr_match" && r.match.test(s)) {
        await params.createCheckpoint(r.name(s), "files+chat+terminal");
        return;
      }
    }
  }
}
```

### Where to call it

* In `aitm run` after exit (you already have command + exit code + stderr)
* Or in MCP `tm_capsule_exec` after exec

So every recorded command can trigger checkpoints automatically.

---

# 3) MCP tools: “rewind/resume from Claude” (one-shot UX)

Claude can’t rewind itself, but it *can* call MCP tools that:

* restore workspace
* generate context packet
* (optionally) restart a capsule
* return a “next instruction” payload for Claude

## Tools you add

### `tm_rewind_to_last_green`

* finds latest checkpoint whose name matches `Tests green` or `Build green` (or tag)
* restores it
* returns context packet URI or text summary + next steps

### `tm_resume_context`

* returns the generated context packet so Claude can continue using it (if the client doesn’t allow sending big context at once)

### `tm_rewind_to_checkpoint`

* restore exact checkpoint id

## Exact schemas

### `src/mcp/rewind_schemas.ts`

```ts
import { z } from "zod";

export const zRewindToCheckpoint = z.object({
  projectId: z.string().min(1),
  checkpointId: z.string().min(1),
  mode: z.enum(["safe","hard"]).default("hard"),
  includeContextText: z.boolean().default(true),
});

export const zRewindToLastGreen = z.object({
  projectId: z.string().min(1),
  mode: z.enum(["safe","hard"]).default("hard"),
  includeContextText: z.boolean().default(true),
  // pattern override if user wants
  greenNamePatterns: z.array(z.string()).default(["Tests green", "Build green"]),
});

export const zResumeContext = z.object({
  projectId: z.string().min(1),
  checkpointId: z.string().min(1),
});
```

## Context packet generator

### `src/context/context_packet.ts`

```ts
import type { Repo } from "../store/repo.js";

export async function buildContextPacket(params: {
  repo: Repo;
  projectId: string;
  checkpointId: string;
  maxMessages?: number;
}) {
  // You’ll implement repo.getChatMessagesUpToHead(...) in your sqlite repo.
  // For now, return a placeholder format.
  const maxMessages = params.maxMessages ?? 20;

  // pseudo:
  const msgs = []; // await params.repo.getRecentChatMessages(params.projectId, checkpointId, maxMessages);

  const md = [
    `# AITM Restored Context`,
    `Checkpoint: ${params.checkpointId}`,
    `Time: ${new Date().toISOString()}`,
    ``,
    `## Conversation (last ${maxMessages} messages)`,
    ...msgs.map((m: any, i: number) => `${i + 1}) **${m.role}**: ${m.content}`),
    ``,
    `## Instruction`,
    `You are now operating on the restored workspace state. Continue from this checkpoint.`,
    ``,
  ].join("\n");

  return md;
}
```

## MCP tool handlers (rewind/resume)

### `src/mcp/rewind_tools.ts`

```ts
import { TmError } from "../core/errors.js";
import { parseManifestJson } from "../core/manifest.js";
import { restoreWorkspaceAtomic } from "../core/restore.js";
import { ProjectLock } from "../core/lock.js";
import { buildContextPacket } from "../context/context_packet.js";
import type { CasStore } from "../core/cas.js";
import type { Repo } from "../store/repo.js";

export async function rewindToCheckpoint(params: {
  repo: Repo;
  cas: CasStore;
  projectId: string;
  checkpointId: string;
  mode: "safe" | "hard";
  backupCurrent: boolean;
  includeContextText: boolean;
}) {
  const project = params.repo.getProject(params.projectId);
  if (!project) throw new TmError("TM_PROJECT_NOT_FOUND", "Project not found", { projectId: params.projectId });

  const cp = params.repo.getCheckpoint(params.projectId, params.checkpointId);
  if (!cp) throw new TmError("TM_CHECKPOINT_NOT_FOUND", "Checkpoint not found", { checkpointId: params.checkpointId });

  const lock = new ProjectLock(project.rootPath);
  lock.acquire();
  try {
    const manifestBuf = params.cas.getBytes(cp.manifestBlobHash);
    const manifest = parseManifestJson(manifestBuf.toString("utf8"));

    const res = restoreWorkspaceAtomic({
      projectRoot: project.rootPath,
      cas: params.cas,
      manifest,
      mode: params.mode,
      backupCurrent: params.backupCurrent,
    });

    const contextText = params.includeContextText
      ? await buildContextPacket({ repo: params.repo, projectId: params.projectId, checkpointId: cp.checkpointId })
      : null;

    return {
      checkpointId: cp.checkpointId,
      restored: res,
      contextText,
      // IMPORTANT: tell Claude what to do next
      next: contextText
        ? `I restored the workspace to checkpoint ${cp.checkpointId}. Use the provided context to continue from that state.`
        : `Workspace restored to checkpoint ${cp.checkpointId}.`,
    };
  } finally {
    lock.release();
  }
}

export async function rewindToLastGreen(params: {
  repo: Repo;
  cas: CasStore;
  projectId: string;
  mode: "safe" | "hard";
  includeContextText: boolean;
  greenNamePatterns: string[];
}) {
  // Implement repo.listCheckpointsNewestFirst and pick first matching name/tag.
  const cps = await (params.repo as any).listCheckpointsNewestFirst(params.projectId, 100);
  const patterns = params.greenNamePatterns;
  const found = cps.find((c: any) => patterns.some((p) => c.name.includes(p)));
  if (!found) throw new TmError("TM_CHECKPOINT_NOT_FOUND", "No 'green' checkpoint found", { patterns });

  return rewindToCheckpoint({
    repo: params.repo,
    cas: params.cas,
    projectId: params.projectId,
    checkpointId: found.checkpointId,
    mode: params.mode,
    backupCurrent: true,
    includeContextText: params.includeContextText,
  });
}
```

## Hook these tools into MCP

Add to your MCP `server.ts`:

```ts
import { zRewindToCheckpoint, zRewindToLastGreen } from "./rewind_schemas.js";
import { rewindToCheckpoint, rewindToLastGreen } from "./rewind_tools.js";

server.tool(
  "tm_rewind_to_checkpoint",
  "Restore workspace to a checkpoint and return a restored context packet for the model to continue from",
  zRewindToCheckpoint.shape,
  async (input) => {
    try {
      const r = await rewindToCheckpoint({
        repo: opts.repo,
        cas,
        projectId: input.projectId,
        checkpointId: input.checkpointId,
        mode: input.mode,
        backupCurrent: true,
        includeContextText: input.includeContextText,
      });
      return { content: [{ type: "text", text: JSON.stringify(r, null, 2) }] };
    } catch (e) {
      return { content: [{ type: "text", text: JSON.stringify({ error: toToolError(e) }, null, 2) }], isError: true };
    }
  }
);

server.tool(
  "tm_rewind_to_last_green",
  "Restore workspace to the most recent 'green' checkpoint (tests/build passing) and return restored context",
  zRewindToLastGreen.shape,
  async (input) => {
    try {
      const r = await rewindToLastGreen({
        repo: opts.repo,
        cas,
        projectId: input.projectId,
        mode: input.mode,
        includeContextText: input.includeContextText,
        greenNamePatterns: input.greenNamePatterns,
      });
      return { content: [{ type: "text", text: JSON.stringify(r, null, 2) }] };
    } catch (e) {
      return { content: [{ type: "text", text: JSON.stringify({ error: toToolError(e) }, null, 2) }], isError: true };
    }
  }
);
```

### How Claude uses it

User: “rewind to last green”

Claude calls:

* `tm_rewind_to_last_green({ projectId: "...", mode:"hard", includeContextText:true })`

Tool returns:

* restored summary
* `contextText`

Claude then continues with:

* “I’m now operating on restored state. Here’s the restored context…”
  (and it already has it)

---

# 4) Make it feel magical: “one-shot rewind then continue”

**Best practice**: your MCP tool returns a `next` instruction that nudges the agent:

* “State restored. Proceed to rerun tests and reapply changes carefully.”
* “Investigate why the regression happened using tm_diff_checkpoints.”

That makes the “just happens” vibe real.

---

# 5) What you must do once in practice (to tune marker parsing)

Run:

```bash
aitm claude --debug-transcript
```

Store raw PTY output for 30–60 seconds and tune the `MarkerProfile` regexes until it’s perfect for Claude Code.

That’s normal; terminals are messy.

---

If you want, I’ll also add:

* a **“pre-failure buffer”** feature: automatically checkpoint *right before* running a risky command
* an **auto-bisect** MCP tool: “find the first bad checkpoint by running tests in capsule”
