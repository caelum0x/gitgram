import { NextRequest, NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import polar from "@/lib/polar";

const PRO_PRODUCT_ID = process.env.NEXT_PUBLIC_POLAR_PRO_PRODUCT_ID || "";
const TEAM_PRODUCT_ID = process.env.NEXT_PUBLIC_POLAR_TEAM_PRODUCT_ID || "";

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

    const { productId, plan } = await req.json();

    // Resolve product ID from plan name if productId not provided
    let resolvedProductId = productId;
    if (!resolvedProductId && plan) {
      if (plan === "pro") {
        resolvedProductId = PRO_PRODUCT_ID;
      } else if (plan === "team") {
        resolvedProductId = TEAM_PRODUCT_ID;
      }
    }

    if (!resolvedProductId) {
      return NextResponse.json(
        { error: "productId or valid plan is required" },
        { status: 400 }
      );
    }

    const email = user.emailAddresses[0]?.emailAddress;
    if (!email) {
      return NextResponse.json(
        { error: "User email not found" },
        { status: 400 }
      );
    }

    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3002";

    // Create checkout session directly with Polar
    const checkout = await polar.checkouts.create({
      productId: resolvedProductId,
      successUrl: `${appUrl}/dashboard?checkout=success&plan=${plan || "pro"}`,
      customerEmail: email,
      metadata: {
        userId,
        clerkUserId: userId,
      },
    });

    return NextResponse.json({ checkoutUrl: checkout.url });
  } catch (error: any) {
    console.error("Checkout error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
