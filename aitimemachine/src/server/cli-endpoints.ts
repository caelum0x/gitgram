/**
 * CLI Endpoints Router (bundled `aitm serve`)
 *
 * Wires the backends the `aitm conflicts | export | agents | memory` command
 * groups depend on into the product's own server, so `aitm serve` is the single
 * backend for the whole CLI. Paths and response envelopes match the CLI clients
 * exactly:
 *
 *   POST /v1/sync/conflicts            -> { success, data: ConflictSummary[] }
 *   POST /v1/sync/conflicts/show       -> { success, data: ConflictDetail }
 *   POST /v1/sync/conflicts/resolve    -> { success, data: ResolveResult }
 *   POST /v1/sync/conflicts/auto       -> { success, data: AutoResult }
 *
 *   POST /v1/sessions/export/json            -> { success, data: SessionExport[] }
 *   POST /v1/sessions/export/markdown        -> { success, data: {filename,content}[] }
 *   POST /v1/sessions/export/csv             -> { success, data: string }
 *   GET  /v1/sessions/export/activity-report -> { success, data: html }
 *   POST /v1/sessions/export/git             -> { success, data: GitExportResult }
 *
 *   GET/POST/PUT /beads/tasks*  -> { success, data, error } (beads envelope)
 *   GET/POST     /v1/contexts*  -> bare JSON (memory envelope)
 */

import { Router, type Request, type Response } from 'express';
import type { TimeMachineEngine } from '../core/engine.js';
import type { EventStore } from '../core/event-store.js';
import {
  listConflicts,
  showConflict,
  resolveConflict,
  autoResolve,
} from './conflict-service.js';
import {
  buildSessionExports,
  sessionsAsMarkdown,
  sessionsAsCsv,
  activityReportHtml,
  exportToGitHistory,
} from './sessions-export-service.js';
import { AgentsMemoryStore } from './agents-memory-store.js';

function ok<T>(res: Response, data: T): void {
  res.json({ success: true, data });
}

function failJson(res: Response, status: number, message: string): void {
  res.status(status).json({ success: false, error: message });
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

type ResolveStrategy = 'local' | 'remote' | 'manual';

function isStrategy(value: unknown): value is ResolveStrategy {
  return value === 'local' || value === 'remote' || value === 'manual';
}

export function createCliEndpointsRouter(
  engine: TimeMachineEngine,
  eventStore: EventStore,
): Router {
  const router = Router();
  const store = new AgentsMemoryStore();

  // ── Conflicts ────────────────────────────────────────────────────────────────

  router.post('/v1/sync/conflicts', (_req: Request, res: Response) => {
    try {
      ok(res, listConflicts(engine));
    } catch (err: unknown) {
      failJson(res, 500, errMsg(err));
    }
  });

  router.post('/v1/sync/conflicts/show', (req: Request, res: Response) => {
    try {
      const conflictId = String(req.body?.conflictId ?? '');
      if (!conflictId) return failJson(res, 400, 'conflictId is required');
      const detail = showConflict(engine, conflictId);
      if (!detail) return failJson(res, 404, `Conflict ${conflictId} not found`);
      ok(res, detail);
    } catch (err: unknown) {
      failJson(res, 500, errMsg(err));
    }
  });

  router.post('/v1/sync/conflicts/resolve', (req: Request, res: Response) => {
    try {
      const conflictId = String(req.body?.conflictId ?? '');
      const strategy = req.body?.strategy;
      if (!conflictId) return failJson(res, 400, 'conflictId is required');
      if (!isStrategy(strategy)) {
        return failJson(res, 400, 'strategy must be one of: local, remote, manual');
      }
      const files = Array.isArray(req.body?.files) ? req.body.files : undefined;
      ok(res, resolveConflict(engine, conflictId, strategy, files));
    } catch (err: unknown) {
      failJson(res, 400, errMsg(err));
    }
  });

  router.post('/v1/sync/conflicts/auto', (req: Request, res: Response) => {
    try {
      ok(res, autoResolve(engine, req.body?.dryRun === true));
    } catch (err: unknown) {
      failJson(res, 500, errMsg(err));
    }
  });

  // ── Sessions export ────────────────────────────────────────────────────────────

  router.post('/v1/sessions/export/json', (req: Request, res: Response) => {
    try {
      const limit = Number.parseInt(String(req.body?.limit ?? '50'), 10) || 50;
      const since = typeof req.body?.since === 'string' ? req.body.since : undefined;
      ok(res, buildSessionExports(engine, eventStore, { limit, since }));
    } catch (err: unknown) {
      failJson(res, 500, errMsg(err));
    }
  });

  router.post('/v1/sessions/export/markdown', (req: Request, res: Response) => {
    try {
      const limit = Number.parseInt(String(req.body?.limit ?? '50'), 10) || 50;
      const sessions = buildSessionExports(engine, eventStore, { limit });
      ok(res, sessionsAsMarkdown(sessions));
    } catch (err: unknown) {
      failJson(res, 500, errMsg(err));
    }
  });

  router.post('/v1/sessions/export/csv', (_req: Request, res: Response) => {
    try {
      const sessions = buildSessionExports(engine, eventStore, { limit: 1000 });
      ok(res, sessionsAsCsv(sessions));
    } catch (err: unknown) {
      failJson(res, 500, errMsg(err));
    }
  });

  router.get('/v1/sessions/export/activity-report', (req: Request, res: Response) => {
    try {
      const period = typeof req.query.period === 'string' ? req.query.period : '30d';
      const sessions = buildSessionExports(engine, eventStore, { limit: 1000 });
      ok(res, activityReportHtml(sessions, period));
    } catch (err: unknown) {
      failJson(res, 500, errMsg(err));
    }
  });

  router.post('/v1/sessions/export/git', (req: Request, res: Response) => {
    try {
      const repoPath = String(req.body?.repoPath ?? process.cwd());
      const branch = String(req.body?.branch ?? 'aitm-history');
      const sessions = buildSessionExports(engine, eventStore, { limit: 1000 });
      ok(res, exportToGitHistory(sessions, repoPath, branch));
    } catch (err: unknown) {
      failJson(res, 400, errMsg(err));
    }
  });

  // ── Beads (agents) ─────────────────────────────────────────────────────────────

  router.get('/beads/tasks', (_req: Request, res: Response) => {
    try {
      ok(res, store.listTasks());
    } catch (err: unknown) {
      failJson(res, 500, errMsg(err));
    }
  });

  router.post('/beads/tasks', (req: Request, res: Response) => {
    try {
      const title = String(req.body?.title ?? '').trim();
      if (!title) return failJson(res, 400, 'title is required');
      const deps = Array.isArray(req.body?.deps)
        ? (req.body.deps as unknown[]).map((d) => String(d))
        : [];
      ok(res, store.createTask(title, deps));
    } catch (err: unknown) {
      failJson(res, 500, errMsg(err));
    }
  });

  router.get('/beads/tasks/:id', (req: Request, res: Response) => {
    try {
      const task = store.getTask(req.params.id);
      if (!task) return failJson(res, 404, `Task ${req.params.id} not found`);
      ok(res, task);
    } catch (err: unknown) {
      failJson(res, 500, errMsg(err));
    }
  });

  router.put('/beads/tasks/:id/ready', (req: Request, res: Response) => {
    try {
      const task = store.setTaskStatus(req.params.id, 'ready');
      if (!task) return failJson(res, 404, `Task ${req.params.id} not found`);
      ok(res, task);
    } catch (err: unknown) {
      failJson(res, 500, errMsg(err));
    }
  });

  router.put('/beads/tasks/:id/done', (req: Request, res: Response) => {
    try {
      const task = store.setTaskStatus(req.params.id, 'done');
      if (!task) return failJson(res, 404, `Task ${req.params.id} not found`);
      ok(res, task);
    } catch (err: unknown) {
      failJson(res, 500, errMsg(err));
    }
  });

  // ── Contexts (memory) — bare JSON envelope ──────────────────────────────────────

  router.get('/v1/contexts', (req: Request, res: Response) => {
    try {
      const limit = Number.parseInt(String(req.query.limit ?? '20'), 10) || 20;
      const offset = Number.parseInt(String(req.query.offset ?? '0'), 10) || 0;
      const source = typeof req.query.source === 'string' ? req.query.source : undefined;
      const { data, hasMore } = store.listContexts({ source, limit, offset });
      res.json({ data, has_more: hasMore, limit, offset });
    } catch (err: unknown) {
      res.status(500).json({ error: { message: errMsg(err) } });
    }
  });

  router.get('/v1/contexts/search/text', (req: Request, res: Response) => {
    try {
      const q = String(req.query.q ?? '');
      const limit = Number.parseInt(String(req.query.limit ?? '10'), 10) || 10;
      const results = store.searchContexts(q, limit).map((c) => ({
        id: c.id,
        name: c.name,
        description: c.description,
        tool: c.tool,
        tags: c.tags,
        matches: c.messages.slice(0, 1).map((m) => ({ content: m.content, timestamp: m.timestamp })),
        created_at: c.createdAt,
      }));
      res.json({ query: q, results, total: results.length, search_type: 'text' });
    } catch (err: unknown) {
      res.status(500).json({ error: { message: errMsg(err) } });
    }
  });

  // Real semantic search via vector cosine similarity when an embedding
  // provider (OpenAI) is configured. Degrades to text search and labels the
  // response accurately (search_type: 'text') when no provider is available,
  // so it never advertises semantic results it did not compute.
  router.get('/v1/contexts/search/semantic', async (req: Request, res: Response) => {
    try {
      const q = String(req.query.q ?? '');
      const limit = Number.parseInt(String(req.query.limit ?? '10'), 10) || 10;
      const outcome = await store.semanticSearchContexts(q, limit);
      const results = outcome.hits.map((h) => ({
        id: h.context.id,
        name: h.context.name,
        description: h.context.description,
        tool: h.context.tool,
        tags: h.context.tags,
        similarity_score: outcome.searchType === 'semantic' ? Number(h.similarity.toFixed(4)) : undefined,
        matches: h.context.messages
          .slice(0, 1)
          .map((m) => ({ content: m.content, timestamp: m.timestamp })),
        created_at: h.context.createdAt,
      }));
      res.json({
        query: q,
        results,
        total: results.length,
        search_type: outcome.searchType,
        embedding_provider: outcome.provider,
        model: outcome.model,
      });
    } catch (err: unknown) {
      res.status(500).json({ error: { message: errMsg(err) } });
    }
  });

  // Backfill embeddings for all stored contexts (no-op without a provider).
  router.post('/v1/contexts/embed', async (_req: Request, res: Response) => {
    try {
      const indexed = await store.backfillEmbeddings();
      res.json({ indexed, embeddings_available: store.hasEmbeddings() });
    } catch (err: unknown) {
      res.status(500).json({ error: { message: errMsg(err) } });
    }
  });

  router.get('/v1/contexts/:id', (req: Request, res: Response) => {
    try {
      const entry = store.getContext(req.params.id);
      if (!entry) return res.status(404).json({ error: { message: `Context ${req.params.id} not found` } });
      res.json(entry);
    } catch (err: unknown) {
      res.status(500).json({ error: { message: errMsg(err) } });
    }
  });

  router.post('/v1/contexts', (req: Request, res: Response) => {
    try {
      const name = String(req.body?.name ?? '').trim();
      if (!name) return res.status(400).json({ error: { message: 'name is required' } });
      const entry = store.createContext({
        projectId: req.body?.projectId ?? null,
        name,
        description: req.body?.description ?? null,
        tool: req.body?.tool ?? null,
        source: typeof req.body?.source === 'string' ? req.body.source : 'conversation',
        tags: Array.isArray(req.body?.tags) ? req.body.tags.map((t: unknown) => String(t)) : [],
        messages: Array.isArray(req.body?.messages) ? req.body.messages : [],
      });
      res.status(201).json(entry);
    } catch (err: unknown) {
      res.status(500).json({ error: { message: errMsg(err) } });
    }
  });

  return router;
}
