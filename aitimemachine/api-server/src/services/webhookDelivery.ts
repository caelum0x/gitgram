import crypto from "crypto";
import { db, schema } from "../db/index.js";
import { eq, and, lte, or } from "drizzle-orm";
import { logger } from "../lib/monitoring.js";

// ============================================
// TYPES
// ============================================

export interface WebhookPayload {
  event: string;
  timestamp: string;
  data: unknown;
}

export type WebhookEventType =
  | "checkpoint.created"
  | "checkpoint.restored"
  | "restore.event"
  | "sync.completed"
  | "sync.failed"
  | "test";

export type DeliveryStatus = "pending" | "success" | "failed";

// ============================================
// CONSTANTS
// ============================================

// Exponential backoff delays in milliseconds: 5s, 30s, 2min, 10min, 1hr
const RETRY_DELAYS_MS = [
  5 * 1000,        // 5 seconds
  30 * 1000,       // 30 seconds
  2 * 60 * 1000,   // 2 minutes
  10 * 60 * 1000,  // 10 minutes
  60 * 60 * 1000,  // 1 hour
];

const MAX_ATTEMPTS = 5;
const MAX_RESPONSE_BODY_LENGTH = 4096; // Truncate response body to 4KB

// ============================================
// HMAC SIGNATURE
// ============================================

/**
 * Generate HMAC-SHA256 signature for webhook payload
 */
export function signPayload(payload: string, secret: string): string {
  return `sha256=${crypto.createHmac("sha256", secret).update(payload).digest("hex")}`;
}

/**
 * Verify HMAC-SHA256 signature
 */
export function verifySignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  const expected = signPayload(payload, secret);
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

// ============================================
// QUEUE WEBHOOK
// ============================================

/**
 * Queue a webhook for delivery. This creates a delivery record in the database
 * and optionally triggers immediate delivery.
 */
export async function queueWebhook(
  webhookId: string,
  eventType: WebhookEventType,
  payload: WebhookPayload
): Promise<string> {
  const id = `del_${Date.now()}_${crypto.randomBytes(8).toString("hex")}`;

  await db.insert(schema.webhookDeliveries).values({
    id,
    webhookId,
    eventType,
    payload,
    status: "pending",
    attempts: 0,
    nextRetryAt: new Date(), // Ready for immediate delivery
  });

  // Trigger delivery asynchronously (fire and forget)
  deliverWebhook(id).catch((error) => {
    logger.error("Failed to deliver webhook", error instanceof Error ? error : undefined, { deliveryId: id, details: String(error) });
  });

  return id;
}

// ============================================
// DELIVER WEBHOOK
// ============================================

/**
 * Attempt to deliver a webhook. This fetches the delivery record,
 * sends the HTTP request, and updates the status accordingly.
 */
export async function deliverWebhook(deliveryId: string): Promise<boolean> {
  // Fetch the delivery record with webhook details
  const [delivery] = await db
    .select({
      id: schema.webhookDeliveries.id,
      webhookId: schema.webhookDeliveries.webhookId,
      eventType: schema.webhookDeliveries.eventType,
      payload: schema.webhookDeliveries.payload,
      status: schema.webhookDeliveries.status,
      attempts: schema.webhookDeliveries.attempts,
    })
    .from(schema.webhookDeliveries)
    .where(eq(schema.webhookDeliveries.id, deliveryId))
    .limit(1);

  if (!delivery) {
    logger.error("Delivery not found", undefined, { deliveryId });
    return false;
  }

  // Skip if already succeeded or exceeded max attempts
  if (delivery.status === "success") {
    return true;
  }

  if ((delivery.attempts ?? 0) >= MAX_ATTEMPTS) {
    await db
      .update(schema.webhookDeliveries)
      .set({ status: "failed" })
      .where(eq(schema.webhookDeliveries.id, deliveryId));
    return false;
  }

  // Fetch the webhook configuration
  const [webhook] = await db
    .select({
      id: schema.webhooks.id,
      url: schema.webhooks.url,
      secret: schema.webhooks.secret,
      isActive: schema.webhooks.isActive,
      failureCount: schema.webhooks.failureCount,
    })
    .from(schema.webhooks)
    .where(eq(schema.webhooks.id, delivery.webhookId))
    .limit(1);

  if (!webhook) {
    logger.error("Webhook not found for delivery", undefined, { webhookId: delivery.webhookId, deliveryId });
    await db
      .update(schema.webhookDeliveries)
      .set({ status: "failed", responseBody: "Webhook not found" })
      .where(eq(schema.webhookDeliveries.id, deliveryId));
    return false;
  }

  if (!webhook.isActive) {
    await db
      .update(schema.webhookDeliveries)
      .set({ status: "failed", responseBody: "Webhook is disabled" })
      .where(eq(schema.webhookDeliveries.id, deliveryId));
    return false;
  }

  // Prepare the request
  const payload = delivery.payload as WebhookPayload;
  const body = JSON.stringify(payload);
  const signature = signPayload(body, webhook.secret);
  const timestamp = new Date().toISOString();

  // Increment attempt count
  const newAttempts = (delivery.attempts ?? 0) + 1;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000); // 30s timeout

    const response = await fetch(webhook.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Webhook-Signature": signature,
        "X-Webhook-Event": payload.event,
        "X-Webhook-Timestamp": timestamp,
        "X-Webhook-Delivery": deliveryId,
        "User-Agent": "GitgramTimeMachine-Webhook/1.0",
      },
      body,
      signal: controller.signal,
    });

    clearTimeout(timeout);

    // Read response body (truncated)
    let responseBody = "";
    try {
      responseBody = await response.text();
      if (responseBody.length > MAX_RESPONSE_BODY_LENGTH) {
        responseBody = responseBody.slice(0, MAX_RESPONSE_BODY_LENGTH) + "...[truncated]";
      }
    } catch {
      responseBody = "[Unable to read response body]";
    }

    const success = response.ok;

    if (success) {
      // Update delivery as successful
      await db
        .update(schema.webhookDeliveries)
        .set({
          status: "success",
          attempts: newAttempts,
          lastAttemptAt: new Date(),
          nextRetryAt: null,
          responseStatus: response.status,
          responseBody,
        })
        .where(eq(schema.webhookDeliveries.id, deliveryId));

      // Update webhook last triggered and reset failure count
      await db
        .update(schema.webhooks)
        .set({
          lastTriggeredAt: new Date(),
          failureCount: 0,
        })
        .where(eq(schema.webhooks.id, webhook.id));

      return true;
    } else {
      // Calculate next retry time
      const nextRetryAt = calculateNextRetry(newAttempts);
      const isFailed = newAttempts >= MAX_ATTEMPTS;

      await db
        .update(schema.webhookDeliveries)
        .set({
          status: isFailed ? "failed" : "pending",
          attempts: newAttempts,
          lastAttemptAt: new Date(),
          nextRetryAt: isFailed ? null : nextRetryAt,
          responseStatus: response.status,
          responseBody,
        })
        .where(eq(schema.webhookDeliveries.id, deliveryId));

      // Increment webhook failure count
      await db
        .update(schema.webhooks)
        .set({
          lastTriggeredAt: new Date(),
          failureCount: webhook.failureCount ? webhook.failureCount + 1 : 1,
        })
        .where(eq(schema.webhooks.id, webhook.id));

      return false;
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const nextRetryAt = calculateNextRetry(newAttempts);
    const isFailed = newAttempts >= MAX_ATTEMPTS;

    await db
      .update(schema.webhookDeliveries)
      .set({
        status: isFailed ? "failed" : "pending",
        attempts: newAttempts,
        lastAttemptAt: new Date(),
        nextRetryAt: isFailed ? null : nextRetryAt,
        responseBody: `Error: ${errorMessage}`,
      })
      .where(eq(schema.webhookDeliveries.id, deliveryId));

    logger.error("Webhook delivery failed", error instanceof Error ? error : undefined, { deliveryId, errorMessage });
    return false;
  }
}

// ============================================
// PROCESS QUEUE
// ============================================

/**
 * Process pending webhook deliveries that are due for retry.
 * This should be called periodically (e.g., every minute) by a background job.
 */
export async function processQueue(): Promise<number> {
  const now = new Date();

  // Find deliveries that are due for retry
  const pendingDeliveries = await db
    .select({ id: schema.webhookDeliveries.id })
    .from(schema.webhookDeliveries)
    .where(
      and(
        eq(schema.webhookDeliveries.status, "pending"),
        lte(schema.webhookDeliveries.nextRetryAt, now)
      )
    )
    .limit(100); // Process up to 100 deliveries at a time

  if (pendingDeliveries.length === 0) {
    return 0;
  }

  // Process deliveries in parallel with limited concurrency
  const results = await Promise.allSettled(
    pendingDeliveries.map((d: { id: string }) => deliverWebhook(d.id))
  );

  const successful = results.filter(
    (r: PromiseSettledResult<boolean>) => r.status === "fulfilled" && r.value === true
  ).length;

  logger.info("Processed webhook deliveries", { total: pendingDeliveries.length, successful });

  return pendingDeliveries.length;
}

// ============================================
// TRIGGER WEBHOOKS FOR USER
// ============================================

/**
 * Trigger all matching webhooks for a user when an event occurs.
 * This is the main entry point for triggering webhooks from other parts of the app.
 */
export async function triggerWebhooksForUser(
  userId: string,
  eventType: WebhookEventType,
  data: unknown
): Promise<string[]> {
  const payload: WebhookPayload = {
    event: eventType,
    timestamp: new Date().toISOString(),
    data,
  };

  // Get all active webhooks for the user that subscribe to this event
  const userWebhooks = await db
    .select({
      id: schema.webhooks.id,
      events: schema.webhooks.events,
    })
    .from(schema.webhooks)
    .where(
      and(
        eq(schema.webhooks.userId, userId),
        eq(schema.webhooks.isActive, true)
      )
    );

  // Filter webhooks that subscribe to this event
  const matchingWebhooks = userWebhooks.filter((wh: { id: string; events: unknown }) => {
    const events = wh.events as string[];
    return events.includes(eventType) || events.includes("*");
  });

  if (matchingWebhooks.length === 0) {
    return [];
  }

  // Queue all matching webhooks
  const deliveryIds = await Promise.all(
    matchingWebhooks.map((wh: { id: string }) => queueWebhook(wh.id, eventType, payload))
  );

  return deliveryIds;
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Calculate the next retry time based on attempt count using exponential backoff.
 */
function calculateNextRetry(attempts: number): Date {
  const delayIndex = Math.min(attempts - 1, RETRY_DELAYS_MS.length - 1);
  const delayMs = RETRY_DELAYS_MS[delayIndex] ?? RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1];
  return new Date(Date.now() + delayMs);
}

/**
 * Get delivery statistics for a webhook
 */
export async function getDeliveryStats(webhookId: string): Promise<{
  total: number;
  pending: number;
  success: number;
  failed: number;
}> {
  const deliveries = await db
    .select({
      status: schema.webhookDeliveries.status,
    })
    .from(schema.webhookDeliveries)
    .where(eq(schema.webhookDeliveries.webhookId, webhookId));

  return {
    total: deliveries.length,
    pending: deliveries.filter((d) => d.status === "pending").length,
    success: deliveries.filter((d) => d.status === "success").length,
    failed: deliveries.filter((d) => d.status === "failed").length,
  };
}

/**
 * Manually retry a failed delivery
 */
export async function retryDelivery(deliveryId: string): Promise<boolean> {
  // Reset the delivery for retry
  const [delivery] = await db
    .select({ status: schema.webhookDeliveries.status })
    .from(schema.webhookDeliveries)
    .where(eq(schema.webhookDeliveries.id, deliveryId))
    .limit(1);

  if (!delivery) {
    return false;
  }

  // Reset attempts and status for retry
  await db
    .update(schema.webhookDeliveries)
    .set({
      status: "pending",
      attempts: 0,
      nextRetryAt: new Date(),
    })
    .where(eq(schema.webhookDeliveries.id, deliveryId));

  // Trigger delivery
  return deliverWebhook(deliveryId);
}
