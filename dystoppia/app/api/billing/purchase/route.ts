import { NextResponse } from "next/server";

// This route is deprecated — use /api/billing/checkout for Stripe-based purchases.
export async function POST() {
  return NextResponse.json(
    { error: "Use /api/billing/checkout to upgrade your plan." },
    { status: 410 }
  );
}
