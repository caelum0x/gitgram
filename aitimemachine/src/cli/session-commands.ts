/**
 * Session Commands
 *
 * sessions, session, restore-session, projects, session-diff, ai-history,
 * cursor-history, cursor-search, log, conversation, export-session
 */

import { Command } from 'commander';
import { C, formatSize, formatDate, timeAgo } from './cli-helpers.js';
import * as fs from 'fs';
import * as path from 'path';

export function registerSessionCommands(program: Command): void {

  // List sessions
  program
    .command('sessions')
    .description('List all captured sessions')
    .option('-n, --limit <n>', 'Limit results', '20')
    .action(async (options) => {
      const { SessionServer } = await import('../server/index.js');
      const server = new SessionServer();
      const sessions = server.listSessions(process.cwd()).slice(0, parseInt(options.limit));
      if (sessions.length === 0) { console.log('\nNo sessions yet. Run: aitm daemon\n'); return; }
      console.log(`\n${C.bright}[+] Sessions${C.reset} (${sessions.length})\n`);
      for (const s of sessions) {
        const ago = timeAgo(s.createdAt);
        console.log(`  ${C.cyan}*${C.reset} ${formatDate(s.createdAt)} ${C.dim}(${ago})${C.reset}`);
        console.log(`    ${s.description}`);
        console.log(`    ${C.dim}ID: ${s.id.slice(0, 30)}${C.reset}`);
        console.log();
      }
    });

  // Show session details
  program
    .command('session <id>')
    .description('Show session details')
    .action(async (id) => {
      const { SessionServer } = await import('../server/index.js');
      const server = new SessionServer();
      const sessions = server.listSessions();
      const match = sessions.find(s => s.id.startsWith(id) || s.id.includes(id));
      if (!match) { console.log(`Session not found: ${id}`); return; }
      const session = server.loadSession(match.id);
      if (!session) { console.log('Session data not found'); return; }
      console.log(`\n${C.bright}Session: ${session.id}${C.reset}\n`);
      console.log(`  Created: ${formatDate(session.createdAt)} (${timeAgo(session.createdAt)})`);
      console.log(`  Project: ${session.projectName}`);
      console.log(`  Trigger: ${session.trigger.type} - ${session.trigger.description}`);
      console.log(`\n  ${C.bright}Stats:${C.reset}`);
      console.log(`    Files: ${session.stats.totalFiles} (${formatSize(session.stats.totalSize)})`);
      console.log(`    Changes: +${session.stats.addedFiles} ~${session.stats.modifiedFiles} -${session.stats.deletedFiles}`);
      console.log(`    Messages: ${session.stats.messageCount}`);
      if (session.git) {
        console.log(`\n  ${C.bright}Git:${C.reset}`);
        console.log(`    Branch: ${session.git.branch || 'unknown'}`);
        console.log(`    Commit: ${session.git.commit?.slice(0, 8) || 'unknown'}`);
        if (session.git.uncommittedChanges) console.log(`    ${C.yellow}Uncommitted changes${C.reset}`);
        if (session.git.stagedChanges) console.log(`    ${C.green}Staged changes${C.reset}`);
      }
      if (session.environment) {
        console.log(`\n  ${C.bright}Environment:${C.reset}`);
        const rt = session.environment.runtimes;
        if (rt.node) console.log(`    Node: ${rt.node}`);
        if (rt.python) console.log(`    Python: ${rt.python}`);
        if (rt.rust) console.log(`    Rust: ${rt.rust}`);
        if (rt.go) console.log(`    Go: ${rt.go}`);
        if (session.environment.packageManager) console.log(`    Package Manager: ${session.environment.packageManager.name} ${session.environment.packageManager.version}`);
        if (session.environment.dependencies) console.log(`    Dependencies: ${session.environment.dependencies.count} (${session.environment.dependencies.file})`);
      }
      if (session.diffs.length > 0) {
        console.log(`\n  ${C.bright}Changes:${C.reset}`);
        for (const d of session.diffs.slice(0, 10)) {
          const icon = d.type === 'added' ? C.green + '+' : d.type === 'deleted' ? C.red + '-' : C.yellow + '~';
          console.log(`    ${icon}${C.reset} ${d.path}`);
        }
        if (session.diffs.length > 10) console.log(`    ${C.dim}... and ${session.diffs.length - 10} more${C.reset}`);
      }
      if (session.conversation.length > 0) {
        console.log(`\n  ${C.bright}Conversation:${C.reset}`);
        for (const m of session.conversation.slice(-5)) {
          const icon = m.role === 'user' ? '[U]' : '[A]';
          const contentStr = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
          console.log(`    ${icon} ${contentStr.slice(0, 60)}${contentStr.length > 60 ? '...' : ''}`);
        }
      }
      console.log();
    });

  // Restore session
  program
    .command('restore-session <id>')
    .description('Restore project to a session state')
    .option('-f, --force', 'Skip confirmation')
    .action(async (id, options) => {
      const { SessionServer } = await import('../server/index.js');
      const { confirm } = await import('./cli-helpers.js');
      const server = new SessionServer();
      const sessions = server.listSessions();
      const match = sessions.find(s => s.id.startsWith(id) || s.id.includes(id));
      if (!match) { console.log(`Session not found: ${id}`); return; }
      const session = server.loadSession(match.id);
      if (!session) { console.log('Session data not found'); return; }
      console.log(`\n${C.bright}< Restore to session${C.reset}`);
      console.log(`   ${session.trigger.description}`);
      console.log(`   ${formatDate(session.createdAt)} (${timeAgo(session.createdAt)})`);
      console.log(`   ${session.stats.totalFiles} files\n`);
      if (!options.force && !(await confirm('Restore to this session?'))) { console.log('Cancelled'); return; }
      const projectPath = process.cwd();
      const currentFiles = new Set<string>();
      const walkDir = (dir: string) => {
        try {
          for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            if (['.aitimemachine', 'node_modules', '.git'].includes(entry.name)) continue;
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) walkDir(full);
            else currentFiles.add(path.relative(projectPath, full));
          }
        } catch {}
      };
      walkDir(projectPath);
      const sessionFiles = new Set(session.files.map(f => f.path));
      let filesRestored = 0, filesDeleted = 0;
      for (const filePath of currentFiles) { if (!sessionFiles.has(filePath)) { try { fs.unlinkSync(path.join(projectPath, filePath)); filesDeleted++; } catch {} } }
      for (const file of session.files) {
        const content = server.getBlob(file.hash);
        if (!content) continue;
        const fullPath = path.join(projectPath, file.path);
        const dir = path.dirname(fullPath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(fullPath, content);
        filesRestored++;
      }
      console.log(`\n${C.green}[OK] Restored!${C.reset}`);
      console.log(`   ${filesRestored} files restored`);
      console.log(`   ${filesDeleted} files deleted\n`);
    });

  // List projects
  program
    .command('projects')
    .description('List all tracked projects')
    .action(async () => {
      const { SessionServer } = await import('../server/index.js');
      const server = new SessionServer();
      const projects = server.getProjects();
      if (projects.length === 0) { console.log('\nNo projects tracked yet. Run: aitm daemon\n'); return; }
      console.log(`\n${C.bright}[D] Projects${C.reset} (${projects.length})\n`);
      for (const p of projects) {
        console.log(`  ${C.cyan}*${C.reset} ${C.bright}${p.name}${C.reset}`);
        console.log(`    ${p.path}`);
        console.log(`    ${p.sessionCount} sessions, ${formatSize(p.totalSize)}`);
        console.log(`    Last: ${formatDate(p.lastSessionAt)} (${timeAgo(p.lastSessionAt)})`);
        console.log();
      }
    });

  // Session diff
  program
    .command('session-diff <from> [to]')
    .alias('sd')
    .description('Show diff between sessions (or session and current)')
    .option('-f, --full', 'Show file content diffs')
    .option('-c, --context <lines>', 'Context lines for diff', '3')
    .action(async (from, to, options) => {
      const { SessionServer } = await import('../server/session-server.js');
      const server = new SessionServer();
      const sessions = server.listSessions();
      const fromSession = sessions.find(s => s.id.startsWith(from));
      if (!fromSession) { console.log(`${C.red}[!]${C.reset} Session not found: ${from}`); return; }
      const toSession = to ? sessions.find(s => s.id.startsWith(to)) : null;
      const fromData = server.loadSession(fromSession.id);
      const toData = toSession ? server.loadSession(toSession.id) : null;
      if (!fromData?.files) { console.log(`${C.red}[!]${C.reset} Session has no file data`); return; }
      const projectPath = fromData.projectPath || process.cwd();
      const fromFiles = new Map<string, { hash: string; getContent: () => string | null }>();
      for (const f of fromData.files) { fromFiles.set(f.path, { hash: f.hash, getContent: () => server.getBlob(f.hash)?.toString('utf-8') ?? null }); }
      const toFiles = new Map<string, { hash: string; getContent: () => string | null }>();
      if (toData?.files) {
        for (const f of toData.files) { toFiles.set(f.path, { hash: f.hash, getContent: () => server.getBlob(f.hash)?.toString('utf-8') ?? null }); }
      } else {
        const scanDir = (dir: string, base = '') => {
          try {
            for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
              if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
              const rel = base ? `${base}/${entry.name}` : entry.name;
              const full = path.join(dir, entry.name);
              if (entry.isDirectory()) scanDir(full, rel);
              else { try { const content = fs.readFileSync(full, 'utf-8'); const hash = require('crypto').createHash('sha256').update(content).digest('hex').slice(0, 16); toFiles.set(rel, { hash, getContent: () => content }); } catch {} }
            }
          } catch {}
        };
        scanDir(projectPath);
      }
      const added: string[] = [], modified: string[] = [], deleted: string[] = [];
      for (const [file, data] of toFiles) { const fromFile = fromFiles.get(file); if (!fromFile) added.push(file); else if (fromFile.hash !== data.hash) modified.push(file); }
      for (const file of fromFiles.keys()) { if (!toFiles.has(file)) deleted.push(file); }
      const toLabel = toSession ? toSession.id.slice(0, 20) : 'current';
      console.log(`\n${C.bright}Session Diff: ${fromSession.id.slice(0, 20)} \u2192 ${toLabel}${C.reset}\n`);
      if (added.length === 0 && modified.length === 0 && deleted.length === 0) { console.log(`${C.dim}No changes${C.reset}`); return; }
      if (options.full && modified.length > 0) {
        const ctx = parseInt(options.context) || 3;
        for (const file of modified.slice(0, 10)) {
          const oldContent = fromFiles.get(file)?.getContent();
          const newContent = toFiles.get(file)?.getContent();
          if (!oldContent || !newContent) continue;
          console.log(`${C.cyan}\u2501\u2501\u2501 ${file} \u2501\u2501\u2501${C.reset}`);
          const oldLines = oldContent.split('\n'); const newLines = newContent.split('\n');
          const maxLen = Math.max(oldLines.length, newLines.length);
          let inChange = false, changeStart = 0;
          const changes: { start: number; old: string[]; new: string[] }[] = [];
          for (let i = 0; i <= maxLen; i++) {
            const same = oldLines[i] === newLines[i];
            if (!same && !inChange) { inChange = true; changeStart = i; }
            if ((same || i === maxLen) && inChange) { changes.push({ start: changeStart, old: oldLines.slice(changeStart, i), new: newLines.slice(changeStart, i) }); inChange = false; }
          }
          for (const ch of changes.slice(0, 5)) {
            const ctxStart = Math.max(0, ch.start - ctx);
            if (ctxStart < ch.start) { console.log(`${C.dim}@@ line ${ch.start + 1} @@${C.reset}`); for (let i = ctxStart; i < ch.start; i++) { console.log(`${C.dim}  ${oldLines[i] || ''}${C.reset}`); } }
            for (const line of ch.old) console.log(`${C.red}- ${line}${C.reset}`);
            for (const line of ch.new) console.log(`${C.green}+ ${line}${C.reset}`);
          }
          if (changes.length > 5) console.log(`${C.dim}  ... ${changes.length - 5} more changes${C.reset}`);
          console.log();
        }
        if (modified.length > 10) console.log(`${C.dim}... ${modified.length - 10} more modified files${C.reset}\n`);
      } else {
        if (added.length > 0) { console.log(`${C.green}Added (${added.length}):${C.reset}`); added.slice(0, 20).forEach(f => console.log(`  + ${f}`)); if (added.length > 20) console.log(`  ${C.dim}... and ${added.length - 20} more${C.reset}`); console.log(); }
        if (modified.length > 0) { console.log(`${C.yellow}Modified (${modified.length}):${C.reset}`); modified.slice(0, 20).forEach(f => console.log(`  ~ ${f}`)); if (modified.length > 20) console.log(`  ${C.dim}... and ${modified.length - 20} more${C.reset}`); console.log(); }
        if (deleted.length > 0) { console.log(`${C.red}Deleted (${deleted.length}):${C.reset}`); deleted.slice(0, 20).forEach(f => console.log(`  - ${f}`)); if (deleted.length > 20) console.log(`  ${C.dim}... and ${deleted.length - 20} more${C.reset}`); }
      }
      console.log(`\n${C.dim}Total: +${added.length} ~${modified.length} -${deleted.length}${C.reset}`);
    });

  // AI history
  program
    .command('ai-history')
    .description('Show combined conversation history from all AI tools')
    .option('-n, --limit <n>', 'Limit results', '20')
    .action(async (options) => {
      const { AIToolSync } = await import('../integrations/index.js');
      const sync = new AIToolSync(process.cwd());
      const history = await sync.getCombinedHistory();
      const limited = history.slice(-parseInt(options.limit));
      console.log(`\n${C.bright}[>] AI Conversation History${C.reset} (${history.length} total)\n`);
      for (const msg of limited) {
        const icon = msg.role === 'user' ? '[U]' : '[A]';
        const toolBadge = msg.tool !== 'aitimemachine' ? ` ${C.dim}[${msg.tool}]${C.reset}` : '';
        const time = formatDate(msg.timestamp);
        const contentStr = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
        const preview = contentStr.slice(0, 80).replace(/\n/g, ' ');
        console.log(`  ${C.dim}${time}${C.reset}${toolBadge}`);
        console.log(`  ${icon} ${preview}${contentStr.length > 80 ? '...' : ''}`);
        console.log();
      }
    });

  // Cursor history
  program
    .command('cursor-history')
    .description('Show Cursor conversation history')
    .option('-p, --project <path>', 'Filter by project path')
    .action(async (options) => {
      const { CursorCollector } = await import('../collectors/index.js');
      const cursor = new CursorCollector();
      if (!cursor.isInstalled()) { console.log('Cursor not installed'); return; }
      if (options.project) {
        const session = cursor.getSession(options.project);
        if (!session) { console.log('No Cursor history for this project'); return; }
        console.log(`\n${C.bright}Cursor History: ${session.projectName}${C.reset} (${session.prompts.length} prompts)\n`);
        for (const p of session.prompts.slice(-20)) { console.log(`  [U] ${p.text.slice(0, 80)}${p.text.length > 80 ? '...' : ''}`); }
      } else {
        const sessions = cursor.getAllSessions();
        console.log(`\n${C.bright}Cursor Sessions${C.reset} (${sessions.length})\n`);
        for (const s of sessions) { console.log(`  ${C.cyan}*${C.reset} ${s.projectName}: ${s.prompts.length} prompts`); }
      }
      console.log();
    });

  // Cursor search
  program
    .command('cursor-search <query>')
    .description('Search Cursor prompts across all projects')
    .action(async (query) => {
      const { CursorCollector } = await import('../collectors/index.js');
      const cursor = new CursorCollector();
      const results = cursor.searchPrompts(query);
      console.log(`\n[?] Found ${results.length} Cursor matches for "${query}":\n`);
      for (const r of results.slice(0, 15)) {
        console.log(`  ${C.dim}[${r.workspace}]${C.reset}`);
        console.log(`  [U] ${r.context.slice(0, 100)}${r.context.length > 100 ? '...' : ''}`);
        console.log();
      }
    });

  // Log conversation
  program
    .command('log <role> <message>')
    .description('Log a conversation message')
    .action(async (role, message) => {
      const { ConversationLogger } = await import('../core/conversation-logger.js');
      const logger = new ConversationLogger(process.cwd());
      if (role === 'user') { logger.logUserMessage(message); }
      else if (role === 'assistant') { logger.logAssistantMessage(message); }
      else { console.error(`${C.red}Invalid role: ${role}. Use 'user' or 'assistant'${C.reset}`); process.exit(1); }
      console.log('[>] Message logged');
    });

  // Conversation history
  program
    .command('conversation')
    .description('View conversation and tool call history')
    .option('--checkpoint <id>', 'Show conversation up to checkpoint')
    .option('--limit <n>', 'Limit number of events', '50')
    .action(async (options) => {
      const { ConversationLogger } = await import('../core/conversation-logger.js');
      const logger = new ConversationLogger(process.cwd());
      if (options.checkpoint) {
        const context = logger.getContextForCheckpoint(options.checkpoint);
        console.log(`\n${C.bright}Conversation up to ${options.checkpoint}${C.reset}\n`);
        console.log(`${C.cyan}Messages:${C.reset} ${context.messages.length}`);
        console.log(`${C.cyan}Tool calls:${C.reset} ${context.toolCalls.length}`);
        console.log(`${C.cyan}Checkpoints:${C.reset} ${context.checkpoints.length}`);
        console.log(`${C.cyan}Code changes:${C.reset} ${context.codeChanges.length}\n`);
        const recent = context.messages.slice(-10);
        for (const msg of recent) {
          const time = timeAgo(msg.timestamp);
          const role = msg.role === 'user' ? C.green : C.blue;
          console.log(`${role}${msg.role}${C.reset} ${C.dim}(${time})${C.reset}`);
          console.log(`  ${msg.content.slice(0, 100)}${msg.content.length > 100 ? '...' : ''}\n`);
        }
        return;
      }
      const events = logger.getAllEvents().slice(-parseInt(options.limit));
      console.log(`\n${C.bright}Recent Events (${events.length})${C.reset}\n`);
      for (const event of events) {
        const time = timeAgo(event.timestamp);
        switch (event.type) {
          case 'user_message': console.log(`${C.green}User${C.reset} ${C.dim}(${time})${C.reset}`); console.log(`   ${event.data.content.slice(0, 80)}...\n`); break;
          case 'assistant_message': console.log(`${C.blue}Assistant${C.reset} ${C.dim}(${time})${C.reset}`); console.log(`   ${event.data.content.slice(0, 80)}...\n`); break;
          case 'tool_call': console.log(`${C.cyan}Tool: ${event.data.tool}${C.reset} ${C.dim}(${time})${C.reset}`); break;
          case 'checkpoint_created': console.log(`${C.yellow}Checkpoint: ${event.data.checkpointId}${C.reset} ${C.dim}(${time})${C.reset}`); console.log(`   ${event.data.description}\n`); break;
          case 'file_created': console.log(`${C.green}Created: ${event.data.filePath}${C.reset} ${C.dim}(${event.data.newSize} bytes)${C.reset}`); break;
          case 'file_modified': console.log(`${C.yellow}Modified: ${event.data.filePath}${C.reset} ${C.dim}(${event.data.oldSize} -> ${event.data.newSize} bytes)${C.reset}`); break;
          case 'file_deleted': console.log(`${C.red}Deleted: ${event.data.filePath}${C.reset} ${C.dim}(${event.data.oldSize} bytes)${C.reset}`); break;
        }
      }
    });

  // Export session
  program
    .command('export-session')
    .description('Export complete session data')
    .option('--format <type>', 'Export format (json|markdown)', 'json')
    .option('--output <path>', 'Output file path')
    .action(async (options) => {
      const { ConversationLogger } = await import('../core/conversation-logger.js');
      const { SessionExporter } = await import('../core/session-exporter.js');
      const { TimeMachineEngine } = await import('../core/engine.js');
      const engine = new TimeMachineEngine(process.cwd());
      const logger = new ConversationLogger(process.cwd());
      const exporter = new SessionExporter(logger, engine);
      const sessionId = logger.getSessionId();
      const outputPath = options.output || `session-${sessionId}.${options.format === 'markdown' ? 'md' : 'json'}`;
      console.log(`\n${C.bright}Exporting session...${C.reset}\n`);
      exporter.saveExport(sessionId, options.format, outputPath);
      console.log(`${C.green}\u2713${C.reset} Exported to: ${outputPath}\n`);
    });
}
