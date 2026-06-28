/**
 * Config Commands
 *
 * init, setup, setup-all, status, install-hooks, sync, sync-config, sync-status,
 * s3-config, s3-backup, s3-restore, s3-status, export, import, sync-ai,
 * config set|get|list
 */

import { Command } from 'commander';
import { TimeMachineEngine } from '../core/engine.js';
import { C, formatSize, formatDate, timeAgo } from './cli-helpers.js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export function registerConfigCommands(program: Command): void {

  // Initialize
  program
    .command('init')
    .description('Initialize AITimeMachine in current project')
    .action(async () => {
      try {
        const engine = new TimeMachineEngine(process.cwd());
        const tp = engine.capture('Project initialized', { type: 'manual' });
        console.log(`${C.green}[OK]${C.reset} AITimeMachine initialized`);
        console.log(`   First checkpoint: ${tp.id}`);
        console.log(`   Files tracked: ${tp.stats.totalFiles}`);
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'EACCES') {
          console.error(`${C.red}[!]${C.reset} Permission denied. Check directory permissions.`);
        } else { throw err; }
      }
    });

  // Setup project
  program
    .command('setup-project')
    .description('Setup project for automatic AI capture (adds MCP config + CLAUDE.md)')
    .option('--global', 'Also add MCP to global Claude config')
    .action(async (options) => {
      const projectPath = process.cwd();
      const projectName = path.basename(projectPath);
      const claudeMd = `# AITimeMachine Integration\n\nThis project uses AITimeMachine for automatic backup and restore.\n\n## IMPORTANT: Before making ANY file changes\n\nCall the \`before_action\` MCP tool:\n\`\`\`\nbefore_action({ action: "description of changes" })\n\`\`\`\n\n## After completing changes\n\nCall the \`after_action\` MCP tool:\n\`\`\`\nafter_action({ action: "what was done", success: true })\n\`\`\`\n\nThis ensures all changes are tracked and can be rolled back.\n`;
      const claudeMdPath = path.join(projectPath, 'CLAUDE.md');
      const hadClaudeMd = fs.existsSync(claudeMdPath);
      if (hadClaudeMd) {
        const existing = fs.readFileSync(claudeMdPath, 'utf-8');
        if (!existing.includes('AITimeMachine')) {
          fs.appendFileSync(claudeMdPath, '\n\n' + claudeMd);
          console.log(`[+] Added AITimeMachine instructions to existing CLAUDE.md`);
        } else { console.log(`[=] CLAUDE.md already has AITimeMachine instructions`); }
      } else {
        fs.writeFileSync(claudeMdPath, claudeMd);
        console.log(`[+] Created CLAUDE.md with AITimeMachine instructions`);
      }
      const claudeConfigPath = path.join(os.homedir(), '.claude.json');
      let addedToGlobal = false;
      if (options?.global) {
        if (fs.existsSync(claudeConfigPath)) {
          try {
            const config = JSON.parse(fs.readFileSync(claudeConfigPath, 'utf-8'));
            if (!config.mcpServers) config.mcpServers = {};
            if (!config.mcpServers.aitimemachine) {
              config.mcpServers.aitimemachine = { type: 'stdio', command: 'aitm', args: ['mcp'] };
              fs.writeFileSync(claudeConfigPath, JSON.stringify(config, null, 2));
              addedToGlobal = true;
              console.log(`[+] Added MCP server to ~/.claude.json`);
            } else { console.log(`[=] MCP server already in ~/.claude.json`); }
          } catch (e) { console.log(`[!] Could not update ~/.claude.json: ${e}`); }
        } else {
          const config = { mcpServers: { aitimemachine: { type: 'stdio', command: 'aitm', args: ['mcp'] } } };
          fs.writeFileSync(claudeConfigPath, JSON.stringify(config, null, 2));
          addedToGlobal = true;
          console.log(`[+] Created ~/.claude.json with MCP server`);
        }
      }
      const engine = new TimeMachineEngine(projectPath);
      const tp = engine.capture('Project setup for AITimeMachine', { type: 'manual' });
      console.log(`\n${C.green}[OK] Project "${projectName}" is now set up!${C.reset}\n`);
      console.log(`  - Initial snapshot: ${tp.stats.totalFiles} files`);
      console.log(`  - CLAUDE.md: instructs AI to use checkpoints`);
      if (options?.global) { console.log(`  - MCP server: ${addedToGlobal ? "registered globally" : "global config unchanged"}`); }
      console.log(`\n${C.dim}Claude Code will now auto-capture before/after changes.${C.reset}\n`);
    });

  // Setup ALL projects
  program
    .command('setup-all')
    .description('Setup ALL projects found in Claude Code history')
    .option('--dry-run', 'Show what would be done without making changes')
    .action(async (options) => {
      const claudeProjectsDir = path.join(os.homedir(), '.claude', 'projects');
      if (!fs.existsSync(claudeProjectsDir)) { console.log(`[!] No Claude Code history found at ${claudeProjectsDir}`); return; }
      const entries = fs.readdirSync(claudeProjectsDir);
      const projects: string[] = [];
      for (const encoded of entries) {
        const parts = encoded.slice(1).split('-');
        let reconstructed = '';
        for (let i = 0; i < parts.length; i++) {
          const withSlash = reconstructed + '/' + parts[i];
          const withHyphen = reconstructed + '-' + parts[i];
          if (fs.existsSync(withSlash)) { reconstructed = withSlash; }
          else if (reconstructed && fs.existsSync(withHyphen)) { reconstructed = withHyphen; }
          else if (!reconstructed) { reconstructed = '/' + parts[i]; }
          else { reconstructed = withSlash; }
        }
        if (fs.existsSync(reconstructed) && fs.statSync(reconstructed).isDirectory()) { projects.push(reconstructed); }
      }
      if (projects.length === 0) { console.log('[!] No valid project paths found'); return; }
      console.log(`\n${C.bright}Found ${projects.length} projects:${C.reset}\n`);
      for (const proj of projects) {
        const name = path.basename(proj);
        const claudeMdPath = path.join(proj, 'CLAUDE.md');
        const hasClaudeMd = fs.existsSync(claudeMdPath);
        const hasAitm = hasClaudeMd && fs.readFileSync(claudeMdPath, 'utf-8').includes('AITimeMachine');
        if (options.dryRun) {
          console.log(`  ${hasAitm ? C.dim + '[skip]' : C.green + '[setup]'} ${name}${C.reset}`);
          console.log(`    ${C.dim}${proj}${C.reset}`);
        } else if (!hasAitm) {
          const claudeMd = `# AITimeMachine Integration\n\nThis project uses AITimeMachine for automatic backup and restore.\n\n## Before making ANY file changes\nCall: \`before_action({ action: "description" })\`\n\n## After completing changes  \nCall: \`after_action({ action: "what was done", success: true })\`\n`;
          if (hasClaudeMd) { fs.appendFileSync(claudeMdPath, '\n\n' + claudeMd); }
          else { fs.writeFileSync(claudeMdPath, claudeMd); }
          console.log(`  ${C.green}[+]${C.reset} ${name}`);
        } else { console.log(`  ${C.dim}[=]${C.reset} ${name} (already setup)`); }
      }
      if (!options.dryRun) {
        const claudeConfigPath = path.join(os.homedir(), '.claude.json');
        if (fs.existsSync(claudeConfigPath)) {
          const config = JSON.parse(fs.readFileSync(claudeConfigPath, 'utf-8'));
          if (!config.mcpServers?.aitimemachine) {
            if (!config.mcpServers) config.mcpServers = {};
            config.mcpServers.aitimemachine = { type: 'stdio', command: 'aitm', args: ['mcp'] };
            fs.writeFileSync(claudeConfigPath, JSON.stringify(config, null, 2));
            console.log(`\n[+] Added MCP to ~/.claude.json`);
          }
        }
      }
      console.log(`\n${C.green}[OK] All projects configured!${C.reset}`);
      console.log(`${C.dim}Claude Code will now auto-capture in all projects.${C.reset}\n`);
    });

  // Status
  program
    .command('status')
    .description('Show current project status: git branch, last checkpoint, sync status')
    .option('-j, --json', 'Output as JSON')
    .action(async (opts) => {
      const { ClaudeCodeReader } = await import('../integrations/index.js');
      const { CursorCollector, AiderCollector, GitCollector, EnvironmentCollector, ContainerCollector } = await import('../collectors/index.js');
      const { SessionServer } = await import('../server/index.js');
      const { SecureSyncClient } = await import('../sync/secure-client.js');
      const projectPath = process.cwd();
      const projectName = path.basename(projectPath);

      const git = new GitCollector(projectPath);
      const gitState = git.capture();

      const engine = new TimeMachineEngine(projectPath);
      const checkpoints = engine.listTimePoints();
      const lastCheckpoint = checkpoints.length > 0 ? checkpoints[checkpoints.length - 1] : null;

      let syncStatus: { synced: number; pending: number } = { synced: 0, pending: 0 };
      try {
        const client = new SecureSyncClient();
        syncStatus = await client.getSyncStatus(projectName);
      } catch { /* sync not configured — treat as unsynced */ }

      if (opts.json) {
        console.log(JSON.stringify({
          project: projectName,
          path: projectPath,
          git: {
            isRepo: gitState.isRepo,
            branch: gitState.branch ?? null,
            commit: gitState.commit ?? null,
            uncommittedChanges: gitState.uncommittedChanges ?? false,
          },
          lastCheckpoint: lastCheckpoint
            ? {
                id: lastCheckpoint.id,
                description: lastCheckpoint.description,
                timestamp: lastCheckpoint.timestamp.toISOString(),
                files: lastCheckpoint.stats.totalFiles,
                changesCount: lastCheckpoint.changesCount,
              }
            : null,
          checkpointCount: checkpoints.length,
          sync: syncStatus,
        }, null, 2));
        return;
      }

      const claude = new ClaudeCodeReader();
      const cursor = new CursorCollector();
      const aider = new AiderCollector();
      const env = new EnvironmentCollector(projectPath);
      const container = new ContainerCollector(projectPath);
      const server = new SessionServer();
      const hasClaude = claude.getProjectClaudeDir(projectPath) !== null;
      const hasCursor = cursor.getSession(projectPath) !== null;
      const hasAider = aider.hasHistory(projectPath);
      const envState = env.capture();
      const containerState = container.capture();

      console.log(`\n${C.bright}AITimeMachine Status: ${projectName}${C.reset}\n`);

      // Git section
      console.log(`  ${C.bright}Git:${C.reset}`);
      if (gitState.isRepo) {
        console.log(`    Branch:  ${C.cyan}${gitState.branch || 'unknown'}${C.reset}`);
        if (gitState.commit) console.log(`    Commit:  ${C.dim}${String(gitState.commit).slice(0, 8)}${C.reset}`);
        const dirtyFlags: string[] = [];
        if (gitState.uncommittedChanges) dirtyFlags.push('uncommitted changes');
        if (gitState.stagedChanges) dirtyFlags.push('staged changes');
        console.log(`    State:   ${dirtyFlags.length ? C.yellow + dirtyFlags.join(', ') : C.green + 'clean'}${C.reset}`);
      } else {
        console.log(`    ${C.dim}Not a git repository${C.reset}`);
      }

      // Checkpoint section
      console.log(`\n  ${C.bright}Checkpoints:${C.reset} ${checkpoints.length}`);
      if (lastCheckpoint) {
        console.log(`    Last:    ${C.cyan}${lastCheckpoint.id.slice(0, 16)}${C.reset}`);
        console.log(`    Desc:    ${lastCheckpoint.description}`);
        console.log(`    When:    ${formatDate(lastCheckpoint.timestamp)} ${C.dim}(${timeAgo(lastCheckpoint.timestamp)})${C.reset}`);
        console.log(`    Files:   ${lastCheckpoint.stats.totalFiles} (${formatSize(lastCheckpoint.stats.totalSize)})`);
      } else {
        console.log(`    ${C.dim}No checkpoints yet — run: aitm init${C.reset}`);
      }

      // Sync section
      console.log(`\n  ${C.bright}Cloud Sync:${C.reset}`);
      if (syncStatus.synced + syncStatus.pending === 0 && checkpoints.length > 0) {
        console.log(`    ${C.yellow}Not configured${C.reset} — run: aitm sync-config <endpoint> <api-key>`);
      } else {
        console.log(`    Synced:  ${syncStatus.synced}`);
        console.log(`    Pending: ${syncStatus.pending > 0 ? C.yellow + syncStatus.pending : C.green + syncStatus.pending}${C.reset}`);
      }

      // Data sources
      console.log(`\n  ${C.bright}Data Sources:${C.reset}`);
      console.log(`    ${hasClaude ? C.green + '+' : C.dim + '-'} Claude Code${C.reset}`);
      console.log(`    ${hasCursor ? C.green + '+' : C.dim + '-'} Cursor${C.reset}`);
      console.log(`    ${hasAider ? C.green + '+' : C.dim + '-'} Aider${C.reset}`);
      console.log(`    ${gitState.isRepo ? C.green + '+' : C.dim + '-'} Git${C.reset}${gitState.isRepo ? ` (${gitState.branch})` : ''}`);
      console.log(`    ${containerState.hasDocker ? C.green + '+' : C.dim + '-'} Docker${C.reset}${containerState.containers.length ? ` (${containerState.containers.length} running)` : ''}`);

      console.log(`\n  ${C.bright}Environment:${C.reset}`);
      const rt = envState.runtimes;
      if (rt.node) console.log(`    Node: ${rt.node}`);
      if (rt.python) console.log(`    Python: ${rt.python}`);
      if (rt.rust) console.log(`    Rust: ${rt.rust}`);
      if (envState.packageManager) console.log(`    Package Manager: ${envState.packageManager.name}`);
      if (envState.dependencies) console.log(`    Dependencies: ${envState.dependencies.count}`);
      if (containerState.compose) console.log(`    Compose: ${containerState.compose.services.length} services`);

      const sessions = server.listSessions(projectPath);
      console.log(`\n  ${C.bright}Sessions:${C.reset} ${sessions.length}`);
      if (sessions.length > 0) {
        const latest = sessions[0];
        console.log(`    Latest: ${formatDate(latest.createdAt)} (${timeAgo(latest.createdAt)})`);
      }
      console.log(`\n  ${C.dim}Run 'aitm sync-ai' to import AI conversations${C.reset}`);
      console.log(`  ${C.dim}Run 'aitm checkpoint' to create a snapshot${C.reset}\n`);
    });

  // Install git hooks
  program
    .command('install-hooks')
    .description('Install git hooks for auto-capture')
    .action(async () => {
      const hooksDir = path.join(process.cwd(), '.git', 'hooks');
      if (!fs.existsSync(hooksDir)) { console.log('[!] Not a git repository'); return; }
      fs.writeFileSync(path.join(hooksDir, 'pre-commit'), `#!/bin/bash\nif command -v aitm &> /dev/null; then\n  aitm checkpoint "Pre-commit" 2>/dev/null &\nfi\n`);
      fs.chmodSync(path.join(hooksDir, 'pre-commit'), '755');
      fs.writeFileSync(path.join(hooksDir, 'post-commit'), `#!/bin/bash\nif command -v aitm &> /dev/null; then\n  aitm log system "Git commit: $(git log -1 --format=%s)" 2>/dev/null &\nfi\n`);
      fs.chmodSync(path.join(hooksDir, 'post-commit'), '755');
      fs.writeFileSync(path.join(hooksDir, 'post-checkout'), `#!/bin/bash\nif command -v aitm &> /dev/null; then\n  aitm checkpoint "Checkout: $(git branch --show-current)" 2>/dev/null &\nfi\n`);
      fs.chmodSync(path.join(hooksDir, 'post-checkout'), '755');
      console.log('[OK] Git hooks installed');
      console.log('  - pre-commit: Captures before commits');
      console.log('  - post-commit: Logs commit messages');
      console.log('  - post-checkout: Captures after branch switches');
    });

  // Cloud sync
  program
    .command('sync')
    .description('Sync checkpoints to cloud (via API server)')
    .option('--all', 'Sync all checkpoints')
    .action(async (options) => {
      const { SecureSyncClient } = await import('../sync/secure-client.js');
      const client = new SecureSyncClient();
      const engine = new TimeMachineEngine(process.cwd());
      const projectId = path.basename(process.cwd());
      const summaries = engine.listTimePoints();
      if (summaries.length === 0) { console.log('No checkpoints to sync'); return; }
      const toSync = options.all ? summaries : [summaries[0]];
      console.log(`Syncing ${toSync.length} checkpoint(s)...`);
      let synced = 0;
      for (const summary of toSync) {
        const cp = engine.getTimePoint(summary.id);
        if (!cp) continue;
        const result = await client.syncCheckpoint(projectId, cp);
        if (result.ok) synced++;
      }
      console.log(`${C.green}\u2713${C.reset} Synced ${synced}/${toSync.length} checkpoints`);
    });

  program
    .command('sync-config <endpoint> <apiKey>')
    .description('Configure cloud sync endpoint')
    .option('-p, --project <id>', 'Project ID for filtering')
    .action(async (endpoint, apiKey, options) => {
      const { CloudSync } = await import('../cloud-sync-v2.js');
      const sync = new CloudSync();
      sync.configure(endpoint, apiKey, options.project);
      console.log(`[OK] Sync configured: ${endpoint}`);
    });

  program
    .command('sync-status')
    .description('Show cloud sync status')
    .action(async () => {
      const { SecureSyncClient } = await import('../sync/secure-client.js');
      const client = new SecureSyncClient();
      const projectId = path.basename(process.cwd());
      const status = await client.getSyncStatus(projectId);
      console.log(`\n${C.bright}Cloud Sync Status${C.reset}\n`);
      console.log(`  Project: ${projectId}`);
      console.log(`  Synced checkpoints: ${status.synced}`);
      console.log(`  Pending: ${status.pending}`);
      console.log();
    });

  // S3 Backup
  program
    .command('s3-config <bucket>')
    .description('Configure S3 backup')
    .option('--prefix <prefix>', 'S3 prefix', 'aitimemachine')
    .option('--region <region>', 'AWS region')
    .option('--profile <profile>', 'AWS profile')
    .action(async (bucket, options) => {
      const { S3Backup } = await import('../s3-backup.js');
      const s3 = new S3Backup();
      s3.configure(bucket, options.prefix, options.region, options.profile);
      console.log(`[OK] S3 configured: s3://${bucket}/${options.prefix}`);
    });

  program
    .command('s3-backup')
    .description('Backup all data to S3')
    .action(async () => {
      const { S3Backup } = await import('../s3-backup.js');
      const s3 = new S3Backup();
      if (!s3.getConfig()) { console.log(`${C.red}[!]${C.reset} Not configured. Run: aitm s3-config <bucket>`); return; }
      console.log('[*] Backing up to S3...');
      try {
        const result = await s3.backup();
        console.log(`${C.green}[OK]${C.reset} Backed up ${result.sessions} sessions, ${result.blobs} blob dirs (${result.size})`);
      } catch (err) {
        const msg = (err as Error).message;
        if (msg.includes('credentials') || msg.includes('AccessDenied')) {
          console.error(`${C.red}[!]${C.reset} AWS credentials error. Check your AWS config.`);
          console.log(`${C.dim}Tip: Run 'aws configure' or set AWS_PROFILE${C.reset}`);
        } else if (msg.includes('NoSuchBucket')) {
          console.error(`${C.red}[!]${C.reset} S3 bucket not found. Check bucket name.`);
        } else { throw err; }
      }
    });

  program
    .command('s3-restore')
    .description('Restore all data from S3')
    .action(async () => {
      const { S3Backup } = await import('../s3-backup.js');
      const s3 = new S3Backup();
      if (!s3.getConfig()) { console.log(`${C.red}[!]${C.reset} Not configured. Run: aitm s3-config <bucket>`); return; }
      console.log('[*] Restoring from S3...');
      const result = await s3.restore();
      console.log(`${C.green}[OK]${C.reset} Restored ${result.sessions} sessions, ${result.blobs} blob dirs`);
    });

  program
    .command('s3-status')
    .description('Show S3 backup status')
    .action(async () => {
      const { S3Backup } = await import('../s3-backup.js');
      const s3 = new S3Backup();
      const config = s3.getConfig();
      if (!config) { console.log(`${C.dim}[Not configured]${C.reset} Run: aitm s3-config <bucket>`); return; }
      console.log(`\n${C.bright}S3 Backup Status${C.reset}\n`);
      console.log(`  Bucket: s3://${config.bucket}/${config.prefix}`);
      if (config.region) console.log(`  Region: ${config.region}`);
      if (config.profile) console.log(`  Profile: ${config.profile}`);
      try {
        const info = await s3.list();
        console.log(`  Sessions: ${info.sessions}`);
        if (info.lastModified) console.log(`  Last backup: ${info.lastModified}`);
      } catch { console.log(`  ${C.red}Error checking S3${C.reset}`); }
      console.log();
    });

  // Export/Import — portable single-file dump of the whole local store.
  //
  // Named `export-all` (not `export`) so it does not collide with the
  // `export json|markdown|csv|report|git-history` command group registered by
  // export-commands. Keeping distinct verbs avoids the confusing dual meaning
  // of a single `export` that is both a leaf command and a command group.
  // `export` (no alias) is kept available for the format group.
  program
    .command('export-all <file>')
    .alias('dump')
    .description('Export the entire local store to a portable file')
    .action(async (file) => {
      const { CloudSync } = await import('../cloud-sync.js');
      const sync = new CloudSync(process.cwd());
      sync.export(file);
      console.log(`[OK] Exported to ${file}`);
    });

  program
    .command('import-all <file>')
    .alias('import')
    .description('Import a portable store file produced by export-all')
    .action(async (file) => {
      const { CloudSync } = await import('../cloud-sync.js');
      const sync = new CloudSync(process.cwd());
      const result = sync.import(file);
      console.log(`[OK] Imported: ${result.timepoints} timepoints, ${result.files} files, ${result.conversations} conversations`);
    });

  // AI Tool Sync
  program
    .command('sync-ai')
    .description('Sync conversations from AI tools (Claude Code, Cursor, Aider)')
    .option('--all', 'Sync ALL projects (not just current)')
    .option('--force', 'Re-import even if already synced')
    .action(async (options) => {
      if (options.all) {
        const { GlobalSync } = await import('../integrations/global-sync.js');
        const sync = new GlobalSync();
        console.log('\n[*] Scanning ALL Claude Code projects...\n');
        const stats = await sync.getStats();
        if (stats.projects.length === 0) { console.log(`${C.yellow}No Claude Code history found${C.reset}\n`); return; }
        console.log(`Found ${stats.projects.length} projects with ${stats.total.sessions} sessions:\n`);
        for (const p of stats.projects.slice(0, 10)) {
          console.log(`  ${C.cyan}${p.path}${C.reset}`);
          console.log(`    ${p.sessions} sessions, ${p.messages} messages`);
        }
        if (stats.projects.length > 10) { console.log(`  ... and ${stats.projects.length - 10} more projects`); }
        console.log('\n[*] Syncing all projects...\n');
        const result = await sync.syncAll({ force: options.force });
        console.log(`${C.green}[OK] Sync complete${C.reset}`);
        console.log(`  Projects: ${result.projects}`);
        console.log(`  Sessions imported: ${result.sessions}`);
        console.log(`  Messages: ${result.messages}`);
        if (result.skipped > 0) { console.log(`  Skipped (already synced): ${result.skipped}`); }
        console.log(`\nRun ${C.cyan}aitm sessions${C.reset} to see all sessions\n`);
        return;
      }
      const { FullSync } = await import('../integrations/index.js');
      const { ClaudeCodeReader } = await import('../integrations/index.js');
      const { CursorCollector, AiderCollector } = await import('../collectors/index.js');
      const reader = new ClaudeCodeReader();
      const cursor = new CursorCollector();
      const aider = new AiderCollector();
      const sync = new FullSync(process.cwd());
      console.log('\n[*] Detecting AI tools...\n');
      const hasClaudeHistory = reader.getProjectClaudeDir(process.cwd()) !== null;
      const hasCursorHistory = cursor.getSession(process.cwd()) !== null;
      const hasAiderHistory = aider.hasHistory(process.cwd());
      console.log(`  ${hasClaudeHistory ? C.green + '+' : C.dim + '-'} Claude Code${C.reset} ${hasClaudeHistory ? '(has history)' : '(no history)'}`);
      console.log(`  ${hasCursorHistory ? C.green + '+' : C.dim + '-'} Cursor${C.reset} ${hasCursorHistory ? '(has history)' : '(no history)'}`);
      console.log(`  ${hasAiderHistory ? C.green + '+' : C.dim + '-'} Aider${C.reset} ${hasAiderHistory ? '(has history)' : '(no history)'}`);
      if (!hasClaudeHistory && !hasCursorHistory && !hasAiderHistory) {
        console.log(`\n${C.yellow}No AI tool history found for this project${C.reset}`);
        console.log(`\nTip: Run ${C.cyan}aitm sync-ai --all${C.reset} to sync ALL projects\n`);
        return;
      }
      console.log('\n[*] Syncing...\n');
      let totalSessions = 0, totalMessages = 0;
      if (hasClaudeHistory) {
        const result = await sync.syncClaudeCode();
        console.log(`  ${C.green}+${C.reset} Claude Code: ${result.sessions} sessions, ${result.messages} messages`);
        totalSessions += result.sessions; totalMessages += result.messages;
      }
      if (hasCursorHistory) {
        const session = cursor.getSession(process.cwd());
        if (session) { console.log(`  ${C.green}+${C.reset} Cursor: ${session.prompts.length} prompts`); totalMessages += session.prompts.length; }
      }
      if (hasAiderHistory) {
        const session = aider.getSession(process.cwd());
        if (session) { console.log(`  ${C.green}+${C.reset} Aider: ${session.messages.length} messages`); totalMessages += session.messages.length; }
      }
      console.log(`\n[OK] Sync complete: ${totalMessages} total messages`);
      console.log(`\nRun ${C.cyan}aitm sessions${C.reset} to see all sessions\n`);
    });

  // ── config set / get / list ────────────────────────────────────────────────
  //
  // Manages ~/.aitm/config.json
  // Supported keys: api_url, project_id, auto_checkpoint, checkpoint_interval

  const AITM_CONFIG_PATH = path.join(os.homedir(), '.aitm', 'config.json');

  type AitmConfigKey = 'api_url' | 'project_id' | 'auto_checkpoint' | 'checkpoint_interval';

  interface AitmConfig {
    api_url?: string;
    project_id?: string;
    auto_checkpoint?: boolean;
    checkpoint_interval?: number;
  }

  const SUPPORTED_KEYS: readonly AitmConfigKey[] = [
    'api_url',
    'project_id',
    'auto_checkpoint',
    'checkpoint_interval',
  ] as const;

  function readAitmConfig(): AitmConfig {
    try {
      if (fs.existsSync(AITM_CONFIG_PATH)) {
        return JSON.parse(fs.readFileSync(AITM_CONFIG_PATH, 'utf-8')) as AitmConfig;
      }
    } catch { /* treat missing/corrupt file as empty config */ }
    return {};
  }

  function writeAitmConfig(config: AitmConfig): void {
    const dir = path.dirname(AITM_CONFIG_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(AITM_CONFIG_PATH, JSON.stringify(config, null, 2));
  }

  function coerceConfigValue(key: AitmConfigKey, raw: string): string | boolean | number {
    if (key === 'auto_checkpoint') {
      if (raw === 'true' || raw === '1' || raw === 'yes') return true;
      if (raw === 'false' || raw === '0' || raw === 'no') return false;
      throw new Error(`Invalid value for auto_checkpoint: "${raw}". Use true/false.`);
    }
    if (key === 'checkpoint_interval') {
      const n = parseInt(raw, 10);
      if (isNaN(n) || n < 1) {
        throw new Error(`Invalid value for checkpoint_interval: "${raw}". Must be a positive integer (seconds).`);
      }
      return n;
    }
    return raw;
  }

  const configCmd = program
    .command('config')
    .description('Manage AITM configuration (~/.aitm/config.json)');

  configCmd
    .command('set <key> <value>')
    .description(`Set a configuration value. Supported keys: ${SUPPORTED_KEYS.join(', ')}`)
    .action((key: string, value: string) => {
      if (!(SUPPORTED_KEYS as readonly string[]).includes(key)) {
        console.error(
          `${C.red}[!]${C.reset} Unknown config key: "${key}"\n` +
          `  Supported keys: ${SUPPORTED_KEYS.join(', ')}`,
        );
        process.exitCode = 1;
        return;
      }
      const k = key as AitmConfigKey;
      let coerced: string | boolean | number;
      try {
        coerced = coerceConfigValue(k, value);
      } catch (err) {
        console.error(`${C.red}[!]${C.reset} ${(err as Error).message}`);
        process.exitCode = 1;
        return;
      }
      const config = readAitmConfig();
      const updated: AitmConfig = { ...config, [k]: coerced };
      writeAitmConfig(updated);
      console.log(`${C.green}[OK]${C.reset} ${key} = ${JSON.stringify(coerced)}`);
      console.log(`${C.dim}Saved to ${AITM_CONFIG_PATH}${C.reset}`);
    });

  configCmd
    .command('get <key>')
    .description('Get a configuration value')
    .option('-j, --json', 'Output as JSON')
    .action((key: string, opts: { json?: boolean }) => {
      if (!(SUPPORTED_KEYS as readonly string[]).includes(key)) {
        console.error(
          `${C.red}[!]${C.reset} Unknown config key: "${key}"\n` +
          `  Supported keys: ${SUPPORTED_KEYS.join(', ')}`,
        );
        process.exitCode = 1;
        return;
      }
      const config = readAitmConfig();
      const val = config[key as AitmConfigKey];
      if (val === undefined) {
        if (opts.json) {
          console.log(JSON.stringify({ key, value: null, set: false }));
        } else {
          console.log(`${C.dim}${key}${C.reset} is not set`);
        }
        return;
      }
      if (opts.json) {
        console.log(JSON.stringify({ key, value: val, set: true }));
      } else {
        console.log(`${key} = ${C.cyan}${JSON.stringify(val)}${C.reset}`);
      }
    });

  configCmd
    .command('list')
    .alias('ls')
    .description('List all configuration values')
    .option('-j, --json', 'Output as JSON')
    .action((opts: { json?: boolean }) => {
      const config = readAitmConfig();
      if (opts.json) {
        console.log(JSON.stringify(config, null, 2));
        return;
      }
      console.log(`\n${C.bright}AITM Configuration${C.reset}`);
      console.log(`${C.dim}File: ${AITM_CONFIG_PATH}${C.reset}\n`);
      let hasAny = false;
      for (const key of SUPPORTED_KEYS) {
        const val = config[key];
        if (val !== undefined) {
          console.log(`  ${C.cyan}${key}${C.reset} = ${JSON.stringify(val)}`);
          hasAny = true;
        } else {
          console.log(`  ${C.dim}${key}${C.reset} ${C.dim}(not set)${C.reset}`);
        }
      }
      if (!hasAny) {
        console.log(`  ${C.dim}No values configured yet.${C.reset}`);
        console.log(`  ${C.dim}Run: aitm config set <key> <value>${C.reset}`);
      }
      console.log();
    });
}
