/**
 * Creem Webhook Route
 *
 * Settles talent-graph recruiter placement / candidate-unlock fees. Creem sends
 * signed events; the signature is HMAC-SHA256 over the raw body using
 * CREEM_WEBHOOK_SECRET (see bidstage `app/api/webhooks/creem/route.ts` — the
 * reviewed reference this mirrors).
 *
 * Registered at: POST /api/v1/webhooks/creem
 *
 * Mounted with express.raw BEFORE the global JSON parser so signature
 * verification receives the unparsed buffer:
 *   app.use('/api/v1/webhooks/creem', express.raw({ type: 'application/json' }), creemWebhookRoutes);
 *
 * Handled events:
 *   checkout.completed – a placement fee was paid; settle the entitlement + receipt.
 */

import { Router, Request, Response } from 'express';
import { createHmac, timingSafeEqual } from 'crypto';
import logger from '../utils/logger';
import { creemEnv } from '../services/creemService';
import { settlePlacementOrder } from '../services/talentBillingService';

// ---------------------------------------------------------------------------
// Types + parsing helpers
// ---------------------------------------------------------------------------

type JsonObject = Record<string, unknown>;

interface CreemEvent {
  id: string;
  eventType: string;
  object: JsonObject & { id: string };
}

function asObject(value: unknown, label: string): JsonObject {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as JsonObject;
}

function asText(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value;
}

function entityId(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const id = (value as JsonObject).id;
    return typeof id === 'string' ? id : null;
  }
  return null;
}

function parseEvent(value: unknown): CreemEvent {
  const envelope = asObject(value, 'Creem event');
  const payload = asObject(envelope.object, 'Creem event object');
  return {
    id: asText(envelope.id, 'Creem event id'),
    eventType: asText(envelope.eventType, 'Creem event type'),
    object: { ...payload, id: asText(payload.id, 'Creem object id') },
  };
}

// ---------------------------------------------------------------------------
// Signature verification (HMAC-SHA256, hex, timing-safe)
// ---------------------------------------------------------------------------

function verifiedSignature(rawBody: Buffer, signature: string, secret: string): boolean {
  if (!/^[a-f0-9]{64}$/i.test(signature)) return false;
  const expected = createHmac('sha256', secret).update(rawBody).digest();
  const supplied = Buffer.from(signature, 'hex');
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

function validMode(mode: unknown, testMode: boolean): boolean {
  if (typeof mode !== 'string') return false;
  return testMode ? ['test', 'sandbox', 'local'].includes(mode) : mode === 'prod';
}

// ---------------------------------------------------------------------------
// checkout.completed → settle placement
// ---------------------------------------------------------------------------

async function settleCheckoutCompleted(
  event: CreemEvent,
  expectedProductId: string,
  testMode: boolean,
): Promise<void> {
  const payload = event.object;
  const order = asObject(payload.order, 'Creem order');
  const metadata = payload.metadata && typeof payload.metadata === 'object' && !Array.isArray(payload.metadata)
    ? (payload.metadata as JsonObject)
    : {};

  if (
    payload.status !== 'completed' ||
    order.status !== 'paid' ||
    entityId(order.product) !== expectedProductId ||
    !validMode(payload.mode, testMode)
  ) {
    logger.warn('[creemWebhook] checkout.completed is not a paid order for the configured product', {
      eventId: event.id,
      status: payload.status,
      orderStatus: order.status,
    });
    return;
  }

  // We anchored request_id to the placement id when opening the checkout.
  const placementId =
    (typeof metadata.placementId === 'string' && metadata.placementId) ||
    (typeof payload.request_id === 'string' ? payload.request_id : '');
  if (!placementId) {
    logger.warn('[creemWebhook] checkout.completed missing placement reference', { eventId: event.id });
    return;
  }

  const amountCents = Number.isSafeInteger(order.amount) ? (order.amount as number) : undefined;
  const result = await settlePlacementOrder({
    placementId,
    providerOrderId: asText(order.id, 'Creem order id'),
    amountCents,
  });

  logger.info('[creemWebhook] checkout.completed processed', {
    eventId: event.id,
    placementId,
    settled: result.settled,
    alreadyPaid: result.alreadyPaid,
    amountMismatch: result.amountMismatch ?? false,
  });
}

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

const router = Router();

router.post('/', async (req: Request, res: Response): Promise<void> => {
  const signature = req.headers['creem-signature'];
  if (typeof signature !== 'string' || signature.length === 0) {
    res.status(400).json({ success: false, error: 'missing_signature' });
    return;
  }

  let env: ReturnType<typeof creemEnv>;
  try {
    env = creemEnv();
  } catch (err: unknown) {
    logger.error('[creemWebhook] Creem is not configured — rejecting', {
      error: err instanceof Error ? err.message : String(err),
    });
    res.status(503).json({ success: false, error: 'creem_not_configured' });
    return;
  }

  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body ?? {}));
  if (!verifiedSignature(rawBody, signature, env.webhookSecret)) {
    logger.warn('[creemWebhook] Signature verification failed');
    res.status(400).json({ success: false, error: 'invalid_signature' });
    return;
  }

  let event: CreemEvent;
  try {
    event = parseEvent(JSON.parse(rawBody.toString('utf-8')));
  } catch {
    res.status(400).json({ success: false, error: 'invalid_event' });
    return;
  }

  try {
    if (event.eventType === 'checkout.completed') {
      await settleCheckoutCompleted(event, env.productId, env.testMode);
    } else {
      logger.info('[creemWebhook] Unhandled event type — ignored', { eventType: event.eventType });
    }
    res.status(200).json({ success: true, received: true });
  } catch (err: unknown) {
    logger.error('[creemWebhook] Event processing failed', {
      eventId: event.id,
      eventType: event.eventType,
      error: err instanceof Error ? err.message : String(err),
    });
    res.status(500).json({ success: false, error: 'event_processing_failed' });
  }
});

export default router;
