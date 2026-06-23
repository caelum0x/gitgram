/**
 * PTY-based Claude session runner.
 * Captures user input and assistant output for time machine recording.
 */

import type { CasStore } from "../core/cas.js";
import type { Repo } from "../store/repo.js";
import { stripAnsi } from "./transcript-parser.js";

export interface ClaudeSessionOptions {
  repo: Repo;
  cas: CasStore;
  projectId: string;
  cwd: string;
  /** Command to launch Claude (default: "claude") */
  claudeCommand?: string;
  /** Context to inject as first message after prompt ready */
  injectedContext?: string;
  /** Enable debug transcript logging */
  debugTranscript?: boolean;
}

/**
 * Run an interactive Claude session with transcript capture.
 * Uses node-pty for terminal emulation.
 */
export async function runClaudeSession(opts: ClaudeSessionOptions): Promise<void> {
  // Dynamic import of node-pty (native module)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let pty: any;
  try {
    pty = await import("node-pty");
  } catch (err: unknown) {
    console.error("Error: node-pty is required for interactive Claude sessions.");
    console.error("Install it with: npm install node-pty");
    console.error("");
    console.error("Note: node-pty requires native compilation. You may need:");
    console.error("  - Python (for node-gyp)");
    console.error("  - C++ build tools (gcc/clang/MSVC)");
    console.error("  - On macOS: xcode-select --install");
    console.error("  - On Ubuntu: sudo apt-get install build-essential");
    process.exit(1);
  }

  const {
    repo,
    cas,
    projectId,
    cwd,
    claudeCommand = "claude",
    injectedContext,
    debugTranscript = false,
  } = opts;

  const tsStart = new Date().toISOString();
  const sessionId = `claude_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  // Record session start
  repo.appendEvent(projectId, "chat.session.start", tsStart, {
    tool: "claude-cli",
    sessionId,
    cwd,
    cmd: claudeCommand,
  });

  // Spawn PTY shell
  const shell = process.platform === "win32" ? "cmd.exe" : "bash";
  const term = pty.spawn(shell, [], {
    name: "xterm-256color",
    cols: process.stdout.columns ?? 120,
    rows: process.stdout.rows ?? 40,
    cwd,
    env: process.env as Record<string, string>,
  });

  // Launch Claude inside the shell
  term.write(`${claudeCommand}\r`);

  // State for message tracking
  let assistantBuffer = "";
  let currentUserLine = "";
  let promptReady = false;
  let contextInjected = !injectedContext; // true if no context to inject
  let debugLog: string[] = [];

  // Handle PTY output
  term.onData((data: string) => {
    // Write to actual terminal
    process.stdout.write(data);

    // Debug logging
    if (debugTranscript) {
      debugLog.push(`[PTY] ${data.replace(/\n/g, "\\n")}`);
    }

    // Accumulate assistant output
    assistantBuffer += data;

    // Simple prompt detection (Claude usually shows ">" or similar)
    const stripped = stripAnsi(data);
    if (!promptReady && (stripped.includes(">") || stripped.includes("claude"))) {
      promptReady = true;

      // Inject context if we have it and haven't yet
      if (injectedContext && !contextInjected) {
        contextInjected = true;
        setTimeout(() => {
          // Record the context injection
          recordUserMessage(repo, cas, projectId, sessionId, injectedContext, true);

          // Send to Claude
          const escaped = injectedContext.replace(/\n/g, "\r\n");
          term.write(escaped + "\r");
        }, 500);
      }
    }
  });

  // Handle user input
  const stdin = process.stdin;
  stdin.setRawMode?.(true);
  stdin.resume();
  stdin.setEncoding("utf8");

  stdin.on("data", (chunk: string) => {
    // Forward to PTY
    term.write(chunk);

    // Track user input for line detection
    for (const ch of chunk) {
      if (ch === "\r" || ch === "\n") {
        // User pressed Enter - flush assistant and record user message
        const submitted = currentUserLine.trimEnd();
        if (submitted.length > 0) {
          // Flush previous assistant message
          flushAssistantMessage(repo, cas, projectId, sessionId, assistantBuffer);
          assistantBuffer = "";

          // Record user message
          recordUserMessage(repo, cas, projectId, sessionId, submitted, false);
        }
        currentUserLine = "";
      } else if (ch === "\x03") {
        // Ctrl+C
        // Let it pass through
      } else if (ch === "\x7f" || ch === "\b") {
        // Backspace
        currentUserLine = currentUserLine.slice(0, -1);
      } else {
        currentUserLine += ch;
      }
    }
  });

  // Handle terminal resize
  process.stdout.on("resize", () => {
    term.resize(
      process.stdout.columns ?? 120,
      process.stdout.rows ?? 40
    );
  });

  // Wait for PTY exit
  return new Promise<void>((resolve) => {
    term.onExit(({ exitCode }: { exitCode: number }) => {
      // Cleanup
      stdin.setRawMode?.(false);
      stdin.pause();

      // Flush final assistant message
      flushAssistantMessage(repo, cas, projectId, sessionId, assistantBuffer);

      // Record session end
      repo.appendEvent(projectId, "chat.session.end", new Date().toISOString(), {
        tool: "claude-cli",
        sessionId,
        exitCode,
      });

      // Write debug log if requested
      if (debugTranscript && debugLog.length > 0) {
        const fs = require("fs");
        const debugPath = `.aitm-debug-transcript-${sessionId}.log`;
        fs.writeFileSync(debugPath, debugLog.join("\n"), "utf8");
        console.log(`\nDebug transcript written to: ${debugPath}`);
      }

      resolve();
    });
  });
}

/**
 * Record a user message event.
 */
function recordUserMessage(
  repo: Repo,
  cas: CasStore,
  projectId: string,
  sessionId: string,
  content: string,
  isContextInjection: boolean
): void {
  repo.appendEvent(projectId, "chat.message", new Date().toISOString(), {
    tool: "claude-cli",
    sessionId,
    role: "user",
    isContextInjection,
    content,
  });
}

/**
 * Flush accumulated assistant message.
 */
function flushAssistantMessage(
  repo: Repo,
  cas: CasStore,
  projectId: string,
  sessionId: string,
  raw: string
): void {
  const cleaned = normalizeAssistantOutput(raw);
  if (cleaned.trim().length === 0) return;

  // Store long content as blob
  const contentBlob = cas.putBytes("text/plain", Buffer.from(cleaned, "utf8"));

  repo.appendEvent(projectId, "chat.message", new Date().toISOString(), {
    tool: "claude-cli",
    sessionId,
    role: "assistant",
    contentHash: contentBlob.hash,
    contentPreview: cleaned.slice(0, 2000),
  });
}

/**
 * Normalize assistant output (strip ANSI, clean up whitespace).
 */
function normalizeAssistantOutput(s: string): string {
  return stripAnsi(s)
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim();
}

/**
 * Fallback for running Claude without PTY (non-interactive mode).
 * Uses stdin/stdout piping instead.
 */
export async function runClaudeNonInteractive(opts: {
  repo: Repo;
  cas: CasStore;
  projectId: string;
  cwd: string;
  claudeCommand?: string;
  input: string;
}): Promise<{ output: string; exitCode: number }> {
  const { spawn } = await import("node:child_process");
  const {
    repo,
    cas,
    projectId,
    cwd,
    claudeCommand = "claude",
    input,
  } = opts;

  const sessionId = `claude_nonint_${Date.now()}`;
  const tsStart = new Date().toISOString();

  // Record session start
  repo.appendEvent(projectId, "chat.session.start", tsStart, {
    tool: "claude-cli",
    sessionId,
    cwd,
    cmd: claudeCommand,
    mode: "non-interactive",
  });

  // Record input
  recordUserMessage(repo, cas, projectId, sessionId, input, false);

  // Run Claude with piped input
  const child = spawn(claudeCommand, [], {
    cwd,
    shell: true,
    stdio: ["pipe", "pipe", "pipe"],
    env: process.env,
  });

  child.stdin.write(input);
  child.stdin.end();

  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];

  child.stdout.on("data", (d) => stdout.push(d));
  child.stderr.on("data", (d) => stderr.push(d));

  const exitCode: number = await new Promise((resolve) => {
    child.on("close", (code) => resolve(code ?? 1));
  });

  const output = Buffer.concat(stdout).toString("utf8");
  const errorOutput = Buffer.concat(stderr).toString("utf8");

  // Record output
  flushAssistantMessage(repo, cas, projectId, sessionId, output);

  // Record session end
  repo.appendEvent(projectId, "chat.session.end", new Date().toISOString(), {
    tool: "claude-cli",
    sessionId,
    exitCode,
    hasStderr: errorOutput.length > 0,
  });

  return { output, exitCode };
}
