/**
 * CLI store + endpoint contract tests.
 *
 * Guards the two classes of breakage that previously shipped silently:
 *
 *  1. Store consistency — `aitm checkpoint` must populate the SAME store the
 *     natural-language commands (ask/when/what-changed/back-to/fix/diagnose)
 *     read from. Previously checkpoint wrote the engine store while NL commands
 *     read a separate SqliteRepo that nothing populated.
 *
 *  2. Endpoint path contracts — every endpoint the `conflicts | export | agents
 *     | memory` CLI groups POST/GET to must actually be served by the bundled
 *     `aitm serve` router. Previously these targeted paths that did not exist on
 *     the server `aitm serve` starts.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import express from 'express';
import type { Server } from 'http';
import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';

import { TimeMachineEngine } from '../src/core/engine.js';
import { EventStore } from '../src/core/event-store.js';
import { EngineCheckpointReader } from '../src/cli/engine-checkpoint-reader.js';
import {
  parseAdvancedQuery,
  findCheckpointForAdvancedQuery,
  findLastGreenCheckpoint,
  parseTimeQuery,
  findCheckpointsForQuery,
} from '../src/cli/natural-language.js';
import { createCliEndpointsRouter } from '../src/server/cli-endpoints.js';

describe('store consistency: checkpoint writes the store NL commands read', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aitm-contract-'));
    fs.writeFileSync(path.join(dir, 'a.txt'), 'initial');
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('engine-created checkpoints are visible to the natural-language reader', () => {
    const engine = new TimeMachineEngine(dir);
    engine.capture('Tests passed - green', { type: 'manual' });
    fs.writeFileSync(path.join(dir, 'a.txt'), 'changed');
    engine.capture('Broke the build', { type: 'manual' });

    const reader = new EngineCheckpointReader(engine, path.basename(dir));
    const projectId = path.basename(dir);

    // `ask` path
    const matches = findCheckpointForAdvancedQuery(
      reader,
      projectId,
      parseAdvancedQuery('when tests passed'),
      10,
    );
    expect(matches.length).toBeGreaterThan(0);

    // `fix` path — last green checkpoint must be found
    const green = findLastGreenCheckpoint(reader, projectId);
    expect(green).not.toBeNull();
    expect(green?.name).toContain('green');

    // `when` path
    const when = findCheckpointsForQuery(reader, projectId, parseTimeQuery('when tests passed'), 5);
    expect(when.length).toBeGreaterThan(0);

    // reader exposes both checkpoints, newest first
    const all = reader.listCheckpointsNewestFirst(projectId, 10);
    expect(all.length).toBe(2);
    expect(all[0].name).toBe('Broke the build');
  });

  it('back-to resolves and the engine can restore the resolved checkpoint', () => {
    const engine = new TimeMachineEngine(dir);
    const first = engine.capture('Tests green baseline', { type: 'manual' });
    fs.writeFileSync(path.join(dir, 'a.txt'), 'mutated');
    engine.capture('WIP', { type: 'manual' });

    const reader = new EngineCheckpointReader(engine, path.basename(dir));
    const target = reader.getCheckpoint(path.basename(dir), first.id);
    expect(target).not.toBeNull();

    const result = engine.restore(target!.checkpointId);
    expect(result.filesRestored).toBeGreaterThan(0);
    expect(fs.readFileSync(path.join(dir, 'a.txt'), 'utf-8')).toBe('initial');
  });
});

describe('endpoint path contracts: bundled serve router serves every CLI target', () => {
  let app: express.Express;
  let server: Server;
  let base: string;
  let dir: string;

  beforeAll(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aitm-endpoints-'));
    fs.writeFileSync(path.join(dir, 'f.txt'), 'v1');
    const engine = new TimeMachineEngine(dir);
    engine.capture('Initial checkpoint', { type: 'manual' });
    const eventStore = new EventStore(dir);
    eventStore.load();

    app = express();
    app.use(express.json());
    app.use(createCliEndpointsRouter(engine, eventStore));

    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const addr = server.address();
        const port = typeof addr === 'object' && addr ? addr.port : 0;
        base = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    fs.rmSync(dir, { recursive: true, force: true });
  });

  // Every (method, path) pair the CLI command groups use.
  const contracts: Array<{ method: 'GET' | 'POST' | 'PUT'; path: string; body?: unknown }> = [
    // conflict-commands.ts
    { method: 'POST', path: '/v1/sync/conflicts', body: {} },
    { method: 'POST', path: '/v1/sync/conflicts/auto', body: { dryRun: true } },
    // export-commands.ts
    { method: 'POST', path: '/v1/sessions/export/json', body: { limit: 5 } },
    { method: 'POST', path: '/v1/sessions/export/markdown', body: { limit: 5 } },
    { method: 'POST', path: '/v1/sessions/export/csv', body: {} },
    { method: 'GET', path: '/v1/sessions/export/activity-report?period=30d' },
    // agents-commands.ts
    { method: 'GET', path: '/beads/tasks' },
    // memory-commands.ts
    { method: 'GET', path: '/v1/contexts?limit=5' },
    { method: 'GET', path: '/v1/contexts/search/text?q=hello&limit=5' },
  ];

  for (const c of contracts) {
    it(`${c.method} ${c.path} exists (not 404/405)`, async () => {
      const res = await fetch(`${base}${c.path}`, {
        method: c.method,
        headers: { 'Content-Type': 'application/json' },
        body: c.method === 'GET' ? undefined : JSON.stringify(c.body ?? {}),
      });
      expect(res.status).not.toBe(404);
      expect(res.status).not.toBe(405);
      expect(res.ok).toBe(true);
    });
  }

  it('beads task lifecycle: create -> ready -> done', async () => {
    const created = await fetch(`${base}/beads/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'contract task' }),
    }).then((r) => r.json());
    expect(created.success).toBe(true);
    const id = created.data.id as string;

    const ready = await fetch(`${base}/beads/tasks/${id}/ready`, { method: 'PUT' }).then((r) => r.json());
    expect(ready.data.status).toBe('ready');

    const done = await fetch(`${base}/beads/tasks/${id}/done`, { method: 'PUT' }).then((r) => r.json());
    expect(done.data.status).toBe('done');
  });

  it('contexts remember -> show round-trips', async () => {
    const created = await fetch(`${base}/v1/contexts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'a note', description: 'remember this', source: 'conversation' }),
    }).then((r) => r.json());
    expect(created.id).toBeTruthy();

    const fetched = await fetch(`${base}/v1/contexts/${created.id}`).then((r) => r.json());
    expect(fetched.name).toBe('a note');
  });
});
