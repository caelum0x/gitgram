/**
 * Outgoing webhook delivery service.
 *
 * Handles scheduling, signing, delivering, and retrying Gitgram webhooks
 * sent to external subscriber URLs whenever repository or profile events occur.
 */

import crypto from 'crypto';
import axios, { AxiosError } from 'axios';
import { Prisma } from '@prisma/client';
import prisma from '../utils/prisma';
import logger from '../utils/logger';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type WebhookEvent =
  | 'push'
  | 'pull_request'
  | 'issue'
  | 'star'
  | 'fork'
  | 'release'
  | 'follow'
  | 'post'
  | 'ping';

export interface WebhookDelivery {
  id: string;
  webhookId: string;
  event: string;
  payload: Record<string, unknown>;
  response: string | null;
  status: 'pending' | 'success' | 'failed';
  attemptCount: number;
  nextRetryAt: Date | null;
  createdAt: Date;
}

export interface DeliveryResult {
  deliveryId: string;
  success: boolean;
  statusCode?: number;
  responseBody?: string;
  durationMs: number;
  error?: string;
}

// Retry backoff intervals in milliseconds
const RETRY_BACKOFFS_MS = [
  2 * 60 * 1000,   // 2 minutes
  10 * 60 * 1000,  // 10 minutes
  30 * 60 * 1000,  // 30 minutes
  2 * 60 * 60 * 1000, // 2 hours
  8 * 60 * 60 * 1000, // 8 hours
] as const;

const MAX_ATTEMPTS = RETRY_BACKOFFS_MS.length + 1; // 6 total (1 initial + 5 retries)
const DELIVERY_TIMEOUT_MS = 30_000;
const RESPONSE_BODY_LIMIT = 1_000; // characters stored in DB

// ---------------------------------------------------------------------------
// In-process retry registry
//
// Maps deliveryId -> { attemptCount, nextRetryAt, timeoutHandle }
// This avoids a DB schema migration while providing full retry semantics.
// On process restart, `retryFailedDeliveries()` recovers from DB state.
// ---------------------------------------------------------------------------

interface RetryEntry {
  attemptCount: number;
  nextRetryAt: Date;
  timeoutHandle: ReturnType<typeof setTimeout>;
}

const retryRegistry = new Map<string, RetryEntry>();

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

interface WebhookConfig {
  id: string;
  url: string;
  secret: string | null;
  events: string[];
  active: boolean;
}

async function fetchWebhookConfig(webhookId: string): Promise<WebhookConfig | null> {
  const webhook = await prisma.userWebhook.findUnique({
    where: { id: webhookId },
    select: {
      id: true,
      url: true,
      secret: true,
      events: true,
      active: true,
    },
  });
  return webhook;
}

function signPayload(payload: Record<string, unknown>, secret: string): string {
  const body = JSON.stringify(payload);
  const hmac = crypto.createHmac('sha256', secret).update(body).digest('hex');
  return `sha256=${hmac}`;
}

function truncate(text: string, limit: number): string {
  return text.length > limit ? text.slice(0, limit) : text;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function getCurrentAttemptCount(deliveryId: string): number {
  return retryRegistry.get(deliveryId)?.attemptCount ?? 0;
}

function scheduleRetry(deliveryId: string, currentAttemptCount: number): Date | null {
  const backoffIndex = currentAttemptCount; // 0-based: attempt 1 failed -> index 0
  if (backoffIndex >= RETRY_BACKOFFS_MS.length) {
    return null; // exhausted all retries
  }

  const delayMs = RETRY_BACKOFFS_MS[backoffIndex];
  const nextRetryAt = new Date(Date.now() + delayMs);

  const timeoutHandle = setTimeout(() => {
    retryRegistry.delete(deliveryId);
    attemptDelivery(deliveryId).catch((err: unknown) => {
      logger.error('Scheduled retry failed', { deliveryId, error: getErrorMessage(err) });
    });
  }, delayMs);

  retryRegistry.set(deliveryId, {
    attemptCount: currentAttemptCount + 1,
    nextRetryAt,
    timeoutHandle,
  });

  return nextRetryAt;
}

function cancelRetry(deliveryId: string): void {
  const entry = retryRegistry.get(deliveryId);
  if (entry) {
    clearTimeout(entry.timeoutHandle);
    retryRegistry.delete(deliveryId);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Creates a delivery record in the database and immediately attempts delivery.
 */
export async function scheduleDelivery(
  webhookId: string,
  event: WebhookEvent,
  payload: Record<string, unknown>
): Promise<void> {
  const delivery = await prisma.webhookDelivery.create({
    data: {
      webhookId,
      event,
      payload: payload as unknown as Prisma.InputJsonValue,
      success: false,
    },
  });

  // Fire-and-forget; errors are logged inside attemptDelivery
  attemptDelivery(delivery.id).catch((err: unknown) => {
    logger.error('Initial delivery attempt failed', {
      deliveryId: delivery.id,
      error: getErrorMessage(err),
    });
  });
}

/**
 * Fetches webhook config, signs the payload, POSTs to the subscriber URL,
 * records the response, and schedules a retry on failure.
 */
export async function attemptDelivery(deliveryId: string): Promise<DeliveryResult> {
  const deliveryRecord = await prisma.webhookDelivery.findUnique({
    where: { id: deliveryId },
    select: {
      id: true,
      webhookId: true,
      event: true,
      payload: true,
    },
  });

  if (!deliveryRecord) {
    throw new Error(`Delivery record not found: ${deliveryId}`);
  }

  const webhookConfig = await fetchWebhookConfig(deliveryRecord.webhookId);

  if (!webhookConfig) {
    logger.warn('Webhook config not found; aborting delivery', {
      deliveryId,
      webhookId: deliveryRecord.webhookId,
    });
    await prisma.webhookDelivery.update({
      where: { id: deliveryId },
      data: {
        success: false,
        error: 'Webhook configuration not found',
      },
    });
    return {
      deliveryId,
      success: false,
      durationMs: 0,
      error: 'Webhook configuration not found',
    };
  }

  if (!webhookConfig.active) {
    await prisma.webhookDelivery.update({
      where: { id: deliveryId },
      data: {
        success: false,
        error: 'Webhook is inactive',
      },
    });
    return { deliveryId, success: false, durationMs: 0, error: 'Webhook is inactive' };
  }

  const payload = deliveryRecord.payload as Record<string, unknown>;
  const deliveryId_ = crypto.randomUUID();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'User-Agent': 'Gitgram-Webhook/1.0',
    'X-Gitgram-Event': deliveryRecord.event,
    'X-Gitgram-Delivery': deliveryId_,
  };

  if (webhookConfig.secret) {
    headers['X-Gitgram-Signature'] = signPayload(payload, webhookConfig.secret);
  }

  const startTime = Date.now();
  let statusCode: number | undefined;
  let responseBody: string | undefined;
  let success = false;
  let errorMessage: string | undefined;

  try {
    const response = await axios.post(webhookConfig.url, payload, {
      headers,
      timeout: DELIVERY_TIMEOUT_MS,
      validateStatus: () => true, // capture non-2xx without throwing
    });

    statusCode = response.status;
    const rawBody =
      typeof response.data === 'string'
        ? response.data
        : JSON.stringify(response.data);
    responseBody = truncate(rawBody, RESPONSE_BODY_LIMIT);
    success = response.status >= 200 && response.status < 300;

    if (!success) {
      errorMessage = `HTTP ${response.status}`;
    }
  } catch (err: unknown) {
    if (err instanceof AxiosError) {
      errorMessage = err.message;
      statusCode = err.response?.status;
    } else {
      errorMessage = getErrorMessage(err);
    }
    logger.error('Webhook HTTP request failed', {
      deliveryId,
      url: webhookConfig.url,
      error: errorMessage,
    });
  }

  const durationMs = Date.now() - startTime;
  const attemptCount = getCurrentAttemptCount(deliveryId);

  let nextRetryAt: Date | null = null;

  if (!success && attemptCount < MAX_ATTEMPTS - 1) {
    nextRetryAt = scheduleRetry(deliveryId, attemptCount);
    logger.info('Webhook delivery failed; retry scheduled', {
      deliveryId,
      attempt: attemptCount + 1,
      nextRetryAt,
    });
  } else if (success) {
    cancelRetry(deliveryId);
  }

  await prisma.webhookDelivery.update({
    where: { id: deliveryId },
    data: {
      statusCode,
      response: responseBody ?? null,
      success,
      error: errorMessage ?? null,
      duration: durationMs,
    },
  });

  return {
    deliveryId,
    success,
    statusCode,
    responseBody,
    durationMs,
    error: errorMessage,
  };
}

/**
 * Scans the retry registry for deliveries whose nextRetryAt has passed
 * and triggers each one. Also recovers deliveries that failed during a
 * previous process lifecycle by querying the DB for recent failures.
 *
 * Returns the count of deliveries retried.
 */
export async function retryFailedDeliveries(): Promise<number> {
  let count = 0;

  // 1. Process in-memory registry entries that are due
  const now = new Date();
  const dueEntries = [...retryRegistry.entries()].filter(
    ([, entry]) => entry.nextRetryAt <= now
  );

  for (const [deliveryId] of dueEntries) {
    cancelRetry(deliveryId); // clear the timeout, we're handling it now
    attemptDelivery(deliveryId).catch((err: unknown) => {
      logger.error('Manual retry failed', { deliveryId, error: getErrorMessage(err) });
    });
    count++;
  }

  // 2. Recover deliveries that failed in a prior process (not in registry)
  const recentFailures = await prisma.webhookDelivery.findMany({
    where: {
      success: false,
      createdAt: {
        // Only consider deliveries from the last 24 hours (covers all retry windows)
        gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
      },
    },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });

  const orphanedIds = recentFailures
    .map((d) => d.id)
    .filter((id) => !retryRegistry.has(id));

  for (const deliveryId of orphanedIds) {
    attemptDelivery(deliveryId).catch((err: unknown) => {
      logger.error('Orphan retry failed', { deliveryId, error: getErrorMessage(err) });
    });
    count++;
  }

  if (count > 0) {
    logger.info('retryFailedDeliveries dispatched', { count });
  }

  return count;
}

/**
 * Returns recent delivery attempts for a given webhook, newest first.
 */
export async function getDeliveryHistory(
  webhookId: string,
  limit = 50
): Promise<WebhookDelivery[]> {
  const records = await prisma.webhookDelivery.findMany({
    where: { webhookId },
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: {
      id: true,
      webhookId: true,
      event: true,
      payload: true,
      response: true,
      success: true,
      statusCode: true,
      createdAt: true,
    },
  });

  return records.map((record) => {
    const retryEntry = retryRegistry.get(record.id);
    const status: WebhookDelivery['status'] = record.success
      ? 'success'
      : retryEntry
      ? 'pending'
      : 'failed';

    return {
      id: record.id,
      webhookId: record.webhookId,
      event: record.event,
      payload: record.payload as Record<string, unknown>,
      response: record.response,
      status,
      attemptCount: retryEntry?.attemptCount ?? (record.success ? 1 : MAX_ATTEMPTS),
      nextRetryAt: retryEntry?.nextRetryAt ?? null,
      createdAt: record.createdAt,
    };
  });
}

/**
 * Sends a test "ping" payload to verify the webhook endpoint is reachable.
 */
export async function testWebhook(webhookId: string): Promise<DeliveryResult> {
  const webhookConfig = await fetchWebhookConfig(webhookId);

  if (!webhookConfig) {
    throw new Error(`Webhook not found: ${webhookId}`);
  }

  const pingPayload: Record<string, unknown> = {
    event: 'ping',
    zen: 'Keep it simple.',
    hookId: webhookId,
    timestamp: new Date().toISOString(),
  };

  const delivery = await prisma.webhookDelivery.create({
    data: {
      webhookId,
      event: 'ping',
      payload: pingPayload as unknown as Prisma.InputJsonValue,
      success: false,
    },
  });

  return attemptDelivery(delivery.id);
}
