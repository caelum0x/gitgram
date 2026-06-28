/**
 * E2E: System wiring — health, feature flags, and webhook route mounting.
 *
 * Confirms cross-cutting wiring works end-to-end:
 *   - health endpoints respond
 *   - the GitNexus AI-analysis feature is correctly disabled (503) when its
 *     dependency is not provisioned (AI_ANALYSIS_ENABLED=false in E2E)
 *   - the dedicated Polar webhook route is mounted and rejects unsigned payloads
 *     (the duplicate /subscriptions/webhook route has been removed)
 */
import request from 'supertest';
import type { Express } from 'express';
import { buildApp, registerUser, bearer, resetDatabase } from './helpers';

describe('E2E: System wiring', () => {
  let app: Express;

  beforeAll(async () => {
    app = buildApp();
    await resetDatabase();
  });

  it('serves the health endpoint', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
  });

  it('serves the readiness endpoint', async () => {
    const res = await request(app).get('/health/ready');
    expect([200, 503]).toContain(res.status);
  });

  it('reports AI analysis disabled and returns 503 from /analyze', async () => {
    const user = await registerUser(app);

    const status = await request(app).get('/api/v1/tools/ai-analysis/status');
    expect(status.status).toBe(200);
    expect(status.body.enabled).toBe(false);

    const analyze = await request(app)
      .post('/api/v1/tools/ai-analysis/analyze')
      .set(...bearer(user.token))
      .send({ repoUrl: 'https://github.com/owner/repo' });
    expect(analyze.status).toBe(503);
    expect(analyze.body.available).toBe(false);
  });

  it('mounts the dedicated Polar webhook and rejects an unsigned payload', async () => {
    const res = await request(app)
      .post('/api/v1/webhooks/polar')
      .set('Content-Type', 'application/json')
      .send({ type: 'subscription.created', data: { id: 'sub_1' } });

    // Missing signature header -> 400; the route exists and is wired.
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('confirms the duplicate /subscriptions/webhook route was removed', async () => {
    const res = await request(app)
      .post('/api/v1/subscriptions/webhook')
      .set('Content-Type', 'application/json')
      .send({ type: 'subscription.created', data: { id: 'sub_1' } });

    // The route no longer exists; Express returns 404 (no handler matched).
    expect(res.status).toBe(404);
  });
});
