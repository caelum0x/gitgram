/**
 * register-pal-tools.ts
 *
 * Registers PAL Python-execution tools into the AITM MCP server.
 *
 * PAL is run as an AITM-managed subprocess rather than an external HTTP
 * service: the `pal-mcp-server` console script is spawned from a bundled
 * Python virtual environment and driven over stdio using
 * `@modelcontextprotocol/sdk`'s StdioClientTransport. This mirrors the
 * api-server `palEngine` and removes the old PAL_MCP_URL HTTP proxy.
 *
 * Tool names, inputs, and outputs are unchanged — only the transport behind
 * `callPal` moved from HTTP JSON-RPC to an in-process stdio MCP client.
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import {
  createToolRegistrar,
  defineTool,
} from '../lib/tool-runtime.js';
import {
  mutatingAnnotations,
  readOnlyAnnotations,
} from '../lib/tool-annotations.js';
import { jsonResponse, textResponse } from '../lib/tool-responses.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// Maximum allowed execution timeout, in seconds.
const TIMEOUT_MAX_SECONDS = 300;
const TIMEOUT_DEFAULT_SECONDS = 30;

const STARTUP_TIMEOUT_MS = 30_000;

/**
 * Shape of a single notebook cell sent to pal_execute_notebook.
 * Defined here for documentation; the PAL server owns deep validation.
 */
interface NotebookCell {
  type: 'code' | 'markdown';
  source: string;
}

/**
 * Shape of a single cell result returned from pal_execute_notebook.
 */
interface NotebookCellResult {
  output: string;
  error: string | null;
  executionTime: number;
}

// ---------------------------------------------------------------------------
// PAL subprocess engine (stdio MCP client)
// ---------------------------------------------------------------------------

/**
 * Resolve the bundled PAL venv directory: `aitimemachine/engines/pal`.
 *
 * This module compiles to `mcp/dist/tools/register-pal-tools.js`, so the
 * aitimemachine root is three levels up from the tools directory.
 */
function resolveBundledVenvDir(): string {
  const here = fileURLToPath(new URL('.', import.meta.url));
  // here = .../mcp/{src|dist}/tools/
  const aitmRoot = join(here, '..', '..', '..');
  return join(aitmRoot, 'engines', 'pal');
}

function resolveVenvPython(venvDir: string): string {
  const posix = join(venvDir, 'bin', 'python');
  if (existsSync(posix)) {
    return posix;
  }
  const win = join(venvDir, 'Scripts', 'python.exe');
  if (existsSync(win)) {
    return win;
  }
  return posix;
}

function filterEnv(
  source: Readonly<Record<string, string | undefined>>
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(source)) {
    if (typeof value === 'string') {
      out[key] = value;
    }
  }
  return out;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
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
 * Manages the lifecycle of the PAL MCP subprocess and proxies tool calls to
 * it over stdio. Equivalent to the api-server `palEngine`.
 */
class PalEngine {
  private readonly venvDir: string;
  private readonly pythonPath: string;
  private readonly cwd: string;

  private client: Client | null = null;
  private transport: StdioClientTransport | null = null;
  private startPromise: Promise<void> | null = null;

  constructor() {
    const envVenv =
      typeof process !== 'undefined' ? process.env.PAL_VENV_DIR : undefined;
    this.venvDir = envVenv ?? resolveBundledVenvDir();

    const envPython =
      typeof process !== 'undefined' ? process.env.PAL_PYTHON : undefined;
    this.pythonPath = envPython ?? resolveVenvPython(this.venvDir);

    this.cwd = join(this.venvDir, '..');
  }

  private get command(): string {
    return this.pythonPath;
  }

  private get args(): string[] {
    // Equivalent to the `pal-mcp-server` console script (server:run),
    // invoked through the interpreter so no PATH manipulation is needed.
    return ['-m', 'server'];
  }

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
      ...filterEnv(typeof process !== 'undefined' ? process.env : {}),
    };

    const transport = new StdioClientTransport({
      command: this.command,
      args: this.args,
      cwd: this.cwd,
      env: childEnv,
      stderr: 'inherit',
    });

    const client = new Client(
      { name: 'aitm-pal-engine', version: '1.0.0' },
      { capabilities: {} }
    );

    try {
      await withTimeout(
        client.connect(transport),
        STARTUP_TIMEOUT_MS,
        `PAL engine failed to start within ${STARTUP_TIMEOUT_MS}ms ` +
          `(command: ${this.command} ${this.args.join(' ')}, cwd: ${this.cwd})`
      );
    } catch (error: unknown) {
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

  async callTool(
    name: string,
    args: Readonly<Record<string, unknown>>
  ): Promise<{ content: Array<{ type: string; text?: string }>; isError: boolean }> {
    await this.ensureStarted();
    const client = this.client;
    if (client === null) {
      throw new Error('PAL engine is not running');
    }

    const result = await client.callTool({
      name,
      arguments: { ...args },
    });

    const content = Array.isArray(result.content)
      ? (result.content as Array<{ type: string; text?: string }>)
      : [];

    return { content, isError: result.isError === true };
  }
}

const palEngine = new PalEngine();

// ---------------------------------------------------------------------------
// callPal — proxy a tool call through the PAL subprocess engine
// ---------------------------------------------------------------------------

async function callPal(
  toolName: string,
  args: Record<string, unknown>
): Promise<ReturnType<typeof textResponse>> {
  let result: { content: Array<{ type: string; text?: string }>; isError: boolean };
  try {
    result = await palEngine.callTool(toolName, args);
  } catch (err: unknown) {
    throw new Error(
      `PAL engine: tool '${toolName}' failed — ${getErrorMessage(err)}`
    );
  }

  if (result.isError) {
    const errText = result.content
      .filter((c) => c.type === 'text' && typeof c.text === 'string')
      .map((c) => c.text as string)
      .join('\n');
    throw new Error(
      `PAL tool '${toolName}' returned an error: ${errText || 'unknown error'}`
    );
  }

  // Forward text content as-is when present (MCP native format).
  if (Array.isArray(result.content) && result.content.length > 0) {
    const text = result.content
      .filter((c) => c.type === 'text' && typeof c.text === 'string')
      .map((c) => c.text as string)
      .join('\n');
    if (text.length > 0) {
      return textResponse(text);
    }
    // Non-text or empty content — return the whole result as JSON.
    return jsonResponse(result.content);
  }

  return jsonResponse(result.content);
}

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

export const registerPalTools = createToolRegistrar([
  // -------------------------------------------------------------------------
  // pal_execute — stateful Python execution with session and stdin support
  // -------------------------------------------------------------------------
  defineTool({
    name: 'pal_execute',
    description:
      'Execute Python code in an isolated sandbox. Supports persistent sessions ' +
      '(variable state is preserved across calls within the same session), ' +
      'configurable timeout, and stdin data.',
    schema: {
      code: z.string().describe('Python source code to execute'),
      sessionId: z
        .string()
        .optional()
        .describe(
          'Session ID from pal_create_session. When provided, variables from ' +
            'previous executions in this session are available.'
        ),
      timeout: z
        .number()
        .int()
        .min(1)
        .max(TIMEOUT_MAX_SECONDS)
        .default(TIMEOUT_DEFAULT_SECONDS)
        .optional()
        .describe(
          `Execution timeout in seconds. Default ${TIMEOUT_DEFAULT_SECONDS}, max ${TIMEOUT_MAX_SECONDS}.`
        ),
      input: z
        .string()
        .optional()
        .describe('Data to pipe to the process as stdin (e.g. for input() calls).'),
    },
    annotations: mutatingAnnotations(),
    run: async (args) => callPal('pal_execute', args as Record<string, unknown>),
  }),

  // -------------------------------------------------------------------------
  // pal_execute_notebook — run a Jupyter-style cell list
  // -------------------------------------------------------------------------
  defineTool({
    name: 'pal_execute_notebook',
    description:
      'Execute a Jupyter-style notebook defined as a list of cells. ' +
      'Code cells are run in sequence; markdown cells are skipped. ' +
      'Returns per-cell output, error, and execution time. ' +
      'Execution stops at the first cell that raises an unhandled exception ' +
      'unless continueOnError is true.',
    schema: {
      cells: z
        .array(
          z.object({
            type: z
              .enum(['code', 'markdown'])
              .describe('Cell kind. Markdown cells are recorded but not executed.'),
            source: z.string().describe('Cell source text.'),
          })
        )
        .min(1)
        .describe('Ordered list of notebook cells to process.'),
      sessionId: z
        .string()
        .optional()
        .describe(
          'Session ID from pal_create_session. Shares variable state across cells ' +
            'and across separate pal_execute_notebook calls.'
        ),
      continueOnError: z
        .boolean()
        .default(false)
        .optional()
        .describe(
          'When true, execution continues past a failing cell rather than stopping. ' +
            'The failing cell result will have a non-null error field.'
        ),
      timeout: z
        .number()
        .int()
        .min(1)
        .max(TIMEOUT_MAX_SECONDS)
        .default(TIMEOUT_DEFAULT_SECONDS)
        .optional()
        .describe(
          `Per-cell execution timeout in seconds. Default ${TIMEOUT_DEFAULT_SECONDS}, max ${TIMEOUT_MAX_SECONDS}.`
        ),
    },
    annotations: mutatingAnnotations(),
    run: async (args) =>
      callPal('pal_execute_notebook', args as Record<string, unknown>),
  }),

  // -------------------------------------------------------------------------
  // pal_install_package — pip install inside the sandbox
  // -------------------------------------------------------------------------
  defineTool({
    name: 'pal_install_package',
    description:
      'Install a Python package in the PAL sandbox environment via pip. ' +
      'Returns { success, version, warnings[] } once the installation completes.',
    schema: {
      package: z.string().describe('Package name (e.g. "pandas", "httpx").'),
      version: z
        .string()
        .optional()
        .describe(
          'Exact version to install (e.g. "1.26.0"). ' +
            'Omit to install the latest compatible version.'
        ),
    },
    annotations: mutatingAnnotations(),
    run: async (args) =>
      callPal('pal_install_package', args as Record<string, unknown>),
  }),

  // -------------------------------------------------------------------------
  // pal_list_packages — enumerate installed packages
  // -------------------------------------------------------------------------
  defineTool({
    name: 'pal_list_packages',
    description:
      'List all Python packages installed in the PAL sandbox environment. ' +
      'Returns { packages: [{ name, version }] }.',
    schema: {},
    annotations: readOnlyAnnotations(),
    run: async (args) =>
      callPal('pal_list_packages', args as Record<string, unknown>),
  }),

  // -------------------------------------------------------------------------
  // pal_analyze_code — static analysis and suggestions
  // -------------------------------------------------------------------------
  defineTool({
    name: 'pal_analyze_code',
    description:
      'Analyze code quality, style, and suggest improvements for the given source code.',
    schema: {
      code: z.string().describe('Source code to analyze'),
      language: z
        .string()
        .describe('Programming language (python, javascript, typescript, etc.)'),
    },
    annotations: readOnlyAnnotations(),
    run: async (args) =>
      callPal('pal_analyze_code', args as Record<string, unknown>),
  }),

  // -------------------------------------------------------------------------
  // pal_convert_notebook — .ipynb → markdown / Python script
  // -------------------------------------------------------------------------
  defineTool({
    name: 'pal_convert_notebook',
    description:
      'Convert a Jupyter notebook (.ipynb) to Markdown or a Python script.',
    schema: {
      notebookPath: z
        .string()
        .describe('Absolute path to the .ipynb file'),
    },
    annotations: readOnlyAnnotations(),
    run: async (args) =>
      callPal('pal_convert_notebook', args as Record<string, unknown>),
  }),

  // -------------------------------------------------------------------------
  // pal_create_session — open a persistent execution session
  // -------------------------------------------------------------------------
  defineTool({
    name: 'pal_create_session',
    description:
      'Create a persistent Python execution session. ' +
      'Pass the returned sessionId to pal_execute or pal_execute_notebook to ' +
      'preserve variable state across calls. ' +
      'Returns { sessionId, expires } where expires is an ISO-8601 timestamp.',
    schema: {
      ttl: z
        .number()
        .int()
        .min(60)
        .max(86400)
        .default(3600)
        .optional()
        .describe(
          'Session time-to-live in seconds. Default 3600 (1 hour), max 86400 (24 hours). ' +
            'The session is automatically destroyed after this period of inactivity.'
        ),
    },
    annotations: mutatingAnnotations(),
    run: async (args) =>
      callPal('pal_create_session', args as Record<string, unknown>),
  }),

  // -------------------------------------------------------------------------
  // pal_destroy_session — clean up a session explicitly
  // -------------------------------------------------------------------------
  defineTool({
    name: 'pal_destroy_session',
    description:
      'Destroy a persistent execution session and release its resources. ' +
      'After calling this, the sessionId is no longer valid.',
    schema: {
      sessionId: z
        .string()
        .describe('Session ID returned by pal_create_session.'),
    },
    annotations: mutatingAnnotations(),
    run: async (args) =>
      callPal('pal_destroy_session', args as Record<string, unknown>),
  }),
]);

export default registerPalTools;
