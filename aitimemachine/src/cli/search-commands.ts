/**
 * Search Commands
 *
 * search, search-conv, kb-search, ai-search, conv-search, find-restore
 */

import { Command } from 'commander';
import { TimeMachineEngine } from '../core/engine.js';
import { C, timeAgo, formatDate, fail, warn } from './cli-helpers.js';

interface KbSearchOptions {
  limit?: string;
  json?: boolean;
}

/**
 * Local fallback for `kb-search` when the cloud KB is not configured. Runs the
 * built-in full-text search engine over the current project's checkpoints and
 * file contents so the command is usable out of the box on a fresh install.
 */
async function runLocalKbSearch(query: string, options: KbSearchOptions): Promise<void> {
  const limit = parseInt(options.limit ?? '20', 10) || 20;
  const { SearchEngine } = await import('../core/search-engine.js');
  const { TimelineIndex } = await import('../core/timeline-index.js');
  const { EventStore } = await import('../core/event-store.js');

  const engine = new TimeMachineEngine(process.cwd());
  const eventStore = new EventStore(process.cwd());
  eventStore.load();
  const timeline = new TimelineIndex(engine);
  const searchEngine = new SearchEngine(eventStore, timeline);

  const results = searchEngine.search({ query, type: 'all', limit });
  const files = results.filter((r) => r.type === 'file');
  const checkpoints = results.filter((r) => r.type === 'checkpoint');

  if (options.json) {
    console.log(
      JSON.stringify(
        {
          source: 'local',
          query,
          files: files.map((r) => ({ file_path: r.filePath, snippet: r.context || r.content, checkpoint_id: r.checkpointId })),
          checkpoints: checkpoints.map((r) => ({ id: r.id, snippet: r.context || r.content })),
        },
        null,
        2,
      ),
    );
    return;
  }

  console.log(`\n${C.bright}KB Search${C.reset} "${query}" ${C.dim}(local fallback — cloud KB not configured)${C.reset}`);
  console.log(`${C.dim}Total results: ${results.length}${C.reset}\n`);

  if (files.length > 0) {
    console.log(`${C.bright}Files${C.reset}`);
    for (const r of files) {
      console.log(`  ${C.cyan}${r.filePath ?? r.id}${C.reset}`);
      const snippet = (r.context || r.content).replace(/\n/g, ' ').slice(0, 160);
      if (snippet) console.log(`    ${C.dim}${snippet}${C.reset}`);
    }
    console.log();
  }
  if (checkpoints.length > 0) {
    console.log(`${C.bright}Checkpoints${C.reset}`);
    for (const r of checkpoints) {
      console.log(`  ${C.cyan}${r.id.slice(0, 16)}${C.reset} ${C.dim}${timeAgo(r.timestamp)}${C.reset}`);
      const snippet = (r.context || r.content).replace(/\n/g, ' ').slice(0, 160);
      if (snippet) console.log(`    ${C.dim}${snippet}${C.reset}`);
    }
    console.log();
  }
  if (results.length === 0) {
    warn('No local KB results found', ['Configure the cloud KB with AITM_API_URL + AITM_API_KEY for unified search']);
  }
}

export function registerSearchCommands(program: Command): void {

  // Enhanced search with fuzzy matching
  program
    .command('search <query>')
    .description('Search conversations and checkpoints with fuzzy matching')
    .option('-t, --type <type>', 'Search type: conversation, checkpoints, all', 'all')
    .option('--semantic', 'Use semantic (AI-powered) search via cloud API')
    .option('--no-fuzzy', 'Disable fuzzy matching')
    .option('-c, --context <lines>', 'Context lines around matches', '2')
    .option('--after <date>', 'Search after date')
    .option('--before <date>', 'Search before date')
    .option('-r, --role <role>', 'Filter by role: user, assistant')
    .option('-n, --limit <n>', 'Limit results', '20')
    .option('-j, --json', 'Output as JSON')
    .option('--project-id <id>', 'Filter by project ID (semantic mode)')
    .action(async (query, options) => {
      // Semantic search mode (cloud). Falls through to local fuzzy search below
      // when the cloud API is not configured, so the command still works.
      if (options.semantic) {
        const { createCloudSyncClient } = await import('../cloud/sync-client.js');
        const client = createCloudSyncClient();
        if (!client) {
          warn('Cloud API not configured — using local fuzzy search', [
            'Set AITM_API_URL and AITM_API_KEY for cloud semantic search',
          ]);
          // Fall through to the local fuzzy search below.
        } else {
        try {
          const result = await client.semanticSearch(query, {
            projectId: options.projectId,
            maxResults: parseInt(options.limit),
          });
          if (options.json) { console.log(JSON.stringify(result, null, 2)); return; }
          const results = result.data?.results || result.results || [];
          if (results.length === 0) { console.log(`\nNo semantic matches for "${query}"\n`); return; }
          console.log(`\n${C.bright}Semantic Search${C.reset} (${results.length} matches, model: ${result.data?.model || result.model || 'unknown'})\n`);
          for (const r of results) {
            const sim = r.similarity ? ` ${C.dim}(similarity: ${r.similarity})${C.reset}` : '';
            console.log(`  ${C.yellow}[CP]${C.reset} ${r.name}${sim}`);
            if (r.description) console.log(`    ${C.dim}${r.description.slice(0, 120)}${C.reset}`);
            console.log(`    ${C.dim}project: ${r.project_id} | ${r.scope || 'files'} | ${r.trigger_type || 'manual'}${C.reset}`);
            if (r.created_at) console.log(`    ${C.dim}${new Date(r.created_at).toLocaleString()}${C.reset}`);
            console.log();
          }
          return;
        } catch (err) {
          fail(`Semantic search failed: ${(err as Error).message}`);
          return;
        }
        } // end cloud-configured branch
      }

      // Local fuzzy search mode (original, also used as semantic fallback)
      const { SearchEngine } = await import('../core/search-engine.js');
      const { TimelineIndex } = await import('../core/timeline-index.js');
      const { EventStore } = await import('../core/event-store.js');
      const engine = new TimeMachineEngine(process.cwd());
      const eventStore = new EventStore(process.cwd());
      eventStore.load();
      const timeline = new TimelineIndex(engine);
      const searchEngine = new SearchEngine(eventStore, timeline);
      const parseDate = (str: string): Date | undefined => {
        if (!str) return undefined;
        const match = str.match(/^(\d+)(m|h|d)\s*ago$/i);
        if (match) {
          const amount = parseInt(match[1]);
          const unit = match[2].toLowerCase();
          const ms = unit === 'm' ? 60000 : unit === 'h' ? 3600000 : 86400000;
          return new Date(Date.now() - amount * ms);
        }
        return new Date(str);
      };
      const results = searchEngine.search({
        query, type: options.type as any, fuzzy: options.fuzzy !== false,
        contextLines: parseInt(options.context), startDate: parseDate(options.after),
        endDate: parseDate(options.before), limit: parseInt(options.limit)
      });
      const filtered = options.role ? results.filter(r => r.role === options.role) : results;
      if (options.json) { console.log(JSON.stringify(filtered, null, 2)); return; }
      if (filtered.length === 0) { console.log(`\nNo results found for "${query}"\n`); return; }
      console.log(`\n${C.bright}Search Results${C.reset} (${filtered.length} matches for "${query}")\n`);
      for (const r of filtered) {
        const icon = r.type === 'message'
          ? (r.role === 'user' ? `${C.green}[U]${C.reset}` : `${C.blue}[A]${C.reset}`)
          : `${C.yellow}[CP]${C.reset}`;
        const time = timeAgo(r.timestamp);
        const score = r.score.toFixed(2);
        console.log(`  ${icon} ${C.dim}${time} (score: ${score})${C.reset}`);
        const display = r.context || r.content;
        const lines = display.split('\n').slice(0, 4);
        for (const line of lines) {
          let highlighted = line;
          for (const term of r.matchedTerms) {
            const cleanTerm = term.replace(/^~/, '');
            const regex = new RegExp(`(${cleanTerm})`, 'gi');
            highlighted = highlighted.replace(regex, `${C.yellow}$1${C.reset}`);
          }
          console.log(`    ${highlighted.slice(0, 100)}`);
        }
        if (display.split('\n').length > 4) { console.log(`    ${C.dim}...${C.reset}`); }
        console.log();
      }
      console.log(`${C.dim}Matched terms: ${[...new Set(filtered.flatMap(r => r.matchedTerms))].join(', ')}${C.reset}\n`);
    });

  // Search conversations only
  program
    .command('search-conv <query>')
    .description('Search only in conversations')
    .option('-r, --role <role>', 'Filter by role: user, assistant')
    .option('-n, --limit <n>', 'Limit results', '20')
    .action(async (query, options) => {
      const { SearchEngine } = await import('../core/search-engine.js');
      const { TimelineIndex } = await import('../core/timeline-index.js');
      const { EventStore } = await import('../core/event-store.js');
      const engine = new TimeMachineEngine(process.cwd());
      const eventStore = new EventStore(process.cwd());
      eventStore.load();
      const timeline = new TimelineIndex(engine);
      const searchEngine = new SearchEngine(eventStore, timeline);
      const results = searchEngine.searchConversations(query, { limit: parseInt(options.limit), role: options.role });
      if (results.length === 0) { console.log(`\nNo conversation matches for "${query}"\n`); return; }
      console.log(`\n${C.bright}Conversation Search${C.reset} (${results.length} matches)\n`);
      for (const r of results) {
        const icon = r.role === 'user' ? `${C.green}[U]${C.reset}` : `${C.blue}[A]${C.reset}`;
        console.log(`  ${icon} ${C.dim}${timeAgo(r.timestamp)}${C.reset}`);
        console.log(`    ${r.content.slice(0, 150)}${r.content.length > 150 ? '...' : ''}`);
        console.log();
      }
    });

  // KB search
  program
    .command('kb-search <query>')
    .description('Unified search across knowledge base (cloud when configured, else local checkpoints/files)')
    .option('--repository-id <id>', 'Filter by repository ID')
    .option('--project-id <id>', 'Filter by project ID')
    .option('--kb-only', 'Require the cloud KB (error instead of local fallback)')
    .option('-n, --limit <n>', 'Limit results', '20')
    .option('-j, --json', 'Output as JSON')
    .action(async (query, options) => {
      const { createCloudSyncClient } = await import('../cloud/sync-client.js');
      const client = createCloudSyncClient();
      if (!client) {
        // --kb-only opts out of the local fallback and requires the cloud KB.
        if (options.kbOnly) {
          fail('Cloud KB not configured', ['Set AITM_API_URL and AITM_API_KEY in your environment']);
          return;
        }
        await runLocalKbSearch(query, options);
        return;
      }
      try {
        const result = await client.unifiedKnowledgeBaseSearch(query, {
          repositoryId: options.repositoryId, projectId: options.projectId,
          limit: parseInt(options.limit, 10),
        });
        if (options.json) { console.log(JSON.stringify(result, null, 2)); return; }
        const total = (result.files?.length || 0) + (result.artifacts?.length || 0) + (result.embeddings?.length || 0);
        console.log(`\n${C.bright}KB Search${C.reset} "${query}"`);
        console.log(`${C.dim}Total results: ${total}${C.reset}\n`);
        if (result.files?.length > 0) {
          console.log(`${C.bright}Files${C.reset}`);
          result.files.slice(0, parseInt(options.limit, 10)).forEach((f: any) => {
            console.log(`  ${C.cyan}${f.file_path}${C.reset} ${C.dim}(${f.language || 'unknown'})${C.reset}`);
            if (f.repository_id) console.log(`    Repo: ${f.repository_id}`);
            if (f.snippet) console.log(`    ${C.dim}${f.snippet.replace(/\n/g, ' ').slice(0, 160)}${C.reset}`);
          });
          console.log();
        }
        if (result.artifacts?.length > 0) {
          console.log(`${C.bright}Artifacts${C.reset}`);
          result.artifacts.slice(0, parseInt(options.limit, 10)).forEach((a: any) => {
            console.log(`  ${C.cyan}${a.type}${C.reset} ${C.dim}(${a.format || 'unknown'})${C.reset}`);
            console.log(`    ID: ${a.id}`);
            if (a.storage) console.log(`    Storage: ${a.storage}`);
            if (a.stats) console.log(`    Stats: ${JSON.stringify(a.stats)}`);
          });
          console.log();
        }
        if (result.embeddings?.length > 0) {
          console.log(`${C.bright}Embeddings${C.reset}`);
          result.embeddings.slice(0, parseInt(options.limit, 10)).forEach((e: any) => {
            const symbol = e.symbol ? `${e.symbol} (${e.symbol_type || 'symbol'})` : 'embedding';
            console.log(`  ${C.cyan}${symbol}${C.reset}`);
            if (e.file_path) console.log(`    File: ${e.file_path}`);
            if (e.repository_id) console.log(`    Repo: ${e.repository_id}`);
            if (e.snippet) console.log(`    ${C.dim}${e.snippet.replace(/\n/g, ' ').slice(0, 160)}${C.reset}`);
          });
          console.log();
        }
        if (total === 0) { warn('No KB results found'); }
      } catch (err) {
        fail(`KB search failed: ${(err as Error).message}`);
      }
    });

  // AI search
  program
    .command('ai-search <query>')
    .description('Search across all AI tool conversations')
    .action(async (query) => {
      const { FullSync } = await import('../integrations/index.js');
      const sync = new FullSync(process.cwd());
      const results = await sync.searchAll(query);
      console.log(`\n[?] Found ${results.length} matches for "${query}":\n`);
      for (const r of results.slice(0, 15)) {
        const icon = r.role === 'user' ? '[U]' : '[A]';
        const source = r.source === 'claude_code' ? '[Claude]' : '[AITM]';
        console.log(`  ${C.dim}${formatDate(r.timestamp)} ${source}${C.reset}`);
        console.log(`  ${icon} ${r.context.slice(0, 150)}`);
        console.log();
      }
    });

  // Global conversation search
  program
    .command('conv-search <query>')
    .description('Search conversations across all projects')
    .action(async (query) => {
      const { SessionServer } = await import('../server/index.js');
      const server = new SessionServer();
      const results = server.searchConversations(query);
      console.log(`\n[?] Found ${results.length} matches for "${query}":\n`);
      for (const r of results.slice(0, 15)) {
        const icon = r.message.role === 'user' ? '[U]' : '[A]';
        console.log(`  ${C.dim}${formatDate(r.message.timestamp)} [${r.project.name}]${C.reset}`);
        console.log(`  ${icon} ${r.context.slice(0, 150)}`);
        console.log();
      }
    });

  // Find-restore
  program
    .command('find-restore <query>')
    .alias('fr')
    .description('Find and restore by searching conversations')
    .action(async (query) => {
      const { SmartRestore } = await import('../server/smart-restore.js');
      const smart = new SmartRestore();
      const projectPath = process.cwd();
      const results = smart.searchForRestore(query, projectPath);
      if (results.length === 0) { console.log(`No sessions found matching "${query}"`); return; }
      console.log(`\n${C.bright}Found ${results.length} matching sessions:${C.reset}\n`);
      results.forEach((r, i) => {
        const date = formatDate(r.session.createdAt);
        const ago = timeAgo(r.session.createdAt);
        console.log(`  ${C.cyan}${i + 1}.${C.reset} ${date} ${C.dim}(${ago})${C.reset}`);
        console.log(`     "${r.session.trigger.description}"`);
        if (r.context) console.log(`     ${C.dim}${r.context}${C.reset}`);
        console.log(`     ${r.session.stats?.totalFiles || 0} files, ${r.session.diffs?.length || 0} changes`);
        console.log();
      });
      const rl = await import('readline');
      const iface = rl.createInterface({ input: process.stdin, output: process.stdout });
      const answer = await new Promise<string>(resolve => {
        iface.question(`Select (1-${results.length}) or 'q' to quit: `, resolve);
      });
      iface.close();
      if (answer === 'q' || answer === '') { console.log('Cancelled'); return; }
      const idx = parseInt(answer) - 1;
      if (isNaN(idx) || idx < 0 || idx >= results.length) { console.log('Invalid selection'); return; }
      const selected = results[idx];
      console.log(`\nRestoring to "${selected.session.trigger.description}"...`);
      const { SessionDaemon } = await import('../server/session-daemon.js');
      const daemon = new SessionDaemon();
      const result = daemon.restore(selected.session.id);
      console.log(`${C.green}[OK] Restored!${C.reset}`);
      console.log(`   Files: ${result.filesRestored}`);
    });
}
