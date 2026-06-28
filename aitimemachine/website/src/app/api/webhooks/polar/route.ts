import { NextRequest, NextResponse } from "next/server";
import { validateEvent, WebhookVerificationError } from "@polar-sh/sdk/webhooks";

export const runtime = "nodejs";
// Polar signs the *raw* request body, so this route must never be cached or
// have its body transformed.
export const dynamic = "force-dynamic";

const API_URL =
  process.env.API_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:3001";

const WEBHOOK_SECRET = process.env.POLAR_WEBHOOK_SECRET || "";

/**
 * Events we forward to the backend for persistence. Anything else is verified
 * and acknowledged (200) so Polar does not retry, but not acted upon.
 */
const PERSISTED_EVENTS = new Set([
  "subscription.created",
  "subscription.active",
  "subscription.updated",
  "subscription.canceled",
  "subscription.revoked",
  "subscription.uncanceled",
  "order.created",
  "order.refunded",
]);

/**
 * POST /api/webhooks/polar
 *
 * Verified, public-facing Polar webhook endpoint. It:
 *   1. Reads the raw request body (required for signature verification).
 *   2. Verifies the Polar signature with POLAR_WEBHOOK_SECRET.
 *   3. Forwards the verified raw payload to the backend's webhook handler,
 *      which reconciles subscription/order state into the app's own database
 *      (handling activations, cancellations, refunds and payment changes).
 *
 * This replaces sole reliance on the post-checkout `?checkout=success` redirect
 * with a verified, server-to-server source of entitlement truth.
 */
export async function POST(req: NextRequest) {
  if (!WEBHOOK_SECRET) {
    console.error("POLAR_WEBHOOK_SECRET is not configured");
    return NextResponse.json(
      { error: "Webhook secret not configured" },
      { status: 500 }
    );
  }

  const rawBody = await req.text();
  const headers: Record<string, string> = {};
  req.headers.forEach((value, key) => {
    headers[key] = value;
  });

  let eventType = "";
  try {
    const event = validateEvent(rawBody, headers, WEBHOOK_SECRET);
    eventType = event.type ?? "";
  } catch (error: unknown) {
    if (error instanceof WebhookVerificationError) {
      console.error("Invalid Polar webhook signature");
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }
    console.error(
      "Failed to parse Polar webhook payload:",
      error instanceof Error ? error.message : String(error)
    );
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  if (!PERSISTED_EVENTS.has(eventType)) {
    // Verified but not actionable — acknowledge so Polar stops retrying.
    return NextResponse.json({ received: true, persisted: false });
  }

  // Forward the verified raw payload to the backend, which owns persistence.
  // We pass the original signature headers so the backend can re-verify with
  // the same shared secret (defence in depth).
  try {
    const res = await fetch(`${API_URL}/v1/billing/webhooks/polar`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "webhook-id": headers["webhook-id"] ?? "",
        "webhook-timestamp": headers["webhook-timestamp"] ?? "",
        "webhook-signature": headers["webhook-signature"] ?? "",
      },
      body: rawBody,
      cache: "no-store",
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error(
        `Backend webhook sync failed (${res.status}) for ${eventType}: ${detail}`
      );
      // Return 502 so Polar retries delivery rather than dropping the event.
      return NextResponse.json(
        { error: "Failed to sync subscription state" },
        { status: 502 }
      );
    }

    return NextResponse.json({ received: true, persisted: true });
  } catch (error: unknown) {
    console.error(
      "Backend unreachable while syncing Polar webhook:",
      error instanceof Error ? error.message : String(error)
    );
    return NextResponse.json(
      { error: "Backend service is unavailable" },
      { status: 502 }
    );
  }
}
