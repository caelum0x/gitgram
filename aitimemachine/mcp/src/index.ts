#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import {
  getDisabledTools,
  getToolAvailability,
  getUnknownDisabledTools,
  getProtectedEssentialTools,
} from './lib/stable-tools.js';
import {
  formatHiddenFamiliesWarning,
  getConfiguredButHiddenFamilies,
} from './lib/tool-diagnostics.js';
import { buildHandshakeInstructions } from './lib/handshake-instructions.js';
import type { ToolRuntimeContext, SessionServerLike } from './lib/tool-runtime.js';
import { registerCoreTools } from './tools/register-core-tools.js';
import { registerSessionTools } from './tools/register-session-tools.js';
import { registerIntegrationTools } from './tools/register-integration-tools.js';
import { registerStorageTools } from './tools/register-storage-tools.js';
import { registerFileTools } from './tools/register-file-tools.js';
import { registerWorktreeTools } from './tools/register-worktree-tools.js';
import { registerGitNexusTools } from './tools/register-gitnexus-tools.js';
import { registerA2ATools } from './tools/register-a2a-tools.js';
import { registerContext7Tools } from './tools/register-context7-tools.js';
import { registerPalTools } from './tools/register-pal-tools.js';
import { registerWorkspaceTools } from './tools/register-workspace-tools.js';
import { registerBeadsTools } from './tools/register-beads-tools.js';
import { registerGitHubTools } from './tools/register-github-tools.js';
import { registerClaudeTools } from './tools/register-claude-tools.js';
import { registerAnalysisTools } from './tools/register-analysis-tools.js';
import { registerMetaTools } from './tools/register-meta-tools.js';
import { registerResources } from './resources/register-resources.js';
import { registerPrompts } from './prompts/register-prompts.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

function resolveLibPath(): string {
  // Primary: when published, mcp/dist ships inside the @gitgram/timemachine
  // package, so the compiled core lib is at <pkgRoot>/lib (../../lib from
  // mcp/dist/). This works in a plain `npm install @gitgram/timemachine`.
  const bundledLib = path.resolve(__dirname, '../../lib');
  if (fs.existsSync(path.join(bundledLib, 'core', 'index.js'))) {
    return bundledLib;
  }

  // Fallbacks: resolve the core package by name in case the MCP server is
  // installed standalone. Try the real (scoped) package name first, then the
  // legacy unscoped name for backwards compatibility.
  for (const pkgName of ['@gitgram/timemachine', 'aitimemachine']) {
    try {
      const pkgPath = require.resolve(`${pkgName}/package.json`);
      const libPath = path.join(path.dirname(pkgPath), 'lib');
      if (fs.existsSync(path.join(libPath, 'core', 'index.js'))) {
        return libPath;
      }
    } catch {
      // try next candidate name
    }
  }

  throw new Error(
    'Could not find Gitgram TimeMachine core library. Install it with: npm install -g @gitgram/timemachine'
  );
}

const EXPERIMENTAL_ENABLED = process.env.AITM_EXPERIMENTAL_TOOLS === '1';
const TOOL_SELECTION_OPTIONS = {
  includeExperimental: EXPERIMENTAL_ENABLED,
  disabledTools: process.env.DISABLED_TOOLS,
};

async function loadLib() {
  const libPath = resolveLibPath();

  const { TimeMachineEngine } = await import(path.join(libPath, 'core/index.js'));
  const { SessionServer } = await import(path.join(libPath, 'server/session-server.js'));
  const { FastSessionCapture } = await import(path.join(libPath, 'server/fast-session-capture.js'));
  const { SmartRestore } = await import(path.join(libPath, 'server/smart-restore.js'));
  const { ContainerCollector } = await import(path.join(libPath, 'collectors/container-collector.js'));
  const { DatabaseCollector } = await import(path.join(libPath, 'collectors/database-collector.js'));
  const { GeminiCollector } = await import(path.join(libPath, 'collectors/gemini-collector.js'));
  const { GitCollector } = await import(path.join(libPath, 'collectors/git-collector.js'));
  const { EnvCollector } = await import(path.join(libPath, 'collectors/env-collector.js'));
  const { AiderCollector } = await import(path.join(libPath, 'collectors/aider-collector.js'));
  const { CursorCollector } = await import(path.join(libPath, 'collectors/cursor-collector.js'));
  const { S3Backup } = await import(path.join(libPath, 's3-backup.js'));
  const { ClaudeCodeIntegration } = await import(path.join(libPath, 'integrations/claude-code.js'));
  const { GlobalDaemon } = await import(path.join(libPath, 'server/global-daemon.js'));

  return {
    TimeMachineEngine,
    SessionServer,
    FastSessionCapture,
    SmartRestore,
    ContainerCollector,
    DatabaseCollector,
    GeminiCollector,
    GitCollector,
    EnvCollector,
    AiderCollector,
    CursorCollector,
    S3Backup,
    ClaudeCodeIntegration,
    GlobalDaemon,
  };
}

const server = new McpServer(
  {
    name: 'ai-time-machine-mcp',
    version: '2.0.0',
  },
  {
    // Advertise short usage guidance to the MCP client at initialize time so an
    // agent knows how to navigate the server's ~90 tools (discovery path,
    // experimental gating, before/after-action checkpoint protocol) without
    // first burning context probing every schema. Derived from the live tool
    // policy so the hints reflect what is actually enabled in this process.
    instructions: buildHandshakeInstructions(TOOL_SELECTION_OPTIONS),
  }
);

const skippedToolNames = new Map<string, string>();
const originalToolRegistration = server.tool.bind(server);

server.tool = ((name: string, ...args: unknown[]) => {
  const availability = getToolAvailability(name, TOOL_SELECTION_OPTIONS);
  if (!availability.enabled) {
    skippedToolNames.set(name, availability.reason);
    return undefined as unknown as ReturnType<typeof server.tool>;
  }

  return (originalToolRegistration as (...toolArgs: unknown[]) => unknown)(
    name,
    ...args
  ) as ReturnType<typeof server.tool>;
}) as unknown as typeof server.tool;

let lib: Awaited<ReturnType<typeof loadLib>> | undefined;
let sessionServer: SessionServerLike;
let currentProjectPath = process.cwd();

const unknownDisabledTools = getUnknownDisabledTools(TOOL_SELECTION_OPTIONS);
if (unknownDisabledTools.length > 0) {
  console.warn(`Unknown tools in DISABLED_TOOLS: ${unknownDisabledTools.join(', ')}`);
}

const protectedEssentialTools = getProtectedEssentialTools(TOOL_SELECTION_OPTIONS);
if (protectedEssentialTools.length > 0) {
  console.warn(
    `Cannot disable essential tools (ignored in DISABLED_TOOLS): ${protectedEssentialTools.join(', ')}`
  );
}

function ensureLibLoaded() {
  if (!lib) {
    throw new Error('AITM core library not loaded yet');
  }
  return lib;
}

function getSessionServer() {
  const loadedLib = ensureLibLoaded();
  if (!sessionServer) {
    sessionServer = new loadedLib.SessionServer();
  }
  return sessionServer;
}

function getEngine(projectPath?: string) {
  const loadedLib = ensureLibLoaded();
  return new loadedLib.TimeMachineEngine(projectPath || currentProjectPath);
}

const runtime: ToolRuntimeContext = {
  getLib: async () => ensureLibLoaded(),
  getSessionServer,
  getEngine,
  getCurrentProjectPath: () => currentProjectPath,
  setCurrentProjectPath: (projectPath: string) => {
    currentProjectPath = projectPath;
  },
  resolveProjectPath: (projectPath?: string) => projectPath || currentProjectPath,
  resolveLibPath: async () => resolveLibPath(),
};

registerCoreTools(server, runtime);
registerSessionTools(server, runtime);
registerIntegrationTools(server, runtime);
registerStorageTools(server, runtime);
registerFileTools(server, runtime);
registerWorktreeTools(server, runtime);
if (process.env.GITNEXUS_URL || process.env.AITM_GITNEXUS_ENABLED === '1') {
  registerGitNexusTools(server, runtime);
}
registerA2ATools(server, runtime);
// Context7 is now an in-process SDK client — gate on the API key.
if (process.env.CONTEXT7_API_KEY || process.env.AITM_CONTEXT7_ENABLED === '1') {
  registerContext7Tools(server, runtime);
}
// PAL is now an AITM-managed Python subprocess — gate on enable flag / bundled venv.
const PAL_ENABLED =
  process.env.AITM_PAL_ENABLED === '1' || Boolean(process.env.PAL_VENV_DIR);
if (PAL_ENABLED) {
  registerPalTools(server, runtime);
}
if (process.env.AITM_API_URL || process.env.AITM_WORKSPACE_ENABLED === '1') {
  registerWorkspaceTools(server, runtime);
}
if (process.env.BEADS_BINARY || process.env.AITM_BEADS_ENABLED === '1') {
  registerBeadsTools(server, runtime);
}
if (process.env.GITHUB_TOKEN) {
  registerGitHubTools(server, runtime);
}
if (process.env.ANTHROPIC_API_KEY) {
  registerClaudeTools(server, runtime);
}
registerAnalysisTools(server, runtime);
registerMetaTools(server, runtime);
registerResources(server, runtime, {
  experimentalEnabled: EXPERIMENTAL_ENABLED,
  toolSelectionOptions: TOOL_SELECTION_OPTIONS,
  skippedToolNames,
  unknownDisabledTools,
});
registerPrompts(server, runtime);

interface CliOptions {
  readonly transport: 'stdio' | 'http';
  readonly port: number;
  readonly help: boolean;
}

function parseCliArgs(argv: readonly string[]): CliOptions {
  const args = argv.slice(2);
  let transport: 'stdio' | 'http' = 'stdio';
  let port = 3002;
  let help = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--help' || arg === '-h') {
      help = true;
    } else if (arg === '--transport' || arg === '-t') {
      const value = args[++i];
      if (value === 'stdio' || value === 'http') {
        transport = value;
      } else {
        console.error(`Invalid transport: ${value}. Must be "stdio" or "http".`);
        process.exit(1);
      }
    } else if (arg === '--port' || arg === '-p') {
      const value = parseInt(args[++i], 10);
      if (Number.isNaN(value) || value < 1 || value > 65535) {
        console.error(`Invalid port: ${args[i]}. Must be 1-65535.`);
        process.exit(1);
      }
      port = value;
    }
  }

  return { transport, port, help };
}

function printHelp(): void {
  console.log(`
Gitgram TimeMachine MCP Server v2.0.0

Usage: aitm-mcp [options]

Options:
  --transport, -t <type>  Transport type: "stdio" (default) or "http"
  --port, -p <number>     Port for HTTP transport (default: 3002)
  --help, -h              Show this help message

Examples:
  aitm-mcp                              # stdio transport (default)
  aitm-mcp --transport http             # HTTP on port 3002
  aitm-mcp --transport http --port 8080 # HTTP on custom port

Environment:
  AITM_EXPERIMENTAL_TOOLS=1   Make experimental tool families visible
  DISABLED_TOOLS=a,b,c        Disable specific tools by name
  AITM_API_URL=<url>          AITM API server base URL (ws_*/beads_* proxy)
  AITM_API_KEY=aitm_...       Credential for the AITM API server (X-API-Key)
  AITM_MCP_AUTH_TOKEN=<tok>   Require Bearer/X-API-Key auth on /mcp and /a2a (http)
  AITM_MCP_ALLOWED_ORIGINS=.. Comma-separated CORS allow-list (http)
`.trim());
}

async function main() {
  const cli = parseCliArgs(process.argv);

  if (cli.help) {
    printHelp();
    process.exit(0);
  }

  lib = await loadLib();

  if (skippedToolNames.size > 0) {
    console.error(
      `AITM MCP tool policy active. Disabled tools: ${[...skippedToolNames.entries()]
        .map(([name, reason]) => `${name} (${reason})`)
        .join(', ')}`
    );
  }

  // Discoverability: if a user configured an integration (set its env var) but
  // every tool in that family is hidden because it is experimental and
  // AITM_EXPERIMENTAL_TOOLS is unset, they'd see zero tools with no signal.
  // Surface a clear, actionable hint rather than failing silently.
  const hiddenWarning = formatHiddenFamiliesWarning(
    getConfiguredButHiddenFamilies(TOOL_SELECTION_OPTIONS)
  );
  if (hiddenWarning) {
    console.warn(hiddenWarning);
  }

  // PAL readiness probe: when PAL tools are enabled, verify the bundled venv up
  // front so a broken/missing install surfaces immediately as clear guidance
  // instead of a 30s timeout on the first pal_* call. Non-fatal: the tools stay
  // registered so the error is also actionable at call time.
  if (PAL_ENABLED) {
    try {
      const { probePalReadiness } = await import('./tools/register-pal-tools.js');
      const probe = await probePalReadiness();
      if (!probe.ready) {
        console.warn(`PAL tools enabled but NOT ready: ${probe.detail}`);
      } else {
        console.error('PAL engine readiness check passed.');
      }
    } catch (err: unknown) {
      console.warn(
        `PAL readiness probe could not run: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }
  }

  if (cli.transport === 'http') {
    const { startHttpTransport } = await import('./http-transport.js');
    const { shutdown } = await startHttpTransport({
      port: cli.port,
      mcpServer: server,
    });

    const handleShutdown = async () => {
      await shutdown();
      process.exit(0);
    };
    process.on('SIGINT', handleShutdown);
    process.on('SIGTERM', handleShutdown);
  } else {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error('Gitgram TimeMachine MCP server started (stdio)');
  }
}

main().catch((error) => {
  console.error('Fatal MCP server error:', error);
  process.exit(1);
});
