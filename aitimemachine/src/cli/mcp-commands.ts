/**
 * MCP & Daemon Commands
 *
 * mcp, mcp-tools, setup-mcp, daemon, daemon-stop, daemon-status, daemon-logs,
 * install, uninstall, service-status, ui, serve
 */

import { Command } from 'commander';
import { C } from './cli-helpers.js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function registerMcpCommands(program: Command): void {

  // MCP tools list
  program
    .command('mcp-tools')
    .description('List available MCP tools for AI integration')
    .action(async () => {
      console.log(`\n${C.bright}MCP Tools Available${C.reset}\n`);
      console.log(`${C.bright}AI-Friendly Navigation:${C.reset}`);
      console.log(`  ${C.cyan}where_am_i${C.reset}     - Show current state and recent timeline`);
      console.log(`  ${C.cyan}go_back${C.reset}        - Natural language restore`);
      console.log(`  ${C.cyan}show_changes${C.reset}   - Show what changed since last checkpoint`);
      console.log(`  ${C.cyan}undo_last${C.reset}      - Quick undo to previous checkpoint`);
      console.log(`\n${C.bright}Checkpoint Management:${C.reset}`);
      console.log(`  ${C.cyan}before_action${C.reset}  - Create "before" checkpoint`);
      console.log(`  ${C.cyan}after_action${C.reset}   - Create "after" checkpoint with change summary`);
      console.log(`  ${C.cyan}checkpoint${C.reset}     - Manual checkpoint creation`);
      console.log(`  ${C.cyan}list_timepoints${C.reset} - List all checkpoints`);
      console.log(`  ${C.cyan}restore${C.reset}        - Restore to checkpoint`);
      console.log(`  ${C.cyan}preview_restore${C.reset} - Preview what restore will do`);
      console.log(`\n${C.bright}File Operations:${C.reset}`);
      console.log(`  ${C.cyan}get_file_at${C.reset}    - Get file content at specific checkpoint`);
      console.log(`  ${C.cyan}diff${C.reset}           - Compare two checkpoints`);
      console.log(`  ${C.cyan}search${C.reset}         - Search conversations and checkpoints`);
      console.log(`\n${C.bright}Git-Inspired:${C.reset}`);
      console.log(`  ${C.cyan}stash${C.reset}          - Save/restore uncommitted changes`);
      console.log(`  ${C.cyan}blame${C.reset}          - Show who/when each line was modified`);
      console.log(`  ${C.cyan}reflog${C.reset}         - History of all operations`);
      console.log(`  ${C.cyan}history${C.reset}        - Enhanced log with --oneline, --stat`);
      console.log(`  ${C.cyan}tag${C.reset}            - Named references to checkpoints`);
      console.log(`  ${C.cyan}cherry_pick${C.reset}    - Apply changes from specific checkpoint`);
      console.log(`  ${C.cyan}reset${C.reset}          - Reset to checkpoint (soft/hard)`);
      console.log(`  ${C.cyan}clean${C.reset}          - Remove untracked files`);
      console.log(`  ${C.cyan}revert${C.reset}         - Undo a checkpoint's changes`);
      console.log(`  ${C.cyan}shortlog${C.reset}       - Summarize checkpoint history`);
      console.log(`\n${C.dim}Configure in your AI tool's MCP settings:${C.reset}`);
      console.log(`${C.dim}{${C.reset}`);
      console.log(`${C.dim}  "aitimemachine": {${C.reset}`);
      console.log(`${C.dim}    "command": "aitm",${C.reset}`);
      console.log(`${C.dim}    "args": ["mcp"]${C.reset}`);
      console.log(`${C.dim}  }${C.reset}`);
      console.log(`${C.dim}}${C.reset}\n`);
    });

  // MCP daemon
  program
    .command('mcp')
    .description('Run MCP server (for AI tool integration)')
    .option('--http <port>', 'Run as HTTP server on specified port')
    .option('--sse <port>', 'Run as SSE server on specified port')
    .action(async (options) => {
      const { spawn } = await import('child_process');
      const mcpPath = path.join(__dirname, '..', '..', 'mcp', 'dist', 'index.js');
      const args = [mcpPath];
      if (options.http) args.push('http', options.http);
      else if (options.sse) args.push('sse', options.sse);
      const child = spawn('node', args, { stdio: 'inherit' });
      child.on('error', (err) => { console.error('Failed to start MCP server:', err.message); process.exit(1); });
      child.on('exit', (code) => process.exit(code || 0));
    });

  // Global daemon (auto-setup, periodic capture, cloud sync).
  // Distinct from the auto-checkpoint daemon registered by watch-commands as
  // `aitm daemon start|stop|status`. Named `global-daemon` so both are reachable
  // (commander only allows one command per name; the first registrant wins, so
  // a shared `daemon` name would have made one of them a dead no-op).
  program
    .command('global-daemon')
    .description('Start global background daemon (auto-setup, periodic capture, cloud sync)')
    .option('--foreground', 'Run in foreground (for debugging)')
    .action(async (options) => {
      const { DaemonManager } = await import('../server/daemon-manager.js');
      const dm = new DaemonManager();
      if (options.foreground || process.env.AITM_DAEMON === '1') {
        const { GlobalDaemon } = await import('../server/global-daemon.js');
        const daemon = new GlobalDaemon();
        await daemon.run();
      } else {
        const result = await dm.start();
        console.log(result.message);
        if (result.pid) console.log(`  PID: ${result.pid}`);
      }
    });

  program
    .command('global-daemon-stop')
    .description('Stop the global background daemon')
    .action(async () => {
      const { DaemonManager } = await import('../server/daemon-manager.js');
      const dm = new DaemonManager();
      const result = dm.stop();
      console.log(result.message);
    });

  program
    .command('global-daemon-status')
    .description('Check global daemon status')
    .action(async () => {
      const { DaemonManager } = await import('../server/daemon-manager.js');
      const dm = new DaemonManager();
      const status = dm.status();
      if (status.running) {
        console.log(`${C.green}[Running]${C.reset} PID: ${status.pid}, Uptime: ${status.uptime}`);
      } else {
        console.log(`${C.dim}[Stopped]${C.reset}`);
      }
    });

  program
    .command('global-daemon-logs')
    .description('View global daemon logs')
    .option('-n, --lines <n>', 'Number of lines', '20')
    .action(async (options) => {
      const { DaemonManager } = await import('../server/daemon-manager.js');
      const dm = new DaemonManager();
      const logs = dm.getLogs(parseInt(options.lines));
      if (logs.length === 0) { console.log('No logs yet'); } else { logs.forEach(l => console.log(l)); }
    });

  // System service
  program
    .command('install')
    .description('Install as system service (auto-start on boot)')
    .action(async () => {
      const { ServiceInstaller } = await import('../service-installer.js');
      const installer = new ServiceInstaller();
      const result = installer.install();
      if (result.success) {
        console.log(`${C.green}[OK]${C.reset} ${result.message}`);
        console.log(`${C.dim}Daemon will now start automatically on login${C.reset}`);
      } else {
        console.log(`${C.red}[!]${C.reset} ${result.message}`);
      }
    });

  program
    .command('uninstall')
    .description('Remove system service')
    .action(async () => {
      const { ServiceInstaller } = await import('../service-installer.js');
      const installer = new ServiceInstaller();
      const result = installer.uninstall();
      if (result.success) { console.log(`${C.green}[OK]${C.reset} ${result.message}`); }
      else { console.log(`${C.red}[!]${C.reset} ${result.message}`); }
    });

  program
    .command('service-status')
    .description('Check system service status')
    .action(async () => {
      const { ServiceInstaller } = await import('../service-installer.js');
      const installer = new ServiceInstaller();
      const status = installer.status();
      console.log(`\n${C.bright}Service Status${C.reset} (${status.type})\n`);
      console.log(`  Installed: ${status.installed ? C.green + 'Yes' : C.dim + 'No'}${C.reset}`);
      console.log(`  Running: ${status.running ? C.green + 'Yes' : C.dim + 'No'}${C.reset}`);
      if (!status.installed) { console.log(`\n${C.dim}Run 'aitm install' to enable auto-start${C.reset}`); }
      console.log();
    });

  // Web UI
  program
    .command('ui')
    .alias('web')
    .description('Start web UI for visual timeline browsing')
    .option('-p, --port <port>', 'Port number', '3333')
    .option('-h, --host <host>', 'Host to bind', 'localhost')
    .option('--no-open', 'Do not open browser')
    .action(async (options) => {
      const { startWebUI } = await import('../web-ui-v3.js');
      startWebUI(parseInt(options.port), options.host, options.open !== false);
    });

  // API Server
  program
    .command('serve')
    .description('Start API server')
    .option('-p, --port <port>', 'Port number', '3001')
    .action(async (options) => {
      process.env.PORT = options.port;
      await import('../api-server.js');
    });

  // Setup MCP for all AI tools
  program
    .command('setup-mcp')
    .description('Setup AITimeMachine MCP integration for AI tools')
    .option('-t, --tool <tool>', 'Specific tool: claude, cursor, windsurf, cline, zed, continue')
    .action(async () => {
      console.log(`\n${C.bright}AITimeMachine Integration Setup${C.reset}\n`);
      const home = process.env.HOME || '';
      const { execSync } = await import('child_process');
      const mcpConfig = { command: 'aitm', args: ['mcp'] };

      // Claude Code
      console.log(`${C.cyan}[1] Claude Code${C.reset}`);
      try {
        execSync('which claude', { stdio: 'pipe' });
        try { execSync(`claude mcp add aitimemachine -- aitm mcp`, { stdio: 'pipe' }); console.log(`    ${C.green}+${C.reset} Added via CLI`); }
        catch { console.log(`    ${C.yellow}o${C.reset} Already configured or manual setup needed`); }
      } catch {
        const claudeConfig = path.join(home, '.claude.json');
        try {
          const config = fs.existsSync(claudeConfig) ? JSON.parse(fs.readFileSync(claudeConfig, 'utf-8')) : {};
          config.mcpServers = config.mcpServers || {};
          config.mcpServers.aitimemachine = { type: 'stdio', ...mcpConfig };
          fs.writeFileSync(claudeConfig, JSON.stringify(config, null, 2));
          console.log(`    ${C.green}+${C.reset} Added to ~/.claude.json`);
        } catch { console.log(`    ${C.dim}-${C.reset} Not installed`); }
      }

      // Cursor
      console.log(`${C.cyan}[2] Cursor${C.reset}`);
      const cursorConfig = path.join(home, '.cursor', 'mcp.json');
      try {
        const dir = path.dirname(cursorConfig);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        const config = fs.existsSync(cursorConfig) ? JSON.parse(fs.readFileSync(cursorConfig, 'utf-8')) : {};
        config.mcpServers = config.mcpServers || {};
        config.mcpServers.aitimemachine = mcpConfig;
        fs.writeFileSync(cursorConfig, JSON.stringify(config, null, 2));
        console.log(`    ${C.green}+${C.reset} Added to ~/.cursor/mcp.json`);
      } catch (e) { console.log(`    ${C.dim}-${C.reset} Failed: ${(e as Error).message}`); }

      // Windsurf
      console.log(`${C.cyan}[3] Windsurf${C.reset}`);
      const windsurfConfig = path.join(home, '.codeium', 'windsurf', 'mcp_config.json');
      try {
        const dir = path.dirname(windsurfConfig);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        const config = fs.existsSync(windsurfConfig) ? JSON.parse(fs.readFileSync(windsurfConfig, 'utf-8')) : {};
        config.mcpServers = config.mcpServers || {};
        config.mcpServers.aitimemachine = mcpConfig;
        fs.writeFileSync(windsurfConfig, JSON.stringify(config, null, 2));
        console.log(`    ${C.green}+${C.reset} Added to ~/.codeium/windsurf/mcp_config.json`);
      } catch (e) { console.log(`    ${C.dim}-${C.reset} Failed: ${(e as Error).message}`); }

      // Cline
      console.log(`${C.cyan}[4] Cline${C.reset}`);
      const clineConfig = path.join(home, 'Library', 'Application Support', 'Code', 'User', 'globalStorage', 'saoudrizwan.claude-dev', 'settings', 'cline_mcp_settings.json');
      try {
        const dir = path.dirname(clineConfig);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        const config = fs.existsSync(clineConfig) ? JSON.parse(fs.readFileSync(clineConfig, 'utf-8')) : {};
        config.mcpServers = config.mcpServers || {};
        config.mcpServers.aitimemachine = mcpConfig;
        fs.writeFileSync(clineConfig, JSON.stringify(config, null, 2));
        console.log(`    ${C.green}+${C.reset} Added to Cline settings`);
      } catch { console.log(`    ${C.dim}-${C.reset} Not installed or failed`); }

      // Zed
      console.log(`${C.cyan}[5] Zed${C.reset}`);
      const zedConfig = path.join(home, '.config', 'zed', 'settings.json');
      try {
        if (fs.existsSync(zedConfig)) {
          const content = fs.readFileSync(zedConfig, 'utf-8');
          if (!content.includes('aitimemachine')) {
            console.log(`    ${C.yellow}o${C.reset} Add manually to ${zedConfig}:`);
            console.log(`       "context_servers": { "aitimemachine": { "command": { "path": "aitm", "args": ["mcp"] } } }`);
          } else { console.log(`    ${C.green}+${C.reset} Already configured`); }
        } else { console.log(`    ${C.dim}-${C.reset} Not installed`); }
      } catch { console.log(`    ${C.dim}-${C.reset} Not installed`); }

      // Continue
      console.log(`${C.cyan}[6] Continue${C.reset}`);
      const continueConfig = path.join(home, '.continue', 'config.json');
      try {
        const dir = path.dirname(continueConfig);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        const config = fs.existsSync(continueConfig) ? JSON.parse(fs.readFileSync(continueConfig, 'utf-8')) : {};
        config.experimental = config.experimental || {};
        config.experimental.modelContextProtocolServers = config.experimental.modelContextProtocolServers || [];
        if (!config.experimental.modelContextProtocolServers.find((s: any) => s.name === 'aitimemachine')) {
          config.experimental.modelContextProtocolServers.push({
            name: 'aitimemachine', transport: { type: 'stdio', command: 'aitm', args: ['mcp'] }
          });
          fs.writeFileSync(continueConfig, JSON.stringify(config, null, 2));
          console.log(`    ${C.green}+${C.reset} Added to ~/.continue/config.json`);
        } else { console.log(`    ${C.green}+${C.reset} Already configured`); }
      } catch (e) { console.log(`    ${C.dim}-${C.reset} Failed: ${(e as Error).message}`); }

      // Gemini CLI
      console.log(`${C.cyan}[7] Gemini CLI${C.reset}`);
      const geminiConfig = path.join(home, '.gemini', 'settings.json');
      try {
        if (fs.existsSync(path.dirname(geminiConfig))) {
          const config = fs.existsSync(geminiConfig) ? JSON.parse(fs.readFileSync(geminiConfig, 'utf-8')) : {};
          config.mcpServers = config.mcpServers || {};
          config.mcpServers.aitimemachine = mcpConfig;
          fs.writeFileSync(geminiConfig, JSON.stringify(config, null, 2));
          console.log(`    ${C.green}+${C.reset} Added to ~/.gemini/settings.json`);
        } else { console.log(`    ${C.dim}-${C.reset} Not installed`); }
      } catch { console.log(`    ${C.dim}-${C.reset} Not installed`); }

      // Aider
      console.log(`${C.cyan}[8] Aider${C.reset}`);
      const aiderConfig = path.join(home, '.aider.conf.yml');
      try {
        let content = fs.existsSync(aiderConfig) ? fs.readFileSync(aiderConfig, 'utf-8') : '';
        if (!content.includes('aitimemachine')) {
          content += '\n# AITimeMachine integration - run aitm daemon in background\n# auto-commits: false\n';
          fs.writeFileSync(aiderConfig, content);
          console.log(`    ${C.yellow}o${C.reset} Note added to ~/.aider.conf.yml`);
          console.log(`       Run 'aitm daemon' alongside Aider for auto-capture`);
        } else { console.log(`    ${C.green}+${C.reset} Already noted`); }
      } catch { console.log(`    ${C.dim}-${C.reset} Manual setup: run 'aitm daemon' alongside Aider`); }

      console.log(`\n${C.green}[OK] Setup complete${C.reset}`);
      console.log(`\n${C.bright}Available MCP Tools:${C.reset}`);
      console.log(`  - before_action / after_action - Auto-checkpoint`);
      console.log(`  - checkpoint - Manual snapshot`);
      console.log(`  - list_sessions / get_session - Browse history`);
      console.log(`  - restore_session - Time travel`);
      console.log(`  - search_sessions - Find past work`);
      console.log(`  - get_git_state - Current git status`);
      console.log(`  - compare_sessions - Diff between points`);
      console.log(`\n${C.dim}Restart your AI tools to activate${C.reset}\n`);
    });
}
