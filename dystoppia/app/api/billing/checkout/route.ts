import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/authGuard";
import { stripe, STRIPE_PLAN_PRICES, getCreditPackage } from "@/lib/stripe";

export async function POST(req: NextRequest) {
  try {
    const auth = await requireUser(req);
    if (auth instanceof NextResponse) return auth;

    const { plan, packageId } = await req.json();
    const selectedPackage = packageId ? getCreditPackage(packageId) : null;
    const priceId = plan ? STRIPE_PLAN_PRICES[plan] : undefined;

    if (packageId && !selectedPackage) {
      return NextResponse.json({ error: "Invalid credit package" }, { status: 400 });
    }

    if (!packageId && (!plan || !priceId)) {
      return NextResponse.json({ error: "Invalid billing selection" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { id: auth.userId },
      select: { email: true, stripeCustomerId: true },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Create or retrieve Stripe customer
    let customerId = user.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({ email: user.email });
      customerId = customer.id;
      await prisma.user.update({
        where: { id: auth.userId },
        data: { stripeCustomerId: customerId },
      });
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

    if (packageId) {
      const creditPackage = selectedPackage;
      if (!creditPackage) {
        return NextResponse.json({ error: "Invalid credit package" }, { status: 400 });
      }

      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        payment_method_types: ["card"],
        customer: customerId,
        line_items: [
          {
            price_data: {
              currency: "usd",
              product_data: {
                name: `${creditPackage.name} credits`,
                description: creditPackage.description,
              },
              unit_amount: creditPackage.unitAmountCents,
            },
            quantity: 1,
          },
        ],
        success_url: `${appUrl}/billing/success?session_id={CHECKOUT_SESSION_ID}&kind=credits`,
        cancel_url: `${appUrl}/builder`,
        metadata: {
          userId: auth.userId,
          purchaseType: "credits",
          packageId: creditPackage.id,
          credits: String(creditPackage.credits),
          unitAmountCents: String(creditPackage.unitAmountCents),
        },
      });

      return NextResponse.json({
        url: session.url,
        kind: "credits",
        packageId: creditPackage.id,
      });
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${appUrl}/billing/success?session_id={CHECKOUT_SESSION_ID}&kind=subscription`,
      cancel_url: `${appUrl}/`,
      metadata: { userId: auth.userId, plan, purchaseType: "subscription" },
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to create checkout session", details: String(error) },
      { status: 500 }
    );
  }
}
