import * as http from 'http';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
import { SessionServer } from './server/index.js';
import { FullSync } from './integrations/index.js';
import { GitCollector, EnvironmentCollector, CursorCollector } from './collectors/index.js';

const HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AITimeMachine</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0d1117; color: #c9d1d9; line-height: 1.5; }
    .container { max-width: 1400px; margin: 0 auto; padding: 20px; }
    header { display: flex; justify-content: space-between; align-items: center; padding: 16px 0; border-bottom: 1px solid #30363d; margin-bottom: 20px; }
    h1 { font-size: 20px; font-weight: 600; }
    .header-actions { display: flex; gap: 12px; }
    .stats { display: flex; gap: 16px; font-size: 13px; color: #8b949e; }
    .stat { background: #161b22; padding: 6px 12px; border-radius: 6px; border: 1px solid #30363d; }
    .tabs { display: flex; gap: 8px; margin-bottom: 16px; border-bottom: 1px solid #30363d; padding-bottom: 8px; }
    .tab { padding: 8px 16px; background: transparent; border: none; border-radius: 6px; cursor: pointer; color: #8b949e; font-size: 14px; }
    .tab:hover { background: #161b22; }
    .tab.active { background: #238636; color: #fff; }
    .search { margin-bottom: 16px; }
    .search input { width: 100%; padding: 10px 14px; background: #161b22; border: 1px solid #30363d; border-radius: 6px; color: #c9d1d9; font-size: 14px; }
    .search input:focus { outline: none; border-color: #58a6ff; }
    .grid { display: grid; grid-template-columns: 350px 1fr; gap: 20px; }
    .sidebar { max-height: calc(100vh - 200px); overflow-y: auto; }
    .main { max-height: calc(100vh - 200px); overflow-y: auto; }
    .session-list { display: flex; flex-direction: column; gap: 8px; }
    .session-item { background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 12px; cursor: pointer; transition: all 0.15s; }
    .session-item:hover { border-color: #58a6ff; }
    .session-item.active { border-color: #238636; background: #238636/10; }
    .session-time { font-size: 11px; color: #8b949e; margin-bottom: 4px; }
    .session-desc { font-size: 13px; margin-bottom: 6px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .session-meta { display: flex; gap: 12px; font-size: 11px; color: #8b949e; }
    .detail-panel { background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 20px; }
    .detail-header { margin-bottom: 16px; padding-bottom: 16px; border-bottom: 1px solid #30363d; }
    .detail-title { font-size: 16px; font-weight: 600; margin-bottom: 8px; }
    .detail-meta { font-size: 12px; color: #8b949e; }
    .section { margin-bottom: 20px; }
    .section-title { font-size: 13px; font-weight: 600; margin-bottom: 8px; color: #8b949e; text-transform: uppercase; letter-spacing: 0.5px; }
    .stat-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
    .stat-box { background: #0d1117; padding: 12px; border-radius: 6px; text-align: center; }
    .stat-value { font-size: 20px; font-weight: 600; }
    .stat-label { font-size: 11px; color: #8b949e; }
    .stat-add { color: #3fb950; }
    .stat-mod { color: #d29922; }
    .stat-del { color: #f85149; }
    .file-list { max-height: 200px; overflow-y: auto; font-family: monospace; font-size: 12px; }
    .file-item { padding: 4px 8px; border-radius: 4px; }
    .file-add { color: #3fb950; }
    .file-mod { color: #d29922; }
    .file-del { color: #f85149; }
    .conv-list { max-height: 300px; overflow-y: auto; }
    .msg { padding: 10px 12px; margin-bottom: 8px; border-radius: 8px; font-size: 13px; }
    .msg-user { background: #1f6feb22; border-left: 3px solid #1f6feb; }
    .msg-assistant { background: #23863622; border-left: 3px solid #238636; }
    .msg-role { font-size: 10px; color: #8b949e; margin-bottom: 4px; text-transform: uppercase; }
    .msg-content { white-space: pre-wrap; word-break: break-word; }
    .btn { padding: 8px 16px; border-radius: 6px; border: none; cursor: pointer; font-size: 13px; font-weight: 500; }
    .btn-primary { background: #238636; color: #fff; }
    .btn-primary:hover { background: #2ea043; }
    .btn-danger { background: #da3633; color: #fff; }
    .btn-outline { background: transparent; border: 1px solid #30363d; color: #c9d1d9; }
    .btn-outline:hover { background: #161b22; }
    .actions { display: flex; gap: 8px; margin-top: 16px; }
    .env-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; font-size: 12px; }
    .env-item { background: #0d1117; padding: 8px; border-radius: 4px; }
    .env-label { color: #8b949e; }
    .git-info { background: #0d1117; padding: 12px; border-radius: 6px; font-size: 12px; }
    .git-branch { color: #f0883e; font-weight: 500; }
    .git-commit { color: #8b949e; font-family: monospace; }
    .empty { text-align: center; padding: 40px; color: #8b949e; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 11px; }
    .badge-green { background: #238636; color: #fff; }
    .badge-yellow { background: #9e6a03; color: #fff; }
    .badge-red { background: #da3633; color: #fff; }
    @media (max-width: 900px) { .grid { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>AITimeMachine</h1>
      <div class="stats" id="stats"></div>
    </header>
    
    <div class="tabs">
      <button class="tab active" data-tab="timeline">Timeline</button>
      <button class="tab" data-tab="search">Search</button>
      <button class="tab" data-tab="projects">Projects</button>
    </div>
    
    <div id="timeline-tab">
      <div class="search">
        <input type="text" id="filter" placeholder="Filter sessions...">
      </div>
      <div class="grid">
        <div class="sidebar">
          <div class="session-list" id="session-list"></div>
        </div>
        <div class="main">
          <div class="detail-panel" id="detail-panel">
            <div class="empty">Select a session to view details</div>
          </div>
        </div>
      </div>
    </div>
    
    <div id="search-tab" style="display:none">
      <div class="search">
        <input type="text" id="search-input" placeholder="Search conversations...">
      </div>
      <div id="search-results" class="session-list"></div>
    </div>
    
    <div id="projects-tab" style="display:none">
      <div class="session-list" id="projects-list"></div>
    </div>
  </div>
  
  <script>
    let sessions = [];
    let selectedSession = null;
    
    async function load() {
      const [statsRes, sessionsRes, projectsRes] = await Promise.all([
        fetch('/api/stats'),
        fetch('/api/sessions'),
        fetch('/api/projects')
      ]);
      
      const stats = await statsRes.json();
      document.getElementById('stats').innerHTML = 
        '<div class="stat">' + stats.sessions + ' sessions</div>' +
        '<div class="stat">' + stats.projects + ' projects</div>' +
        '<div class="stat">' + formatSize(stats.totalSize) + '</div>';
      
      sessions = await sessionsRes.json();
      renderSessions(sessions);
      
      const projects = await projectsRes.json();
      renderProjects(projects);
    }
    
    function renderSessions(list) {
      const html = list.slice(0, 100).map(s => 
        '<div class="session-item" data-id="' + s.id + '">' +
          '<div class="session-time">' + formatDate(s.createdAt) + '</div>' +
          '<div class="session-desc">' + escapeHtml(s.description || 'No description') + '</div>' +
          '<div class="session-meta">' +
            '<span>' + (s.fileCount || 0) + ' files</span>' +
            '<span>' + (s.messageCount || 0) + ' messages</span>' +
          '</div>' +
        '</div>'
      ).join('');
      document.getElementById('session-list').innerHTML = html || '<div class="empty">No sessions</div>';
      
      document.querySelectorAll('.session-item').forEach(el => {
        el.onclick = () => selectSession(el.dataset.id);
      });
    }
    
    function renderProjects(list) {
      const html = list.map(p =>
        '<div class="session-item">' +
          '<div class="session-desc">' + escapeHtml(p.name) + '</div>' +
          '<div class="session-time">' + escapeHtml(p.path) + '</div>' +
          '<div class="session-meta">' +
            '<span>' + p.sessionCount + ' sessions</span>' +
            '<span>' + formatSize(p.totalSize) + '</span>' +
          '</div>' +
        '</div>'
      ).join('');
      document.getElementById('projects-list').innerHTML = html || '<div class="empty">No projects</div>';
    }
    
    async function selectSession(id) {
      document.querySelectorAll('.session-item').forEach(el => el.classList.remove('active'));
      document.querySelector('[data-id="' + id + '"]')?.classList.add('active');
      
      const res = await fetch('/api/sessions/' + id);
      const session = await res.json();
      selectedSession = session;
      
      let html = '<div class="detail-header">' +
        '<div class="detail-title">' + escapeHtml(session.trigger?.description || 'Session') + '</div>' +
        '<div class="detail-meta">' + formatDate(session.createdAt) + '</div>' +
        '</div>';
      
      // Stats
      html += '<div class="section"><div class="section-title">Stats</div>' +
        '<div class="stat-grid">' +
          '<div class="stat-box"><div class="stat-value">' + session.stats.totalFiles + '</div><div class="stat-label">Files</div></div>' +
          '<div class="stat-box"><div class="stat-value stat-add">+' + session.stats.addedFiles + '</div><div class="stat-label">Added</div></div>' +
          '<div class="stat-box"><div class="stat-value stat-mod">~' + session.stats.modifiedFiles + '</div><div class="stat-label">Modified</div></div>' +
          '<div class="stat-box"><div class="stat-value stat-del">-' + session.stats.deletedFiles + '</div><div class="stat-label">Deleted</div></div>' +
        '</div></div>';
      
      // Git
      if (session.git) {
        html += '<div class="section"><div class="section-title">Git</div>' +
          '<div class="git-info">' +
            '<span class="git-branch">' + (session.git.branch || 'unknown') + '</span> ' +
            '<span class="git-commit">' + (session.git.commit?.slice(0, 8) || '') + '</span>' +
            (session.git.uncommittedChanges ? ' <span class="badge badge-yellow">uncommitted</span>' : '') +
          '</div></div>';
      }
      
      // Environment
      if (session.environment) {
        const rt = session.environment.runtimes || {};
        html += '<div class="section"><div class="section-title">Environment</div>' +
          '<div class="env-grid">';
        if (rt.node) html += '<div class="env-item"><span class="env-label">Node:</span> ' + rt.node + '</div>';
        if (rt.python) html += '<div class="env-item"><span class="env-label">Python:</span> ' + rt.python + '</div>';
        if (rt.rust) html += '<div class="env-item"><span class="env-label">Rust:</span> ' + rt.rust + '</div>';
        if (session.environment.packageManager) {
          html += '<div class="env-item"><span class="env-label">PM:</span> ' + session.environment.packageManager.name + '</div>';
        }
        html += '</div></div>';
      }
      
      // Changes
      if (session.diffs && session.diffs.length > 0) {
        html += '<div class="section"><div class="section-title">Changes (' + session.diffs.length + ')</div>' +
          '<div class="file-list">';
        session.diffs.slice(0, 30).forEach(d => {
          const cls = d.type === 'added' ? 'file-add' : d.type === 'deleted' ? 'file-del' : 'file-mod';
          const prefix = d.type === 'added' ? '+' : d.type === 'deleted' ? '-' : '~';
          html += '<div class="file-item ' + cls + '">' + prefix + ' ' + escapeHtml(d.path) + '</div>';
        });
        if (session.diffs.length > 30) html += '<div class="file-item">... and ' + (session.diffs.length - 30) + ' more</div>';
        html += '</div></div>';
      }
      
      // Conversation
      if (session.conversation && session.conversation.length > 0) {
        html += '<div class="section"><div class="section-title">Conversation (' + session.conversation.length + ')</div>' +
          '<div class="conv-list">';
        session.conversation.slice(-10).forEach(m => {
          const cls = m.role === 'user' ? 'msg-user' : 'msg-assistant';
          const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
          html += '<div class="msg ' + cls + '">' +
            '<div class="msg-role">' + m.role + '</div>' +
            '<div class="msg-content">' + escapeHtml(content.slice(0, 300)) + (content.length > 300 ? '...' : '') + '</div>' +
            '</div>';
        });
        html += '</div></div>';
      }
      
      // Actions
      html += '<div class="actions">' +
        '<button class="btn btn-primary" onclick="restoreSession()">Restore to this point</button>' +
        '<button class="btn btn-outline" onclick="previewRestore()">Preview changes</button>' +
        '</div>';
      
      document.getElementById('detail-panel').innerHTML = html;
    }
    
    async function restoreSession() {
      if (!selectedSession) return;
      if (!confirm('Restore to this session? Current files will be overwritten.')) return;
      
      const res = await fetch('/api/restore/' + selectedSession.id, { method: 'POST' });
      const result = await res.json();
      alert('Restored! ' + result.filesRestored + ' files restored, ' + result.filesDeleted + ' deleted');
    }
    
    function previewRestore() {
      if (!selectedSession) return;
      alert('Preview: ' + selectedSession.stats.totalFiles + ' files will be restored, ' + 
            selectedSession.stats.addedFiles + ' files will be deleted');
    }
    
    // Tabs
    document.querySelectorAll('.tab').forEach(tab => {
      tab.onclick = () => {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        const tabName = tab.dataset.tab;
        document.getElementById('timeline-tab').style.display = tabName === 'timeline' ? 'block' : 'none';
        document.getElementById('search-tab').style.display = tabName === 'search' ? 'block' : 'none';
        document.getElementById('projects-tab').style.display = tabName === 'projects' ? 'block' : 'none';
      };
    });
    
    // Filter
    document.getElementById('filter').oninput = (e) => {
      const q = e.target.value.toLowerCase();
      const filtered = sessions.filter(s => (s.description || '').toLowerCase().includes(q));
      renderSessions(filtered);
    };
    
    // Search
    let searchTimeout;
    document.getElementById('search-input').oninput = async (e) => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(async () => {
        const q = e.target.value;
        if (q.length < 2) { document.getElementById('search-results').innerHTML = ''; return; }
        const res = await fetch('/api/search?q=' + encodeURIComponent(q));
        const results = await res.json();
        document.getElementById('search-results').innerHTML = results.slice(0, 30).map(r =>
          '<div class="session-item">' +
            '<div class="session-time">' + formatDate(r.timestamp) + ' [' + r.source + ']</div>' +
            '<div class="session-desc">' + escapeHtml(r.context.slice(0, 150)) + '</div>' +
          '</div>'
        ).join('') || '<div class="empty">No results</div>';
      }, 300);
    };
    
    function formatDate(d) { return new Date(d).toLocaleString(); }
    function formatSize(b) { return b < 1024 ? b + ' B' : b < 1048576 ? (b/1024).toFixed(1) + ' KB' : (b/1048576).toFixed(1) + ' MB'; }
    function escapeHtml(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
    
    // WebSocket for real-time updates
    function connectWS() {
      const ws = new WebSocket('ws://' + location.host);
      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          if (msg.type === 'session_added') {
            load(); // Reload sessions
          }
        } catch {}
      };
      ws.onclose = () => setTimeout(connectWS, 3000);
      ws.onerror = () => ws.close();
    }
    connectWS();
    
    load();
  </script>
</body>
</html>`;

export function startWebUI(projectPath: string, port = 3333) {
  const server = new SessionServer();
  const sync = new FullSync(projectPath);
  
  const httpServer = http.createServer(async (req, res) => {
    const url = new URL(req.url || '/', 'http://localhost');
    
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST');
    
    if (url.pathname === '/') {
      res.setHeader('Content-Type', 'text/html');
      res.end(HTML);
      return;
    }
    
    res.setHeader('Content-Type', 'application/json');
    
    try {
      if (url.pathname === '/api/stats') {
        res.end(JSON.stringify(server.getStats()));
        return;
      }
      
      if (url.pathname === '/api/sessions') {
        const sessions = server.listSessions(projectPath);
        const enriched = sessions.map(s => {
          const full = server.loadSession(s.id);
          return { ...s, fileCount: full?.files.length || 0, messageCount: full?.conversation.length || 0 };
        });
        res.end(JSON.stringify(enriched));
        return;
      }
      
      if (url.pathname.startsWith('/api/sessions/')) {
        const id = url.pathname.split('/')[3];
        const session = server.loadSession(id);
        res.end(JSON.stringify(session || { error: 'Not found' }));
        return;
      }
      
      if (url.pathname === '/api/projects') {
        res.end(JSON.stringify(server.getProjects()));
        return;
      }
      
      if (url.pathname === '/api/search') {
        const q = url.searchParams.get('q') || '';
        const results = await sync.searchAll(q);
        res.end(JSON.stringify(results.slice(0, 50)));
        return;
      }
      
      if (url.pathname.startsWith('/api/restore/') && req.method === 'POST') {
        const id = url.pathname.split('/')[3];
        const session = server.loadSession(id);
        if (!session) {
          res.writeHead(404);
          res.end(JSON.stringify({ error: 'Not found' }));
          return;
        }
        
        let filesRestored = 0, filesDeleted = 0;
        
        // Get current files
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
        
        // Delete files not in session
        for (const filePath of currentFiles) {
          if (!sessionFiles.has(filePath)) {
            try { fs.unlinkSync(path.join(projectPath, filePath)); filesDeleted++; } catch {}
          }
        }
        
        // Restore files
        for (const file of session.files) {
          const content = server.getBlob(file.hash);
          if (!content) continue;
          const fullPath = path.join(projectPath, file.path);
          const dir = path.dirname(fullPath);
          if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
          fs.writeFileSync(fullPath, content);
          filesRestored++;
        }
        
        res.end(JSON.stringify({ filesRestored, filesDeleted }));
        return;
      }
      
      res.writeHead(404);
      res.end(JSON.stringify({ error: 'Not found' }));
    } catch (err) {
      res.writeHead(500);
      res.end(JSON.stringify({ error: (err as Error).message }));
    }
  });
  
  httpServer.listen(port, () => {
    console.log(`\nAITimeMachine Web UI: http://localhost:${port}\n`);
  });
  
  // WebSocket support for real-time updates
  const wsClients = new Set<any>();
  
  httpServer.on('upgrade', (req, socket, head) => {
    if (req.headers['upgrade'] !== 'websocket') {
      socket.destroy();
      return;
    }
    
    const key = req.headers['sec-websocket-key'];
    const accept = crypto.createHash('sha1')
      .update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
      .digest('base64');
    
    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\n' +
      'Upgrade: websocket\r\n' +
      'Connection: Upgrade\r\n' +
      `Sec-WebSocket-Accept: ${accept}\r\n\r\n`
    );
    
    wsClients.add(socket);
    socket.on('close', () => wsClients.delete(socket));
    socket.on('error', () => wsClients.delete(socket));
  });
  
  // Watch for new sessions and broadcast
  const sessionsDir = path.join(process.env.HOME || '', '.aitimemachine-server', 'sessions');
  if (fs.existsSync(sessionsDir)) {
    fs.watch(sessionsDir, { persistent: false }, (event, filename) => {
      if (event === 'rename' && filename?.endsWith('.json')) {
        const msg = JSON.stringify({ type: 'session_added', id: filename.replace('.json', '') });
        const frame = Buffer.alloc(2 + msg.length);
        frame[0] = 0x81;
        frame[1] = msg.length;
        Buffer.from(msg).copy(frame, 2);
        wsClients.forEach(s => { try { s.write(frame); } catch {} });
      }
    });
  }
  
  return httpServer;
}
