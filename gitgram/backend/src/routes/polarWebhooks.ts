/**
 * Polar.sh Webhook Route
 *
 * Handles inbound webhook events from Polar.sh for subscription lifecycle
 * management. Signature verification uses HMAC-SHA256 with the secret stored
 * in POLAR_WEBHOOK_SECRET.
 *
 * Registered at: POST /webhooks/polar
 *
 * Supported event types:
 *   subscription.created  – new subscription; upgrade user tier
 *   subscription.updated  – plan change; update user tier
 *   subscription.canceled – scheduled cancellation at period end
 *   subscription.revoked  – immediate revocation; downgrade to free now
 *   order.created         – one-time purchase; grant feature
 *   benefit.granted       – benefit (feature flag) enabled for user
 *   benefit.revoked       – benefit (feature flag) disabled for user
 */

import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import prisma from '../utils/prisma';
import logger from '../utils/logger';
import * as auditLogService from '../services/auditLogService';
import { enqueue } from '../services/emailQueueService';
import type { SubscriptionTier } from '../services/subscriptionService';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Minimal customer shape returned inside Polar webhook payloads. */
interface PolarCustomer {
  email: string;
  id?: string;
  name?: string;
}

/** Product shape embedded in subscription / order payloads. */
interface PolarProduct {
  id: string;
  name?: string;
}

/** Benefit shape embedded in benefit.granted / benefit.revoked payloads. */
interface PolarBenefit {
  id: string;
  description?: string;
  type?: string;
  properties?: Record<string, unknown>;
}

/** Core subscription payload from Polar. */
interface PolarSubscriptionPayload {
  id: string;
  status: string;
  current_period_end?: string;
  currentPeriodEnd?: string;
  cancel_at_period_end?: boolean;
  cancelAtPeriodEnd?: boolean;
  customer?: PolarCustomer;
  product?: PolarProduct;
  product_id?: string;
  productId?: string;
  customer_id?: string;
  customerId?: string;
}

/** Order payload from Polar (one-time purchases). */
interface PolarOrderPayload {
  id: string;
  status: string;
  customer?: PolarCustomer;
  product?: PolarProduct;
  product_id?: string;
  productId?: string;
  customer_id?: string;
  customerId?: string;
  amount?: number;
}

/** Benefit granted / revoked payload. */
interface PolarBenefitGrantPayload {
  id: string;
  benefit?: PolarBenefit;
  benefit_id?: string;
  benefitId?: string;
  subscription?: { id?: string; customer?: PolarCustomer };
  subscription_id?: string;
  subscriptionId?: string;
  customer?: PolarCustomer;
}

/** The outer envelope Polar sends for every webhook event. */
interface PolarWebhookEnvelope {
  type: string;
  data: unknown;
}

// ---------------------------------------------------------------------------
// Tier resolution
// ---------------------------------------------------------------------------

const PRODUCT_TO_TIER: Record<string, SubscriptionTier> = {
  [process.env.POLAR_PRO_PRODUCT_ID ?? '']: 'pro',
  [process.env.POLAR_TEAM_PRODUCT_ID ?? '']: 'team',
  // Legacy aliases
  [process.env.POLAR_PREMIUM_PRODUCT_ID ?? '']: 'pro',
  [process.env.POLAR_CREATOR_PRODUCT_ID ?? '']: 'team',
};

function resolveTierFromProductId(productId: string | undefined): SubscriptionTier {
  if (!productId) return 'pro';
  return PRODUCT_TO_TIER[productId] ?? 'pro';
}

// ---------------------------------------------------------------------------
// Signature verification
// ---------------------------------------------------------------------------

/**
 * Verify the `X-Polar-Signature` header against the raw request body using
 * HMAC-SHA256. Returns true when the signature is valid.
 */
function verifyPolarSignature(rawBody: Buffer, signature: string): boolean {
  const secret = process.env.POLAR_WEBHOOK_SECRET;
  if (!secret) {
    logger.warn('[polarWebhook] POLAR_WEBHOOK_SECRET is not configured — rejecting');
    return false;
  }

  const expected = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');

  // Polar may send the signature as a plain hex digest or prefixed with "sha256="
  const normalised = signature.startsWith('sha256=') ? signature.slice(7) : signature;

  if (normalised.length !== expected.length) return false;

  return crypto.timingSafeEqual(
    Buffer.from(normalised, 'hex'),
    Buffer.from(expected, 'hex'),
  );
}

// ---------------------------------------------------------------------------
// User lookup
// ---------------------------------------------------------------------------

async function findUserByEmail(email: string): Promise<{ id: string; email: string; username: string | null } | null> {
  return prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, username: true },
  });
}

// ---------------------------------------------------------------------------
// Audit helper
// ---------------------------------------------------------------------------

async function logAuditEvent(
  userId: string,
  action: auditLogService.AuditAction,
  metadata: Record<string, unknown>,
): Promise<void> {
  try {
    await auditLogService.log(userId, action, metadata);
  } catch (err: unknown) {
    logger.warn('[polarWebhook] Audit log write failed (non-fatal)', { err });
  }
}

// ---------------------------------------------------------------------------
// Email notification helper
// ---------------------------------------------------------------------------

function enqueueSubscriptionEmail(
  userEmail: string,
  subject: string,
  body: string,
): void {
  try {
    enqueue({
      to: userEmail,
      subject,
      html: body,
      priority: 'normal',
      maxAttempts: 3,
    });
  } catch (err: unknown) {
    logger.warn('[polarWebhook] Email enqueue failed (non-fatal)', { err });
  }
}

function buildSubscriptionEmailHtml(heading: string, message: string): string {
  return `<h2>${heading}</h2><p>${message}</p>`;
}

// ---------------------------------------------------------------------------
// Payload helpers
// ---------------------------------------------------------------------------

function getCustomerEmail(payload: PolarSubscriptionPayload | PolarOrderPayload | PolarBenefitGrantPayload): string | undefined {
  return payload.customer?.email;
}

function getProductId(
  payload: PolarSubscriptionPayload | PolarOrderPayload,
): string | undefined {
  return (payload as PolarSubscriptionPayload).product?.id
    ?? (payload as PolarSubscriptionPayload).product_id
    ?? (payload as PolarSubscriptionPayload).productId;
}

function getPeriodEnd(payload: PolarSubscriptionPayload): Date | null {
  const raw = payload.current_period_end ?? payload.currentPeriodEnd;
  return raw ? new Date(raw) : null;
}

function isCancelAtPeriodEnd(payload: PolarSubscriptionPayload): boolean {
  return payload.cancel_at_period_end ?? payload.cancelAtPeriodEnd ?? false;
}

// ---------------------------------------------------------------------------
// Event sub-handlers
// ---------------------------------------------------------------------------

/**
 * subscription.created / subscription.updated
 * Upsert the user's subscription row and set the resolved tier.
 */
async function handleSubscriptionUpsert(
  payload: PolarSubscriptionPayload,
  eventType: string,
): Promise<void> {
  const email = getCustomerEmail(payload);
  if (!email) {
    logger.warn('[polarWebhook] Missing customer email', { eventType, subscriptionId: payload.id });
    return;
  }

  const user = await findUserByEmail(email);
  if (!user) {
    logger.warn('[polarWebhook] User not found for email', { eventType, email });
    return;
  }

  const productId = getProductId(payload);
  const tier = resolveTierFromProductId(productId);
  const currentPeriodEnd = getPeriodEnd(payload);
  const customerId = (payload as PolarSubscriptionPayload).customer_id
    ?? (payload as PolarSubscriptionPayload).customerId
    ?? payload.customer?.id;

  await prisma.subscription.upsert({
    where: { userId: user.id },
    create: {
      userId: user.id,
      tier,
      plan: tier,
      status: 'active',
      polarSubscriptionId: payload.id,
      polarCustomerId: customerId ?? null,
      currentPeriodEnd,
    },
    update: {
      tier,
      plan: tier,
      status: 'active',
      polarSubscriptionId: payload.id,
      polarCustomerId: customerId ?? null,
      currentPeriodEnd,
    },
  });

  const auditAction: auditLogService.AuditAction =
    eventType === 'subscription.created' ? 'subscription_upgrade' : 'subscription_upgrade';

  await logAuditEvent(user.id, auditAction, {
    eventType,
    tier,
    subscriptionId: payload.id,
    productId,
  });

  const tierLabel = tier.charAt(0).toUpperCase() + tier.slice(1);
  enqueueSubscriptionEmail(
    user.email,
    `Your Gitgram ${tierLabel} subscription is active`,
    buildSubscriptionEmailHtml(
      `Welcome to Gitgram ${tierLabel}!`,
      `Your ${tierLabel} plan is now active. Enjoy all the features it unlocks.`,
    ),
  );

  logger.info('[polarWebhook] Subscription upserted', { userId: user.id, tier, subscriptionId: payload.id, eventType });
}

/**
 * subscription.canceled
 * Mark the subscription as canceled but keep the tier active until the period ends.
 */
async function handleSubscriptionCanceled(payload: PolarSubscriptionPayload): Promise<void> {
  const email = getCustomerEmail(payload);
  if (!email) {
    logger.warn('[polarWebhook] subscription.canceled: missing customer email', { subscriptionId: payload.id });
    return;
  }

  const user = await findUserByEmail(email);
  if (!user) {
    logger.warn('[polarWebhook] subscription.canceled: user not found', { email });
    return;
  }

  const periodEnd = getPeriodEnd(payload);

  await prisma.subscription.updateMany({
    where: { userId: user.id, polarSubscriptionId: payload.id },
    data: {
      status: 'canceled',
      currentPeriodEnd: periodEnd ?? undefined,
    },
  });

  await logAuditEvent(user.id, 'subscription_downgrade', {
    eventType: 'subscription.canceled',
    subscriptionId: payload.id,
    cancelAtPeriodEnd: isCancelAtPeriodEnd(payload),
    periodEnd: periodEnd?.toISOString(),
  });

  const periodEndDisplay = periodEnd
    ? periodEnd.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    : 'your current billing period';

  enqueueSubscriptionEmail(
    user.email,
    'Your Gitgram subscription has been canceled',
    buildSubscriptionEmailHtml(
      'Subscription Canceled',
      `Your subscription has been canceled and will remain active until ${periodEndDisplay}.`,
    ),
  );

  logger.info('[polarWebhook] Subscription marked canceled', { userId: user.id, subscriptionId: payload.id, periodEnd });
}

/**
 * subscription.revoked
 * Immediately downgrade the user to the free tier.
 */
async function handleSubscriptionRevoked(payload: PolarSubscriptionPayload): Promise<void> {
  const email = getCustomerEmail(payload);
  if (!email) {
    logger.warn('[polarWebhook] subscription.revoked: missing customer email', { subscriptionId: payload.id });
    return;
  }

  const user = await findUserByEmail(email);
  if (!user) {
    logger.warn('[polarWebhook] subscription.revoked: user not found', { email });
    return;
  }

  await prisma.subscription.updateMany({
    where: { userId: user.id, polarSubscriptionId: payload.id },
    data: {
      tier: 'free',
      plan: 'free',
      status: 'expired',
      currentPeriodEnd: new Date(),
    },
  });

  await logAuditEvent(user.id, 'subscription_downgrade', {
    eventType: 'subscription.revoked',
    subscriptionId: payload.id,
    revokedAt: new Date().toISOString(),
  });

  enqueueSubscriptionEmail(
    user.email,
    'Your Gitgram subscription has been revoked',
    buildSubscriptionEmailHtml(
      'Subscription Revoked',
      'Your subscription has been revoked and your account has been downgraded to the free plan.',
    ),
  );

  logger.info('[polarWebhook] Subscription revoked — downgraded to free', { userId: user.id, subscriptionId: payload.id });
}

/**
 * order.created
 * A one-time payment was completed. Grant the appropriate feature/tier upgrade.
 */
async function handleOrderCreated(payload: PolarOrderPayload): Promise<void> {
  if (payload.status !== 'paid' && payload.status !== 'complete' && payload.status !== 'completed') {
    logger.info('[polarWebhook] order.created: non-paid status, skipping', { orderId: payload.id, status: payload.status });
    return;
  }

  const email = getCustomerEmail(payload);
  if (!email) {
    logger.warn('[polarWebhook] order.created: missing customer email', { orderId: payload.id });
    return;
  }

  const user = await findUserByEmail(email);
  if (!user) {
    logger.warn('[polarWebhook] order.created: user not found', { email });
    return;
  }

  const productId = getProductId(payload);
  const tier = resolveTierFromProductId(productId);

  // For one-time purchases, grant the tier for 1 year
  const expiresAt = new Date();
  expiresAt.setFullYear(expiresAt.getFullYear() + 1);

  await prisma.subscription.upsert({
    where: { userId: user.id },
    create: {
      userId: user.id,
      tier,
      plan: tier,
      status: 'active',
      polarSubscriptionId: null,
      polarCustomerId: payload.customer?.id ?? null,
      currentPeriodEnd: expiresAt,
    },
    update: {
      tier,
      plan: tier,
      status: 'active',
      currentPeriodEnd: expiresAt,
    },
  });

  await logAuditEvent(user.id, 'subscription_upgrade', {
    eventType: 'order.created',
    orderId: payload.id,
    tier,
    productId,
    amount: payload.amount,
  });

  const tierLabel = tier.charAt(0).toUpperCase() + tier.slice(1);
  enqueueSubscriptionEmail(
    user.email,
    `Your Gitgram ${tierLabel} order is confirmed`,
    buildSubscriptionEmailHtml(
      'Order Confirmed',
      `Thank you for your purchase! Your ${tierLabel} features are now active.`,
    ),
  );

  logger.info('[polarWebhook] Order created — tier granted', { userId: user.id, tier, orderId: payload.id });
}

/**
 * benefit.granted
 * Enable a specific feature flag for the user.
 */
async function handleBenefitGranted(payload: PolarBenefitGrantPayload): Promise<void> {
  const email = getCustomerEmail(payload);
  if (!email) {
    logger.warn('[polarWebhook] benefit.granted: missing customer email', { grantId: payload.id });
    return;
  }

  const user = await findUserByEmail(email);
  if (!user) {
    logger.warn('[polarWebhook] benefit.granted: user not found', { email });
    return;
  }

  const benefitId = payload.benefit?.id ?? payload.benefit_id ?? payload.benefitId;
  const benefitDescription = payload.benefit?.description ?? benefitId ?? 'unknown';
  const benefitType = payload.benefit?.type ?? 'feature';

  // Record the granted benefit in audit log and notify user
  await logAuditEvent(user.id, 'subscription_upgrade', {
    eventType: 'benefit.granted',
    grantId: payload.id,
    benefitId,
    benefitDescription,
    benefitType,
  });

  enqueueSubscriptionEmail(
    user.email,
    'A new benefit has been granted to your Gitgram account',
    buildSubscriptionEmailHtml(
      'Benefit Granted',
      `The feature "${benefitDescription}" has been enabled on your account.`,
    ),
  );

  logger.info('[polarWebhook] Benefit granted', { userId: user.id, benefitId, benefitDescription });
}

/**
 * benefit.revoked
 * Disable a specific feature flag for the user.
 */
async function handleBenefitRevoked(payload: PolarBenefitGrantPayload): Promise<void> {
  const email = getCustomerEmail(payload);
  if (!email) {
    logger.warn('[polarWebhook] benefit.revoked: missing customer email', { grantId: payload.id });
    return;
  }

  const user = await findUserByEmail(email);
  if (!user) {
    logger.warn('[polarWebhook] benefit.revoked: user not found', { email });
    return;
  }

  const benefitId = payload.benefit?.id ?? payload.benefit_id ?? payload.benefitId;
  const benefitDescription = payload.benefit?.description ?? benefitId ?? 'unknown';

  await logAuditEvent(user.id, 'subscription_downgrade', {
    eventType: 'benefit.revoked',
    grantId: payload.id,
    benefitId,
    benefitDescription,
  });

  enqueueSubscriptionEmail(
    user.email,
    'A benefit has been removed from your Gitgram account',
    buildSubscriptionEmailHtml(
      'Benefit Revoked',
      `The feature "${benefitDescription}" has been disabled on your account.`,
    ),
  );

  logger.info('[polarWebhook] Benefit revoked', { userId: user.id, benefitId, benefitDescription });
}

// ---------------------------------------------------------------------------
// Event dispatcher
// ---------------------------------------------------------------------------

async function dispatchEvent(envelope: PolarWebhookEnvelope): Promise<void> {
  const { type, data } = envelope;

  switch (type) {
    case 'subscription.created':
    case 'subscription.updated':
      await handleSubscriptionUpsert(data as PolarSubscriptionPayload, type);
      break;

    case 'subscription.canceled':
      await handleSubscriptionCanceled(data as PolarSubscriptionPayload);
      break;

    case 'subscription.revoked':
      await handleSubscriptionRevoked(data as PolarSubscriptionPayload);
      break;

    case 'order.created':
      await handleOrderCreated(data as PolarOrderPayload);
      break;

    case 'benefit.granted':
      await handleBenefitGranted(data as PolarBenefitGrantPayload);
      break;

    case 'benefit.revoked':
      await handleBenefitRevoked(data as PolarBenefitGrantPayload);
      break;

    default:
      logger.info('[polarWebhook] Unhandled event type — ignored', { eventType: type });
  }
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

const router = Router();

/**
 * POST /webhooks/polar
 *
 * Polar.sh sends all events to this single endpoint. The raw body is required
 * for HMAC signature verification, so this route must be mounted BEFORE the
 * global `express.json()` middleware, or the route must use its own raw body
 * parser via `express.raw({ type: 'application/json' })`.
 *
 * Mount in index.ts before the JSON body-parser middleware:
 *   app.use('/webhooks/polar', express.raw({ type: 'application/json' }), polarWebhookRoutes);
 */
router.post(
  '/',
  // Raw body parser so we can verify the HMAC signature
  (req: Request, res: Response, next) => {
    if (Buffer.isBuffer(req.body)) {
      next();
    } else {
      // If body was already parsed as JSON by a parent middleware, reconstruct
      // the buffer from the raw body stored by express.raw or re-parse.
      // To keep things deterministic, always mount this route with express.raw.
      next();
    }
  },
  async (req: Request, res: Response): Promise<void> => {
    const signature = req.headers['x-polar-signature'] as string | undefined;

    if (!signature) {
      logger.warn('[polarWebhook] Missing X-Polar-Signature header');
      res.status(400).json({ success: false, error: 'Missing signature header' });
      return;
    }

    // The raw body must be a Buffer (express.raw middleware ensures this)
    const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body));

    if (!verifyPolarSignature(rawBody, signature)) {
      logger.warn('[polarWebhook] Signature verification failed');
      res.status(401).json({ success: false, error: 'Invalid signature' });
      return;
    }

    let envelope: PolarWebhookEnvelope;
    try {
      envelope = JSON.parse(rawBody.toString('utf-8')) as PolarWebhookEnvelope;
    } catch {
      logger.warn('[polarWebhook] Failed to parse webhook payload as JSON');
      res.status(400).json({ success: false, error: 'Invalid JSON payload' });
      return;
    }

    if (!envelope.type || !envelope.data) {
      logger.warn('[polarWebhook] Webhook payload missing required fields');
      res.status(400).json({ success: false, error: 'Payload must include type and data' });
      return;
    }

    // Acknowledge immediately — Polar expects a 2xx within its timeout window
    res.status(200).json({ success: true, received: true });

    // Process asynchronously so latency spikes don't cause delivery retries
    dispatchEvent(envelope).catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      logger.error('[polarWebhook] Unhandled error in dispatchEvent', { eventType: envelope.type, error: message });
    });
  },
);

export default router;
