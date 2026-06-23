import * as http from 'http';
import * as path from 'path';
import * as fs from 'fs';
import * as url from 'url';
import { SessionServer } from './server/index.js';
import { SessionDaemon } from './server/session-daemon.js';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

/**
 * Web UI Server - Serves React app + API + WebSocket
 */
export class WebUIServer {
  private server: SessionServer;
  private httpServer: http.Server | null = null;
  private wsClients: Set<any> = new Set();
  private staticDir: string;

  constructor() {
    this.server = new SessionServer();
    // Look for built React app - try multiple locations
    const possiblePaths = [
      path.join(__dirname, '..', 'web', 'dist'),  // From lib/
      path.join(__dirname, '..', '..', 'web', 'dist'),  // From src/
      path.join(process.cwd(), 'web', 'dist'),  // From project root
    ];
    this.staticDir = possiblePaths.find(p => fs.existsSync(p)) || possiblePaths[0];
  }

  start(port = 3333, host = 'localhost', open = true) {
    this.httpServer = http.createServer((req, res) => this.handleRequest(req, res));
    
    // WebSocket upgrade
    this.httpServer.on('upgrade', (req, socket, head) => {
      this.handleWebSocket(req, socket);
    });

    this.httpServer.listen(port, host, () => {
      const url = `http://${host}:${port}`;
      console.log(`\nAITimeMachine Web UI: ${url}\n`);
      
      if (open) {
        import('child_process').then(({ exec }) => {
          const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
          exec(`${cmd} ${url}`);
        });
      }
    });
  }

  stop() {
    this.httpServer?.close();
  }

  private broadcast(data: any) {
    const msg = JSON.stringify(data);
    this.wsClients.forEach(client => {
      try { client.write(`data: ${msg}\n\n`); } catch {}
    });
  }

  private handleWebSocket(req: http.IncomingMessage, socket: any) {
    // Simple WebSocket handshake
    const key = req.headers['sec-websocket-key'];
    if (!key) {
      socket.destroy();
      return;
    }

    const acceptKey = require('crypto')
      .createHash('sha1')
      .update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
      .digest('base64');

    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\n' +
      'Upgrade: websocket\r\n' +
      'Connection: Upgrade\r\n' +
      `Sec-WebSocket-Accept: ${acceptKey}\r\n\r\n`
    );

    this.wsClients.add(socket);
    socket.on('close', () => this.wsClients.delete(socket));
    socket.on('error', () => this.wsClients.delete(socket));
  }

  private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse) {
    const parsedUrl = new URL(req.url || '/', `http://${req.headers.host}`);
    const pathname = parsedUrl.pathname;

    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    // API routes
    if (pathname.startsWith('/api/')) {
      return this.handleAPI(req, res, pathname, parsedUrl);
    }

    // Static files (React app)
    return this.serveStatic(req, res, pathname);
  }

  private async handleAPI(req: http.IncomingMessage, res: http.ServerResponse, pathname: string, parsedUrl: URL) {
    res.setHeader('Content-Type', 'application/json');

    try {
      // GET /api/stats
      if (pathname === '/api/stats' && req.method === 'GET') {
        const stats = this.server.getStats();
        res.writeHead(200);
        res.end(JSON.stringify(stats));
        return;
      }

      // GET /api/sessions
      if (pathname === '/api/sessions' && req.method === 'GET') {
        const projectPath = parsedUrl.searchParams.get('project') || undefined;
        const sessionList = this.server.listSessions(projectPath);
        // Load full session data for each
        const sessions = sessionList.map(s => {
          const full = this.server.loadSession(s.id);
          return full || s;
        });
        res.writeHead(200);
        res.end(JSON.stringify(sessions));
        return;
      }

      // GET /api/sessions/:id
      const sessionMatch = pathname.match(/^\/api\/sessions\/([^/]+)$/);
      if (sessionMatch && req.method === 'GET') {
        const session = this.server.loadSession(sessionMatch[1]);
        if (!session) {
          res.writeHead(404);
          res.end(JSON.stringify({ error: 'Session not found' }));
          return;
        }
        res.writeHead(200);
        res.end(JSON.stringify(session));
        return;
      }

      // GET /api/projects
      if (pathname === '/api/projects' && req.method === 'GET') {
        const projects = this.server.getProjects();
        res.writeHead(200);
        res.end(JSON.stringify(projects));
        return;
      }

      // GET /api/search
      if (pathname === '/api/search' && req.method === 'GET') {
        const query = parsedUrl.searchParams.get('q') || '';
        const results = this.server.searchConversations(query);
        // Transform to simpler format
        const formatted = results.map(r => ({
          source: r.project.name,
          timestamp: r.message.timestamp.toISOString(),
          context: r.context,
          projectPath: r.project.path,
        }));
        res.writeHead(200);
        res.end(JSON.stringify(formatted));
        return;
      }

      // GET /api/restore/:id/preview
      const previewMatch = pathname.match(/^\/api\/restore\/([^/]+)\/preview$/);
      if (previewMatch && req.method === 'GET') {
        const session = this.server.loadSession(previewMatch[1]);
        if (!session) {
          res.writeHead(404);
          res.end(JSON.stringify({ error: 'Session not found' }));
          return;
        }
        res.writeHead(200);
        res.end(JSON.stringify({
          filesToRestore: session.stats?.totalFiles || 0,
          filesToDelete: session.stats?.deletedFiles || 0,
          conversationMessages: session.conversation?.length || 0,
        }));
        return;
      }

      // POST /api/restore/:id
      const restoreMatch = pathname.match(/^\/api\/restore\/([^/]+)$/);
      if (restoreMatch && req.method === 'POST') {
        const session = this.server.loadSession(restoreMatch[1]);
        if (!session) {
          res.writeHead(404);
          res.end(JSON.stringify({ error: 'Session not found' }));
          return;
        }
        
        // Perform restore using SessionDaemon
        const daemon = new SessionDaemon();
        const result = daemon.restore(restoreMatch[1]);
        
        this.broadcast({ type: 'restored', sessionId: restoreMatch[1] });
        res.writeHead(200);
        res.end(JSON.stringify(result));
        return;
      }

      // GET /api/blobs/:hash
      const blobMatch = pathname.match(/^\/api\/blobs\/([a-f0-9]+)$/);
      if (blobMatch && req.method === 'GET') {
        const blob = this.server.getBlob(blobMatch[1]);
        if (!blob) {
          res.writeHead(404);
          res.end(JSON.stringify({ error: 'Blob not found' }));
          return;
        }
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.writeHead(200);
        res.end(blob);
        return;
      }

      // GET /api/sessions/:id/files/:path
      const fileMatch = pathname.match(/^\/api\/sessions\/([^/]+)\/files\/(.+)$/);
      if (fileMatch && req.method === 'GET') {
        const session = this.server.loadSession(fileMatch[1]);
        if (!session) {
          res.writeHead(404);
          res.end(JSON.stringify({ error: 'Session not found' }));
          return;
        }
        const filePath = decodeURIComponent(fileMatch[2]);
        const file = session.files?.find(f => f.path === filePath);
        if (!file) {
          res.writeHead(404);
          res.end(JSON.stringify({ error: 'File not found in session' }));
          return;
        }
        const blob = this.server.getBlob(file.hash);
        if (!blob) {
          res.writeHead(404);
          res.end(JSON.stringify({ error: 'File content not found' }));
          return;
        }
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.writeHead(200);
        res.end(blob);
        return;
      }

      // 404 for unknown API routes
      res.writeHead(404);
      res.end(JSON.stringify({ error: 'Not found' }));

    } catch (err) {
      res.writeHead(500);
      res.end(JSON.stringify({ error: (err as Error).message }));
    }
  }

  private serveStatic(req: http.IncomingMessage, res: http.ServerResponse, pathname: string) {
    // Check if React build exists
    const indexPath = path.join(this.staticDir, 'index.html');
    
    if (!fs.existsSync(this.staticDir) || !fs.existsSync(indexPath)) {
      // Serve fallback HTML if React app not built
      return this.serveFallbackHTML(res);
    }

    // Determine file path
    let filePath = path.join(this.staticDir, pathname);
    
    // If path doesn't exist or is directory, serve index.html (SPA routing)
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      filePath = indexPath;
    }

    // Get content type
    const ext = path.extname(filePath).toLowerCase();
    const contentTypes: Record<string, string> = {
      '.html': 'text/html',
      '.js': 'application/javascript',
      '.css': 'text/css',
      '.json': 'application/json',
      '.png': 'image/png',
      '.svg': 'image/svg+xml',
      '.ico': 'image/x-icon',
    };

    const contentType = contentTypes[ext] || 'application/octet-stream';

    try {
      const content = fs.readFileSync(filePath);
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    } catch {
      res.writeHead(404);
      res.end('Not found');
    }
  }

  private serveFallbackHTML(res: http.ServerResponse) {
    // Minimal fallback UI when React app isn't built
    const html = `<!DOCTYPE html>
<html>
<head>
  <title>AITimeMachine</title>
  <style>
    body { font-family: system-ui; background: #0a0a0f; color: #e0e0e8; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
    .container { text-align: center; padding: 40px; }
    h1 { font-size: 24px; margin-bottom: 16px; }
    p { color: #8888a0; margin-bottom: 24px; }
    code { background: #1a1a25; padding: 12px 20px; border-radius: 8px; display: block; margin: 16px 0; }
    a { color: #6366f1; }
  </style>
</head>
<body>
  <div class="container">
    <h1>⏰ AITimeMachine</h1>
    <p>Web UI needs to be built first.</p>
    <p>Run these commands:</p>
    <code>cd web && npm install && npm run build</code>
    <p>Then restart: <code>aitm ui</code></p>
    <p><a href="/api/stats">API is working →</a></p>
  </div>
</body>
</html>`;
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(html);
  }
}

export function startWebUI(port = 3333, host = 'localhost', open = true) {
  const server = new WebUIServer();
  server.start(port, host, open);
  return server;
}
