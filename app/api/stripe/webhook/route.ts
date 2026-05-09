/**
 * Stripe Webhook — Route Handler
 * 
 * POST /api/stripe/webhook
 * 
 * Recebe eventos do Stripe (assinatura criada, paga, cancelada).
 * Atualiza o status da empresa no banco de dados via Admin Client.
 */

import { headers } from "next/headers";
import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(req: Request) {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!secretKey || !webhookSecret) {
    console.error("[Stripe Webhook] ❌ Missing environment variables");
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
    console.error(`[Stripe Webhook] ❌ Error verifying signature: ${err.message}`);
    return new NextResponse(`Webhook Error: ${err.message}`, { status: 400 });
  }

  const admin = createAdminClient();
  const session = event.data.object as any;

  console.log(`[Stripe Webhook] 🔔 Received event: ${event.type}`);

  // Helper para atualizar status da empresa
  async function updateCompanyStatus(companyId: string, status: string, plan: string, subId?: string, custId?: string) {
    const updateData: any = {
      subscription_status: status,
      plan_type: plan,
    };
    if (subId) updateData.stripe_subscription_id = subId;
    if (custId) updateData.stripe_customer_id = custId;

    const { error } = await admin
      .from('companies')
      .update(updateData)
      .eq('id', companyId);

    if (error) console.error(`[Stripe Webhook] ❌ Error updating company ${companyId}:`, error.message);
    else console.log(`[Stripe Webhook] ✅ Updated company ${companyId} to ${status}/${plan}`);
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const companyId = session.metadata?.companyId;
      if (companyId) {
        await updateCompanyStatus(
          companyId, 
          'active', 
          'pro', 
          session.subscription as string, 
          session.customer as string
        );
      }
      break;
    }

    case "customer.subscription.updated": {
      const sub = event.data.object as Stripe.Subscription;
      const companyId = sub.metadata?.companyId;
      if (companyId) {
        await updateCompanyStatus(
          companyId, 
          sub.status === 'active' ? 'active' : 'past_due', 
          'pro'
        );
      }
      break;
    }

    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      const companyId = sub.metadata?.companyId;
      if (companyId) {
        await updateCompanyStatus(companyId, 'canceled', 'free');
      }
      break;
    }

    case "invoice.payment_failed": {
      const inv = event.data.object as Stripe.Invoice;
      const companyId = (inv.subscription as Stripe.Subscription)?.metadata?.companyId;
      if (companyId) {
        await updateCompanyStatus(companyId, 'past_due', 'pro');
      }
      break;
    }

    default:
      console.log(`[Stripe Webhook] ℹ️ Unhandled event type: ${event.type}`);
  }

  return NextResponse.json({ received: true });
}
