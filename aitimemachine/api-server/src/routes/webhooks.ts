import { Router, Request, Response } from "express";
import crypto from "crypto";
import { db, schema } from "../db/index.js";
import { eq, and, sql, desc } from "drizzle-orm";
import { apiKeyAuth, AuthenticatedRequest } from "../middleware/auth.js";
import { logger } from "../lib/monitoring.js";
import {
  queueWebhook,
  retryDelivery,
  getDeliveryStats,
  WebhookPayload as ServiceWebhookPayload,
} from "../services/webhookDelivery.js";
import {
  logWebhookCreated,
  logWebhookUpdated,
  logWebhookDeleted,
} from "../services/auditLog.js";

const router = Router();

// ============================================
// WEBHOOK MANAGEMENT
// ============================================

// Register a webhook
router.post("/register", apiKeyAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.userId;
    const { url, events, secret } = req.body;

    if (!url || !events || !Array.isArray(events)) {
      return res.status(400).json({ error: "url and events array required" });
    }

    const id = crypto.randomBytes(16).toString("hex");
    const webhookSecret = secret || crypto.randomBytes(32).toString("hex");

    await db.insert(schema.webhooks).values({
      id,
      userId,
      url,
      secret: webhookSecret,
      events,
      isActive: true,
    });

    // Log audit event
    await logWebhookCreated(userId, id, url, events, req);

    res.json({
      id,
      secret: webhookSecret,
      events,
      message: "Webhook registered. Store the secret securely - it won't be shown again.",
    });
  } catch (error) {
    logger.error("Webhook register error", error instanceof Error ? error : undefined, { details: String(error) });
    res.status(500).json({ error: "Failed to register webhook" });
  }
});

// List webhooks for the authenticated user
router.get("/list", apiKeyAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.userId;

    const userWebhooks = await db
      .select({
        id: schema.webhooks.id,
        url: schema.webhooks.url,
        events: schema.webhooks.events,
        isActive: schema.webhooks.isActive,
        createdAt: schema.webhooks.createdAt,
        lastTriggeredAt: schema.webhooks.lastTriggeredAt,
        failureCount: schema.webhooks.failureCount,
      })
      .from(schema.webhooks)
      .where(eq(schema.webhooks.userId, userId));

    res.json({ webhooks: userWebhooks });
  } catch (error) {
    logger.error("Webhook list error", error instanceof Error ? error : undefined, { details: String(error) });
    res.status(500).json({ error: "Failed to list webhooks" });
  }
});

// Delete a webhook (scoped to authenticated user)
router.delete("/:webhookId", apiKeyAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.userId;
    const { webhookId } = req.params;

    const result = await db
      .delete(schema.webhooks)
      .where(
        and(
          eq(schema.webhooks.id, webhookId),
          eq(schema.webhooks.userId, userId)
        )
      )
      .returning({ id: schema.webhooks.id });

    if (result.length > 0) {
      res.json({ success: true });
    } else {
      res.status(404).json({ error: "Webhook not found" });
    }
  } catch (error) {
    logger.error("Webhook delete error", error instanceof Error ? error : undefined, { details: String(error) });
    res.status(500).json({ error: "Failed to delete webhook" });
  }
});

// Update webhook (enable/disable) - scoped to authenticated user
router.patch("/:webhookId", apiKeyAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.userId;
    const { webhookId } = req.params;
    const { isActive, events, url } = req.body;

    const updateData: Partial<{
      isActive: boolean;
      events: string[];
      url: string;
      updatedAt: Date;
    }> = { updatedAt: new Date() };

    if (typeof isActive === "boolean") updateData.isActive = isActive;
    if (events) updateData.events = events;
    if (url) updateData.url = url;

    const result = await db
      .update(schema.webhooks)
      .set(updateData)
      .where(
        and(
          eq(schema.webhooks.id, webhookId),
          eq(schema.webhooks.userId, userId)
        )
      )
      .returning({ id: schema.webhooks.id });

    if (result.length > 0) {
      res.json({ success: true });
    } else {
      res.status(404).json({ error: "Webhook not found" });
    }
  } catch (error) {
    logger.error("Webhook update error", error instanceof Error ? error : undefined, { details: String(error) });
    res.status(500).json({ error: "Failed to update webhook" });
  }
});

// ============================================
// WEBHOOK DELIVERY
// ============================================

interface WebhookPayload {
  event: string;
  timestamp: string;
  data: any;
}

function signPayload(payload: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

async function deliverWebhook(
  webhookId: string,
  url: string,
  secret: string,
  payload: WebhookPayload
): Promise<boolean> {
  const body = JSON.stringify(payload);
  const signature = signPayload(body, secret);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Webhook-Signature": signature,
        "X-Webhook-Event": payload.event,
        "X-Webhook-Timestamp": payload.timestamp,
      },
      body,
    });

    // Update last triggered time
    await db
      .update(schema.webhooks)
      .set({
        lastTriggeredAt: new Date(),
        failureCount: response.ok ? 0 : undefined,
      })
      .where(eq(schema.webhooks.id, webhookId));

    if (!response.ok) {
      // Increment failure count
      await db.execute(
        sql`UPDATE webhooks SET failure_count = failure_count + 1 WHERE id = ${webhookId}`
      );
    }

    return response.ok;
  } catch (error) {
    logger.error("Webhook delivery failed", error instanceof Error ? error : undefined, { webhookId, details: String(error) });

    // Increment failure count
    try {
      await db.execute(
        sql`UPDATE webhooks SET failure_count = failure_count + 1, last_triggered_at = NOW() WHERE id = ${webhookId}`
      );
    } catch (e) {
      logger.error("Failed to update webhook failure count", e instanceof Error ? e : undefined, { details: String(e) });
    }

    return false;
  }
}

// Trigger webhooks for an event
export async function triggerWebhooks(
  userId: string,
  event: string,
  data: any
): Promise<void> {
  const payload: WebhookPayload = {
    event,
    timestamp: new Date().toISOString(),
    data,
  };

  try {
    // Get all active webhooks for user that subscribe to this event
    const userWebhooks = await db
      .select()
      .from(schema.webhooks)
      .where(
        and(
          eq(schema.webhooks.userId, userId),
          eq(schema.webhooks.isActive, true)
        )
      );

    // Filter webhooks that subscribe to this event
    const matchingWebhooks = userWebhooks.filter((wh: any) => {
      const events = wh.events as string[];
      return events.includes(event) || events.includes("*");
    });

    // Deliver webhooks in parallel (fire and forget)
    Promise.all(
      matchingWebhooks.map((wh: any) =>
        deliverWebhook(wh.id, wh.url, wh.secret, payload)
      )
    ).catch((error) => logger.error("Webhook delivery error", error instanceof Error ? error : undefined, { details: String(error) }));
  } catch (error) {
    logger.error("Failed to trigger webhooks", error instanceof Error ? error : undefined, { details: String(error) });
  }
}

// ============================================
// TEST WEBHOOK
// ============================================

router.post("/test", apiKeyAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.userId;
    const { webhookId } = req.body;

    const [webhook] = await db
      .select()
      .from(schema.webhooks)
      .where(
        and(
          eq(schema.webhooks.id, webhookId),
          eq(schema.webhooks.userId, userId)
        )
      )
      .limit(1);

    if (!webhook) {
      return res.status(404).json({ error: "Webhook not found" });
    }

    const testPayload: WebhookPayload = {
      event: "test",
      timestamp: new Date().toISOString(),
      data: {
        message: "This is a test webhook from Gitgram TimeMachine",
        webhookId,
      },
    };

    const success = await deliverWebhook(
      webhook.id,
      webhook.url,
      webhook.secret,
      testPayload
    );

    res.json({
      success,
      message: success ? "Test webhook delivered successfully" : "Webhook delivery failed",
    });
  } catch (error) {
    logger.error("Webhook test error", error instanceof Error ? error : undefined, { details: String(error) });
    res.status(500).json({ error: "Failed to test webhook" });
  }
});

// ============================================
// SSE (Server-Sent Events) for real-time updates
// ============================================

interface SSEClient {
  id: string;
  userId: string;
  projectId?: string;
  res: Response;
}

const sseClients: SSEClient[] = [];

router.get("/events", apiKeyAuth, (req: AuthenticatedRequest, res) => {
  const userId = req.user!.userId;
  const { projectId } = req.query;

  // Set up SSE
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no"); // For nginx

  const clientId = crypto.randomBytes(8).toString("hex");

  const client: SSEClient = {
    id: clientId,
    userId,
    projectId: projectId as string | undefined,
    res,
  };

  sseClients.push(client);

  // Send initial connection message
  res.write(`event: connected\ndata: ${JSON.stringify({ clientId })}\n\n`);

  // Heartbeat every 30 seconds
  const heartbeat = setInterval(() => {
    res.write(`: heartbeat\n\n`);
  }, 30000);

  // Clean up on close
  req.on("close", () => {
    clearInterval(heartbeat);
    const index = sseClients.findIndex((c) => c.id === clientId);
    if (index !== -1) {
      sseClients.splice(index, 1);
    }
  });
});

// Send event to SSE clients
export function sendSSEEvent(
  userId: string,
  event: string,
  data: any,
  projectId?: string
): void {
  const payload = JSON.stringify({
    event,
    timestamp: new Date().toISOString(),
    data,
  });

  for (const client of sseClients) {
    if (client.userId === userId) {
      if (projectId && client.projectId && client.projectId !== projectId) {
        continue;
      }
      try {
        client.res.write(`event: ${event}\ndata: ${payload}\n\n`);
      } catch (error) {
        // Client disconnected
      }
    }
  }
}

// ============================================
// WEBHOOK DELIVERIES (Reliable delivery)
// ============================================

// List webhook deliveries
// GET /v1/webhooks/:webhookId/deliveries
router.get("/:webhookId/deliveries", apiKeyAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { webhookId } = req.params;
    const userId = req.user!.userId;
    const { limit = "50", offset = "0", status } = req.query;

    // Verify webhook belongs to user
    const [webhook] = await db
      .select({ id: schema.webhooks.id })
      .from(schema.webhooks)
      .where(
        and(
          eq(schema.webhooks.id, webhookId),
          eq(schema.webhooks.userId, userId)
        )
      )
      .limit(1);

    if (!webhook) {
      return res.status(404).json({
        error: {
          type: "not_found",
          message: "Webhook not found",
        },
      });
    }

    // Build query
    const deliveries = await db
      .select({
        id: schema.webhookDeliveries.id,
        eventType: schema.webhookDeliveries.eventType,
        status: schema.webhookDeliveries.status,
        attempts: schema.webhookDeliveries.attempts,
        lastAttemptAt: schema.webhookDeliveries.lastAttemptAt,
        nextRetryAt: schema.webhookDeliveries.nextRetryAt,
        responseStatus: schema.webhookDeliveries.responseStatus,
        createdAt: schema.webhookDeliveries.createdAt,
      })
      .from(schema.webhookDeliveries)
      .where(
        status
          ? and(
              eq(schema.webhookDeliveries.webhookId, webhookId),
              eq(schema.webhookDeliveries.status, status as string)
            )
          : eq(schema.webhookDeliveries.webhookId, webhookId)
      )
      .orderBy(desc(schema.webhookDeliveries.createdAt))
      .limit(parseInt(limit as string, 10))
      .offset(parseInt(offset as string, 10));

    // Get stats
    const stats = await getDeliveryStats(webhookId);

    res.json({
      deliveries,
      stats,
      pagination: {
        limit: parseInt(limit as string, 10),
        offset: parseInt(offset as string, 10),
        hasMore: deliveries.length === parseInt(limit as string, 10),
      },
    });
  } catch (error) {
    logger.error("List webhook deliveries error", error instanceof Error ? error : undefined, { details: String(error) });
    res.status(500).json({
      error: {
        type: "internal_error",
        message: "Failed to list webhook deliveries",
      },
    });
  }
});

// Get single delivery details
// GET /v1/webhooks/:webhookId/deliveries/:deliveryId
router.get(
  "/:webhookId/deliveries/:deliveryId",
  apiKeyAuth,
  async (req: AuthenticatedRequest, res) => {
    try {
      const { webhookId, deliveryId } = req.params;
      const userId = req.user!.userId;

      // Verify webhook belongs to user
      const [webhook] = await db
        .select({ id: schema.webhooks.id })
        .from(schema.webhooks)
        .where(
          and(
            eq(schema.webhooks.id, webhookId),
            eq(schema.webhooks.userId, userId)
          )
        )
        .limit(1);

      if (!webhook) {
        return res.status(404).json({
          error: {
            type: "not_found",
            message: "Webhook not found",
          },
        });
      }

      // Get delivery details
      const [delivery] = await db
        .select()
        .from(schema.webhookDeliveries)
        .where(
          and(
            eq(schema.webhookDeliveries.id, deliveryId),
            eq(schema.webhookDeliveries.webhookId, webhookId)
          )
        )
        .limit(1);

      if (!delivery) {
        return res.status(404).json({
          error: {
            type: "not_found",
            message: "Delivery not found",
          },
        });
      }

      res.json({ delivery });
    } catch (error) {
      logger.error("Get webhook delivery error", error instanceof Error ? error : undefined, { details: String(error) });
      res.status(500).json({
        error: {
          type: "internal_error",
          message: "Failed to get webhook delivery",
        },
      });
    }
  }
);

// Test webhook with reliable delivery
// POST /v1/webhooks/:webhookId/test
router.post("/:webhookId/test", apiKeyAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { webhookId } = req.params;
    const userId = req.user!.userId;

    // Verify webhook belongs to user
    const [webhook] = await db
      .select({
        id: schema.webhooks.id,
        url: schema.webhooks.url,
        isActive: schema.webhooks.isActive,
      })
      .from(schema.webhooks)
      .where(
        and(
          eq(schema.webhooks.id, webhookId),
          eq(schema.webhooks.userId, userId)
        )
      )
      .limit(1);

    if (!webhook) {
      return res.status(404).json({
        error: {
          type: "not_found",
          message: "Webhook not found",
        },
      });
    }

    if (!webhook.isActive) {
      return res.status(400).json({
        error: {
          type: "invalid_request",
          message: "Webhook is disabled. Enable it before testing.",
        },
      });
    }

    // Create test payload
    const testPayload: ServiceWebhookPayload = {
      event: "test",
      timestamp: new Date().toISOString(),
      data: {
        message: "This is a test webhook from Gitgram TimeMachine",
        webhookId,
        targetUrl: webhook.url,
      },
    };

    // Queue the test webhook
    const deliveryId = await queueWebhook(webhookId, "test", testPayload);

    // Wait a moment for delivery to complete
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Check delivery status
    const [delivery] = await db
      .select({
        status: schema.webhookDeliveries.status,
        responseStatus: schema.webhookDeliveries.responseStatus,
        responseBody: schema.webhookDeliveries.responseBody,
        attempts: schema.webhookDeliveries.attempts,
      })
      .from(schema.webhookDeliveries)
      .where(eq(schema.webhookDeliveries.id, deliveryId))
      .limit(1);

    res.json({
      deliveryId,
      status: delivery?.status || "pending",
      responseStatus: delivery?.responseStatus,
      responseBody: delivery?.responseBody,
      attempts: delivery?.attempts || 1,
      message:
        delivery?.status === "success"
          ? "Test webhook delivered successfully"
          : "Test webhook delivery attempted - check delivery details for status",
    });
  } catch (error) {
    logger.error("Test webhook error", error instanceof Error ? error : undefined, { details: String(error) });
    res.status(500).json({
      error: {
        type: "internal_error",
        message: "Failed to test webhook",
      },
    });
  }
});

// Manual retry a failed delivery
// POST /v1/webhooks/:webhookId/deliveries/:deliveryId/retry
router.post(
  "/:webhookId/deliveries/:deliveryId/retry",
  apiKeyAuth,
  async (req: AuthenticatedRequest, res) => {
    try {
      const { webhookId, deliveryId } = req.params;
      const userId = req.user!.userId;

      // Verify webhook belongs to user
      const [webhook] = await db
        .select({ id: schema.webhooks.id, isActive: schema.webhooks.isActive })
        .from(schema.webhooks)
        .where(
          and(
            eq(schema.webhooks.id, webhookId),
            eq(schema.webhooks.userId, userId)
          )
        )
        .limit(1);

      if (!webhook) {
        return res.status(404).json({
          error: {
            type: "not_found",
            message: "Webhook not found",
          },
        });
      }

      if (!webhook.isActive) {
        return res.status(400).json({
          error: {
            type: "invalid_request",
            message: "Webhook is disabled. Enable it before retrying deliveries.",
          },
        });
      }

      // Verify delivery belongs to webhook
      const [delivery] = await db
        .select({ id: schema.webhookDeliveries.id })
        .from(schema.webhookDeliveries)
        .where(
          and(
            eq(schema.webhookDeliveries.id, deliveryId),
            eq(schema.webhookDeliveries.webhookId, webhookId)
          )
        )
        .limit(1);

      if (!delivery) {
        return res.status(404).json({
          error: {
            type: "not_found",
            message: "Delivery not found",
          },
        });
      }

      // Attempt retry
      const success = await retryDelivery(deliveryId);

      // Get updated delivery status
      const [updatedDelivery] = await db
        .select({
          status: schema.webhookDeliveries.status,
          attempts: schema.webhookDeliveries.attempts,
          responseStatus: schema.webhookDeliveries.responseStatus,
          responseBody: schema.webhookDeliveries.responseBody,
        })
        .from(schema.webhookDeliveries)
        .where(eq(schema.webhookDeliveries.id, deliveryId))
        .limit(1);

      res.json({
        success,
        deliveryId,
        status: updatedDelivery?.status,
        attempts: updatedDelivery?.attempts,
        responseStatus: updatedDelivery?.responseStatus,
        message: success
          ? "Webhook retry successful"
          : "Webhook retry failed - will be retried automatically",
      });
    } catch (error) {
      logger.error("Retry webhook delivery error", error instanceof Error ? error : undefined, { details: String(error) });
      res.status(500).json({
        error: {
          type: "internal_error",
          message: "Failed to retry webhook delivery",
        },
      });
    }
  }
);

// Get delivery stats for a webhook
// GET /v1/webhooks/:webhookId/stats
router.get("/:webhookId/stats", apiKeyAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { webhookId } = req.params;
    const userId = req.user!.userId;

    // Verify webhook belongs to user
    const [webhook] = await db
      .select({ id: schema.webhooks.id })
      .from(schema.webhooks)
      .where(
        and(
          eq(schema.webhooks.id, webhookId),
          eq(schema.webhooks.userId, userId)
        )
      )
      .limit(1);

    if (!webhook) {
      return res.status(404).json({
        error: {
          type: "not_found",
          message: "Webhook not found",
        },
      });
    }

    const stats = await getDeliveryStats(webhookId);

    res.json({ stats });
  } catch (error) {
    logger.error("Get webhook stats error", error instanceof Error ? error : undefined, { details: String(error) });
    res.status(500).json({
      error: {
        type: "internal_error",
        message: "Failed to get webhook stats",
      },
    });
  }
});

export default router;
