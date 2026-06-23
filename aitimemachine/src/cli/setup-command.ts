/**
 * Setup Command
 *
 * Auto-configure AITM MCP server in popular AI coding agents.
 * Detects Claude Code, Cursor, and Windsurf by checking config file existence.
 */

import { Command } from 'commander';
import { C, ok, warn, fail } from './cli-helpers.js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// ─── Types ──────────────────────────────────────────────────────────────────

interface AgentConfig {
  readonly name: string;
  readonly configPaths: readonly string[];
  readonly key: string;
}

interface DetectedAgent {
  readonly agent: AgentConfig;
  readonly configPath: string;
  readonly hasAitm: boolean;
}

interface McpServerEntry {
  readonly command: string;
  readonly args: readonly string[];
  readonly env: Record<string, never>;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const MCP_SERVER_ENTRY: McpServerEntry = {
  command: 'npx',
  args: ['@gitgram/timemachine-mcp'],
  env: {},
};

const AITM_SERVER_KEY = 'aitimemachine';

function getAgentConfigs(): readonly AgentConfig[] {
  const home = os.homedir();
  return [
    {
      name: 'Claude Code',
      configPaths: [
        path.join(home, '.claude.json'),
        path.join(home, '.claude', 'config.json'),
      ],
      key: 'claude',
    },
    {
      name: 'Cursor',
      configPaths: [
        path.join(home, '.cursor', 'mcp.json'),
      ],
      key: 'cursor',
    },
    {
      name: 'Windsurf',
      configPaths: [
        path.join(home, '.codeium', 'windsurf', 'mcp_config.json'),
      ],
      key: 'windsurf',
    },
  ] as const;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Strip single-line and multi-line JSON comments (// and /* ... *\/).
 * Some agent configs (e.g. VS Code based) allow comments in JSON.
 */
function stripJsonComments(text: string): string {
  let result = '';
  let i = 0;
  let inString = false;
  let escaped = false;

  while (i < text.length) {
    const ch = text[i];

    if (inString) {
      result += ch;
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      i++;
      continue;
    }

    if (ch === '"') {
      inString = true;
      result += ch;
      i++;
      continue;
    }

    if (ch === '/' && i + 1 < text.length) {
      const next = text[i + 1];
      if (next === '/') {
        // Single-line comment: skip to end of line
        const eol = text.indexOf('\n', i);
        i = eol === -1 ? text.length : eol;
        continue;
      }
      if (next === '*') {
        // Multi-line comment: skip to closing */
        const end = text.indexOf('*/', i + 2);
        i = end === -1 ? text.length : end + 2;
        continue;
      }
    }

    result += ch;
    i++;
  }

  return result;
}

/**
 * Safely read and parse a JSON config file, stripping comments if present.
 * Returns null if the file does not exist.
 * Throws on permission errors or malformed JSON.
 */
function readJsonConfig(filePath: string): Record<string, unknown> | null {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  const raw = fs.readFileSync(filePath, 'utf-8');
  const stripped = stripJsonComments(raw);
  const trimmed = stripped.trim();

  if (trimmed.length === 0) {
    return {};
  }

  return JSON.parse(trimmed) as Record<string, unknown>;
}

/**
 * Write a JSON config file with 2-space indent.
 * Creates parent directories if they do not exist.
 */
function writeJsonConfig(filePath: string, data: Record<string, unknown>): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
}

/**
 * Detect which agents are installed by checking config file existence.
 * For agents with multiple possible config paths, the first existing path wins.
 * If no config file exists, the first path is used as the default.
 */
function detectAgents(agents: readonly AgentConfig[]): readonly DetectedAgent[] {
  const detected: DetectedAgent[] = [];

  for (const agent of agents) {
    // Find the first existing config path, or fall back to the first path
    let configPath: string | null = null;
    let fileExists = false;

    for (const candidate of agent.configPaths) {
      if (fs.existsSync(candidate)) {
        configPath = candidate;
        fileExists = true;
        break;
      }
    }

    // Also check if parent directory exists (agent is installed but no config yet)
    if (!configPath) {
      for (const candidate of agent.configPaths) {
        const dir = path.dirname(candidate);
        if (fs.existsSync(dir)) {
          configPath = candidate;
          fileExists = false;
          break;
        }
      }
    }

    if (!configPath) {
      continue;
    }

    let hasAitm = false;
    if (fileExists) {
      try {
        const config = readJsonConfig(configPath);
        if (config) {
          const servers = config['mcpServers'] as Record<string, unknown> | undefined;
          hasAitm = servers !== undefined && AITM_SERVER_KEY in servers;
        }
      } catch {
        // Malformed config - still detected, just can't determine AITM status
      }
    }

    detected.push({ agent, configPath, hasAitm });
  }

  return detected;
}

/**
 * Inject the AITM MCP server entry into an agent's config file.
 * Merges into existing mcpServers without overwriting other entries.
 */
function injectMcpServer(configPath: string): { readonly success: boolean; readonly message: string } {
  try {
    let config = readJsonConfig(configPath);
    if (config === null) {
      config = {};
    }

    const servers = (config['mcpServers'] ?? {}) as Record<string, unknown>;

    if (AITM_SERVER_KEY in servers) {
      return { success: true, message: 'Already configured' };
    }

    const updatedServers = { ...servers, [AITM_SERVER_KEY]: { ...MCP_SERVER_ENTRY } };
    const updatedConfig = { ...config, mcpServers: updatedServers };

    writeJsonConfig(configPath, updatedConfig);
    return { success: true, message: 'Added successfully' };
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'EACCES') {
      return { success: false, message: 'Permission denied' };
    }
    if (err instanceof SyntaxError) {
      return { success: false, message: `Malformed JSON in config file: ${err.message}` };
    }
    return { success: false, message: (err as Error).message };
  }
}

/**
 * Remove the AITM MCP server entry from an agent's config file.
 */
function removeMcpServer(configPath: string): { readonly success: boolean; readonly message: string } {
  try {
    const config = readJsonConfig(configPath);
    if (config === null) {
      return { success: true, message: 'Config file does not exist' };
    }

    const servers = config['mcpServers'] as Record<string, unknown> | undefined;
    if (!servers || !(AITM_SERVER_KEY in servers)) {
      return { success: true, message: 'Not configured' };
    }

    const { [AITM_SERVER_KEY]: _removed, ...remainingServers } = servers;
    const updatedConfig = { ...config, mcpServers: remainingServers };

    writeJsonConfig(configPath, updatedConfig);
    return { success: true, message: 'Removed successfully' };
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'EACCES') {
      return { success: false, message: 'Permission denied' };
    }
    return { success: false, message: (err as Error).message };
  }
}

// ─── Command Registration ───────────────────────────────────────────────────

export function registerSetupCommand(program: Command): void {

  program
    .command('setup')
    .description('Auto-configure AITM MCP server in AI coding agents')
    .option('--claude', 'Only configure Claude Code')
    .option('--cursor', 'Only configure Cursor')
    .option('--windsurf', 'Only configure Windsurf')
    .option('--list', 'List detected agents and their config status')
    .option('--remove', 'Remove AITM from all agent configs')
    .action(async (options: {
      claude?: boolean;
      cursor?: boolean;
      windsurf?: boolean;
      list?: boolean;
      remove?: boolean;
    }) => {
      const allAgents = getAgentConfigs();

      // Determine which agents to target
      const hasSpecificFlag = options.claude || options.cursor || options.windsurf;
      const targetAgents = hasSpecificFlag
        ? allAgents.filter(a =>
            (options.claude && a.key === 'claude') ||
            (options.cursor && a.key === 'cursor') ||
            (options.windsurf && a.key === 'windsurf')
          )
        : [...allAgents];

      // --list: show detected agents and status
      if (options.list) {
        console.log(`\n${C.bright}AI Coding Agents${C.reset}\n`);

        const detected = detectAgents(targetAgents);

        if (detected.length === 0) {
          console.log(`  ${C.dim}No agents detected.${C.reset}`);
          console.log(`  ${C.dim}Checked:${C.reset}`);
          for (const agent of targetAgents) {
            for (const p of agent.configPaths) {
              console.log(`    ${C.dim}${p}${C.reset}`);
            }
          }
        } else {
          for (const { agent, configPath, hasAitm } of detected) {
            const statusIcon = hasAitm
              ? `${C.green}configured${C.reset}`
              : `${C.yellow}not configured${C.reset}`;
            console.log(`  ${C.cyan}${agent.name}${C.reset}`);
            console.log(`    Config: ${C.dim}${configPath}${C.reset}`);
            console.log(`    AITM:   ${statusIcon}`);
          }
        }

        const notDetected = targetAgents.filter(
          a => !detected.some(d => d.agent.key === a.key)
        );
        if (notDetected.length > 0) {
          console.log(`\n  ${C.dim}Not detected:${C.reset}`);
          for (const agent of notDetected) {
            console.log(`    ${C.dim}${agent.name}${C.reset}`);
          }
        }

        console.log('');
        return;
      }

      // --remove: remove AITM from configs
      if (options.remove) {
        console.log(`\n${C.bright}Removing AITM from AI agents${C.reset}\n`);

        const detected = detectAgents(targetAgents);

        if (detected.length === 0) {
          warn('No agents detected');
          return;
        }

        for (const { agent, configPath } of detected) {
          const result = removeMcpServer(configPath);
          if (result.success) {
            ok(`${agent.name}: ${result.message}`);
          } else {
            fail(`${agent.name}: ${result.message}`);
          }
        }

        console.log('');
        return;
      }

      // Default: auto-detect and configure
      console.log(`\n${C.bright}Setting up AITM MCP server${C.reset}\n`);

      const detected = detectAgents(targetAgents);

      if (detected.length === 0) {
        warn('No AI coding agents detected');
        console.log(`\n  ${C.dim}Looked for:${C.reset}`);
        for (const agent of targetAgents) {
          console.log(`    ${C.dim}- ${agent.name}${C.reset}`);
        }
        console.log(`\n  ${C.dim}Install an agent or use a specific flag:${C.reset}`);
        console.log(`    ${C.dim}aitm setup --claude${C.reset}`);
        console.log(`    ${C.dim}aitm setup --cursor${C.reset}`);
        console.log(`    ${C.dim}aitm setup --windsurf${C.reset}`);
        console.log('');
        return;
      }

      let configured = 0;
      let skipped = 0;

      for (const { agent, configPath, hasAitm } of detected) {
        if (hasAitm) {
          console.log(`  ${C.dim}[=]${C.reset} ${agent.name}: already configured`);
          skipped++;
          continue;
        }

        const result = injectMcpServer(configPath);
        if (result.success) {
          ok(`${agent.name}: ${result.message}`);
          console.log(`      ${C.dim}${configPath}${C.reset}`);
          configured++;
        } else {
          fail(`${agent.name}: ${result.message}`);
        }
      }

      console.log('');
      if (configured > 0) {
        console.log(`  ${C.green}${configured} agent(s) configured.${C.reset}`);
      }
      if (skipped > 0) {
        console.log(`  ${C.dim}${skipped} agent(s) already configured.${C.reset}`);
      }
      if (configured > 0) {
        console.log(`\n  ${C.dim}Restart your AI agent to pick up the new MCP server.${C.reset}`);
      }
      console.log('');
    });
}
