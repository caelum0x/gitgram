/**
 * Memory Commands
 *
 * Surface the AITM unified memory layer (saved_contexts + beads tasks) from
 * the CLI. The unified memory layer persists conversation contexts, ingested
 * beads tasks, and Context7 library docs into the same `saved_contexts` table,
 * discriminated by a `source` field (conversation | task | library | checkpoint).
 *
 *   aitm memory list   [--source conversation|task|library|checkpoint] [--limit 20]
 *   aitm memory search <query> [--semantic] [--limit 10]
 *   aitm memory show   <id>
 *   aitm memory tasks                       – beads tasks with ready-work highlighting
 *   aitm memory remember <text> [--tags a,b] [--project <id>] [--name <name>]
 *   aitm memory stats                       – counts per source
 *
 * Backed by the api-server endpoints:
 *   GET  /v1/contexts                  (list)
 *   GET  /v1/contexts/search/text      (text search)
 *   GET  /v1/contexts/search/semantic  (semantic search)
 *   GET  /v1/contexts/:id              (show)
 *   POST /v1/contexts                  (remember / ingest)
 *   GET  /beads/tasks                  (tasks)
 */

import { Command } from 'commander';
import { C, fail } from './cli-helpers.js';

// ─── Types ────────────────────────────────────────────────────────────────────

type MemorySource = 'conversation' | 'task' | 'library' | 'checkpoint';

const SOURCES: readonly MemorySource[] = [
  'conversation',
  'task',
  'library',
  'checkpoint',
];

interface MemoryEntry {
  id: string;
  name: string;
  description?: string | null;
  tool?: string | null;
  source?: MemorySource | string | null;
  tags?: string[] | null;
  message_count?: number;
  git_branch?: string | null;
  project_id?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

interface MemoryEntryFull extends MemoryEntry {
  messages?: Array<{ role: string; content: string; timestamp?: string }>;
  system_prompt?: string | null;
  open_files?: string[] | null;
  working_directory?: string | null;
  git_commit?: string | null;
  metadata?: unknown;
  expires_at?: string | null;
}

interface ListResponse {
  data: MemoryEntry[];
  has_more?: boolean;
  limit?: number;
  offset?: number;
}

interface SearchMatch {
  content: string;
  timestamp?: string;
}

interface SearchResult {
  id: string;
  name: string;
  description?: string | null;
  tool?: string | null;
  tags?: string[] | null;
  matches?: SearchMatch[];
  similarity_score?: number;
  created_at?: string | null;
}

interface SearchResponse {
  query: string;
  results: SearchResult[];
  total: number;
  search_type?: string;
  embedding_provider?: string;
}

interface BeadsTask {
  id: string;
  title: string;
  status: 'pending' | 'ready' | 'done' | 'blocked' | string;
  description?: string;
  deps?: string[];
  dependencies?: string[];
}

interface BeadsResponse<T> {
  success: boolean;
  data: T;
  error?: string;
}

interface MemoryOptions {
  source?: string;
  limit?: string;
  semantic?: boolean;
  tags?: string;
  project?: string;
  name?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getApiBase(): string {
  return process.env.AITM_API_URL ?? 'http://localhost:3001';
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function resolveApiKey(): Promise<string | undefined> {
  if (process.env.AITM_API_KEY) {
    return process.env.AITM_API_KEY;
  }
  try {
    const { getStoredAuth } = await import('../auth/index.js');
    return getStoredAuth()?.apiKey;
  } catch {
    return undefined;
  }
}

async function buildHeaders(extra?: Record<string, string>): Promise<Record<string, string>> {
  const apiKey = await resolveApiKey();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(extra ?? {}),
  };
  if (apiKey) {
    headers['X-API-Key'] = apiKey;
  }
  return headers;
}

async function doFetch(path: string, init?: RequestInit): Promise<Response> {
  const headers = await buildHeaders(init?.headers as Record<string, string> | undefined);
  const url = `${getApiBase()}${path}`;
  try {
    return await fetch(url, { ...init, headers });
  } catch (err: unknown) {
    throw new Error(
      `Cannot reach AITM API at ${getApiBase()} — is the server running? (${errorMessage(err)})`,
    );
  }
}

/**
 * Fetch a /v1/contexts/* endpoint. These return bare JSON (no success
 * envelope), surfacing errors via { error: { message } } or { error: string }.
 */
async function contextFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await doFetch(path, init);
  const body = (await res.json()) as T & { error?: unknown };
  if (!res.ok) {
    throw new Error(extractError(body.error) ?? `HTTP ${res.status}`);
  }
  return body as T;
}

/** Fetch a /beads/* endpoint. These use a { success, data, error } envelope. */
async function beadsFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await doFetch(`/beads${path}`, init);
  const body = (await res.json()) as BeadsResponse<T>;
  if (!res.ok || !body.success) {
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  return body.data;
}

function extractError(error: unknown): string | undefined {
  if (!error) return undefined;
  if (typeof error === 'string') return error;
  if (typeof error === 'object' && error !== null && 'message' in error) {
    return String((error as { message: unknown }).message);
  }
  return undefined;
}

function sourceColor(source: string | null | undefined): string {
  switch (source) {
    case 'conversation': return C.cyan;
    case 'task': return C.yellow;
    case 'library': return C.magenta;
    case 'checkpoint': return C.green;
    default: return C.dim;
  }
}

function sourceLabel(source: string | null | undefined): string {
  return (source ?? 'conversation').padEnd(12);
}

function truncate(text: string | null | undefined, max: number): string {
  const value = (text ?? '').replace(/\s+/g, ' ').trim();
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function statusIcon(status: string): string {
  switch (status) {
    case 'done': return '[x]';
    case 'ready': return '[>]';
    case 'blocked': return '[!]';
    default: return '[ ]';
  }
}

function statusColor(status: string): string {
  switch (status) {
    case 'done': return C.green;
    case 'ready': return C.cyan;
    case 'blocked': return C.red;
    default: return C.yellow;
  }
}

// ─── Registration ──────────────────────────────────────────────────────────────

export function registerMemoryCommands(program: Command): void {
  const memory = program
    .command('memory')
    .description('Browse and search the unified memory layer (contexts, tasks, docs)');

  // ── list ────────────────────────────────────────────────────────────────────

  memory
    .command('list')
    .description('List memory entries')
    .option('--source <source>', `Filter by source: ${SOURCES.join('|')}`)
    .option('--limit <n>', 'Maximum number of entries', '20')
    .action(async (opts: MemoryOptions) => {
      try {
        if (opts.source && !SOURCES.includes(opts.source as MemorySource)) {
          fail(`Invalid source '${opts.source}'. Expected one of: ${SOURCES.join(', ')}`);
          return;
        }

        const limit = Math.max(1, parseInt(opts.limit ?? '20', 10) || 20);
        const params = new URLSearchParams({ limit: String(limit) });
        if (opts.source) {
          params.set('source', opts.source);
        }

        const body = await contextFetch<ListResponse>(`/v1/contexts?${params.toString()}`);
        let entries = Array.isArray(body.data) ? body.data : [];

        // Defensive client-side filter: the list endpoint may not honor the
        // source query param on every server version.
        if (opts.source) {
          const withSource = entries.filter((e) => e.source != null);
          if (withSource.length > 0) {
            entries = entries.filter((e) => e.source === opts.source);
          }
        }

        if (entries.length === 0) {
          console.log(`${C.yellow}[!]${C.reset} No memory entries found`);
          return;
        }

        console.log(`${C.bright}Memory entries${C.reset} ${C.dim}(${entries.length})${C.reset}\n`);
        for (const entry of entries) {
          const sc = sourceColor(entry.source);
          console.log(
            `${sc}${sourceLabel(entry.source)}${C.reset} ${C.bright}${truncate(entry.name, 48)}${C.reset} ${C.dim}[${entry.id}]${C.reset}`,
          );
          if (entry.description) {
            console.log(`             ${C.dim}${truncate(entry.description, 70)}${C.reset}`);
          }
        }
      } catch (err: unknown) {
        fail(errorMessage(err));
      }
    });

  // ── search ──────────────────────────────────────────────────────────────────

  memory
    .command('search <query>')
    .description('Search memory entries (text or semantic)')
    .option('--semantic', 'Use vector/semantic search instead of text search')
    .option('--limit <n>', 'Maximum number of results', '10')
    .action(async (query: string, opts: MemoryOptions) => {
      try {
        const limit = Math.max(1, parseInt(opts.limit ?? '10', 10) || 10);
        const endpoint = opts.semantic
          ? '/v1/contexts/search/semantic'
          : '/v1/contexts/search/text';
        const params = new URLSearchParams({ q: query, limit: String(limit) });

        const body = await contextFetch<SearchResponse>(`${endpoint}?${params.toString()}`);
        const results = Array.isArray(body.results) ? body.results : [];

        const kind = opts.semantic ? 'semantic' : 'text';
        console.log(
          `${C.bright}Search${C.reset} ${C.dim}(${kind})${C.reset} for ${C.cyan}"${query}"${C.reset} — ${results.length} result(s)\n`,
        );

        if (results.length === 0) {
          console.log(`${C.yellow}[!]${C.reset} No matches`);
          return;
        }

        for (const r of results) {
          const score = typeof r.similarity_score === 'number'
            ? ` ${C.magenta}${(r.similarity_score * 100).toFixed(0)}%${C.reset}`
            : '';
          console.log(
            `${C.bright}${truncate(r.name, 50)}${C.reset}${score} ${C.dim}[${r.id}]${C.reset}`,
          );
          if (r.matches && r.matches.length > 0) {
            console.log(`  ${C.dim}${truncate(r.matches[0].content, 76)}${C.reset}`);
          } else if (r.description) {
            console.log(`  ${C.dim}${truncate(r.description, 76)}${C.reset}`);
          }
        }
      } catch (err: unknown) {
        fail(errorMessage(err));
      }
    });

  // ── show ────────────────────────────────────────────────────────────────────

  memory
    .command('show <id>')
    .description('Show a full memory entry')
    .action(async (id: string) => {
      try {
        const entry = await contextFetch<MemoryEntryFull>(`/v1/contexts/${encodeURIComponent(id)}`);

        const sc = sourceColor(entry.source);
        console.log(`${C.bright}${entry.name}${C.reset}`);
        console.log(`${C.dim}${entry.id}${C.reset}\n`);
        console.log(`  Source:    ${sc}${entry.source ?? 'conversation'}${C.reset}`);
        if (entry.tool) console.log(`  Tool:      ${entry.tool}`);
        if (entry.project_id) console.log(`  Project:   ${C.dim}${entry.project_id}${C.reset}`);
        if (entry.git_branch) console.log(`  Branch:    ${entry.git_branch}`);
        if (entry.tags && entry.tags.length > 0) {
          console.log(`  Tags:      ${C.cyan}${entry.tags.join(', ')}${C.reset}`);
        }
        if (entry.created_at) console.log(`  Created:   ${C.dim}${entry.created_at}${C.reset}`);
        if (entry.description) {
          console.log(`\n${C.bright}Description${C.reset}\n  ${entry.description}`);
        }

        const messages = Array.isArray(entry.messages) ? entry.messages : [];
        if (messages.length > 0) {
          console.log(`\n${C.bright}Messages${C.reset} ${C.dim}(${messages.length})${C.reset}`);
          for (const msg of messages) {
            console.log(`  ${C.cyan}${msg.role}:${C.reset} ${truncate(msg.content, 80)}`);
          }
        }
      } catch (err: unknown) {
        fail(errorMessage(err));
      }
    });

  // ── tasks ───────────────────────────────────────────────────────────────────

  memory
    .command('tasks')
    .description('List beads tasks with ready-work highlighting')
    .action(async () => {
      try {
        const data = await beadsFetch<BeadsTask[]>('/tasks');
        const tasks = Array.isArray(data) ? data : [];

        if (tasks.length === 0) {
          console.log(`${C.yellow}[!]${C.reset} No tasks found`);
          return;
        }

        const ready = tasks.filter((t) => t.status === 'ready');
        const other = tasks.filter((t) => t.status !== 'ready');

        if (ready.length > 0) {
          console.log(`${C.bright}${C.cyan}Ready work${C.reset} ${C.dim}(${ready.length})${C.reset}`);
          for (const t of ready) {
            console.log(
              `  ${C.cyan}${statusIcon(t.status)}${C.reset} ${C.bright}${truncate(t.title, 60)}${C.reset} ${C.dim}[${t.id}]${C.reset}`,
            );
          }
          console.log('');
        }

        console.log(`${C.bright}All tasks${C.reset} ${C.dim}(${tasks.length})${C.reset}`);
        for (const t of other) {
          const sc = statusColor(t.status);
          console.log(
            `  ${sc}${statusIcon(t.status)}${C.reset} ${truncate(t.title, 60)} ${C.dim}[${t.id}] ${t.status}${C.reset}`,
          );
        }
      } catch (err: unknown) {
        fail(errorMessage(err));
      }
    });

  // ── remember ──────────────────────────────────────────────────────────────────

  memory
    .command('remember <text...>')
    .description('Ingest a note into the unified memory layer')
    .option('--tags <tags>', 'Comma-separated tags')
    .option('--name <name>', 'Short title for the note (default: first line of text)')
    .option('--project <id>', 'Project ID (default: $AITM_MEMORY_PROJECT_ID / $AITM_PROJECT_ID)')
    .action(async (textParts: string[], opts: MemoryOptions) => {
      try {
        const text = textParts.join(' ').trim();
        if (!text) {
          fail('Note text is required');
          return;
        }

        const projectId =
          opts.project ??
          process.env.AITM_MEMORY_PROJECT_ID ??
          process.env.AITM_PROJECT_ID;

        if (!projectId) {
          fail(
            'A project is required to store a note',
            [
              'Pass --project <id>, or set AITM_MEMORY_PROJECT_ID / AITM_PROJECT_ID.',
            ],
          );
          return;
        }

        const tags = opts.tags
          ? opts.tags.split(',').map((t) => t.trim()).filter(Boolean)
          : ['note'];
        const name = opts.name?.trim() || truncate(text.split('\n')[0], 60) || 'Note';

        const created = await contextFetch<MemoryEntry>('/v1/contexts', {
          method: 'POST',
          body: JSON.stringify({
            projectId,
            name,
            description: text,
            tool: 'aitm-cli',
            tags,
            messages: [
              { role: 'user', content: text, timestamp: new Date().toISOString() },
            ],
          }),
        });

        console.log(
          `${C.green}[OK]${C.reset} Remembered ${C.bright}${name}${C.reset} ${C.dim}[${created.id}]${C.reset}`,
        );
        if (tags.length > 0) {
          console.log(`       Tags: ${C.cyan}${tags.join(', ')}${C.reset}`);
        }
      } catch (err: unknown) {
        fail(errorMessage(err));
      }
    });

  // ── stats ───────────────────────────────────────────────────────────────────

  memory
    .command('stats')
    .description('Show memory entry counts per source')
    .action(async () => {
      try {
        // Pull a generous page and tally per source. The list endpoint does not
        // expose aggregate counts, so we count what we can retrieve.
        const body = await contextFetch<ListResponse>('/v1/contexts?limit=1000');
        const entries = Array.isArray(body.data) ? body.data : [];

        const counts: Record<string, number> = {};
        for (const source of SOURCES) {
          counts[source] = 0;
        }
        let unknownSource = 0;

        for (const entry of entries) {
          const source = entry.source ?? 'conversation';
          if (source in counts) {
            counts[source] += 1;
          } else {
            unknownSource += 1;
          }
        }

        console.log(`${C.bright}Memory stats${C.reset}\n`);
        for (const source of SOURCES) {
          const sc = sourceColor(source);
          console.log(`  ${sc}${sourceLabel(source)}${C.reset} ${C.bright}${counts[source]}${C.reset}`);
        }
        if (unknownSource > 0) {
          console.log(`  ${C.dim}${'other'.padEnd(12)}${C.reset} ${C.bright}${unknownSource}${C.reset}`);
        }

        const total = entries.length;
        const suffix = body.has_more ? '+' : '';
        console.log(`\n  ${C.dim}total${C.reset}        ${C.bright}${total}${suffix}${C.reset}`);
        if (body.has_more) {
          console.log(`  ${C.dim}(more entries exist beyond the 1000-entry sample)${C.reset}`);
        }
      } catch (err: unknown) {
        fail(errorMessage(err));
      }
    });
}
