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
    apiVersion: '2026-04-22.dahlia' as any,
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
    periodEnd?: number,
    cancelAtPeriodEnd?: boolean
  ) {
    const updateData: Record<string, any> = {
      subscription_status: status,
      plan_type: plan,
    };
    if (subId) updateData.stripe_subscription_id = subId;
    if (custId) updateData.stripe_customer_id = custId;
    if (periodStart) updateData.current_period_start = new Date(periodStart * 1000).toISOString();
    if (periodEnd) updateData.current_period_end = new Date(periodEnd * 1000).toISOString();
    if (cancelAtPeriodEnd !== undefined) updateData.cancel_at_period_end = cancelAtPeriodEnd;

    const { error } = await admin
      .from('companies')
      .update(updateData)
      .eq('id', companyId);

    if (error) console.error(`[Stripe Webhook] ❌ Error updating company ${companyId}:`, error.message);
    else console.log(`[Stripe Webhook] ✅ Updated company ${companyId} → status=${status} plan=${plan} cancel_at=${cancelAtPeriodEnd}`);
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
        const subscription = (await stripe.subscriptions.retrieve(
          session.subscription as string
        )) as any;

        // [HIGH-2] Determinar planType a partir do price_id (fonte mais confiável)
        // [FIX W2.10] Stripe API 2026-04-22: read period from items.data[0] with root fallback
        const item0 = subscription.items?.data?.[0];
        await updateCompanyStatus(
          companyId,
          subscription.status,
          planFromPriceId(item0?.price?.id) || 'pro',
          subscription.id,
          subscription.customer as string,
          item0?.current_period_start ?? subscription.current_period_start,
          item0?.current_period_end   ?? subscription.current_period_end,
          subscription.cancel_at_period_end
        );
      }
      break;
    }

    case 'customer.subscription.updated': {
      const sub = event.data.object as Stripe.Subscription;
      const priceId = sub.items.data[0]?.price?.id;
      const resolvedPlan = planFromPriceId(priceId);
      
      console.log('[Stripe Webhook] 📋 subscription.updated details:', {
        subId: sub.id,
        customerId: sub.customer,
        priceId,
        resolvedPlan,
        metadataCompanyId: sub.metadata?.companyId,
        metadataPlanType: sub.metadata?.planType,
        status: sub.status,
        cancelAtPeriodEnd: sub.cancel_at_period_end,
      });

      const companyId = sub.metadata?.companyId 
        || (sub.customer ? await getCompanyByCustomer(sub.customer as string) : null);

      if (!companyId) {
        console.error('[Stripe Webhook] ❌ subscription.updated: Could not resolve companyId! customer:', sub.customer);
      } else {
        const status = sub.status === 'active' ? 'active' : 
                       sub.status === 'past_due' ? 'past_due' : sub.status;
        const finalPlan = resolvedPlan || sub.metadata?.planType || 'pro';

        console.log(`[Stripe Webhook] 🔄 Updating company ${companyId} → plan=${finalPlan} status=${status}`);

        // [FIX W2.10] Stripe API 2026-04-22: read period from items.data[0] with root fallback
        const item0upd = sub.items?.data?.[0] as any;
        await updateCompanyStatus(
          companyId,
          status,
          finalPlan,
          sub.id,
          undefined,
          item0upd?.current_period_start ?? (sub as any).current_period_start,
          item0upd?.current_period_end   ?? (sub as any).current_period_end,
          sub.cancel_at_period_end
        );
      }
      break;
    }

    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription;
      const companyId = sub.metadata?.companyId
        || (sub.customer ? await getCompanyByCustomer(sub.customer as string) : null);

      if (companyId) {
        // [FIX HIGH-1] Reset para 'trial' e status 'canceled'
        await updateCompanyStatus(
          companyId, 
          'canceled', 
          'trial', 
          undefined, 
          undefined, 
          undefined, 
          undefined, 
          false // Reset cancel_at
        );
      }
      break;
    }

    case 'invoice.payment_action_required': {
      const inv = event.data.object as Stripe.Invoice;
      const invAny = inv as any;
      let companyId: string | null = null;

      if (invAny.subscription) {
        try {
          const sub = await stripe.subscriptions.retrieve(invAny.subscription as string);
          companyId = sub.metadata?.companyId
            || (sub.customer ? await getCompanyByCustomer(sub.customer as string) : null);
        } catch (err) {}
      }
      if (!companyId && inv.customer) {
        companyId = await getCompanyByCustomer(inv.customer as string);
      }

      if (companyId) {
        await admin.from('stripe_payment_events').insert({
          company_id: companyId,
          event_type: '3ds_required',
          stripe_event_id: event.id,
          invoice_id: inv.id,
          amount_cents: inv.amount_due,
          metadata: { hosted_invoice_url: inv.hosted_invoice_url, attempt_count: inv.attempt_count },
        });
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

        await admin.from('stripe_payment_events').insert({
          company_id: companyId,
          event_type: 'invoice_failed',
          stripe_event_id: event.id,
          invoice_id: inv.id,
          amount_cents: inv.amount_due,
          metadata: { hosted_invoice_url: inv.hosted_invoice_url, attempt_count: inv.attempt_count },
        });

        // Notify company owner of payment failure
        try {
          const { createNotification } = await import("@/lib/notifications/create");
          // H5 FIX: Fallback from owner to admin — if no owner exists, at least notify an admin
          const { data: owner } = await admin
            .from("memberships")
            .select("user_id")
            .eq("company_id", companyId)
            .in("role", ["owner", "admin"])
            .order("role", { ascending: false }) // owner > admin alphabetically — prefer owner
            .limit(1)
            .maybeSingle();

          if (owner) {
            await createNotification({
              company_id: companyId,
              user_id: owner.user_id,
              type: "payment_failed",
              title: "Falha no pagamento",
              body: "Não foi possível processar o pagamento da sua assinatura. Acesse o portal de cobrança para atualizar seus dados.",
              action_url: "/settings",
              priority: "critical",
              metadata: {
                invoice_id: inv.id,
                amount_cents: inv.amount_due,
                hosted_invoice_url: inv.hosted_invoice_url,
              },
            });
          }
        } catch (notifErr: any) {
          console.error("[Stripe Webhook] Failed to create payment_failed notification:", notifErr.message);
        }
      }
      break;
    }

    case 'invoice.payment_succeeded': {
      // Reativar empresa se estava past_due + atualizar período de billing
      const inv = event.data.object as Stripe.Invoice;
      const invAny2 = inv as any;
      let companyId: string | null = null;
      let currentPlanType = 'starter';
      let periodStart: number | undefined;
      let periodEnd: number | undefined;

      let subscriptionObj: Stripe.Subscription | null = null;

      if (invAny2.subscription) {
        try {
          const sub = await stripe.subscriptions.retrieve(invAny2.subscription as string);
          subscriptionObj = sub;
          companyId = sub.metadata?.companyId
            || (sub.customer ? await getCompanyByCustomer(sub.customer as string) : null);
          const priceId = sub.items.data[0]?.price?.id;
          currentPlanType = planFromPriceId(priceId) || sub.metadata?.planType || 'starter';
          // [FIX A3 + W2.10] Persistir período de billing — lê de items.data[0] (API 2026-04-22)
          const item0inv = sub.items?.data?.[0] as any;
          periodStart = item0inv?.current_period_start ?? (sub as any).current_period_start;
          periodEnd   = item0inv?.current_period_end   ?? (sub as any).current_period_end;
        } catch (err) {
          console.error('[Stripe Webhook] ❌ Failed to retrieve subscription for payment_succeeded:', err);
        }
      }

      if (!companyId && inv.customer) {
        companyId = await getCompanyByCustomer(inv.customer as string);
      }

      if (companyId) {
        // Obter cancel_at real da sub se possível
        let cancelAt = false;
        if (subscriptionObj) {
          cancelAt = subscriptionObj.cancel_at_period_end;
        } else if (invAny2.subscription) {
          try {
            const sub = await stripe.subscriptions.retrieve(invAny2.subscription as string);
            cancelAt = sub.cancel_at_period_end;
          } catch(e) {}
        }

        await updateCompanyStatus(
          companyId, 
          'active', 
          currentPlanType, 
          undefined, 
          undefined, 
          periodStart, 
          periodEnd,
          cancelAt
        );

        await admin.from('stripe_payment_events').insert({
          company_id: companyId,
          event_type: 'invoice_paid',
          stripe_event_id: event.id,
          invoice_id: inv.id,
          amount_cents: inv.amount_paid,
          metadata: { hosted_invoice_url: inv.hosted_invoice_url },
        });

        const isProrated = inv.lines?.data?.some(l => (l as any).proration);
        if (isProrated) {
          await admin.from('stripe_payment_events').insert({
            company_id: companyId,
            event_type: 'proration_applied',
            stripe_event_id: event.id + '_proration',
            invoice_id: inv.id,
            amount_cents: inv.amount_paid,
            metadata: { hosted_invoice_url: inv.hosted_invoice_url },
          });
        }
      }
      break;
    }

    case 'payment_intent.succeeded': {
      // Fintech: Pix payment confirmed → update transaction + auto-confirm booking
      const pi = event.data.object as Stripe.PaymentIntent;

      const { data: tx, error: txErr } = await admin
        .from('transactions')
        .update({ status: 'paid', paid_at: new Date().toISOString() })
        .eq('provider_tx_id', pi.id)
        .select('id, company_id, lead_id, amount')
        .maybeSingle();

      if (txErr) {
        console.error('[Stripe Webhook] ❌ Failed to update transaction for payment_intent.succeeded:', txErr.message);
      } else if (tx) {
        console.log(`[Stripe Webhook] 💰 Pix paid! transaction=${tx.id} amount=R$${Number(tx.amount).toFixed(2)} lead=${tx.lead_id}`);
        // Mark lead with payment confirmed flag (engine polls checkPaymentStatus)
        // C1 FIX: Merge instead of overwrite — preserve existing metadata fields
        const { data: currentLead } = await admin
          .from('leads')
          .select('metadata')
          .eq('id', tx.lead_id)
          .eq('company_id', tx.company_id)
          .maybeSingle();
        const mergedMetadata = { ...((currentLead?.metadata as Record<string, unknown>) ?? {}), payment_confirmed: true };
        await admin
          .from('leads')
          .update({ metadata: mergedMetadata } as any)
          .eq('id', tx.lead_id)
          .eq('company_id', tx.company_id);
      }
      break;
    }

    case 'payment_intent.payment_failed': {
      const pi = event.data.object as Stripe.PaymentIntent;
      const failReason = pi.last_payment_error?.message ?? 'Pagamento recusado';

      await admin
        .from('transactions')
        .update({ status: 'expired' })
        .eq('provider_tx_id', pi.id);

      console.log(`[Stripe Webhook] ❌ Pix payment_intent.failed: ${pi.id} — ${failReason}`);
      break;
    }

    default:
      console.log(`[Stripe Webhook] ℹ️ Unhandled event type: ${event.type}`);
  }

  return NextResponse.json({ received: true });
}
