/**
 * Stripe Webhook — Route Handler
 *
 * POST /api/stripe/webhook
 *
 * Fixes:
 * [CRIT-1] invoice.payment_failed agora expande a subscription para ler companyId
 * [HIGH-1] Cancelamento define plan_type = 'trial' (não 'free' que não existe)
 * [HIGH-2] planType derivado do price_id via planFromPriceId (não hardcoded)
 * [HIGH-6] invoice.payment_failed mantém plan_type real do cliente
 */

import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createAdminClient } from '@/lib/supabase/admin';
import { planFromPriceId } from '@/lib/billing/plans';

export async function POST(req: Request) {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!secretKey || !webhookSecret) {
    console.error('[Stripe Webhook] ❌ Missing environment variables');
    return new NextResponse('Stripe configuration missing', { status: 500 });
  }

  const stripe = new Stripe(secretKey, {
    apiVersion: '2025-10-27-acacia' as any,
  });

  const body = await req.text();
  const signature = (await headers()).get('stripe-signature') as string;

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err: any) {
    console.error(`[Stripe Webhook] ❌ Error verifying signature: ${err.message}`);
    return new NextResponse(`Webhook Error: ${err.message}`, { status: 400 });
  }

  const admin = createAdminClient();

  console.log(`[Stripe Webhook] 🔔 Received event: ${event.type}`);

  // ── Helper: atualizar status da empresa ───────────────────────────────────
  async function updateCompanyStatus(
    companyId: string,
    status: string,
    plan: string,
    subId?: string,
    custId?: string,
    periodStart?: number,
    periodEnd?: number
  ) {
    const updateData: Record<string, any> = {
      subscription_status: status,
      plan_type: plan,
    };
    if (subId) updateData.stripe_subscription_id = subId;
    if (custId) updateData.stripe_customer_id = custId;
    if (periodStart) updateData.current_period_start = new Date(periodStart * 1000).toISOString();
    if (periodEnd) updateData.current_period_end = new Date(periodEnd * 1000).toISOString();

    const { error } = await admin
      .from('companies')
      .update(updateData)
      .eq('id', companyId);

    if (error) console.error(`[Stripe Webhook] ❌ Error updating company ${companyId}:`, error.message);
    else console.log(`[Stripe Webhook] ✅ Updated company ${companyId} → status=${status} plan=${plan}`);
  }

  // ── Helper: obter companyId a partir de customer_id (fallback) ────────────
  async function getCompanyByCustomer(customerId: string): Promise<string | null> {
    const { data } = await admin
      .from('companies')
      .select('id')
      .eq('stripe_customer_id', customerId)
      .maybeSingle();
    return data?.id ?? null;
  }

  // ── Event handlers ────────────────────────────────────────────────────────
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      const companyId = session.metadata?.companyId;

      if (companyId && session.subscription) {
        const subscription = await stripe.subscriptions.retrieve(
          session.subscription as string
        ) as Stripe.Subscription & { metadata?: Record<string, string> };

        // [HIGH-2] Determinar planType a partir do price_id (fonte mais confiável)
        const priceId = subscription.items.data[0]?.price?.id;
        const planType = planFromPriceId(priceId) 
          || subscription.metadata?.planType 
          || 'pro';

        await updateCompanyStatus(
          companyId,
          'active',
          planType,
          subscription.id,
          session.customer as string,
          (subscription as any).current_period_start,
          (subscription as any).current_period_end
        );
      }
      break;
    }

    case 'customer.subscription.updated': {
      const sub = event.data.object as Stripe.Subscription;
      const companyId = sub.metadata?.companyId 
        || (sub.customer ? await getCompanyByCustomer(sub.customer as string) : null);

      if (companyId) {
        // [HIGH-2] Derivar planType do price_id real na subscription
        const priceId = sub.items.data[0]?.price?.id;
        const planType = planFromPriceId(priceId) || sub.metadata?.planType || 'pro';

        const status = sub.status === 'active' ? 'active' : 
                       sub.status === 'past_due' ? 'past_due' : sub.status;

        await updateCompanyStatus(
          companyId,
          status,
          planType,
          sub.id,
          undefined,
          (sub as any).current_period_start,
          (sub as any).current_period_end
        );
      }
      break;
    }

    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription;
      const companyId = sub.metadata?.companyId
        || (sub.customer ? await getCompanyByCustomer(sub.customer as string) : null);

      if (companyId) {
        // [FIX HIGH-1] 'trial' não 'free' — 'free' não existe em PLAN_LIMITS
        await updateCompanyStatus(companyId, 'canceled', 'trial');
      }
      break;
    }

    case 'invoice.payment_failed': {
      const inv = event.data.object as Stripe.Invoice;
      const invAny = inv as any;

      // [FIX CRIT-1] Expandir subscription para obter metadados e companyId
      let companyId: string | null = null;
      let currentPlanType = 'starter'; // fallback conservador

      if (invAny.subscription) {
        try {
          const sub = await stripe.subscriptions.retrieve(invAny.subscription as string);
          companyId = sub.metadata?.companyId
            || (sub.customer ? await getCompanyByCustomer(sub.customer as string) : null);

          // Manter o plan_type REAL do cliente, não hardcoded 'pro'
          const priceId = sub.items.data[0]?.price?.id;
          currentPlanType = planFromPriceId(priceId) || sub.metadata?.planType || 'starter';
        } catch (err) {
          console.error('[Stripe Webhook] ❌ Failed to retrieve subscription for payment_failed:', err);
        }
      }

      // Fallback via customer
      if (!companyId && inv.customer) {
        companyId = await getCompanyByCustomer(inv.customer as string);
      }

      if (companyId) {
        // [FIX HIGH-6] Mantém plan_type real, apenas muda subscription_status
        await updateCompanyStatus(companyId, 'past_due', currentPlanType);
      }
      break;
    }

    case 'invoice.payment_succeeded': {
      // Reativar empresa se estava past_due
      const inv = event.data.object as Stripe.Invoice;
      const invAny2 = inv as any;
      let companyId: string | null = null;
      let currentPlanType = 'starter';

      if (invAny2.subscription) {
        try {
          const sub = await stripe.subscriptions.retrieve(invAny2.subscription as string);
          companyId = sub.metadata?.companyId
            || (sub.customer ? await getCompanyByCustomer(sub.customer as string) : null);
          const priceId = sub.items.data[0]?.price?.id;
          currentPlanType = planFromPriceId(priceId) || sub.metadata?.planType || 'starter';
        } catch (err) {
          console.error('[Stripe Webhook] ❌ Failed to retrieve subscription for payment_succeeded:', err);
        }
      }

      if (!companyId && inv.customer) {
        companyId = await getCompanyByCustomer(inv.customer as string);
      }

      if (companyId) {
        await updateCompanyStatus(companyId, 'active', currentPlanType);
      }
      break;
    }

    default:
      console.log(`[Stripe Webhook] ℹ️ Unhandled event type: ${event.type}`);
  }

  return NextResponse.json({ received: true });
}
