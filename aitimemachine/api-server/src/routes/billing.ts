import { Router, Request, Response, raw } from "express";
import { Polar } from "@polar-sh/sdk";
import { validateEvent, WebhookVerificationError } from "@polar-sh/sdk/webhooks";
import { db, schema } from "../db/index.js";
import { eq, and, desc } from "drizzle-orm";
import { internalAuth, apiKeyAuth, AuthenticatedRequest } from "../middleware/auth.js";
import { logger } from "../lib/monitoring.js";

const router = Router();

// Initialize Polar client
const polar = new Polar({
  accessToken: process.env.POLAR_ACCESS_TOKEN,
  ...(process.env.POLAR_SERVER_URL
    ? { serverURL: process.env.POLAR_SERVER_URL }
    : { server: (process.env.POLAR_MODE as "sandbox" | "production") || "sandbox" }),
});

// Product ID to plan mapping
const PRODUCT_PLAN_MAP: Record<string, string> = {
  [process.env.POLAR_PRO_PRODUCT_ID || ""]: "pro",
  [process.env.POLAR_TEAM_PRODUCT_ID || ""]: "team",
};

// ============================================================================
// Webhook Handler
// ============================================================================

function getField<T>(
  input: Record<string, any> | null | undefined,
  ...keys: string[]
): T | undefined {
  for (const key of keys) {
    const value = input?.[key];
    if (value !== undefined && value !== null) {
      return value as T;
    }
  }
  return undefined;
}

/**
 * POST /webhooks/polar
 * Handle Polar webhook events
 */
router.post(
  "/webhooks/polar",
  raw({ type: "application/json" }),
  async (req: Request, res: Response) => {
    const webhookSecret = process.env.POLAR_WEBHOOK_SECRET;

    if (!webhookSecret) {
      logger.error("POLAR_WEBHOOK_SECRET not configured");
      return res.status(500).json({ error: "Webhook secret not configured" });
    }

    let event;
    try {
      const payload = Buffer.isBuffer(req.body)
        ? req.body
        : Buffer.from(
            typeof req.body === "string" ? req.body : JSON.stringify(req.body)
          );
      event = validateEvent(
        payload,
        req.headers as Record<string, string>,
        webhookSecret,
      );
    } catch (error) {
      if (error instanceof WebhookVerificationError) {
        logger.error("Invalid Polar webhook signature");
        return res.status(401).json({ error: "Invalid signature" });
      }
      logger.error("Failed to parse Polar webhook payload", error instanceof Error ? error : undefined, { details: String(error) });
      return res.status(400).json({ error: "Invalid webhook payload" });
    }

    logger.info("Received Polar webhook", { eventType: event.type });

    try {
      switch (event.type) {
        case "subscription.created":
        case "subscription.active":
        case "subscription.updated":
          await handleSubscriptionUpdate(event.data as Record<string, any>);
          break;

        case "subscription.canceled":
        case "subscription.revoked":
          await handleSubscriptionCanceled(event.data as Record<string, any>);
          break;

        case "checkout.created":
        case "checkout.updated":
          // Optional: track checkout attempts for analytics
          logger.info("Checkout created", { checkoutId: event.data.id });
          break;

        default:
          logger.info("Unhandled webhook event", { eventType: event.type });
      }

      return res.json({ received: true });
    } catch (error) {
      logger.error("Error processing webhook", error instanceof Error ? error : undefined, { details: String(error) });
      return res.status(500).json({ error: "Webhook processing failed" });
    }
  }
);

/**
 * Handle subscription created/updated events
 */
async function handleSubscriptionUpdate(subscription: Record<string, any>) {
  const id = getField<string>(subscription, "id");
  const customerId = getField<string>(subscription, "customerId", "customer_id");
  const productId = getField<string>(subscription, "productId", "product_id");
  const status = getField<string>(subscription, "status") || "active";
  const currentPeriodStart = getField<string>(
    subscription,
    "currentPeriodStart",
    "current_period_start",
  );
  const currentPeriodEnd = getField<string>(
    subscription,
    "currentPeriodEnd",
    "current_period_end",
  );
  const cancelAtPeriodEnd = getField<boolean>(
    subscription,
    "cancelAtPeriodEnd",
    "cancel_at_period_end",
  ) || false;
  const metadata = getField<Record<string, any>>(subscription, "metadata") || {};

  if (!id || !customerId || !productId) {
    logger.error("Polar subscription payload missing required fields", undefined, {
      subscriptionId: id,
      customerId,
      productId,
    });
    return;
  }

  // Get plan from product ID
  const plan = PRODUCT_PLAN_MAP[productId] || "pro";

  // Find user by polar customer ID or metadata
  const userId = getField<string>(metadata, "userId", "user_id");
  if (!userId) {
    // Try to find user by polar customer ID
    const [user] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.polarCustomerId, customerId))
      .limit(1);

    if (!user) {
      logger.error("No user found for Polar customer", undefined, { customerId });
      return;
    }
  }

  // Get user ID either from metadata or from existing user
  let actualUserId = userId;
  if (!actualUserId) {
    const [user] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.polarCustomerId, customerId))
      .limit(1);
    actualUserId = user?.id;
  }

  if (!actualUserId) {
    logger.error("Cannot determine user for subscription", undefined, { subscriptionId: id });
    return;
  }

  // Upsert subscription record
  const existingSubscription = await db
    .select()
    .from(schema.subscriptions)
    .where(eq(schema.subscriptions.id, id))
    .limit(1);

  if (existingSubscription.length > 0) {
    // Update existing subscription
    await db
      .update(schema.subscriptions)
      .set({
        status,
        plan,
        currentPeriodStart: currentPeriodStart
          ? new Date(currentPeriodStart)
          : null,
        currentPeriodEnd: currentPeriodEnd
          ? new Date(currentPeriodEnd)
          : null,
        cancelAtPeriodEnd,
        updatedAt: new Date(),
      })
      .where(eq(schema.subscriptions.id, id));
  } else {
    // Create new subscription
    await db.insert(schema.subscriptions).values({
      id,
      userId: actualUserId,
      polarCustomerId: customerId,
      polarProductId: productId,
      status,
      plan,
      currentPeriodStart: currentPeriodStart
        ? new Date(currentPeriodStart)
        : null,
      currentPeriodEnd: currentPeriodEnd
        ? new Date(currentPeriodEnd)
        : null,
      cancelAtPeriodEnd,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  // Update user's plan if subscription is active
  if (status === "active") {
    await db
      .update(schema.users)
      .set({
        plan,
        polarCustomerId: customerId,
        updatedAt: new Date(),
      })
      .where(eq(schema.users.id, actualUserId));

    logger.info("Updated user plan", { userId: actualUserId, plan });
  }
}

/**
 * Handle subscription canceled events
 */
async function handleSubscriptionCanceled(subscription: Record<string, any>) {
  const id = getField<string>(subscription, "id");
  const canceledAt = getField<string>(subscription, "canceledAt", "canceled_at");

  if (!id) {
    logger.error("Polar cancellation payload missing subscription id");
    return;
  }

  // Update subscription record
  await db
    .update(schema.subscriptions)
    .set({
      status: "canceled",
      canceledAt: canceledAt ? new Date(canceledAt) : new Date(),
      updatedAt: new Date(),
    })
    .where(eq(schema.subscriptions.id, id));

  // Get the subscription to find the user
  const [sub] = await db
    .select()
    .from(schema.subscriptions)
    .where(eq(schema.subscriptions.id, id))
    .limit(1);

  if (sub) {
    // Check if user has any other active subscriptions
    const otherActiveSubs = await db
      .select()
      .from(schema.subscriptions)
      .where(
        and(
          eq(schema.subscriptions.userId, sub.userId),
          eq(schema.subscriptions.status, "active")
        )
      )
      .limit(1);

    // If no other active subscriptions, downgrade to free
    if (otherActiveSubs.length === 0) {
      await db
        .update(schema.users)
        .set({
          plan: "free",
          updatedAt: new Date(),
        })
        .where(eq(schema.users.id, sub.userId));

      logger.info("Downgraded user to free plan", { userId: sub.userId });
    }
  }
}

// ============================================================================
// Internal API Endpoints (called by website)
// ============================================================================

/**
 * GET /internal/subscription
 * Get subscription status for a user
 */
router.get(
  "/subscription",
  internalAuth,
  async (req: Request, res: Response) => {
    const userId = req.query.userId as string;

    if (!userId) {
      return res.status(400).json({ error: "userId is required" });
    }

    try {
      // Get the most recent active subscription
      const [subscription] = await db
        .select()
        .from(schema.subscriptions)
        .where(
          and(
            eq(schema.subscriptions.userId, userId),
            eq(schema.subscriptions.status, "active")
          )
        )
        .orderBy(desc(schema.subscriptions.createdAt))
        .limit(1);

      // Get user info
      const [user] = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.id, userId))
        .limit(1);

      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      return res.json({
        subscription: subscription || null,
        user: {
          id: user.id,
          email: user.email,
          plan: user.plan,
          polarCustomerId: user.polarCustomerId,
        },
      });
    } catch (error) {
      logger.error("Error fetching subscription", error instanceof Error ? error : undefined, { details: String(error) });
      return res.status(500).json({ error: "Failed to fetch subscription" });
    }
  }
);

/**
 * POST /internal/customers
 * Create or get Polar customer for a user
 */
router.post(
  "/customers",
  internalAuth,
  async (req: Request, res: Response) => {
    const { userId, email, name } = req.body;

    if (!userId || !email) {
      return res.status(400).json({ error: "userId and email are required" });
    }

    try {
      // Check if user already has a Polar customer ID
      const [user] = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.id, userId))
        .limit(1);

      if (user?.polarCustomerId) {
        return res.json({ customerId: user.polarCustomerId });
      }

      // Create customer in Polar
      const customer = await polar.customers.create({
        email,
        name: name || undefined,
        metadata: { user_id: userId },
      });

      // Update user with Polar customer ID
      await db
        .update(schema.users)
        .set({
          polarCustomerId: customer.id,
          updatedAt: new Date(),
        })
        .where(eq(schema.users.id, userId));

      return res.json({ customerId: customer.id });
    } catch (error: any) {
      logger.error("Error creating Polar customer", error instanceof Error ? error : undefined, { details: String(error) });
      return res
        .status(500)
        .json({ error: error.message || "Failed to create customer" });
    }
  }
);

/**
 * POST /internal/checkout
 * Create a checkout session
 */
router.post(
  "/checkout",
  internalAuth,
  async (req: Request, res: Response) => {
    const { userId, email, productId, successUrl, cancelUrl } = req.body;

    if (!userId || !email || !productId) {
      return res
        .status(400)
        .json({ error: "userId, email, and productId are required" });
    }

    try {
      // Ensure user exists
      const [user] = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.id, userId))
        .limit(1);

      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      // Create checkout session
      const checkout = await polar.checkouts.create({
        productId,
        successUrl:
          successUrl || `${process.env.WEBSITE_URL}/dashboard?checkout=success`,
        customerEmail: email,
        metadata: { user_id: userId },
      });

      return res.json({
        checkoutUrl: checkout.url,
        checkoutId: checkout.id,
      });
    } catch (error: any) {
      logger.error("Error creating checkout", error instanceof Error ? error : undefined, { details: String(error) });
      return res
        .status(500)
        .json({ error: error.message || "Failed to create checkout" });
    }
  }
);

/**
 * POST /internal/portal
 * Create a customer portal session
 */
router.post(
  "/portal",
  internalAuth,
  async (req: Request, res: Response) => {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: "userId is required" });
    }

    try {
      // Get user's Polar customer ID
      const [user] = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.id, userId))
        .limit(1);

      if (!user?.polarCustomerId) {
        return res.status(404).json({ error: "No subscription found" });
      }

      // Create customer session for portal access
      const session = await polar.customerSessions.create({
        customerId: user.polarCustomerId,
      });

      return res.json({ portalUrl: session.customerPortalUrl });
    } catch (error: any) {
      logger.error("Error creating portal session", error instanceof Error ? error : undefined, { details: String(error) });
      return res
        .status(500)
        .json({ error: error.message || "Failed to create portal session" });
    }
  }
);

// ============================================================================
// API Key Authenticated Endpoints (for CLI/SDK access)
// ============================================================================

/**
 * GET /me
 * Get current user's subscription status (API key auth)
 */
router.get(
  "/me",
  apiKeyAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    try {
      const [subscription] = await db
        .select()
        .from(schema.subscriptions)
        .where(
          and(
            eq(schema.subscriptions.userId, req.user.userId),
            eq(schema.subscriptions.status, "active")
          )
        )
        .orderBy(desc(schema.subscriptions.createdAt))
        .limit(1);

      return res.json({
        plan: req.user.plan,
        subscription: subscription
          ? {
              id: subscription.id,
              status: subscription.status,
              plan: subscription.plan,
              currentPeriodEnd: subscription.currentPeriodEnd,
              cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
            }
          : null,
      });
    } catch (error) {
      logger.error("Error fetching subscription", error instanceof Error ? error : undefined, { details: String(error) });
      return res.status(500).json({ error: "Failed to fetch subscription" });
    }
  }
);

export default router;
