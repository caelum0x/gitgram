import express, { type Request, type Response, type NextFunction } from 'express';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import { TimeMachineEngine } from './core/engine.js';
import { SelectiveRestore } from './core/selective-restore.js';
import { FileComparator } from './core/file-comparator.js';
import { TimelineIndex, type TimelineQuery } from './core/timeline-index.js';
import { SearchEngine, type SearchQuery } from './core/search-engine.js';
import { FileHistoryTracker } from './core/file-history-tracker.js';
import { EventStore } from './core/event-store.js';
import { AdvancedDiffEngine, DiffAlgorithm } from './core/diff-engine-v2.js';
import { ThreeWayMerge, ConflictResolver } from './core/three-way-merge.js';
import { CheckpointGraph } from './core/checkpoint-graph.js';
import { TimelineVisualizer } from './core/timeline-visualizer.js';
import { HybridStore, initializeNeonStore, getNeonStore, closeNeonStore } from './cloud/index.js';
import { FileWatcher } from './core/file-watcher.js';
import type { FileEntry } from './core/types.js';
import { requireAuth, optionalAuth, rateLimit, AuthService, auditMiddleware, validateBody } from './auth/index.js';
import { loadConsent, saveConsent, assertConsent, ConsentError } from './auth/consent-policy.js';
import { readRetentionSlaMetrics, readRetentionAlerts } from './core/retention-sla.js';
import { assessLicenseCompliance } from './compliance/license-policy.js';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

const authService = new AuthService();

const app = express();
const httpServer = createServer(app);
const io = new SocketIOServer(httpServer, {
  cors: { origin: '*' }
});

app.use(helmet());
app.use(cors());
app.use(express.json());

const projectPath = process.cwd();
const engine = new TimeMachineEngine(projectPath);
const eventStore = new EventStore(projectPath);
eventStore.load();
const timeline = new TimelineIndex(engine);
const searchEngine = new SearchEngine(eventStore, timeline);

// File watcher for real-time updates
const fileWatcher = new FileWatcher(projectPath);
fileWatcher.on('change', (change) => {
  io.to('files').emit('file:change', change);
});

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function toSearchType(type: unknown): SearchQuery['type'] {
  if (type === 'conversation' || type === 'files' || type === 'checkpoints' || type === 'all') {
    return type;
  }
  return 'all';
}

function toSortBy(value: unknown): TimelineQuery['sortBy'] {
  return value === 'changes' || value === 'files' || value === 'timestamp' ? value : 'timestamp';
}

function toSortOrder(value: unknown): TimelineQuery['sortOrder'] {
  return value === 'asc' || value === 'desc' ? value : 'desc';
}

function handleApiError(res: Response, error: unknown) {
  if (error instanceof ConsentError) {
    return res.status(error.status || 403).json({
      error: error.message,
      code: error.code || 'CONSENT_REQUIRED',
      details: error.details || {},
    });
  }
  return res.status(500).json({ error: errorMessage(error) });
}

// Root route
app.get('/', (req: Request, res: Response) => {
  res.json({
    name: 'Gitgram TimeMachine API',
    version: '2.1.0',
    endpoints: {
      health: 'GET /health',
      checkpoints: {
        list: 'GET /api/checkpoints',
        get: 'GET /api/checkpoints/:id',
        create: 'POST /api/checkpoints',
        files: 'GET /api/checkpoints/:id/files'
      },
      restore: {
        full: 'POST /api/restore',
        selective: 'POST /api/restore/files'
      },
      diff: {
        basic: 'GET /api/diff/:from/:to',
        advanced: 'GET /api/diff/advanced'
      },
      merge: {
        threeWay: 'POST /api/merge',
        resolve: 'POST /api/resolve'
      },
      search: 'GET /api/search',
      fileHistory: 'GET /api/files/history',
      timeline: {
        query: 'GET /api/timeline',
        visualization: 'GET /api/timeline/3d'
      },
      cloud: {
        connect: 'POST /api/cloud/connect',
        disconnect: 'POST /api/cloud/disconnect',
        sync: 'POST /api/cloud/sync',
        status: 'GET /api/cloud/status',
        stats: 'GET /api/cloud/stats',
        projects: 'GET /api/cloud/projects',
        search: 'GET /api/cloud/search',
        branch: 'POST /api/cloud/branch',
        timeline: 'GET /api/cloud/timeline',
        messages: {
          list: 'GET /api/cloud/messages',
          create: 'POST /api/cloud/messages'
        },
        sessions: {
          start: 'POST /api/cloud/sessions',
          end: 'PATCH /api/cloud/sessions/:sessionId'
        },
        events: {
          list: 'GET /api/cloud/events',
          create: 'POST /api/cloud/events'
        },
        changes: 'GET /api/cloud/changes'
      }
    },
    websocket: {
      url: `ws://localhost:${process.env.PORT || 3001}`,
      events: [
        'subscribe:checkpoints',
        'subscribe:cloud',
        'checkpoint:created',
        'cloud:message',
        'cloud:event'
      ]
    }
  });
});

// Health check
app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ═══════════════════════════════════════════════════════════════════════════════
// INTERNAL API KEY MANAGEMENT (called by website)
// ═══════════════════════════════════════════════════════════════════════════════

import { storeKeyFromWebsite, listUserKeys, revokeKey as revokeApiKey } from './auth/api-keys.js';

const INTERNAL_SECRET = process.env.INTERNAL_SECRET;

function requireInternal(req: Request, res: Response, next: NextFunction) {
  if (!INTERNAL_SECRET) {
    return res.status(503).json({ error: 'Internal API unavailable: INTERNAL_SECRET is not configured' });
  }
  if (req.headers['x-internal-secret'] !== INTERNAL_SECRET) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  next();
}

// Store key created by website
app.post('/api/internal/keys', requireInternal, (req: Request, res: Response) => {
  const { id, userId, keyHash, keyPrefix, name } = req.body;
  storeKeyFromWebsite({ id, userId, keyHash, keyPrefix, name });
  res.json({ success: true });
});

// List user's keys
app.get('/api/internal/keys', requireInternal, (req: Request, res: Response) => {
  const userId = req.query.userId as string;
  if (!userId) return res.status(400).json({ error: 'userId required' });
  const keys = listUserKeys(userId);
  res.json(keys);
});

// Revoke key
app.delete('/api/internal/keys/:id', requireInternal, (req: Request, res: Response) => {
  const userId = req.headers['x-user-id'] as string;
  const success = revokeApiKey(req.params.id, userId);
  if (success) {
    res.json({ success: true });
  } else {
    res.status(404).json({ error: 'Key not found' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// AUTH ROUTES (public)
// ═══════════════════════════════════════════════════════════════════════════════

app.post('/api/auth/register', rateLimit(10, 60000), validateBody({ email: 'email', password: 'string' }), auditMiddleware('auth.register'), (req: Request, res: Response) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }
  const result = authService.register(email, password);
  if (result.success) {
    res.json({ user: result.user, token: result.token });
  } else {
    res.status(400).json({ error: result.error });
  }
});

app.post('/api/auth/login', rateLimit(20, 60000), validateBody({ email: 'email', password: 'string' }), auditMiddleware('auth.login'), (req: Request, res: Response) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }
  const result = authService.login(email, password);
  if (result.success) {
    res.json({ user: result.user, token: result.token });
  } else {
    res.status(401).json({ error: result.error });
  }
});

app.get('/api/auth/verify', requireAuth, (req: Request, res: Response) => {
  res.json({ user: req.user });
});

app.get('/api/auth/me', requireAuth, (req: Request, res: Response) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  const user = authService.getUser(req.user.userId);
  if (user) {
    res.json(user);
  } else {
    res.status(404).json({ error: 'User not found' });
  }
});

app.post('/api/auth/api-key/regenerate', requireAuth, (req: Request, res: Response) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  const newKey = authService.regenerateApiKey(req.user.userId);
  if (newKey) {
    res.json({ apiKey: newKey });
  } else {
    res.status(500).json({ error: 'Failed to regenerate key' });
  }
});

// Consent policy (org/project scoped)
app.get('/api/consent', requireAuth, (req: Request, res: Response) => {
  try {
    const targetProjectPath = (req.query.projectPath as string) || process.cwd();
    const consent = loadConsent(targetProjectPath);
    res.json({
      projectPath: targetProjectPath,
      consent,
    });
  } catch (error: unknown) {
    handleApiError(res, error);
  }
});

app.post('/api/consent', requireAuth, (req: Request, res: Response) => {
  try {
    const targetProjectPath = (req.body.projectPath as string) || process.cwd();
    const policy = req.body.policy || {};
    const updated = saveConsent(targetProjectPath, {
      orgId: req.body.orgId,
      projectId: req.body.projectId,
      policy: {
        operational_capture: policy.operational_capture,
        training_export: policy.training_export,
      },
    });
    res.json({
      success: true,
      projectPath: targetProjectPath,
      consent: updated,
    });
  } catch (error: unknown) {
    handleApiError(res, error);
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// PROTECTED ROUTES (require auth)
// ═══════════════════════════════════════════════════════════════════════════════

// Apply auth middleware to all /api/* routes except auth routes
app.use('/api/checkpoints', requireAuth);
app.use('/api/restore', requireAuth);
app.use('/api/diff', requireAuth);
app.use('/api/search', requireAuth);
app.use('/api/timeline', requireAuth);
app.use('/api/cloud', requireAuth);
app.use('/api/retention', requireAuth);
app.use('/api/compliance', requireAuth);

// List checkpoints
app.get('/api/checkpoints', (req: Request, res: Response) => {
  try {
    const { startDate, endDate, filePath, limit = 100, offset = 0 } = req.query;
    
    const query: TimelineQuery = {
      limit: parseInt(limit as string),
      offset: parseInt(offset as string)
    };
    
    if (startDate) query.startDate = new Date(startDate as string);
    if (endDate) query.endDate = new Date(endDate as string);
    if (filePath) query.filePath = filePath as string;
    
    const results = timeline.query(query);
    res.json({ checkpoints: results, total: results.length });
  } catch (error: unknown) {
    handleApiError(res, error);
  }
});

// Get checkpoint details
app.get('/api/checkpoints/:id', (req: Request, res: Response) => {
  try {
    const checkpoint = engine.getTimePoint(req.params.id);
    if (!checkpoint) {
      return res.status(404).json({ error: 'Checkpoint not found' });
    }
    res.json(checkpoint);
  } catch (error: unknown) {
    handleApiError(res, error);
  }
});

// Get file at checkpoint
app.get('/api/checkpoints/:id/files', (req: Request, res: Response) => {
  try {
    const { path: filePath } = req.query;
    if (!filePath) {
      // List files
      const checkpoint = engine.getTimePoint(req.params.id);
      if (!checkpoint) {
        return res.status(404).json({ error: 'Checkpoint not found' });
      }
      const files = checkpoint.files.map((f: FileEntry) => ({
        path: f.path,
        hash: f.hash,
        size: f.size
      }));
      return res.json({ files });
    }
    
    // Get specific file
    const content = engine.getFileContent(req.params.id, filePath as string);
    if (!content) {
      return res.status(404).json({ error: 'File not found' });
    }
    res.type('text/plain').send(content);
  } catch (error: unknown) {
    handleApiError(res, error);
  }
});

// Create checkpoint
app.post('/api/checkpoints', requireAuth, (req: Request, res: Response) => {
  try {
    const { description, metadata } = req.body;
    const checkpoint = engine.capture(description, metadata);
    
    // Notify WebSocket clients
    io.emit('checkpoint:created', checkpoint);
    
    res.status(201).json(checkpoint);
  } catch (error: unknown) {
    handleApiError(res, error);
  }
});

// Restore checkpoint
app.post('/api/restore', (req: Request, res: Response) => {
  try {
    const { checkpointId } = req.body;
    engine.restore(checkpointId);
    res.json({ success: true, checkpointId });
  } catch (error: unknown) {
    handleApiError(res, error);
  }
});

// ============================================================================
// Git-Enhanced Endpoints
// ============================================================================

// Advanced diff with algorithm selection
app.get('/api/diff/advanced', (req: Request, res: Response) => {
  try {
    const { from, to, filePath, algorithm = 'histogram', context = 3 } = req.query;
    
    if (!from || !filePath) {
      return res.status(400).json({ error: 'from and filePath parameters required' });
    }
    
    // Get content from checkpoints
    const contentA = engine.getFileContent(from as string, filePath as string) || '';
    const contentB = to 
      ? (engine.getFileContent(to as string, filePath as string) || '')
      : (() => {
          const fs = require('fs');
          try { return fs.readFileSync(path.join(projectPath, filePath as string), 'utf8'); }
          catch { return ''; }
        })();
    
    const diffEngine = new AdvancedDiffEngine();
    const diff = diffEngine.diff(contentA, contentB, { 
      algorithm: algorithm as DiffAlgorithm, 
      context: parseInt(context as string)
    });
    
    res.json({
      algorithm,
      filePath,
      stats: { added: diff.added, removed: diff.removed },
      hunks: diff.hunks,
      unified: diffEngine.formatUnified(diff, `a/${filePath}`, `b/${filePath}`)
    });
  } catch (error: unknown) {
    handleApiError(res, error);
  }
});

// Three-way merge
app.post('/api/merge', requireAuth, (req: Request, res: Response) => {
  try {
    const { baseCheckpoint, oursCheckpoint, theirsCheckpoint, filePath, strategy = 'ort', conflictStyle = 'diff3', apply = false } = req.body;
    
    if (!filePath) {
      return res.status(400).json({ error: 'filePath required' });
    }
    
    // Get contents
    const baseContent = baseCheckpoint 
      ? (engine.getFileContent(baseCheckpoint, filePath) || '')
      : '';
    
    const oursContent = oursCheckpoint
      ? (engine.getFileContent(oursCheckpoint, filePath) || '')
      : (() => {
          const fs = require('fs');
          try { return fs.readFileSync(path.join(projectPath, filePath), 'utf8'); }
          catch { return ''; }
        })();
    
    const theirsContent = theirsCheckpoint
      ? (engine.getFileContent(theirsCheckpoint, filePath) || '')
      : '';
    
    const merger = new ThreeWayMerge({ strategy, conflictStyle });
    const result = merger.merge({ base: baseContent, ours: oursContent, theirs: theirsContent });
    
    // Apply if requested and no conflicts
    if (apply && !result.hasConflicts) {
      const fs = require('fs');
      fs.writeFileSync(path.join(projectPath, filePath), result.merged);
    }
    
    res.json({
      filePath,
      strategy,
      conflictStyle,
      hasConflicts: result.hasConflicts,
      stats: result.stats,
      conflicts: result.conflicts.map(c => ({
        line: c.startLine + 1,
        type: c.type,
        oursLines: c.ours.length,
        theirsLines: c.theirs.length,
        autoResolvable: c.autoResolvable
      })),
      merged: result.merged,
      applied: apply && !result.hasConflicts
    });
  } catch (error: unknown) {
    handleApiError(res, error);
  }
});

// Resolve conflicts
app.post('/api/resolve', requireAuth, (req: Request, res: Response) => {
  try {
    const { content, resolution, conflictIndex, manualContent } = req.body;
    
    if (!content || !resolution) {
      return res.status(400).json({ error: 'content and resolution required' });
    }
    
    if (!ConflictResolver.hasConflicts(content)) {
      return res.json({ hasConflicts: false, resolved: content });
    }
    
    let resolved: string;
    if (conflictIndex !== undefined) {
      resolved = ConflictResolver.resolveConflict(content, conflictIndex, resolution, manualContent);
    } else if (resolution === 'ours' || resolution === 'theirs') {
      resolved = ConflictResolver.resolveAll(content, resolution);
    } else {
      return res.status(400).json({ error: 'conflictIndex required for both/manual resolution' });
    }
    
    const remaining = ConflictResolver.countConflicts(resolved);
    
    res.json({
      hasConflicts: remaining > 0,
      conflictsResolved: ConflictResolver.countConflicts(content) - remaining,
      conflictsRemaining: remaining,
      resolved
    });
  } catch (error: unknown) {
    handleApiError(res, error);
  }
});

// 3D Timeline data
app.get('/api/timeline/3d', async (req: Request, res: Response) => {
  try {
    const { limit = 50 } = req.query;
    
    const checkpoints = engine.listTimePoints().slice(0, parseInt(limit as string));
    const graph = new CheckpointGraph(path.join(projectPath, '.aitimemachine'));
    
    await graph.build(checkpoints.map(cp => ({
      id: cp.id,
      timestamp: cp.timestamp,
      description: cp.description,
      files: [],
      stats: { totalFiles: cp.stats.totalFiles, totalSize: 0 }
    })));
    
    const visualizer = new TimelineVisualizer(graph);
    const threeData = visualizer.toThreeJS({ limit: parseInt(limit as string) });
    
    res.json(threeData);
  } catch (error: unknown) {
    handleApiError(res, error);
  }
});

// ============================================================================
// Cloud/Neon Endpoints
// ============================================================================

// Cloud config helpers
const CLOUD_CONFIG_PATH = path.join(os.homedir(), '.aitimemachine', 'cloud-config.json');

function loadCloudConfig(): { neonConnectionString?: string; syncEnabled?: boolean } {
  try {
    if (fs.existsSync(CLOUD_CONFIG_PATH)) {
      return JSON.parse(fs.readFileSync(CLOUD_CONFIG_PATH, 'utf-8'));
    }
  } catch {}
  return {};
}

function saveCloudConfig(config: { neonConnectionString?: string; syncEnabled?: boolean }): void {
  const dir = path.dirname(CLOUD_CONFIG_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(CLOUD_CONFIG_PATH, JSON.stringify(config, null, 2));
}

// Connect to Neon cloud
app.post('/api/cloud/connect', async (req: Request, res: Response) => {
  try {
    const { connectionString } = req.body;
    if (!connectionString) {
      return res.status(400).json({ error: 'connectionString is required' });
    }
    
    // Test connection
    const neon = await initializeNeonStore(connectionString);
    
    // Save config
    const config = loadCloudConfig();
    config.neonConnectionString = connectionString;
    config.syncEnabled = true;
    saveCloudConfig(config);
    
    res.json({ success: true, message: 'Connected to Neon' });
  } catch (error: unknown) {
    handleApiError(res, error);
  }
});

// Disconnect from cloud
app.post('/api/cloud/disconnect', async (req: Request, res: Response) => {
  try {
    const config = loadCloudConfig();
    delete config.neonConnectionString;
    config.syncEnabled = false;
    saveCloudConfig(config);
    
    res.json({ success: true, message: 'Disconnected from Neon' });
  } catch (error: unknown) {
    handleApiError(res, error);
  }
});

// Sync with cloud
app.post('/api/cloud/sync', async (req: Request, res: Response) => {
  try {
    assertConsent(projectPath, 'capture', {
      source: 'api.cloud.sync',
      userId: req.user?.userId,
      resource: '/api/cloud/sync',
    });

    const config = loadCloudConfig();
    if (!config.neonConnectionString) {
      return res.status(400).json({ error: 'Not connected to Neon' });
    }
    
    const store = new HybridStore(projectPath, {
      neonConnectionString: config.neonConnectionString
    });
    await store.initialize();
    const result = await store.sync();
    
    res.json({ 
      success: result.success, 
      result 
    });
  } catch (error: unknown) {
    handleApiError(res, error);
  }
});

// Get cloud status
app.get('/api/cloud/status', async (req: Request, res: Response) => {
  try {
    assertConsent(projectPath, 'export_operational', {
      source: 'api.cloud.status',
      userId: req.user?.userId,
      resource: '/api/cloud/status',
    });

    const config = loadCloudConfig();
    
    if (!config.neonConnectionString) {
      return res.json({ 
        connected: false, 
        syncEnabled: false 
      });
    }
    
    const store = new HybridStore(projectPath, {
      neonConnectionString: config.neonConnectionString
    });
    await store.initialize();
    const stats = await store.getStats();
    
    res.json({
      connected: store.isConnected(),
      syncEnabled: config.syncEnabled,
      stats
    });
  } catch (error: unknown) {
    handleApiError(res, error);
  }
});

// Cloud search (full-text search on messages)
app.get('/api/cloud/search', async (req: Request, res: Response) => {
  try {
    assertConsent(projectPath, 'export_operational', {
      source: 'api.cloud.search',
      userId: req.user?.userId,
      resource: '/api/cloud/search',
    });

    const { query, limit = '50' } = req.query;
    if (!query) {
      return res.status(400).json({ error: 'query is required' });
    }
    
    const config = loadCloudConfig();
    if (!config.neonConnectionString) {
      return res.status(400).json({ error: 'Not connected to Neon' });
    }
    
    const store = new HybridStore(projectPath, {
      neonConnectionString: config.neonConnectionString
    });
    await store.initialize();
    const results = await store.searchMessages(query as string, parseInt(limit as string));
    
    res.json({ results });
  } catch (error: unknown) {
    handleApiError(res, error);
  }
});

// Create branch point (for "what if" scenarios)
app.post('/api/cloud/branch', async (req: Request, res: Response) => {
  try {
    assertConsent(projectPath, 'capture', {
      source: 'api.cloud.branch',
      userId: req.user?.userId,
      resource: '/api/cloud/branch',
    });

    const { name, description } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'name is required' });
    }
    
    const config = loadCloudConfig();
    if (!config.neonConnectionString) {
      return res.status(400).json({ error: 'Not connected to Neon' });
    }
    
    const neon = await initializeNeonStore(config.neonConnectionString);
    const project = await neon.getProjectByPath(projectPath);
    
    if (!project) {
      return res.status(400).json({ error: 'Project not found. Run sync first.' });
    }
    
    const branchId = await neon.createBranchPoint(project.id, name, description);
    
    res.json({ 
      success: true, 
      branchId,
      message: 'Branch point created. Use Neon Console to create actual database branch.' 
    });
  } catch (error: unknown) {
    handleApiError(res, error);
  }
});

// Get cloud timeline (unified view of all activity)
app.get('/api/cloud/timeline', async (req: Request, res: Response) => {
  try {
    assertConsent(projectPath, 'export_operational', {
      source: 'api.cloud.timeline',
      userId: req.user?.userId,
      resource: '/api/cloud/timeline',
    });

    const { limit = '100', includeMessages = 'true', includeEvents = 'true', startDate, endDate } = req.query;
    
    const config = loadCloudConfig();
    if (!config.neonConnectionString) {
      return res.status(400).json({ error: 'Not connected to Neon' });
    }
    
    const neon = await initializeNeonStore(config.neonConnectionString);
    const project = await neon.getProjectByPath(projectPath);
    
    if (!project) {
      return res.status(400).json({ error: 'Project not found' });
    }
    
    const timeline = await neon.getTimeline(project.id, {
      limit: parseInt(limit as string),
      includeMessages: includeMessages === 'true',
      includeEvents: includeEvents === 'true',
      startDate: startDate ? new Date(startDate as string) : undefined,
      endDate: endDate ? new Date(endDate as string) : undefined
    });
    
    res.json({ timeline });
  } catch (error: unknown) {
    handleApiError(res, error);
  }
});

// Get cloud storage statistics
app.get('/api/cloud/stats', async (req: Request, res: Response) => {
  try {
    assertConsent(projectPath, 'export_operational', {
      source: 'api.cloud.stats',
      userId: req.user?.userId,
      resource: '/api/cloud/stats',
    });

    const config = loadCloudConfig();
    if (!config.neonConnectionString) {
      return res.status(400).json({ error: 'Not connected to Neon' });
    }
    
    const neon = await initializeNeonStore(config.neonConnectionString);
    const project = await neon.getProjectByPath(projectPath);
    
    if (!project) {
      return res.status(400).json({ error: 'Project not found. Run sync first.' });
    }
    
    const stats = await neon.getStats(project.id);
    
    res.json({
      project: {
        id: project.id,
        name: project.name,
        path: project.path,
        createdAt: project.created_at,
        updatedAt: project.updated_at
      },
      stats: {
        totalTimepoints: stats.totalTimepoints,
        totalMessages: stats.totalMessages,
        totalEvents: stats.totalEvents,
        totalFiles: stats.totalFiles,
        storageSize: stats.storageSize,
        storageSizeFormatted: formatBytes(stats.storageSize),
        firstActivity: stats.firstActivity,
        lastActivity: stats.lastActivity
      }
    });
  } catch (error: unknown) {
    handleApiError(res, error);
  }
});

// Retention/deletion SLA metrics
app.get('/api/retention/sla', (req: Request, res: Response) => {
  try {
    const limit = Math.max(1, Math.min(500, parseInt((req.query.limit as string) || '50', 10)));
    const project = (req.query.projectPath as string) || projectPath;
    const history = readRetentionSlaMetrics(project, limit);
    res.json({ projectPath: project, total: history.length, history });
  } catch (error: unknown) {
    handleApiError(res, error);
  }
});

// Retention/deletion SLA alerts
app.get('/api/retention/alerts', (req: Request, res: Response) => {
  try {
    const limit = Math.max(1, Math.min(500, parseInt((req.query.limit as string) || '100', 10)));
    const project = (req.query.projectPath as string) || projectPath;
    const alerts = readRetentionAlerts(project, limit);
    res.json({ projectPath: project, total: alerts.length, alerts });
  } catch (error: unknown) {
    handleApiError(res, error);
  }
});

// License/compliance guardrail status
app.get('/api/compliance/license', (req: Request, res: Response) => {
  try {
    const project = (req.query.projectPath as string) || projectPath;
    const ingest = assessLicenseCompliance(project, 'repo_ingest');
    const dataset = assessLicenseCompliance(project, 'dataset_export');
    res.json({
      projectPath: project,
      repoIngest: ingest,
      datasetExport: dataset,
    });
  } catch (error: unknown) {
    handleApiError(res, error);
  }
});

// List all cloud projects
app.get('/api/cloud/projects', async (req: Request, res: Response) => {
  try {
    assertConsent(projectPath, 'export_operational', {
      source: 'api.cloud.projects',
      userId: req.user?.userId,
      resource: '/api/cloud/projects',
    });

    const config = loadCloudConfig();
    if (!config.neonConnectionString) {
      return res.status(400).json({ error: 'Not connected to Neon' });
    }
    
    const neon = await initializeNeonStore(config.neonConnectionString);
    const projects = await neon.listProjects();
    
    res.json({ projects });
  } catch (error: unknown) {
    handleApiError(res, error);
  }
});

// Save a message to cloud
app.post('/api/cloud/messages', async (req: Request, res: Response) => {
  try {
    assertConsent(projectPath, 'capture', {
      source: 'api.cloud.messages.create',
      userId: req.user?.userId,
      resource: '/api/cloud/messages',
    });

    const { role, content, sessionId, tool, metadata } = req.body;
    
    if (!role || !content || !sessionId) {
      return res.status(400).json({ error: 'role, content, and sessionId are required' });
    }
    
    if (!['user', 'assistant', 'system'].includes(role)) {
      return res.status(400).json({ error: 'role must be user, assistant, or system' });
    }
    
    const config = loadCloudConfig();
    if (!config.neonConnectionString) {
      return res.status(400).json({ error: 'Not connected to Neon' });
    }
    
    const neon = await initializeNeonStore(config.neonConnectionString);
    const project = await neon.getOrCreateProject(projectPath, path.basename(projectPath));
    
    await neon.saveMessage({
      id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      project_id: project.id,
      session_id: sessionId,
      timestamp: new Date(),
      role,
      content,
      tool,
      metadata
    });
    
    // Notify WebSocket clients
    io.to('cloud').emit('cloud:message', { role, sessionId, timestamp: new Date() });
    
    res.status(201).json({ success: true, message: 'Message saved to cloud' });
  } catch (error: unknown) {
    handleApiError(res, error);
  }
});

// Get messages from cloud
app.get('/api/cloud/messages', async (req: Request, res: Response) => {
  try {
    assertConsent(projectPath, 'export_operational', {
      source: 'api.cloud.messages.list',
      userId: req.user?.userId,
      resource: '/api/cloud/messages',
    });

    const { sessionId, limit = '100' } = req.query;
    
    const config = loadCloudConfig();
    if (!config.neonConnectionString) {
      return res.status(400).json({ error: 'Not connected to Neon' });
    }
    
    const neon = await initializeNeonStore(config.neonConnectionString);
    const project = await neon.getProjectByPath(projectPath);
    
    if (!project) {
      return res.status(400).json({ error: 'Project not found' });
    }
    
    const messages = await neon.getMessages(
      project.id, 
      sessionId as string | undefined, 
      parseInt(limit as string)
    );
    
    res.json({ messages });
  } catch (error: unknown) {
    handleApiError(res, error);
  }
});

// Start a session
app.post('/api/cloud/sessions', async (req: Request, res: Response) => {
  try {
    assertConsent(projectPath, 'capture', {
      source: 'api.cloud.sessions.start',
      userId: req.user?.userId,
      resource: '/api/cloud/sessions',
    });

    const { sessionId, tool } = req.body;
    
    if (!sessionId) {
      return res.status(400).json({ error: 'sessionId is required' });
    }
    
    const config = loadCloudConfig();
    if (!config.neonConnectionString) {
      return res.status(400).json({ error: 'Not connected to Neon' });
    }
    
    const neon = await initializeNeonStore(config.neonConnectionString);
    const project = await neon.getOrCreateProject(projectPath, path.basename(projectPath));
    
    await neon.startSession(project.id, sessionId, tool);
    
    res.status(201).json({ success: true, sessionId });
  } catch (error: unknown) {
    handleApiError(res, error);
  }
});

// End a session
app.patch('/api/cloud/sessions/:sessionId', async (req: Request, res: Response) => {
  try {
    assertConsent(projectPath, 'capture', {
      source: 'api.cloud.sessions.end',
      userId: req.user?.userId,
      resource: '/api/cloud/sessions/:sessionId',
    });

    const { sessionId } = req.params;
    const { summary } = req.body;
    
    const config = loadCloudConfig();
    if (!config.neonConnectionString) {
      return res.status(400).json({ error: 'Not connected to Neon' });
    }
    
    const neon = await initializeNeonStore(config.neonConnectionString);
    await neon.endSession(sessionId, summary);
    
    res.json({ success: true, sessionId });
  } catch (error: unknown) {
    handleApiError(res, error);
  }
});

// Save event to cloud
app.post('/api/cloud/events', async (req: Request, res: Response) => {
  try {
    assertConsent(projectPath, 'capture', {
      source: 'api.cloud.events.create',
      userId: req.user?.userId,
      resource: '/api/cloud/events',
    });

    const { type, data, sessionId, timepointId } = req.body;
    
    if (!type || !sessionId) {
      return res.status(400).json({ error: 'type and sessionId are required' });
    }
    
    const config = loadCloudConfig();
    if (!config.neonConnectionString) {
      return res.status(400).json({ error: 'Not connected to Neon' });
    }
    
    const neon = await initializeNeonStore(config.neonConnectionString);
    const project = await neon.getOrCreateProject(projectPath, path.basename(projectPath));
    
    await neon.appendEvent({
      id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      project_id: project.id,
      session_id: sessionId,
      timestamp: new Date(),
      type,
      data: data || {},
      timepoint_id: timepointId
    });
    
    // Notify WebSocket clients
    io.to('cloud').emit('cloud:event', { type, sessionId, timestamp: new Date() });
    
    res.status(201).json({ success: true });
  } catch (error: unknown) {
    handleApiError(res, error);
  }
});

// Get events from cloud
app.get('/api/cloud/events', async (req: Request, res: Response) => {
  try {
    assertConsent(projectPath, 'export_operational', {
      source: 'api.cloud.events.list',
      userId: req.user?.userId,
      resource: '/api/cloud/events',
    });

    const { sessionId, type, limit = '100', afterTimestamp } = req.query;
    
    const config = loadCloudConfig();
    if (!config.neonConnectionString) {
      return res.status(400).json({ error: 'Not connected to Neon' });
    }
    
    const neon = await initializeNeonStore(config.neonConnectionString);
    const project = await neon.getProjectByPath(projectPath);
    
    if (!project) {
      return res.status(400).json({ error: 'Project not found' });
    }
    
    const events = await neon.getEvents(project.id, {
      sessionId: sessionId as string | undefined,
      type: type as string | undefined,
      limit: parseInt(limit as string),
      afterTimestamp: afterTimestamp ? new Date(afterTimestamp as string) : undefined
    });
    
    res.json({ events });
  } catch (error: unknown) {
    handleApiError(res, error);
  }
});

// Get changes since timestamp (for sync)
app.get('/api/cloud/changes', async (req: Request, res: Response) => {
  try {
    assertConsent(projectPath, 'export_operational', {
      source: 'api.cloud.changes',
      userId: req.user?.userId,
      resource: '/api/cloud/changes',
    });

    const { since } = req.query;
    
    if (!since) {
      return res.status(400).json({ error: 'since timestamp is required' });
    }
    
    const config = loadCloudConfig();
    if (!config.neonConnectionString) {
      return res.status(400).json({ error: 'Not connected to Neon' });
    }
    
    const neon = await initializeNeonStore(config.neonConnectionString);
    const changes = await neon.getChangesSince(new Date(since as string));
    
    res.json({
      since,
      changes: {
        timepoints: changes.timepoints.length,
        events: changes.events.length,
        messages: changes.messages.length
      },
      data: changes
    });
  } catch (error: unknown) {
    handleApiError(res, error);
  }
});

// ============================================================================
// TIME MACHINE EXPERIENCE ENDPOINTS (macOS Time Machine-like)
// ============================================================================

// Quick undo last action
app.post('/api/restore/undo', requireAuth, (req: Request, res: Response) => {
  try {
    const { steps = 1 } = req.body;
    const allTps = engine.listTimePoints();

    if (allTps.length < steps + 1) {
      return res.status(400).json({ 
        error: `Not enough history. Only ${allTps.length - 1} checkpoints available.` 
      });
    }

    const currentTp = allTps[allTps.length - 1];
    const targetTp = allTps[allTps.length - 1 - steps];

    // Create backup before undo
    engine.capture('Before undo', { type: 'restore' });

    // Restore
    const result = engine.restore(targetTp.id);

    res.json({
      success: true,
      stepsUndone: steps,
      from: { id: currentTp.id, description: currentTp.description },
      to: { id: targetTp.id, description: targetTp.description },
      filesRestored: result.filesRestored,
      filesDeleted: result.filesDeleted,
      messagesRemoved: result.messagesRemoved
    });
  } catch (error: unknown) {
    handleApiError(res, error);
  }
});

// Restore to specific time
app.post('/api/restore/to-time', requireAuth, (req: Request, res: Response) => {
  try {
    const { minutesAgo, hoursAgo, searchQuery, checkpointId } = req.body;

    const allTps = engine.listTimePoints();
    let targetTp;

    if (checkpointId) {
      targetTp = allTps.find(t => t.id === checkpointId || t.id.startsWith(checkpointId));
    } else if (searchQuery) {
      const queryLower = searchQuery.toLowerCase();
      targetTp = allTps.find(t => t.description.toLowerCase().includes(queryLower));
    } else if (minutesAgo || hoursAgo) {
      const targetTime = new Date();
      if (minutesAgo) targetTime.setMinutes(targetTime.getMinutes() - minutesAgo);
      if (hoursAgo) targetTime.setHours(targetTime.getHours() - hoursAgo);
      
      targetTp = allTps.reverse().find(t => new Date(t.timestamp) <= targetTime);
    }

    if (!targetTp) {
      return res.status(404).json({ error: 'No matching checkpoint found' });
    }

    // Create backup
    engine.capture('Before time travel', { type: 'restore' });

    const result = engine.restore(targetTp.id);

    res.json({
      success: true,
      checkpoint: {
        id: targetTp.id,
        description: targetTp.description,
        timestamp: targetTp.timestamp
      },
      filesRestored: result.filesRestored,
      filesDeleted: result.filesDeleted
    });
  } catch (error: unknown) {
    handleApiError(res, error);
  }
});

// Get state before specific action
app.get('/api/before/action/:query', requireAuth, (req: Request, res: Response) => {
  try {
    const { query } = req.params;
    const queryLower = query.toLowerCase();
    const allTps = engine.listTimePoints();

    let foundIndex = -1;
    for (let i = allTps.length - 1; i >= 1; i--) {
      if (allTps[i].description.toLowerCase().includes(queryLower)) {
        foundIndex = i - 1;
        break;
      }
    }

    if (foundIndex < 0) {
      return res.status(404).json({ error: 'No matching action found' });
    }

    const matchedTp = allTps[foundIndex + 1];
    const targetTp = allTps[foundIndex];

    res.json({
      actionFound: { id: matchedTp.id, description: matchedTp.description },
      stateBefore: {
        id: targetTp.id,
        description: targetTp.description,
        timestamp: targetTp.timestamp
      }
    });
  } catch (error: unknown) {
    handleApiError(res, error);
  }
});

// Diff summary
app.get('/api/diff/summary', (req: Request, res: Response) => {
  try {
    const { from, to } = req.query;
    const allTps = engine.listTimePoints();

    const fromTp = from 
      ? allTps.find(t => t.id.startsWith(from as string))
      : allTps.length > 1 ? allTps[allTps.length - 2] : null;

    if (!fromTp) {
      return res.status(404).json({ error: 'From checkpoint not found' });
    }

    const diff = engine.getDiff(fromTp.id, to as string);

    res.json({
      from: { id: fromTp.id, description: fromTp.description },
      to: to || 'current',
      summary: {
        added: diff.added.length,
        modified: diff.modified.length,
        deleted: diff.deleted.length
      },
      files: {
        added: diff.added.slice(0, 20),
        modified: diff.modified.slice(0, 20),
        deleted: diff.deleted.slice(0, 20)
      }
    });
  } catch (error: unknown) {
    handleApiError(res, error);
  }
});

// Browse checkpoint files
app.get('/api/browse/:checkpoint', requireAuth, (req: Request, res: Response) => {
  try {
    const { checkpoint } = req.params;
    const { path: browsePath } = req.query;

    const allTps = engine.listTimePoints();
    const tp = allTps.find(t => t.id === checkpoint || t.id.startsWith(checkpoint));

    if (!tp) {
      return res.status(404).json({ error: 'Checkpoint not found' });
    }

    const fullTp = engine.getTimePoint(tp.id);
    if (!fullTp) {
      return res.status(404).json({ error: 'Checkpoint data not found' });
    }

    // Filter by path if specified
    const files = fullTp.files.filter((f: FileEntry) => 
      !browsePath || f.path.startsWith(browsePath as string)
    );

    // Group by directory
    const tree: Record<string, { files: string[]; size: number }> = {};
    for (const file of files) {
      const dir = path.dirname(file.path);
      if (!tree[dir]) tree[dir] = { files: [], size: 0 };
      tree[dir].files.push(path.basename(file.path));
      tree[dir].size += file.size;
    }

    res.json({
      checkpoint: { id: tp.id, description: tp.description, timestamp: tp.timestamp },
      totalFiles: files.length,
      tree: Object.entries(tree).map(([dir, info]) => ({
        path: dir,
        files: info.files,
        size: info.size
      }))
    });
  } catch (error: unknown) {
    handleApiError(res, error);
  }
});

// Get file content at checkpoint
app.get('/api/browse/:checkpoint/file', requireAuth, (req: Request, res: Response) => {
  try {
    const { checkpoint } = req.params;
    const filePath = req.query.path as string;

    if (!filePath) {
      return res.status(400).json({ error: 'path query parameter required' });
    }

    const allTps = engine.listTimePoints();
    const tp = allTps.find(t => t.id === checkpoint || t.id.startsWith(checkpoint));

    if (!tp) {
      return res.status(404).json({ error: 'Checkpoint not found' });
    }

    const content = engine.getFileContent(tp.id, filePath);
    if (!content) {
      return res.status(404).json({ error: 'File not found in checkpoint' });
    }

    res.type('text/plain').send(content);
  } catch (error: unknown) {
    handleApiError(res, error);
  }
});

// Restore single file
app.post('/api/restore/file', requireAuth, (req: Request, res: Response) => {
  try {
    const { checkpointId, filePath, strategy = 'overwrite' } = req.body;

    if (!checkpointId || !filePath) {
      return res.status(400).json({ error: 'checkpointId and filePath required' });
    }

    const allTps = engine.listTimePoints();
    const tp = allTps.find(t => t.id === checkpointId || t.id.startsWith(checkpointId));

    if (!tp) {
      return res.status(404).json({ error: 'Checkpoint not found' });
    }

    const content = engine.getFileContent(tp.id, filePath);
    if (!content) {
      return res.status(404).json({ error: 'File not found in checkpoint' });
    }

    const fullPath = path.join(projectPath, filePath);
    const exists = fs.existsSync(fullPath);

    if (exists && strategy === 'skip') {
      return res.json({ success: true, skipped: true, message: 'File exists, skipped' });
    }

    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content);

    res.json({
      success: true,
      filePath,
      restored: true,
      wasExisting: exists
    });
  } catch (error: unknown) {
    handleApiError(res, error);
  }
});

// Restore multiple files by pattern
app.post('/api/restore/files', requireAuth, (req: Request, res: Response) => {
  try {
    const { checkpointId, patterns, strategy = 'abort', dryRun = false } = req.body;
    const restore = new SelectiveRestore(engine);
    
    const result = restore.restore({
      checkpointId,
      patterns,
      strategy,
      dryRun
    });
    
    res.json(result);
  } catch (error: unknown) {
    handleApiError(res, error);
  }
});

// Helper function
function formatBytes(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
}

// ============================================================================
// Enhanced Search Endpoints
// ============================================================================

// Search conversations with fuzzy matching
app.get('/api/search/conversations', (req: Request, res: Response) => {
  try {
    const { q, fuzzy = 'true', context = '2', role, startDate, endDate, limit = '20' } = req.query;
    
    if (!q) {
      return res.status(400).json({ error: 'q (query) parameter required' });
    }

    const results = searchEngine.search({
      query: q as string,
      type: 'conversation',
      fuzzy: fuzzy === 'true',
      contextLines: parseInt(context as string),
      startDate: startDate ? new Date(startDate as string) : undefined,
      endDate: endDate ? new Date(endDate as string) : undefined,
      limit: parseInt(limit as string)
    });

    const filtered = role ? results.filter(r => r.role === role) : results;

    res.json({
      query: q,
      total: filtered.length,
      results: filtered
    });
  } catch (error: unknown) {
    handleApiError(res, error);
  }
});

// Search checkpoints
app.get('/api/search/checkpoints', (req: Request, res: Response) => {
  try {
    const { q, limit = '20' } = req.query;
    
    if (!q) {
      return res.status(400).json({ error: 'q (query) parameter required' });
    }

    const results = searchEngine.searchCheckpoints(q as string, parseInt(limit as string));

    res.json({
      query: q,
      total: results.length,
      results
    });
  } catch (error: unknown) {
    handleApiError(res, error);
  }
});

// Unified search
app.get('/api/search', (req: Request, res: Response) => {
  try {
    const { q, type = 'all', fuzzy = 'true', context = '2', startDate, endDate, limit = '20' } = req.query;
    
    if (!q) {
      return res.status(400).json({ error: 'q (query) parameter required' });
    }

    const results = searchEngine.search({
      query: q as string,
      type: toSearchType(type),
      fuzzy: fuzzy === 'true',
      contextLines: parseInt(context as string),
      startDate: startDate ? new Date(startDate as string) : undefined,
      endDate: endDate ? new Date(endDate as string) : undefined,
      limit: parseInt(limit as string)
    });

    res.json({
      query: q,
      type,
      total: results.length,
      results
    });
  } catch (error: unknown) {
    handleApiError(res, error);
  }
});

// ============================================================================
// Enhanced Timeline Endpoints
// ============================================================================

// Timeline with advanced filtering
app.get('/api/timeline', (req: Request, res: Response) => {
  try {
    const { 
      startDate, endDate, filePath, filePattern, content, trigger,
      sortBy = 'timestamp', sortOrder = 'desc', limit = '50', offset = '0'
    } = req.query;

    const results = timeline.query({
      startDate: startDate ? new Date(startDate as string) : undefined,
      endDate: endDate ? new Date(endDate as string) : undefined,
      filePath: filePath as string,
      filePattern: filePattern as string,
      content: content as string,
      trigger: trigger as string,
      sortBy: toSortBy(sortBy),
      sortOrder: toSortOrder(sortOrder),
      limit: parseInt(limit as string),
      offset: parseInt(offset as string)
    });

    res.json({
      total: results.length,
      offset: parseInt(offset as string),
      limit: parseInt(limit as string),
      checkpoints: results
    });
  } catch (error: unknown) {
    handleApiError(res, error);
  }
});

// Get checkpoints by file
app.get('/api/timeline/by-file', (req: Request, res: Response) => {
  try {
    const { path: filePath } = req.query;
    
    if (!filePath) {
      return res.status(400).json({ error: 'path parameter required' });
    }

    const results = timeline.getCheckpointsByFile(filePath as string);

    res.json({
      filePath,
      total: results.length,
      checkpoints: results
    });
  } catch (error: unknown) {
    handleApiError(res, error);
  }
});

// Get checkpoints by directory
app.get('/api/timeline/by-directory', (req: Request, res: Response) => {
  try {
    const { path: dirPath } = req.query;
    
    if (!dirPath) {
      return res.status(400).json({ error: 'path parameter required' });
    }

    const results = timeline.getCheckpointsByDirectory(dirPath as string);

    res.json({
      directory: dirPath,
      total: results.length,
      checkpoints: results
    });
  } catch (error: unknown) {
    handleApiError(res, error);
  }
});

// Get checkpoints by date range
app.get('/api/timeline/by-date-range', (req: Request, res: Response) => {
  try {
    const { start, end } = req.query;
    
    if (!start || !end) {
      return res.status(400).json({ error: 'start and end parameters required' });
    }

    const results = timeline.getCheckpointsByDateRange(
      new Date(start as string),
      new Date(end as string)
    );

    res.json({
      start,
      end,
      total: results.length,
      checkpoints: results
    });
  } catch (error: unknown) {
    handleApiError(res, error);
  }
});

// Refresh indexes
app.post('/api/refresh', requireAuth, (req: Request, res: Response) => {
  try {
    timeline.refresh();
    searchEngine.refresh();
    res.json({ success: true, message: 'Indexes refreshed' });
  } catch (error: unknown) {
    handleApiError(res, error);
  }
});

// WebSocket connections
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  
  socket.on('subscribe:checkpoints', () => {
    socket.join('checkpoints');
  });

  socket.on('subscribe:files', () => {
    socket.join('files');
    // Start file watcher if not already running
    if (fileWatcher.listenerCount('change') === 1) {
      fileWatcher.start();
    }
  });

  socket.on('unsubscribe:files', () => {
    socket.leave('files');
    // Stop watcher if no clients
    const room = io.sockets.adapter.rooms.get('files');
    if (!room || room.size === 0) {
      fileWatcher.stop();
    }
  });
  
  socket.on('subscribe:cloud', () => {
    socket.join('cloud');
  });
  
  socket.on('unsubscribe:cloud', () => {
    socket.leave('cloud');
  });

  // Real-time search
  socket.on('search', (query: { q: string; type?: string }) => {
    const results = searchEngine.search({
      query: query.q,
      type: toSearchType(query.type),
      limit: 10
    });
    socket.emit('search:results', results);
  });
  
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// NEON SYNC ENDPOINTS (secure - only API server has DATABASE_URL)
// ═══════════════════════════════════════════════════════════════════════════════

// Sync checkpoint to Neon (called by CLI/MCP via API)
app.post('/api/sync/checkpoint', requireAuth, async (req: Request, res: Response) => {
  const { projectId, checkpoint } = req.body;
  
  if (!process.env.DATABASE_URL) {
    return res.json({ ok: true, message: 'Cloud sync not configured' });
  }

  try {
    assertConsent(projectPath, 'capture', {
      source: 'api.sync.checkpoint',
      userId: req.user?.userId,
      resource: projectId,
    });

    const { NeonSyncService } = await import('./core/neon/sync.js');
    const sync = new NeonSyncService(projectId);
    await sync.initProject(projectId);
    await sync.sync(checkpoint);
    res.json({ ok: true });
  } catch (error: unknown) {
    if (error instanceof ConsentError) {
      return res.status(error.status || 403).json({ ok: false, error: error.message, code: error.code });
    }
    res.status(500).json({ ok: false, error: errorMessage(error) });
  }
});

// Sync blob metadata to Neon (content stays local in CAS)
app.post('/api/sync/blob', requireAuth, async (req: Request, res: Response) => {
  const { hash, size, language } = req.body;
  
  if (!process.env.DATABASE_URL) {
    return res.json({ ok: true, message: 'Cloud sync not configured' });
  }

  try {
    assertConsent(projectPath, 'capture', {
      source: 'api.sync.blob',
      userId: req.user?.userId,
      resource: hash,
    });

    const { db } = await import('./core/neon/client.js');
    const { blobs } = await import('./core/neon/schema.js');
    await db.insert(blobs).values({ hash, size: size || 0, language }).onConflictDoNothing();
    res.json({ ok: true });
  } catch (error: unknown) {
    if (error instanceof ConsentError) {
      return res.status(error.status || 403).json({ ok: false, error: error.message, code: error.code });
    }
    res.status(500).json({ ok: false, error: errorMessage(error) });
  }
});

// Get sync status
app.post('/api/sync/status', requireAuth, async (req: Request, res: Response) => {
  const { projectId } = req.body;
  
  if (!process.env.DATABASE_URL) {
    return res.json({ ok: true, data: { synced: 0, pending: 0, configured: false } });
  }

  try {
    const { db } = await import('./core/neon/client.js');
    const { commits } = await import('./core/neon/schema.js');
    const { eq, count } = await import('drizzle-orm');
    const result = await db.select({ count: count() }).from(commits).where(eq(commits.projectId, projectId));
    res.json({ ok: true, data: { synced: result[0]?.count || 0, pending: 0, configured: true } });
  } catch (error: unknown) {
    res.status(500).json({ ok: false, error: errorMessage(error) });
  }
});

// Sync message to Neon (from AI tools like Cursor, Claude Code)
app.post('/api/sync/message', requireAuth, async (req: Request, res: Response) => {
  const { projectId, message } = req.body;
  const userId = req.user?.userId;
  
  if (!process.env.DATABASE_URL) {
    return res.json({ ok: true, message: 'Cloud sync not configured' });
  }

  try {
    assertConsent(projectPath, 'capture', {
      source: 'api.sync.message',
      userId: req.user?.userId,
      resource: projectId,
    });

    const { db } = await import('./core/neon/client.js');
    const { messages } = await import('./core/neon/schema.js');
    await db.insert(messages).values({
      projectId,
      sessionId: message.sessionId,
      role: message.role,
      content: message.content,
      checkpointId: message.checkpointId,
      timestamp: new Date(message.timestamp),
      metadata: { tool: message.tool, userId },
    });
    res.json({ ok: true });
  } catch (error: unknown) {
    if (error instanceof ConsentError) {
      return res.status(error.status || 403).json({ ok: false, error: error.message, code: error.code });
    }
    res.status(500).json({ ok: false, error: errorMessage(error) });
  }
});

// Sync tool call to Neon (AI tool actions)
app.post('/api/sync/tool-call', requireAuth, async (req: Request, res: Response) => {
  const { projectId, toolCall } = req.body;
  const userId = req.user?.userId;
  
  if (!process.env.DATABASE_URL) {
    return res.json({ ok: true, message: 'Cloud sync not configured' });
  }

  try {
    assertConsent(projectPath, 'capture', {
      source: 'api.sync.tool-call',
      userId: req.user?.userId,
      resource: projectId,
    });

    const { db } = await import('./core/neon/client.js');
    const { toolCalls } = await import('./core/neon/schema.js');
    await db.insert(toolCalls).values({
      toolName: toolCall.toolName,
      arguments: toolCall.arguments,
      result: toolCall.result,
      success: toolCall.success,
      checkpointBeforeId: toolCall.checkpointBeforeId,
      checkpointAfterId: toolCall.checkpointAfterId,
      timestamp: new Date(toolCall.timestamp),
    });
    res.json({ ok: true });
  } catch (error: unknown) {
    if (error instanceof ConsentError) {
      return res.status(error.status || 403).json({ ok: false, error: error.message, code: error.code });
    }
    res.status(500).json({ ok: false, error: errorMessage(error) });
  }
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('Shutting down...');
  fileWatcher.stop();
  await closeNeonStore();
  httpServer.close();
  process.exit(0);
});

const PORT = process.env.PORT || 3001;

if (process.env.AITM_DISABLE_AUTOLISTEN !== '1') {
  httpServer.listen(PORT, () => {
    console.log(`API Server running on http://localhost:${PORT}`);
    console.log(`WebSocket available on ws://localhost:${PORT}`);
  });
}

export { app, httpServer, io };
