import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import { TimeMachineEngine } from './core/index.js';

/**
 * Web UI server for visual timeline browsing
 */
export class WebServer {
  private engine: TimeMachineEngine;
  private server: http.Server | null = null;

  constructor(private projectPath: string, private port = 3333) {
    this.engine = new TimeMachineEngine(projectPath);
  }

  start(): void {
    this.server = http.createServer((req, res) => this.handleRequest(req, res));
    this.server.listen(this.port, () => {
      console.log(`\n🌐 Gitgram TimeMachine Web UI: http://localhost:${this.port}\n`);
    });
  }

  stop(): void {
    this.server?.close();
  }

  private handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    const url = new URL(req.url || '/', `http://localhost:${this.port}`);
    
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    // Routes
    if (url.pathname === '/') {
      this.serveHTML(res);
    } else if (url.pathname === '/api/timepoints') {
      this.apiTimepoints(res);
    } else if (url.pathname.startsWith('/api/timepoint/')) {
      const id = url.pathname.split('/')[3];
      this.apiTimepoint(res, id);
    } else if (url.pathname.startsWith('/api/diff/')) {
      const parts = url.pathname.split('/');
      this.apiDiff(res, parts[3], parts[4]);
    } else if (url.pathname === '/api/conversations') {
      this.apiConversations(res);
    } else if (url.pathname === '/api/stats') {
      this.apiStats(res);
    } else if (url.pathname === '/api/checkpoint' && req.method === 'POST') {
      this.apiCheckpoint(req, res);
    } else if (url.pathname.startsWith('/api/restore/') && req.method === 'POST') {
      const id = url.pathname.split('/')[3];
      this.apiRestore(res, id);
    } else {
      res.writeHead(404);
      res.end('Not found');
    }
  }

  private json(res: http.ServerResponse, data: unknown): void {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(data));
  }

  private apiTimepoints(res: http.ServerResponse): void {
    const list = this.engine.listTimePoints().reverse();
    this.json(res, list.map(tp => ({
      id: tp.id,
      timestamp: tp.timestamp.toISOString(),
      description: tp.description,
      trigger: tp.trigger,
      files: tp.stats.totalFiles,
      size: tp.stats.totalSize,
      changes: tp.changesCount,
    })));
  }

  private apiTimepoint(res: http.ServerResponse, id: string): void {
    const tp = this.engine.getTimePoint(id);
    if (!tp) {
      res.writeHead(404);
      this.json(res, { error: 'Not found' });
      return;
    }
    this.json(res, {
      ...tp,
      timestamp: tp.timestamp.toISOString(),
    });
  }

  private apiDiff(res: http.ServerResponse, fromId: string, toId?: string): void {
    try {
      const diff = this.engine.getDiff(fromId, toId);
      this.json(res, diff);
    } catch (err) {
      res.writeHead(400);
      this.json(res, { error: (err as Error).message });
    }
  }

  private apiConversations(res: http.ServerResponse): void {
    const convs = this.engine.getConversations();
    this.json(res, convs.map(c => ({
      ...c,
      timestamp: c.timestamp.toISOString(),
    })));
  }

  private apiStats(res: http.ServerResponse): void {
    this.json(res, this.engine.getStats());
  }

  private apiCheckpoint(req: http.IncomingMessage, res: http.ServerResponse): void {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      const { description } = JSON.parse(body || '{}');
      const tp = this.engine.capture(description || 'Manual checkpoint', { type: 'manual' });
      this.json(res, { id: tp.id, timestamp: tp.timestamp.toISOString() });
    });
  }

  private apiRestore(res: http.ServerResponse, id: string): void {
    try {
      const result = this.engine.restore(id);
      this.json(res, result);
    } catch (err) {
      res.writeHead(400);
      this.json(res, { error: (err as Error).message });
    }
  }

  private serveHTML(res: http.ServerResponse): void {
    res.setHeader('Content-Type', 'text/html');
    res.end(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Gitgram TimeMachine</title>
  <style>
    :root { --bg: #0d1117; --card: #161b22; --border: #30363d; --text: #c9d1d9; --dim: #8b949e; --blue: #58a6ff; --green: #3fb950; --red: #f85149; --yellow: #d29922; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: var(--bg); color: var(--text); line-height: 1.5; }
    .container { max-width: 1200px; margin: 0 auto; padding: 20px; }
    header { display: flex; justify-content: space-between; align-items: center; padding: 20px 0; border-bottom: 1px solid var(--border); margin-bottom: 20px; }
    h1 { font-size: 24px; } h1 span { color: var(--blue); }
    .btn { background: #238636; color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-size: 14px; }
    .btn:hover { background: #2ea043; }
    .btn-danger { background: #da3633; } .btn-danger:hover { background: #f85149; }
    .btn-sm { padding: 4px 12px; font-size: 12px; }
    .stats { display: flex; gap: 20px; margin-bottom: 20px; }
    .stat { background: var(--card); border: 1px solid var(--border); border-radius: 8px; padding: 16px; flex: 1; }
    .stat-value { font-size: 24px; font-weight: bold; color: var(--blue); }
    .stat-label { color: var(--dim); font-size: 13px; }
    .timeline { display: flex; gap: 20px; }
    .timeline-list { flex: 1; }
    .timeline-detail { flex: 1; background: var(--card); border: 1px solid var(--border); border-radius: 8px; padding: 20px; position: sticky; top: 20px; max-height: calc(100vh - 40px); overflow-y: auto; }
    .tp { background: var(--card); border: 1px solid var(--border); border-radius: 8px; padding: 16px; margin-bottom: 12px; cursor: pointer; transition: border-color 0.2s; }
    .tp:hover { border-color: var(--blue); }
    .tp.selected { border-color: var(--blue); background: #1c2128; }
    .tp-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px; }
    .tp-time { color: var(--blue); font-weight: 500; font-size: 14px; }
    .tp-ago { color: var(--dim); font-size: 12px; }
    .tp-desc { font-size: 14px; margin-bottom: 8px; }
    .tp-meta { display: flex; gap: 12px; font-size: 12px; color: var(--dim); }
    .badge { background: var(--border); padding: 2px 8px; border-radius: 10px; }
    .tabs { display: flex; gap: 8px; margin-bottom: 16px; border-bottom: 1px solid var(--border); padding-bottom: 8px; }
    .tab { padding: 6px 12px; background: none; border: none; color: var(--dim); cursor: pointer; border-radius: 4px; }
    .tab:hover { color: var(--text); }
    .tab.active { background: var(--border); color: var(--blue); }
    .detail-title { font-size: 18px; margin-bottom: 16px; }
    .file-list { max-height: 300px; overflow-y: auto; font-size: 13px; font-family: monospace; }
    .file { padding: 4px 8px; border-radius: 4px; }
    .file:hover { background: var(--border); }
    .file-add { color: var(--green); } .file-mod { color: var(--yellow); } .file-del { color: var(--red); }
    .conv { padding: 12px; margin-bottom: 8px; border-radius: 8px; font-size: 14px; }
    .conv-user { background: rgba(31, 111, 235, 0.2); border-left: 3px solid #1f6feb; }
    .conv-assistant { background: rgba(35, 134, 54, 0.2); border-left: 3px solid #238636; }
    .conv-role { font-size: 11px; color: var(--dim); margin-bottom: 4px; text-transform: uppercase; }
    .empty { text-align: center; padding: 40px; color: var(--dim); }
    .actions { margin-top: 20px; display: flex; gap: 10px; }
    pre { background: var(--bg); padding: 12px; border-radius: 6px; overflow-x: auto; font-size: 12px; max-height: 400px; overflow-y: auto; }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1><span>Gitgram TimeMachine</span></h1>
      <button class="btn" onclick="checkpoint()">Checkpoint</button>
    </header>
    <div class="stats" id="stats"></div>
    <div class="timeline">
      <div class="timeline-list" id="list"></div>
      <div class="timeline-detail" id="detail"><div class="empty">Select a timepoint</div></div>
    </div>
  </div>
<script>
let timepoints = [], selected = null, tab = 'files';

async function load() {
  const [tps, stats] = await Promise.all([
    fetch('/api/timepoints').then(r => r.json()),
    fetch('/api/stats').then(r => r.json())
  ]);
  timepoints = tps;
  document.getElementById('stats').innerHTML = \`
    <div class="stat"><div class="stat-value">\${stats.timePoints}</div><div class="stat-label">TimePoints</div></div>
    <div class="stat"><div class="stat-value">\${stats.conversations}</div><div class="stat-label">Messages</div></div>
    <div class="stat"><div class="stat-value">\${formatSize(stats.storageSize)}</div><div class="stat-label">Storage</div></div>
  \`;
  renderList();
}

function renderList() {
  const el = document.getElementById('list');
  if (timepoints.length === 0) { el.innerHTML = '<div class="empty">No timepoints yet</div>'; return; }
  el.innerHTML = timepoints.map(tp => \`
    <div class="tp \${selected === tp.id ? 'selected' : ''}" onclick="select('\${tp.id}')">
      <div class="tp-header">
        <span class="tp-time">\${formatDate(tp.timestamp)}</span>
        <span class="tp-ago">\${timeAgo(tp.timestamp)}</span>
      </div>
      <div class="tp-desc">\${esc(tp.description)}</div>
      <div class="tp-meta">
        <span class="badge">\${tp.files}</span>
        <span class="badge">\${tp.changes} changes</span>
        <span class="badge">\${formatSize(tp.size)}</span>
      </div>
    </div>
  \`).join('');
}

async function select(id) {
  selected = id;
  renderList();
  const tp = await fetch('/api/timepoint/' + id).then(r => r.json());
  const diff = await fetch('/api/diff/' + id).then(r => r.json());
  renderDetail(tp, diff);
}

function renderDetail(tp, diff) {
  const el = document.getElementById('detail');
  el.innerHTML = \`
    <div class="detail-title">\${esc(tp.description)}</div>
    <div style="color:var(--dim);font-size:13px;margin-bottom:16px">\${tp.timestamp}<br>ID: \${tp.id}</div>
    <div class="tabs">
      <button class="tab \${tab==='files'?'active':''}" onclick="setTab('files')">Files (\${tp.files.length})</button>
      <button class="tab \${tab==='changes'?'active':''}" onclick="setTab('changes')">Changes (\${diff.added.length + diff.modified.length + diff.deleted.length})</button>
      <button class="tab \${tab==='conv'?'active':''}" onclick="setTab('conv')">Conversation</button>
    </div>
    <div id="tab-content"></div>
    <div class="actions">
      <button class="btn btn-danger" onclick="restore('\${tp.id}')">Restore to here</button>
    </div>
  \`;
  window._tp = tp; window._diff = diff;
  renderTab();
}

function setTab(t) { tab = t; renderTab(); document.querySelectorAll('.tab').forEach(el => el.classList.toggle('active', el.textContent.toLowerCase().startsWith(t))); }

async function renderTab() {
  const el = document.getElementById('tab-content');
  if (tab === 'files') {
    el.innerHTML = '<div class="file-list">' + window._tp.files.map(f => \`<div class="file">\${esc(f.path)}</div>\`).join('') + '</div>';
  } else if (tab === 'changes') {
    const d = window._diff;
    el.innerHTML = '<div class="file-list">' +
      d.added.map(f => \`<div class="file file-add">+ \${esc(f)}</div>\`).join('') +
      d.modified.map(f => \`<div class="file file-mod">~ \${esc(f)}</div>\`).join('') +
      d.deleted.map(f => \`<div class="file file-del">- \${esc(f)}</div>\`).join('') +
      '</div>';
  } else {
    const convs = await fetch('/api/conversations').then(r => r.json());
    const until = new Date(window._tp.timestamp);
    const filtered = convs.filter(c => new Date(c.timestamp) <= until);
    el.innerHTML = filtered.length ? filtered.slice(-20).map(c => \`
      <div class="conv conv-\${c.role}">
        <div class="conv-role">\${c.role}</div>
        \${esc(c.content)}
      </div>
    \`).join('') : '<div class="empty">No conversation</div>';
  }
}

async function checkpoint() {
  const desc = prompt('Checkpoint description:', 'Manual checkpoint');
  if (!desc) return;
  await fetch('/api/checkpoint', { method: 'POST', body: JSON.stringify({ description: desc }) });
  load();
}

async function restore(id) {
  if (!confirm('Restore to this timepoint? Current state will be backed up first.')) return;
  const r = await fetch('/api/restore/' + id, { method: 'POST' }).then(r => r.json());
  alert(\`Restored! Files: \${r.filesRestored}, Deleted: \${r.filesDeleted}\`);
  load();
}

function formatDate(d) { return new Date(d).toLocaleString(); }
function timeAgo(d) { const s = Math.floor((Date.now() - new Date(d)) / 1000); if (s < 60) return s + 's ago'; if (s < 3600) return Math.floor(s/60) + 'm ago'; if (s < 86400) return Math.floor(s/3600) + 'h ago'; return Math.floor(s/86400) + 'd ago'; }
function formatSize(b) { if (b < 1024) return b + ' B'; if (b < 1048576) return (b/1024).toFixed(1) + ' KB'; return (b/1048576).toFixed(2) + ' MB'; }
function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

load();
</script>
</body>
</html>`);
  }
}
