import { NextRequest, NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import { z } from "zod";
import polar from "@/lib/polar";

const bodySchema = z.object({
  // When true, revoke the subscription immediately. Otherwise schedule
  // cancellation at the end of the current billing period (the safe default).
  immediately: z.boolean().optional().default(false),
});

/**
 * POST /api/billing/cancel
 *
 * Cancels the signed-in user's active Polar subscription. This route talks to
 * Polar directly — the single source of truth for subscription state — exactly
 * like the sibling subscription / portal / invoices routes, rather than a
 * backend `/v1/billing/cancel` endpoint that does not exist. The backend stays
 * in sync via the Polar `subscription.canceled` / `subscription.revoked`
 * webhook (see /api/webhooks/polar).
 */
export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await currentUser();
    const email = user?.emailAddresses[0]?.emailAddress;
    if (!email) {
      return NextResponse.json({ error: "User email not found" }, { status: 400 });
    }

    let raw: unknown = {};
    try {
      raw = await req.json();
    } catch {
      // Empty body is allowed; defaults apply.
    }
    const parsed = bodySchema.safeParse(raw ?? {});
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid request" },
        { status: 400 }
      );
    }
    const { immediately } = parsed.data;

    // Resolve the Polar customer for this user's email.
    const customers = await polar.customers.list({ email });
    const customer = customers.result.items?.[0];
    if (!customer) {
      return NextResponse.json(
        { error: "No subscription found to cancel." },
        { status: 404 }
      );
    }

    // Find the active subscription to cancel.
    const subscriptions = await polar.subscriptions.list({
      customerId: customer.id,
      active: true,
    });
    const subscription = subscriptions.result.items?.[0];
    if (!subscription) {
      return NextResponse.json(
        { error: "No active subscription found to cancel." },
        { status: 404 }
      );
    }

    if (immediately) {
      const revoked = await polar.subscriptions.revoke({ id: subscription.id });
      return NextResponse.json({
        success: true,
        subscriptionId: revoked.id,
        status: revoked.status,
        canceledImmediately: true,
        cancelAtPeriodEnd: false,
      });
    }

    const updated = await polar.subscriptions.update({
      id: subscription.id,
      subscriptionUpdate: { cancelAtPeriodEnd: true },
    });

    return NextResponse.json({
      success: true,
      subscriptionId: updated.id,
      status: updated.status,
      canceledImmediately: false,
      cancelAtPeriodEnd: updated.cancelAtPeriodEnd,
      currentPeriodEnd: updated.currentPeriodEnd,
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to cancel subscription";
    console.error("Cancel subscription error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
