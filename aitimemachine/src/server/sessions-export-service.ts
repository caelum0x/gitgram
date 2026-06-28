/**
 * Sessions Export Service (bundled `aitm serve`)
 *
 * Powers `aitm export json|markdown|csv|report|git-history`. A "session" is the
 * set of checkpoints (TimePoints) sharing a conversation sessionId, enriched
 * with the conversation events recorded for that session. This reuses the data
 * the bundled engine + event store already capture — no separate Drizzle DB.
 */

import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import type { TimeMachineEngine } from '../core/engine.js';
import type { EventStore, Event } from '../core/event-store.js';
import type { TimePointSummary } from '../core/types.js';

export interface SessionExport {
  id: string;
  startedAt: string;
  endedAt: string;
  checkpointCount: number;
  messageCount: number;
  checkpoints: Array<{
    id: string;
    description: string;
    timestamp: string;
    filesChanged: number;
  }>;
  messages: Array<{ role: string; content: string; timestamp: string }>;
}

interface SessionGroup {
  id: string;
  timepoints: TimePointSummary[];
}

function groupBySession(engine: TimeMachineEngine): SessionGroup[] {
  const groups = new Map<string, TimePointSummary[]>();
  for (const summary of engine.listTimePoints()) {
    const full = engine.getTimePoint(summary.id);
    const sessionId = full?.conversation.sessionId ?? 'default';
    const list = groups.get(sessionId) ?? [];
    list.push(summary);
    groups.set(sessionId, list);
  }
  return [...groups.entries()].map(([id, timepoints]) => ({ id, timepoints }));
}

function messagesForSession(events: Event[], checkpointIds: Set<string>): Event['data'][] {
  // Map checkpoint -> session by event ordering; messages are the conversation
  // events recorded for this project. We surface user/assistant messages.
  return events
    .filter((e) => e.type === 'user_message' || e.type === 'assistant_message')
    .map((e) => ({ role: e.type === 'user_message' ? 'user' : 'assistant', content: e.data?.content ?? '', timestamp: e.timestamp.toISOString() }));
}

export function buildSessionExports(
  engine: TimeMachineEngine,
  eventStore: EventStore,
  opts: { limit?: number; since?: string } = {},
): SessionExport[] {
  const since = opts.since ? new Date(opts.since) : null;
  const limit = opts.limit ?? 50;
  const events = eventStore.getAll();

  const groups = groupBySession(engine)
    .map((group) => {
      const sorted = [...group.timepoints].sort(
        (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
      );
      const filtered = since
        ? sorted.filter((tp) => new Date(tp.timestamp) >= since)
        : sorted;
      return { ...group, timepoints: filtered };
    })
    .filter((group) => group.timepoints.length > 0);

  const exports: SessionExport[] = groups.map((group) => {
    const first = group.timepoints[0];
    const last = group.timepoints[group.timepoints.length - 1];
    const checkpointIds = new Set(group.timepoints.map((tp) => tp.id));
    const messages = messagesForSession(events, checkpointIds);
    return {
      id: group.id,
      startedAt: new Date(first.timestamp).toISOString(),
      endedAt: new Date(last.timestamp).toISOString(),
      checkpointCount: group.timepoints.length,
      messageCount: messages.length,
      checkpoints: group.timepoints.map((tp) => ({
        id: tp.id,
        description: tp.description,
        timestamp: new Date(tp.timestamp).toISOString(),
        filesChanged: tp.changesCount,
      })),
      messages,
    };
  });

  return exports
    .sort((a, b) => new Date(b.endedAt).getTime() - new Date(a.endedAt).getTime())
    .slice(0, limit);
}

export function sessionsAsMarkdown(
  sessions: SessionExport[],
): Array<{ id: string; filename: string; content: string }> {
  return sessions.map((s) => {
    const lines: string[] = [];
    lines.push(`# Session ${s.id}`);
    lines.push('');
    lines.push(`- **Started:** ${s.startedAt}`);
    lines.push(`- **Ended:** ${s.endedAt}`);
    lines.push(`- **Checkpoints:** ${s.checkpointCount}`);
    lines.push(`- **Messages:** ${s.messageCount}`);
    lines.push('');
    lines.push('## Checkpoints');
    lines.push('');
    for (const cp of s.checkpoints) {
      lines.push(`- \`${cp.id.slice(0, 12)}\` ${cp.description} (${cp.timestamp}, ${cp.filesChanged} changes)`);
    }
    if (s.messages.length > 0) {
      lines.push('');
      lines.push('## Conversation');
      lines.push('');
      for (const m of s.messages) {
        lines.push(`**${m.role}:** ${m.content}`);
        lines.push('');
      }
    }
    return { id: s.id, filename: `session-${s.id}.md`, content: lines.join('\n') };
  });
}

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function sessionsAsCsv(sessions: SessionExport[]): string {
  const header = ['session_id', 'started_at', 'ended_at', 'checkpoints', 'messages'];
  const rows = sessions.map((s) =>
    [s.id, s.startedAt, s.endedAt, String(s.checkpointCount), String(s.messageCount)]
      .map(csvEscape)
      .join(','),
  );
  return [header.join(','), ...rows].join('\n') + '\n';
}

function parsePeriodDays(period: string): number {
  const match = /^(\d+)\s*d?$/i.exec(period.trim());
  return match ? parseInt(match[1], 10) : 30;
}

export function activityReportHtml(sessions: SessionExport[], period: string): string {
  const days = parsePeriodDays(period);
  const cutoff = new Date(Date.now() - days * 86400000);
  const inWindow = sessions.filter((s) => new Date(s.endedAt) >= cutoff);
  const totalCheckpoints = inWindow.reduce((sum, s) => sum + s.checkpointCount, 0);
  const totalMessages = inWindow.reduce((sum, s) => sum + s.messageCount, 0);

  const rows = inWindow
    .map(
      (s) =>
        `<tr><td>${escapeHtml(s.id)}</td><td>${escapeHtml(s.startedAt)}</td><td>${escapeHtml(
          s.endedAt,
        )}</td><td>${s.checkpointCount}</td><td>${s.messageCount}</td></tr>`,
    )
    .join('\n');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>AITM Activity Report</title>
<style>
  body { font-family: -apple-system, system-ui, sans-serif; margin: 2rem; color: #1a1a1a; }
  h1 { margin-bottom: 0.25rem; }
  .meta { color: #666; margin-bottom: 1.5rem; }
  .cards { display: flex; gap: 1rem; margin-bottom: 2rem; }
  .card { background: #f5f5f7; border-radius: 12px; padding: 1rem 1.5rem; }
  .card .n { font-size: 2rem; font-weight: 700; }
  table { border-collapse: collapse; width: 100%; }
  th, td { text-align: left; padding: 0.5rem 0.75rem; border-bottom: 1px solid #eee; }
  th { color: #666; font-weight: 600; }
</style>
</head>
<body>
<h1>AITM Activity Report</h1>
<div class="meta">Last ${days} day(s) &middot; generated ${new Date().toISOString()}</div>
<div class="cards">
  <div class="card"><div class="n">${inWindow.length}</div><div>sessions</div></div>
  <div class="card"><div class="n">${totalCheckpoints}</div><div>checkpoints</div></div>
  <div class="card"><div class="n">${totalMessages}</div><div>messages</div></div>
</div>
<table>
  <thead><tr><th>Session</th><th>Started</th><th>Ended</th><th>Checkpoints</th><th>Messages</th></tr></thead>
  <tbody>
${rows || '<tr><td colspan="5">No activity in this period.</td></tr>'}
  </tbody>
</table>
</body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export interface GitExportResult {
  repoPath: string;
  commitCount: number;
  branch: string;
  instructions: string;
}

/**
 * Materialize the session/checkpoint history as commits on a dedicated branch in
 * an existing git repo. Each checkpoint becomes one commit (metadata only — a
 * NOTE file), giving a browsable `git log` of AITM activity.
 */
export function exportToGitHistory(
  sessions: SessionExport[],
  repoPath: string,
  branch: string,
): GitExportResult {
  const resolvedRepo = path.resolve(repoPath);
  const git = (args: string[]): string =>
    execFileSync('git', args, { cwd: resolvedRepo, encoding: 'utf-8' }).trim();

  // Validate it is a git repository.
  try {
    git(['rev-parse', '--is-inside-work-tree']);
  } catch {
    throw new Error(`${resolvedRepo} is not a git repository — run 'git init' first`);
  }

  const notesDir = path.join(resolvedRepo, '.aitm-history');
  fs.mkdirSync(notesDir, { recursive: true });

  // Create/switch to the history branch as an orphan if it does not exist.
  try {
    git(['rev-parse', '--verify', branch]);
    git(['checkout', branch]);
  } catch {
    git(['checkout', '--orphan', branch]);
  }

  let commitCount = 0;
  const checkpoints = sessions
    .flatMap((s) => s.checkpoints.map((cp) => ({ session: s.id, ...cp })))
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  for (const cp of checkpoints) {
    const notePath = path.join(notesDir, `${cp.id}.md`);
    fs.writeFileSync(
      notePath,
      `# ${cp.description}\n\nSession: ${cp.session}\nCheckpoint: ${cp.id}\nTime: ${cp.timestamp}\nFiles changed: ${cp.filesChanged}\n`,
    );
    git(['add', path.relative(resolvedRepo, notePath)]);
    git([
      'commit',
      '--allow-empty',
      '--date',
      cp.timestamp,
      '-m',
      `${cp.description} [${cp.id.slice(0, 12)}]`,
    ]);
    commitCount += 1;
  }

  return {
    repoPath: resolvedRepo,
    commitCount,
    branch,
    instructions: `cd ${resolvedRepo}\ngit log ${branch} --oneline\ngit push origin ${branch}`,
  };
}
