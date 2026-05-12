/**
 * Stripe Sync — Route Handler
 *
 * POST /api/stripe/sync
 *
 * Sincroniza o estado da assinatura diretamente do Stripe para o banco local.
 * Útil quando webhooks não chegam (desenvolvimento local sem `stripe listen`).
 */

import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createServerClient } from '@supabase/ssr';
import { createAdminClient } from '@/lib/supabase/admin';
import { cookies } from 'next/headers';
import { planFromPriceId } from '@/lib/billing/plans';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2026-04-22.dahlia' as any,
});

export async function POST() {
  try {
    // 1. Autenticação
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll: () => cookieStore.getAll(),
          setAll: () => {},
        },
      }
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

    // 2. Buscar empresa
    const admin = createAdminClient();
    const { data: profile } = await admin
      .from('users')
      .select('company_id, companies(stripe_customer_id, stripe_subscription_id)')
      .eq('id', user.id)
      .maybeSingle();

    const company = profile?.companies as any;
    if (!profile?.company_id || !company?.stripe_customer_id) {
      return NextResponse.json({ error: 'Empresa sem vínculo Stripe' }, { status: 400 });
    }

    // 3. Buscar assinaturas ativas no Stripe
    const subscriptions = await stripe.subscriptions.list({
      customer: company.stripe_customer_id,
      status: 'active',
      limit: 1,
    });

    if (subscriptions.data.length === 0) {
      // Sem assinatura ativa — resetar para trial
      await admin
        .from('companies')
        .update({
          subscription_status: 'canceled',
          plan_type: 'trial',
          stripe_subscription_id: null,
          cancel_at_period_end: false,
        })
        .eq('id', profile.company_id);

      return NextResponse.json({ synced: true, plan: 'trial', status: 'canceled' });
    }

    const sub = subscriptions.data[0];
    const priceId = sub.items.data[0]?.price?.id;
    const planType = planFromPriceId(priceId) || sub.metadata?.planType || 'starter';
    const periodStart = (sub as any).current_period_start;
    const periodEnd = (sub as any).current_period_end;

    // 4. Atualizar banco
    const updateData: Record<string, any> = {
      subscription_status: sub.status,
      plan_type: planType,
      stripe_subscription_id: sub.id,
      cancel_at_period_end: sub.cancel_at_period_end,
    };
    if (periodStart) updateData.current_period_start = new Date(periodStart * 1000).toISOString();
    if (periodEnd) updateData.current_period_end = new Date(periodEnd * 1000).toISOString();

    const { error } = await admin
      .from('companies')
      .update(updateData)
      .eq('id', profile.company_id);

    if (error) {
      console.error('[Stripe Sync] ❌ Erro ao atualizar:', error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    console.log(`[Stripe Sync] ✅ Sincronizado: plan=${planType} status=${sub.status} cancel=${sub.cancel_at_period_end}`);
    return NextResponse.json({
      synced: true,
      plan: planType,
      status: sub.status,
      priceId,
      cancelAtPeriodEnd: sub.cancel_at_period_end,
    });
  } catch (err: any) {
    console.error('[Stripe Sync] ❌ Erro:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
