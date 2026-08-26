/**
 * Integration test for the Creem placement webhook.
 *
 * Mounts only the Creem webhook router (with express.raw, exactly as index.ts
 * does) so the signed-settlement path is exercised end-to-end without the full
 * app. Prisma is the shared in-memory mock from tests/setup.ts.
 *
 * Covers: valid signed checkout.completed settles + unlocks the placement;
 * a bad signature is rejected; and redelivery is idempotent.
 */
import crypto from 'crypto';
import express from 'express';
import request from 'supertest';
import { mockPrisma } from '../setup';

const WEBHOOK_SECRET = 'creem-webhook-secret-value';
const PRODUCT_ID = 'prod_talent_placement';

process.env.CREEM_API_KEY = 'creem-test-key';
process.env.CREEM_PRODUCT_ID = PRODUCT_ID;
process.env.CREEM_WEBHOOK_SECRET = WEBHOOK_SECRET;
process.env.CREEM_TEST_MODE = 'true';

import creemWebhookRouter from '../../src/routes/creemWebhooks';

function buildApp() {
  const app = express();
  app.use('/api/v1/webhooks/creem', express.raw({ type: 'application/json' }), creemWebhookRouter);
  return app;
}

function sign(rawBody: string): string {
  return crypto.createHmac('sha256', WEBHOOK_SECRET).update(rawBody).digest('hex');
}

function seedPendingPlacement(feeCents = 4900): void {
  mockPrisma.talentPlacement.__rows.push({
    id: 'placement-1',
    opportunityId: 'opp-1',
    candidateId: 'candidate-1',
    recruiterId: 'recruiter-1',
    feeCents,
    feeModel: 'unlock',
    status: 'pending',
    provider: 'creem',
    checkoutId: 'checkout-1',
    providerOrderId: null,
    paidAt: null,
  });
}

function checkoutCompletedEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: 'evt_1',
    eventType: 'checkout.completed',
    object: {
      id: 'ch_1',
      status: 'completed',
      mode: 'test',
      request_id: 'placement-1',
      metadata: { placementId: 'placement-1', kind: 'talent_placement' },
      order: {
        id: 'ord_1',
        status: 'paid',
        product: PRODUCT_ID,
        amount: 4900,
        currency: 'usd',
      },
      ...overrides,
    },
  };
}

beforeEach(() => {
  (mockPrisma.talentPlacement as any).__rows.length = 0;
});

describe('POST /api/v1/webhooks/creem', () => {
  it('rejects a missing signature', async () => {
    const res = await request(buildApp())
      .post('/api/v1/webhooks/creem')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify(checkoutCompletedEvent()));
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('missing_signature');
  });

  it('rejects an invalid signature', async () => {
    const raw = JSON.stringify(checkoutCompletedEvent());
    const res = await request(buildApp())
      .post('/api/v1/webhooks/creem')
      .set('Content-Type', 'application/json')
      .set('creem-signature', 'a'.repeat(64))
      .send(raw);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_signature');
  });

  it('settles + unlocks the placement on a valid signed checkout.completed', async () => {
    seedPendingPlacement();
    const raw = JSON.stringify(checkoutCompletedEvent());
    const res = await request(buildApp())
      .post('/api/v1/webhooks/creem')
      .set('Content-Type', 'application/json')
      .set('creem-signature', sign(raw))
      .send(raw);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, received: true });

    const row = (mockPrisma.talentPlacement as any).__rows.find((r: any) => r.id === 'placement-1');
    expect(row.status).toBe('paid');
    expect(row.providerOrderId).toBe('ord_1');
    expect(row.paidAt).toBeInstanceOf(Date);
  });

  it('is idempotent across redelivery of the same event', async () => {
    seedPendingPlacement();
    const raw = JSON.stringify(checkoutCompletedEvent());
    const app = buildApp();

    await request(app)
      .post('/api/v1/webhooks/creem')
      .set('Content-Type', 'application/json')
      .set('creem-signature', sign(raw))
      .send(raw);
    const firstPaidAt = (mockPrisma.talentPlacement as any).__rows.find((r: any) => r.id === 'placement-1').paidAt;

    const res = await request(app)
      .post('/api/v1/webhooks/creem')
      .set('Content-Type', 'application/json')
      .set('creem-signature', sign(raw))
      .send(raw);

    expect(res.status).toBe(200);
    const row = (mockPrisma.talentPlacement as any).__rows.find((r: any) => r.id === 'placement-1');
    expect(row.status).toBe('paid');
    expect(row.paidAt).toBe(firstPaidAt); // unchanged — no re-settlement
  });

  it('does not settle when the order product does not match the configured product', async () => {
    seedPendingPlacement();
    const event = checkoutCompletedEvent({
      order: { id: 'ord_1', status: 'paid', product: 'prod_wrong', amount: 4900, currency: 'usd' },
    });
    const raw = JSON.stringify(event);
    const res = await request(buildApp())
      .post('/api/v1/webhooks/creem')
      .set('Content-Type', 'application/json')
      .set('creem-signature', sign(raw))
      .send(raw);

    expect(res.status).toBe(200); // acknowledged, but ignored
    const row = (mockPrisma.talentPlacement as any).__rows.find((r: any) => r.id === 'placement-1');
    expect(row.status).toBe('pending');
  });
});
