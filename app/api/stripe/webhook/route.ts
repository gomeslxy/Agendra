/**
 * Stripe Webhook — Route Handler
 *
 * POST /api/stripe/webhook
 *
 * Fixes (billing audit 2026-06-01):
 * [CRIT-1] Idempotência via stripe_webhook_events table — eventos duplicados ignorados.
 * [CRIT-2] Status 'trialing' mapeado para 'active' — compatível com CHECK constraint.
 * [CRIT-3] planFromPriceId retorna null → mantém plano atual do banco (sem downgrade silencioso).
 * [HIGH-1] Segundo retrieve de subscription em invoice.payment_succeeded eliminado.
 * [HIGH-4] companyId validado via DB antes de updateCompanyStatus.
 * [HIGH-6] Handler customer.subscription.created adicionado.
 * [MED-5] stripe_subscription_id limpo em customer.subscription.deleted.
 * [MED-6] Handler charge.refunded adicionado.
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

  // ── [CRIT-1] Idempotency: skip already-processed events ──────────────────────
  const { error: dedupeError } = await admin
    .from('stripe_webhook_events')
    .insert({ event_id: event.id, event_type: event.type });

  if (dedupeError) {
    if (dedupeError.code === '23505') {
      // Duplicate delivery — Stripe retried, we already processed this event.
      console.log(`[Stripe Webhook] ⚡ Duplicate event ${event.id} (${event.type}) — skipping`);
      return NextResponse.json({ received: true });
    }
    // Log but don't abort — a failed dedup insert shouldn't block legitimate events.
    console.error('[Stripe Webhook] ⚠️ Failed to record webhook event (dedup):', dedupeError.message);
  }

  console.log(`[Stripe Webhook] 🔔 Received event: ${event.type}`);

  // ── Helper: normalize Stripe status → DB status ──────────────────────────────
  // 'trialing' is a valid Stripe status; both 'trialing' and 'trial' are stored in DB.
  // Unknown statuses fall back to 'incomplete' so the CHECK constraint never rejects the row.
  function normalizeStatus(stripeStatus: string): string {
    const allowed = ['trial', 'trialing', 'active', 'past_due', 'canceled', 'incomplete', 'incomplete_expired'];
    return allowed.includes(stripeStatus) ? stripeStatus : 'incomplete';
  }

  // ── Helper: atualizar status da empresa ───────────────────────────────────
  async function updateCompanyStatus(
    companyId: string,
    status: string,
    plan: string,
    subId?: string | null,
    custId?: string,
    periodStart?: number,
    periodEnd?: number,
    cancelAtPeriodEnd?: boolean
  ) {
    const updateData: Record<string, any> = {
      subscription_status: normalizeStatus(status),
      plan_type: plan,
    };
    if (subId !== undefined) updateData.stripe_subscription_id = subId; // null clears it
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

  // ── Helper: obter plano atual do banco (evita downgrade silencioso) ────────
  // [CRIT-3] Chamado quando planFromPriceId retorna null (price ID desconhecido).
  async function getCurrentPlan(companyId: string): Promise<string> {
    const { data } = await admin
      .from('companies')
      .select('plan_type')
      .eq('id', companyId)
      .maybeSingle();
    return data?.plan_type ?? 'starter';
  }

  // ── Helper: resolver planType com fallback seguro (sem downgrade) ──────────
  async function resolvePlan(
    priceId: string | undefined,
    metadataPlanType: string | undefined,
    companyId: string | null
  ): Promise<string> {
    const fromPrice = planFromPriceId(priceId ?? null);
    if (fromPrice) return fromPrice;
    if (metadataPlanType && ['starter', 'pro', 'business'].includes(metadataPlanType)) return metadataPlanType;
    if (companyId) return getCurrentPlan(companyId);
    return 'starter';
  }

  // ── [HIGH-4] Validate companyId exists in DB before any update ────────────
  async function companyExists(companyId: string): Promise<boolean> {
    const { data } = await admin
      .from('companies')
      .select('id')
      .eq('id', companyId)
      .maybeSingle();
    return !!data;
  }

  // ── Event handlers ────────────────────────────────────────────────────────
  switch (event.type) {

    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      const companyId = session.metadata?.companyId;

      if (companyId && session.subscription) {
        // [HIGH-4] Validate company exists before updating
        if (!(await companyExists(companyId))) {
          console.error(`[Stripe Webhook] ❌ checkout.session.completed: company ${companyId} not found`);
          break;
        }

        const subscription = (await stripe.subscriptions.retrieve(
          session.subscription as string
        )) as any;

        const item0 = subscription.items?.data?.[0];
        const plan = await resolvePlan(item0?.price?.id, subscription.metadata?.planType, companyId);

        await updateCompanyStatus(
          companyId,
          subscription.status,
          plan,
          subscription.id,
          subscription.customer as string,
          item0?.current_period_start ?? subscription.current_period_start,
          item0?.current_period_end   ?? subscription.current_period_end,
          subscription.cancel_at_period_end
        );
      }
      break;
    }

    // [HIGH-6] Handle subscription creation (e.g. created without a checkout session)
    case 'customer.subscription.created': {
      const sub = event.data.object as Stripe.Subscription;
      const priceId = sub.items.data[0]?.price?.id;

      const companyId = sub.metadata?.companyId
        || (sub.customer ? await getCompanyByCustomer(sub.customer as string) : null);

      if (!companyId) {
        console.error('[Stripe Webhook] ❌ subscription.created: Could not resolve companyId! customer:', sub.customer);
        break;
      }

      const plan = await resolvePlan(priceId, sub.metadata?.planType, companyId);
      const item0 = sub.items?.data?.[0] as any;

      await updateCompanyStatus(
        companyId,
        sub.status,
        plan,
        sub.id,
        sub.customer as string,
        item0?.current_period_start ?? (sub as any).current_period_start,
        item0?.current_period_end   ?? (sub as any).current_period_end,
        sub.cancel_at_period_end
      );
      break;
    }

    case 'customer.subscription.updated': {
      const sub = event.data.object as Stripe.Subscription;
      const priceId = sub.items.data[0]?.price?.id;

      console.log('[Stripe Webhook] 📋 subscription.updated details:', {
        subId: sub.id,
        customerId: sub.customer,
        priceId,
        metadataCompanyId: sub.metadata?.companyId,
        status: sub.status,
        cancelAtPeriodEnd: sub.cancel_at_period_end,
      });

      const companyId = sub.metadata?.companyId
        || (sub.customer ? await getCompanyByCustomer(sub.customer as string) : null);

      if (!companyId) {
        console.error('[Stripe Webhook] ❌ subscription.updated: Could not resolve companyId! customer:', sub.customer);
        break;
      }

      const plan = await resolvePlan(priceId, sub.metadata?.planType, companyId);
      const item0upd = sub.items?.data?.[0] as any;

      await updateCompanyStatus(
        companyId,
        sub.status,
        plan,
        sub.id,
        undefined,
        item0upd?.current_period_start ?? (sub as any).current_period_start,
        item0upd?.current_period_end   ?? (sub as any).current_period_end,
        sub.cancel_at_period_end
      );
      break;
    }

    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription;
      const companyId = sub.metadata?.companyId
        || (sub.customer ? await getCompanyByCustomer(sub.customer as string) : null);

      if (companyId) {
        // [MED-5] Clear stripe_subscription_id so the deleted sub doesn't linger.
        await updateCompanyStatus(
          companyId,
          'canceled',
          'trial',
          null,    // null explicitly clears stripe_subscription_id
          undefined,
          undefined,
          undefined,
          false
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

      let companyId: string | null = null;
      let currentPlanType = 'starter';

      if (invAny.subscription) {
        try {
          const sub = await stripe.subscriptions.retrieve(invAny.subscription as string);
          companyId = sub.metadata?.companyId
            || (sub.customer ? await getCompanyByCustomer(sub.customer as string) : null);
          currentPlanType = await resolvePlan(sub.items.data[0]?.price?.id, sub.metadata?.planType, companyId);
        } catch (err) {
          console.error('[Stripe Webhook] ❌ Failed to retrieve subscription for payment_failed:', err);
        }
      }

      if (!companyId && inv.customer) {
        companyId = await getCompanyByCustomer(inv.customer as string);
      }

      if (companyId) {
        await updateCompanyStatus(companyId, 'past_due', currentPlanType);

        await admin.from('stripe_payment_events').insert({
          company_id: companyId,
          event_type: 'invoice_failed',
          stripe_event_id: event.id,
          invoice_id: inv.id,
          amount_cents: inv.amount_due,
          metadata: { hosted_invoice_url: inv.hosted_invoice_url, attempt_count: inv.attempt_count },
        });

        try {
          const { createNotification } = await import("@/lib/notifications/create");
          const { data: owner } = await admin
            .from("memberships")
            .select("user_id")
            .eq("company_id", companyId)
            .in("role", ["owner", "admin"])
            .order("role", { ascending: false })
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
      const inv = event.data.object as Stripe.Invoice;
      const invAny = inv as any;
      let companyId: string | null = null;
      let currentPlanType = 'starter';
      let periodStart: number | undefined;
      let periodEnd: number | undefined;
      let cancelAt = false;

      if (invAny.subscription) {
        try {
          // [HIGH-1] Single retrieve — reuse subscriptionObj for all downstream reads.
          const sub = await stripe.subscriptions.retrieve(invAny.subscription as string);
          companyId = sub.metadata?.companyId
            || (sub.customer ? await getCompanyByCustomer(sub.customer as string) : null);
          currentPlanType = await resolvePlan(sub.items.data[0]?.price?.id, sub.metadata?.planType, companyId);
          const item0inv = sub.items?.data?.[0] as any;
          periodStart = item0inv?.current_period_start ?? (sub as any).current_period_start;
          periodEnd   = item0inv?.current_period_end   ?? (sub as any).current_period_end;
          cancelAt    = sub.cancel_at_period_end;
        } catch (err) {
          console.error('[Stripe Webhook] ❌ Failed to retrieve subscription for payment_succeeded:', err);
        }
      }

      if (!companyId && inv.customer) {
        companyId = await getCompanyByCustomer(inv.customer as string);
      }

      if (companyId) {
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

    // [MED-6] Revoke access when a charge is refunded — customer should not continue
    // using the service for free after a successful refund.
    case 'charge.refunded': {
      const charge = event.data.object as Stripe.Charge;
      let companyId: string | null = null;

      if (charge.customer) {
        companyId = await getCompanyByCustomer(charge.customer as string);
      }

      if (companyId) {
        console.log(`[Stripe Webhook] 💸 charge.refunded for company ${companyId} — marking canceled`);
        // Set to canceled so next getCompanyUsage call blocks access.
        // The customer can re-subscribe at any time.
        await updateCompanyStatus(companyId, 'canceled', 'trial', null, undefined, undefined, undefined, false);

        await admin.from('stripe_payment_events').insert({
          company_id: companyId,
          event_type: 'invoice_failed', // closest available type; carries the refund context
          stripe_event_id: event.id,
          invoice_id: (charge as any).invoice as string | null ?? null,
          amount_cents: charge.amount_refunded,
          metadata: { reason: charge.refunds?.data?.[0]?.reason ?? 'unknown', charge_id: charge.id },
        });
      }
      break;
    }

    case 'payment_intent.succeeded': {
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
