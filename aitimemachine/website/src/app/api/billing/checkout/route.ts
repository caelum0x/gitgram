import { NextRequest, NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import { z } from "zod";
import polar from "@/lib/polar";
import { resolveProductId, type BillingInterval, type PaidPlan } from "@/lib/billingProducts";

const bodySchema = z.object({
  // `plan` is the source of truth; `productId` is accepted for backwards
  // compatibility but is re-validated server-side and never trusted blindly.
  plan: z.enum(["pro", "team"]).optional(),
  productId: z.string().min(1).optional(),
  annual: z.boolean().optional().default(false),
});

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await currentUser();
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    let raw: unknown;
    try {
      raw = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid request" },
        { status: 400 }
      );
    }

    const { plan, annual } = parsed.data;
    const interval: BillingInterval = annual ? "annual" : "monthly";

    // Resolve the product ID server-side from (plan, interval). The client may
    // pass `productId` but we always re-derive it from the trusted plan name so
    // the annual flag is honoured and a stale/spoofed productId cannot charge a
    // user the wrong amount.
    let resolvedPlan: PaidPlan | undefined = plan;
    if (!resolvedPlan && parsed.data.productId) {
      resolvedPlan = inferPlanFromProductId(parsed.data.productId);
    }

    if (!resolvedPlan) {
      return NextResponse.json(
        { error: "A valid plan ('pro' or 'team') is required" },
        { status: 400 }
      );
    }

    const resolution = resolveProductId(resolvedPlan, interval);
    if (!resolution.productId) {
      // The annual product ID is not configured: surface a clear, honest error
      // rather than silently falling back to the monthly product and
      // overcharging the customer.
      return NextResponse.json(
        {
          error:
            interval === "annual"
              ? `Annual billing for the ${resolvedPlan} plan is not available right now. Please choose monthly billing or contact support.`
              : `The ${resolvedPlan} plan is not configured for checkout.`,
        },
        { status: 503 }
      );
    }

    const email = user.emailAddresses[0]?.emailAddress;
    if (!email) {
      return NextResponse.json(
        { error: "User email not found" },
        { status: 400 }
      );
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3002";

    // Create checkout session directly with Polar
    const checkout = await polar.checkouts.create({
      productId: resolution.productId,
      successUrl: `${appUrl}/dashboard?checkout=success&plan=${resolvedPlan}&interval=${interval}`,
      customerEmail: email,
      metadata: {
        userId,
        clerkUserId: userId,
        plan: resolvedPlan,
        interval,
      },
    });

    return NextResponse.json({ checkoutUrl: checkout.url });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Internal server error";
    console.error("Checkout error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * Map a known Polar product ID back to its plan name. Used only to keep the
 * legacy `{ productId }` request shape working; the interval is always taken
 * from the `annual` flag, never inferred from the product ID.
 */
function inferPlanFromProductId(productId: string): PaidPlan | undefined {
  const map = resolveAllProductIds();
  for (const [plan, ids] of Object.entries(map)) {
    if (ids.monthly === productId || ids.annual === productId) {
      return plan as PaidPlan;
    }
  }
  return undefined;
}

function resolveAllProductIds() {
  return {
    pro: {
      monthly: resolveProductId("pro", "monthly").productId,
      annual: resolveProductId("pro", "annual").productId,
    },
    team: {
      monthly: resolveProductId("team", "monthly").productId,
      annual: resolveProductId("team", "annual").productId,
    },
  };
}
