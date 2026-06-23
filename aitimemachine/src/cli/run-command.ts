/**
 * Command runner with event logging for aitm run.
 * Captures stdout/stderr and records events for time machine.
 */

import { spawn } from "node:child_process";
import type { CasStore } from "../core/cas.js";
import type { Repo } from "../store/repo.js";

export interface RunCommandOptions {
  repo: Repo;
  cas: CasStore;
  projectId: string;
  command: string;
  cwd: string;
  env?: Record<string, string>;
  timeoutMs?: number;
  /** Enable auto-checkpoint evaluation after command exits */
  enableAutoCheckpoint?: boolean;
  /** Callback for auto-checkpoint creation */
  createCheckpoint?: (name: string, scope: string) => Promise<void>;
}

export interface RunCommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  stdoutHash: string;
  stderrHash: string;
  durationMs: number;
}

/**
 * Run a shell command with stdout/stderr capture and event logging.
 */
export async function runCommand(opts: RunCommandOptions): Promise<RunCommandResult> {
  const startTime = Date.now();
  const ts = new Date().toISOString();

  // Record command start event
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

  // Stream stdout to console and buffer
  child.stdout.on("data", (d: Buffer) => {
    process.stdout.write(d);
    stdoutChunks.push(d);
  });

  // Stream stderr to console and buffer
  child.stderr.on("data", (d: Buffer) => {
    process.stderr.write(d);
    stderrChunks.push(d);
  });

  // Handle timeout
  let timeoutHandle: NodeJS.Timeout | undefined;
  if (opts.timeoutMs) {
    timeoutHandle = setTimeout(() => {
      child.kill("SIGTERM");
    }, opts.timeoutMs);
  }

  // Wait for exit
  const exitCode: number = await new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (code) => resolve(code ?? 1));
  });

  if (timeoutHandle) {
    clearTimeout(timeoutHandle);
  }

  const durationMs = Date.now() - startTime;

  // Store output as blobs
  const stdoutBuf = Buffer.concat(stdoutChunks);
  const stderrBuf = Buffer.concat(stderrChunks);

  const stdoutBlob = opts.cas.putBytes("text/plain", stdoutBuf);
  const stderrBlob = opts.cas.putBytes("text/plain", stderrBuf);

  const stdout = stdoutBuf.toString("utf8");
  const stderr = stderrBuf.toString("utf8");

  // Record exit event
  opts.repo.appendEvent(opts.projectId, "term.exit", new Date().toISOString(), {
    command: opts.command,
    exitCode,
    stdoutHash: stdoutBlob.hash,
    stderrHash: stderrBlob.hash,
    stderrPreview: stderr.slice(0, 2000), // For auto-checkpoint rules
    durationMs,
  });

  // Evaluate auto-checkpoint rules if enabled
  if (opts.enableAutoCheckpoint && opts.createCheckpoint) {
    const { evaluateAutoCheckpoint, DEFAULT_RULES } = await import("../rules/auto-checkpoint.js");

    await evaluateAutoCheckpoint({
      repo: opts.repo,
      projectId: opts.projectId,
      eventType: "term.exit",
      payload: {
        command: opts.command,
        exitCode,
        stderrPreview: stderr.slice(0, 2000),
      },
      createCheckpoint: async (name, scope) => {
        await opts.createCheckpoint!(name, scope);
      },
      rules: DEFAULT_RULES,
    });
  }

  return {
    exitCode,
    stdout,
    stderr,
    stdoutHash: stdoutBlob.hash,
    stderrHash: stderrBlob.hash,
    durationMs,
  };
}

/**
 * Run multiple commands sequentially.
 */
export async function runCommandsSequentially(
  opts: Omit<RunCommandOptions, "command">,
  commands: string[]
): Promise<RunCommandResult[]> {
  const results: RunCommandResult[] = [];

  for (const command of commands) {
    const result = await runCommand({ ...opts, command });
    results.push(result);

    // Stop on first failure if desired
    if (result.exitCode !== 0) {
      break;
    }
  }

  return results;
}

/**
 * Parse command string to extract the base command name.
 * Useful for auto-checkpoint rules.
 */
export function parseCommandName(command: string): string {
  // Remove leading whitespace and split on spaces
  const parts = command.trim().split(/\s+/);
  return parts[0] || command;
}

/**
 * Check if a command matches a pattern (for auto-checkpoint rules).
 */
export function commandMatches(command: string, pattern: RegExp): boolean {
  return pattern.test(command);
}
