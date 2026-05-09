import { headers } from "next/headers";
import { NextResponse } from "next/server";
import Stripe from "stripe";

export async function POST(req: Request) {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!secretKey || !webhookSecret) {
    console.error("[Stripe Webhook] Missing environment variables");
    return new NextResponse("Stripe configuration missing", { status: 500 });
  }

  const stripe = new Stripe(secretKey, {
    apiVersion: "2025-10-27-acacia" as any,
  });

  const body = await req.text();
  const signature = (await headers()).get("stripe-signature") as string;

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err: any) {
    console.error(`[Stripe Webhook] Error verifying signature: ${err.message}`);
    return new NextResponse(`Webhook Error: ${err.message}`, { status: 400 });
  }

  const session = event.data.object as any;

  console.log(`[Stripe Webhook] Received event: ${event.type}`);

  switch (event.type) {
    case "checkout.session.completed":
      // First time payment / subscription start
      console.log(`Checkout session completed for ${session.id}`);
      break;

    case "customer.subscription.created":
      console.log(`Subscription created: ${session.id}`);
      // TODO: Update company plan to "pro" or similar
      break;

    case "customer.subscription.updated":
      console.log(`Subscription updated: ${session.id}`);
      // TODO: Sync subscription status (active, trialing, past_due, etc.)
      break;

    case "customer.subscription.deleted":
      console.log(`Subscription deleted: ${session.id}`);
      // TODO: Downgrade company plan to "free"
      break;

    case "invoice.payment_succeeded":
      console.log(`Invoice payment succeeded: ${session.id}`);
      break;

    case "invoice.payment_failed":
      console.log(`Invoice payment failed: ${session.id}`);
      // TODO: Notify user or mark account as past_due
      break;

    default:
      console.warn(`Unhandled event type: ${event.type}`);
  }

  return NextResponse.json({ received: true });
}
