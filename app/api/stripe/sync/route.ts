/**
 * Stripe Sync — Route Handler
 *
 * POST /api/stripe/sync
 * Exige owner/admin no tenant ativo (suporta múltiplas empresas sem `.single()`).
 */

import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createAdminClient } from '@/lib/supabase/admin';
import { planFromPriceId } from '@/lib/billing/plans';
import { invalidateUsageCache } from '@/lib/billing/limits';
import { requireTenantContext, TenantContextError } from '@/lib/tenant/context';
import { logError, logInfo } from '@/lib/logging';

function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error('STRIPE_SECRET_KEY não configurada');
  }
  return new Stripe(key);
}

export async function POST() {
  try {
    const ctx = await requireTenantContext({ requireAdmin: true });
    const companyId = ctx.companyId;
    const stripe = getStripe();

    const admin = createAdminClient();
    const { data: company } = await admin
      .from('companies')
      .select('stripe_customer_id, stripe_subscription_id')
      .eq('id', companyId)
      .maybeSingle();

    let customerId = (company?.stripe_customer_id as string | null) ?? null;

    if (!customerId && ctx.userEmail) {
      const [localPart, domainPart] = ctx.userEmail.split('@');
      const maskedEmail = `${localPart.slice(0, 3)}***@${domainPart ?? ''}`;
      logInfo(`[Stripe Sync] Buscando cliente Stripe por email: ${maskedEmail}`);
      const customers = await stripe.customers.list({
        email: ctx.userEmail,
        limit: 1,
      });

      if (customers.data.length > 0) {
        const candidate = customers.data[0].id;

        const candidateSubs = await stripe.subscriptions.list({
          customer: candidate,
          status: 'all',
          limit: 10,
        });
        const belongsHere = candidateSubs.data.some((s) => s.metadata?.companyId === companyId);

        if (!belongsHere && candidateSubs.data.length > 0) {
          logInfo('[Stripe Sync] Customer pertence a outra empresa — ignorando vínculo');
          return NextResponse.json({ synced: false, plan: 'trial', status: 'trial' });
        }

        customerId = candidate;
        await admin
          .from('companies')
          .update({ stripe_customer_id: customerId })
          .eq('id', companyId);
      } else {
        return NextResponse.json({ synced: false, plan: 'trial', status: 'trial' });
      }
    }

    if (!customerId) {
      return NextResponse.json({ synced: false, plan: 'trial', status: 'trial' });
    }

    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      status: 'all',
      limit: 5,
    });

    const activeSub =
      subscriptions.data.find((s) => s.status === 'active') ||
      subscriptions.data.find((s) => s.status === 'trialing') ||
      subscriptions.data.find((s) => s.status === 'incomplete') ||
      subscriptions.data[0];

    if (!activeSub || activeSub.status === 'canceled') {
      await admin
        .from('companies')
        .update({
          subscription_status: 'canceled',
          plan_type: 'trial',
          stripe_subscription_id: null,
          cancel_at_period_end: false,
        })
        .eq('id', companyId);

      await invalidateUsageCache(companyId);
      return NextResponse.json({ synced: true, plan: 'trial', status: 'canceled' });
    }

    const priceId = activeSub.items.data[0]?.price?.id;
    const planType = planFromPriceId(priceId) || activeSub.metadata?.planType || 'starter';
    const subRecord = activeSub as unknown as {
      current_period_start?: number;
      current_period_end?: number;
    };

    const updateData: Record<string, unknown> = {
      subscription_status: activeSub.status,
      plan_type: planType,
      stripe_subscription_id: activeSub.id,
      stripe_customer_id: customerId,
      cancel_at_period_end: activeSub.cancel_at_period_end,
    };
    if (subRecord.current_period_start) {
      updateData.current_period_start = new Date(subRecord.current_period_start * 1000).toISOString();
    }
    if (subRecord.current_period_end) {
      updateData.current_period_end = new Date(subRecord.current_period_end * 1000).toISOString();
    }

    const { error } = await admin.from('companies').update(updateData).eq('id', companyId);

    if (error) {
      logError('[Stripe Sync] Erro ao atualizar:', error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    await invalidateUsageCache(companyId);
    logInfo(`[Stripe Sync] Sincronizado: plan=${planType} status=${activeSub.status}`);
    return NextResponse.json({
      synced: true,
      plan: planType,
      status: activeSub.status,
      priceId,
      cancelAtPeriodEnd: activeSub.cancel_at_period_end,
    });
  } catch (err: unknown) {
    if (err instanceof TenantContextError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    const message = err instanceof Error ? err.message : String(err);
    logError('[Stripe Sync] Erro:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
