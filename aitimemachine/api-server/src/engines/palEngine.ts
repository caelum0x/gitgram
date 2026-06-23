/**
 * palEngine.ts
 *
 * AITM-managed subprocess engine for the PAL MCP server.
 *
 * Instead of proxying to an external HTTP service (the old PAL_MCP_URL), AITM
 * owns the lifecycle of the Python `pal-mcp-server` console script: it spawns
 * the process from a bundled virtual environment and speaks MCP over stdio
 * using `@modelcontextprotocol/sdk`'s StdioClientTransport.
 *
 * Lifecycle:
 *   - ensureStarted() — idempotently spawn the subprocess and connect.
 *   - callTool(name, args) — invoke a PAL MCP tool.
 *   - health() — report whether the engine is reachable.
 *   - shutdown() — terminate the subprocess and release resources.
 *
 * Paths default to a bundled engine location so no external URL is required.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PalToolResult {
  /** Raw MCP content blocks returned by the PAL tool. */
  readonly content: ReadonlyArray<{ readonly type: string; readonly text?: string }>;
  /** Convenience: concatenation of all text blocks. */
  readonly text: string;
  /** Whether the PAL tool reported an error. */
  readonly isError: boolean;
}

export interface PalHealth {
  readonly status: "ok" | "starting" | "down";
  readonly running: boolean;
  readonly pid: number | null;
  readonly command: string;
  readonly detail?: string;
}

export interface PalEngineOptions {
  /**
   * Absolute path to the PAL virtual environment directory.
   * Defaults to PAL_VENV_DIR, then the bundled `aitimemachine/engines/pal`.
   */
  readonly venvDir?: string;
  /**
   * Absolute path to the Python interpreter to use. When omitted it is
   * resolved from the venv directory. Overridable via PAL_PYTHON.
   */
  readonly pythonPath?: string;
  /**
   * Working directory for the spawned subprocess.
   * Defaults to the venv directory's parent (the engine root).
   */
  readonly cwd?: string;
  /** Extra environment variables to pass to the subprocess. */
  readonly env?: Readonly<Record<string, string>>;
  /** Startup timeout in milliseconds. Defaults to 30000. */
  readonly startupTimeoutMs?: number;
}

// ---------------------------------------------------------------------------
// Path resolution
// ---------------------------------------------------------------------------

const DEFAULT_STARTUP_TIMEOUT_MS = 30_000;

/**
 * Resolve the bundled engine root: `aitimemachine/engines/pal`.
 *
 * This file lives at `api-server/src/engines/palEngine.ts` (or its compiled
 * `dist/engines/palEngine.js`), so the aitimemachine root is three levels up
 * from the engines directory, regardless of src vs dist.
 */
function resolveBundledVenvDir(): string {
  const here = fileURLToPath(new URL(".", import.meta.url));
  // here = .../api-server/{src|dist}/engines/
  // aitimemachine root = here/../../../
  const aitmRoot = join(here, "..", "..", "..");
  return join(aitmRoot, "engines", "pal");
}

/**
 * Resolve the Python interpreter inside a venv directory, handling both
 * POSIX (`bin/python`) and Windows (`Scripts/python.exe`) layouts.
 */
function resolveVenvPython(venvDir: string): string {
  const posix = join(venvDir, "bin", "python");
  if (existsSync(posix)) {
    return posix;
  }
  const win = join(venvDir, "Scripts", "python.exe");
  if (existsSync(win)) {
    return win;
  }
  // Fall back to the conventional POSIX path; spawn will surface a clear
  // ENOENT if it is missing and health() will report `down`.
  return posix;
}

// ---------------------------------------------------------------------------
// PalEngine
// ---------------------------------------------------------------------------

export class PalEngine {
  private readonly venvDir: string;
  private readonly pythonPath: string;
  private readonly cwd: string;
  private readonly env: Record<string, string>;
  private readonly startupTimeoutMs: number;

  private client: Client | null = null;
  private transport: StdioClientTransport | null = null;
  private startPromise: Promise<void> | null = null;

  constructor(options: PalEngineOptions = {}) {
    const envVenv =
      typeof process !== "undefined" ? process.env.PAL_VENV_DIR : undefined;
    this.venvDir =
      options.venvDir ?? envVenv ?? resolveBundledVenvDir();

    const envPython =
      typeof process !== "undefined" ? process.env.PAL_PYTHON : undefined;
    this.pythonPath =
      options.pythonPath ?? envPython ?? resolveVenvPython(this.venvDir);

    this.cwd = options.cwd ?? join(this.venvDir, "..");
    this.env = { ...(options.env ?? {}) };
    this.startupTimeoutMs =
      options.startupTimeoutMs ?? DEFAULT_STARTUP_TIMEOUT_MS;
  }

  /**
   * The command used to launch the PAL MCP server.
   * Runs the console script via `python -m` to avoid depending on the venv's
   * bin being on PATH; the `pal-mcp-server` entry point maps to `server:run`.
   */
  private get command(): string {
    return this.pythonPath;
  }

  private get args(): string[] {
    // Equivalent to running the `pal-mcp-server` console script (server:run),
    // but invoked through the interpreter so no PATH manipulation is needed.
    return ["-m", "server"];
  }

  /**
   * Idempotently spawn the PAL subprocess and establish the MCP session.
   * Concurrent callers share a single in-flight start.
   */
  async ensureStarted(): Promise<void> {
    if (this.client !== null) {
      return;
    }
    if (this.startPromise !== null) {
      return this.startPromise;
    }

    this.startPromise = this.start();
    try {
      await this.startPromise;
    } finally {
      this.startPromise = null;
    }
  }

  private async start(): Promise<void> {
    const childEnv: Record<string, string> = {
      ...filterEnv(typeof process !== "undefined" ? process.env : {}),
      ...this.env,
    };

    const transport = new StdioClientTransport({
      command: this.command,
      args: this.args,
      cwd: this.cwd,
      env: childEnv,
      stderr: "inherit",
    });

    const client = new Client(
      { name: "aitm-pal-engine", version: "1.0.0" },
      { capabilities: {} }
    );

    try {
      await withTimeout(
        client.connect(transport),
        this.startupTimeoutMs,
        `PAL engine failed to start within ${this.startupTimeoutMs}ms ` +
          `(command: ${this.command} ${this.args.join(" ")}, cwd: ${this.cwd})`
      );
    } catch (error: unknown) {
      // Best-effort cleanup so a failed start does not leak a child process.
      try {
        await transport.close();
      } catch {
        // ignore secondary cleanup errors
      }
      throw new Error(
        `PAL engine startup failed: ${getErrorMessage(error)}. ` +
          `Ensure the bundled PAL venv exists at ${this.venvDir} ` +
          `and the pal-mcp-server package is installed in it.`
      );
    }

    this.transport = transport;
    this.client = client;
  }

  /**
   * Invoke a PAL MCP tool by name with the given arguments.
   * Lazily starts the engine if it is not already running.
   */
  async callTool(
    name: string,
    args: Readonly<Record<string, unknown>>
  ): Promise<PalToolResult> {
    await this.ensureStarted();
    const client = this.client;
    if (client === null) {
      throw new Error("PAL engine is not running");
    }

    const result = await client.callTool({
      name,
      arguments: { ...args },
    });

    const blocks = Array.isArray(result.content)
      ? (result.content as Array<{ type: string; text?: string }>)
      : [];

    const text = blocks
      .filter((b) => b.type === "text" && typeof b.text === "string")
      .map((b) => b.text as string)
      .join("\n");

    return {
      content: blocks,
      text,
      isError: result.isError === true,
    };
  }

  /**
   * Report the current health of the engine without forcing a start.
   */
  async health(): Promise<PalHealth> {
    const commandLine = `${this.command} ${this.args.join(" ")}`;

    if (this.startPromise !== null) {
      return {
        status: "starting",
        running: false,
        pid: this.transport?.pid ?? null,
        command: commandLine,
      };
    }

    if (this.client === null || this.transport === null) {
      return {
        status: "down",
        running: false,
        pid: null,
        command: commandLine,
        detail: "engine not started",
      };
    }

    try {
      // A lightweight round-trip confirms the stdio session is alive.
      await this.client.listTools();
      return {
        status: "ok",
        running: true,
        pid: this.transport.pid ?? null,
        command: commandLine,
      };
    } catch (error: unknown) {
      return {
        status: "down",
        running: false,
        pid: this.transport.pid ?? null,
        command: commandLine,
        detail: getErrorMessage(error),
      };
    }
  }

  /**
   * Terminate the subprocess and release the MCP session.
   * Safe to call multiple times.
   */
  async shutdown(): Promise<void> {
    const client = this.client;
    const transport = this.transport;
    this.client = null;
    this.transport = null;

    if (client !== null) {
      try {
        await client.close();
      } catch {
        // ignore — fall through to transport close
      }
    }
    if (transport !== null) {
      try {
        await transport.close();
      } catch {
        // ignore
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  message: string
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
}

/**
 * Filter a process environment down to defined string values, since
 * `StdioClientTransport` expects `Record<string, string>`.
 */
function filterEnv(
  source: Readonly<Record<string, string | undefined>>
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(source)) {
    if (typeof value === "string") {
      out[key] = value;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

/**
 * Process-wide PAL engine singleton, used by the MCP `pal_*` tool bridge.
 */
export const palEngine = new PalEngine();
