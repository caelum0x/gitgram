import { NextRequest, NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import polar from "@/lib/polar";

const PRO_PRODUCT_ID = process.env.NEXT_PUBLIC_POLAR_PRO_PRODUCT_ID || "";
const TEAM_PRODUCT_ID = process.env.NEXT_PUBLIC_POLAR_TEAM_PRODUCT_ID || "";

// Map product IDs to plan names
function getPlanFromProductId(productId: string): string {
  if (productId === PRO_PRODUCT_ID) return "pro";
  if (productId === TEAM_PRODUCT_ID) return "team";
  return "free";
}

export async function GET(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await currentUser();
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const email = user.emailAddresses[0]?.emailAddress;
    if (!email) {
      return NextResponse.json(
        { error: "User email not found" },
        { status: 400 }
      );
    }

    // Find customer by email in Polar
    const customers = await polar.customers.list({
      email,
    });

    // No customer found - return free plan
    if (!customers.result.items || customers.result.items.length === 0) {
      return NextResponse.json({
        subscription: null,
        plan: "free",
        status: "active",
        user: {
          id: userId,
          email,
          plan: "free",
          polarCustomerId: null,
        },
      });
    }

    const customer = customers.result.items[0];

    // Get active subscriptions for this customer
    const subscriptions = await polar.subscriptions.list({
      customerId: customer.id,
      active: true,
    });

    // No active subscription - return free plan
    if (!subscriptions.result.items || subscriptions.result.items.length === 0) {
      return NextResponse.json({
        subscription: null,
        plan: "free",
        status: "active",
        user: {
          id: userId,
          email,
          plan: "free",
          polarCustomerId: customer.id,
        },
      });
    }

    // Get the most recent active subscription
    const subscription = subscriptions.result.items[0];
    const plan = getPlanFromProductId(subscription.productId);

    return NextResponse.json({
      subscription: {
        id: subscription.id,
        status: subscription.status,
        plan,
        productId: subscription.productId,
        currentPeriodStart: subscription.currentPeriodStart,
        currentPeriodEnd: subscription.currentPeriodEnd,
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
        startedAt: subscription.startedAt,
        endedAt: subscription.endedAt,
      },
      plan,
      status: subscription.status,
      currentPeriodEnd: subscription.currentPeriodEnd,
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
      user: {
        id: userId,
        email,
        plan,
        polarCustomerId: customer.id,
      },
    });
  } catch (error: any) {
    console.error("Subscription fetch error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
