import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { stripe, planFromPriceId } from "@/lib/stripe";
import { logger } from "@/lib/logger";
import { appendCreditLedgerEventInTransaction } from "@/lib/credits";
import { logAuditEvent } from "@/lib/audit";

export const dynamic = "force-dynamic";

async function markEventAsProcessed(event: Stripe.Event, userId?: string) {
  try {
    await prisma.processedStripeEvent.create({
      data: {
        eventId: event.id,
        eventType: event.type,
        userId: userId ?? null,
        metadataJson: JSON.stringify({
          livemode: event.livemode,
          created: event.created,
        }),
      },
    });
    return true;
  } catch (error) {
    if (
      typeof error === "object" &&
      error &&
      "code" in error &&
      (error as { code?: string }).code === "P2002"
    ) {
      return false;
    }
    throw error;
  }
}

async function handleCreditCheckoutCompleted(session: Stripe.Checkout.Session, event: Stripe.Event) {
  const userId = session.metadata?.userId;
  const credits = Number(session.metadata?.credits ?? "0");
  const packageId = session.metadata?.packageId ?? "unknown";

  if (!userId || !Number.isInteger(credits) || credits <= 0) return;
  if (session.payment_status !== "paid") return;

  let ledgerEntry: { balanceAfter: number } | null = null;

  try {
    ledgerEntry = await prisma.$transaction(async (tx) => {
      await tx.processedStripeEvent.create({
        data: {
          eventId: event.id,
          eventType: event.type,
          userId,
          metadataJson: JSON.stringify({
            livemode: event.livemode,
            created: event.created,
          }),
        },
      });

      return appendCreditLedgerEventInTransaction(tx, {
        userId,
        eventType: "top_up",
        amount: credits,
        reason: `Stripe credit purchase (${packageId})`,
        metadata: {
          stripeEventId: event.id,
          stripeSessionId: session.id,
          packageId,
          amountTotal: session.amount_total ?? null,
          currency: session.currency ?? "usd",
        },
      });
    });
  } catch (error) {
    if (
      typeof error === "object" &&
      error &&
      "code" in error &&
      (error as { code?: string }).code === "P2002"
    ) {
      logger.info("webhook", `duplicate credit checkout ignored: eventId=${event.id}`);
      return;
    }
    throw error;
  }

  if (!ledgerEntry) return;

  await logAuditEvent({
    actorUserId: userId,
    actorRole: "customer",
    eventType: "billing.credit_purchase.completed",
    targetType: "user",
    targetId: userId,
    metadata: {
      stripeEventId: event.id,
      stripeSessionId: session.id,
      packageId,
      credits,
      balanceAfter: ledgerEntry.balanceAfter,
      amountTotal: session.amount_total ?? null,
    },
  });

  logger.info(
    "webhook",
    `credit checkout completed: userId=${userId} package=${packageId} credits=${credits}`
  );
}

async function handleSubscriptionCheckoutCompleted(session: Stripe.Checkout.Session, event: Stripe.Event) {
  const userId = session.metadata?.userId;
  if (!userId || !session.subscription) return;

  const shouldProcess = await markEventAsProcessed(event, userId);
  if (!shouldProcess) {
    logger.info("webhook", `duplicate subscription checkout ignored: eventId=${event.id}`);
    return;
  }

  const subscriptionId =
    typeof session.subscription === "string"
      ? session.subscription
      : session.subscription.id;

  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const priceId = subscription.items.data[0]?.price.id;
  const plan = planFromPriceId(priceId ?? "") ?? "learner";

  await prisma.user.update({
    where: { id: userId },
    data: {
      stripeSubscriptionId: subscriptionId,
      subscriptionStatus: "active",
      plan,
    },
  });

  logger.info("webhook", `checkout.session.completed: userId=${userId} plan=${plan}`);
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session, event: Stripe.Event) {
  const purchaseType = session.metadata?.purchaseType;
  if (purchaseType === "credits") {
    await handleCreditCheckoutCompleted(session, event);
    return;
  }

  await handleSubscriptionCheckoutCompleted(session, event);
}

async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  const user = await prisma.user.findFirst({
    where: { stripeSubscriptionId: subscription.id },
    select: { id: true },
  });

  if (!user) return;

  const priceId = subscription.items.data[0]?.price.id;
  const plan = planFromPriceId(priceId ?? "") ?? "free";
  const status = subscription.status as string;

  await prisma.user.update({
    where: { id: user.id },
    data: { plan, subscriptionStatus: status },
  });

  logger.info("webhook", `subscription.updated: userId=${user.id} plan=${plan} status=${status}`);
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  const user = await prisma.user.findFirst({
    where: { stripeSubscriptionId: subscription.id },
    select: { id: true },
  });

  if (!user) return;

  await prisma.user.update({
    where: { id: user.id },
    data: { plan: "free", subscriptionStatus: "canceled" },
  });

  logger.info("webhook", `subscription.deleted: userId=${user.id} downgraded to free`);
}

async function handleInvoicePaymentFailed(invoice: Stripe.Invoice) {
  // In Stripe API 2026+, subscription is accessed via parent.subscription_details
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = invoice as any;
  const subscriptionId: string | undefined =
    raw.parent?.subscription_details?.subscription ??
    (typeof raw.subscription === "string" ? raw.subscription : raw.subscription?.id);

  if (!subscriptionId) return;

  const user = await prisma.user.findFirst({
    where: { stripeSubscriptionId: subscriptionId },
    select: { id: true },
  });

  if (!user) return;

  await prisma.user.update({
    where: { id: user.id },
    data: { subscriptionStatus: "past_due" },
  });

  logger.info("webhook", `invoice.payment_failed: userId=${user.id} status=past_due`);
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const sig = req.headers.get("stripe-signature");

  if (!sig) {
    return NextResponse.json({ error: "Missing stripe-signature header" }, { status: 400 });
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return NextResponse.json({ error: "STRIPE_WEBHOOK_SECRET not configured" }, { status: 500 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err) {
    logger.warn("webhook", "Invalid signature", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session, event);
        break;
      case "customer.subscription.updated":
        await handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
        break;
      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;
      case "invoice.payment_failed":
        await handleInvoicePaymentFailed(event.data.object as Stripe.Invoice);
        break;
      default:
        break;
    }
  } catch (err) {
    logger.error("webhook", `Failed to handle event ${event.type}`, err);
    return NextResponse.json({ error: "Handler error" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
