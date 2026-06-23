import { NextRequest, NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import polar from "@/lib/polar";

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

    if (!customers.result.items || customers.result.items.length === 0) {
      return NextResponse.json(
        { error: "No subscription found. Please subscribe first." },
        { status: 404 }
      );
    }

    const customer = customers.result.items[0];

    // Create customer portal session
    const session = await polar.customerSessions.create({
      customerId: customer.id,
    });

    return NextResponse.json({ portalUrl: session.customerPortalUrl });
  } catch (error: any) {
    console.error("Portal error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

// GET endpoint for direct redirect to portal
export async function GET(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.redirect(new URL("/sign-in", req.url));
    }

    const user = await currentUser();
    if (!user) {
      return NextResponse.redirect(new URL("/sign-in", req.url));
    }

    const email = user.emailAddresses[0]?.emailAddress;
    if (!email) {
      return NextResponse.redirect(new URL("/dashboard/billing?error=no-email", req.url));
    }

    // Find customer by email in Polar
    const customers = await polar.customers.list({
      email,
    });

    if (!customers.result.items || customers.result.items.length === 0) {
      return NextResponse.redirect(new URL("/pricing", req.url));
    }

    const customer = customers.result.items[0];

    // Create customer portal session
    const session = await polar.customerSessions.create({
      customerId: customer.id,
    });

    return NextResponse.redirect(session.customerPortalUrl);
  } catch (error: any) {
    console.error("Portal redirect error:", error);
    return NextResponse.redirect(new URL("/dashboard/billing?error=portal-failed", req.url));
  }
}
