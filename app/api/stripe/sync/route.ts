/**
 * Stripe Sync — Route Handler
 *
 * POST /api/stripe/sync
 *
 * Sincroniza o estado da assinatura diretamente do Stripe para o banco local.
 * Útil quando webhooks não chegam ou ainda não foram processados.
 *
 * [FIX] Agora busca cliente Stripe por email quando stripe_customer_id ainda
 *       não existe no banco (caso pós-checkout imediato).
 * [FIX] Lista subscriptions com status 'all' para capturar recém-criadas.
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

    // 2. Buscar empresa via memberships (consistente com o restante do app)
    const admin = createAdminClient();
    const { data: membership } = await admin
      .from('memberships')
      .select('company_id, companies(stripe_customer_id, stripe_subscription_id)')
      .eq('user_id', user.id)
      .single();

    const company = Array.isArray(membership?.companies)
      ? membership?.companies[0]
      : (membership?.companies as any);

    if (!membership?.company_id) {
      return NextResponse.json({ error: 'Empresa não encontrada' }, { status: 400 });
    }

    const companyId = membership.company_id;
    let customerId = company?.stripe_customer_id as string | null;

    // 3. Se não tem stripe_customer_id, buscar no Stripe por email
    if (!customerId && user.email) {
      const maskedEmail = user.email.split('@')[0].slice(0, 3) + '***@' + user.email.split('@')[1];
      console.log(`[Stripe Sync] 🔍 Buscando cliente Stripe por email: ${maskedEmail}`);
      const customers = await stripe.customers.list({
        email: user.email,
        limit: 1,
      });

      if (customers.data.length > 0) {
        customerId = customers.data[0].id;
        console.log(`[Stripe Sync] ✅ Cliente encontrado: ${customerId}`);

        // Persistir o customer_id para futuras consultas
        await admin
          .from('companies')
          .update({ stripe_customer_id: customerId })
          .eq('id', companyId);
      } else {
        console.log('[Stripe Sync] ℹ️ Nenhum cliente Stripe encontrado para este email');
        return NextResponse.json({ synced: false, plan: 'trial', status: 'trial' });
      }
    }

    if (!customerId) {
      return NextResponse.json({ synced: false, plan: 'trial', status: 'trial' });
    }

    // 4. Buscar TODAS as subscriptions (não apenas active)
    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      status: 'all',
      limit: 5,
    });

    // Priorizar: active > trialing > incomplete > qualquer outra
    const activeSub = subscriptions.data.find(s => s.status === 'active')
      || subscriptions.data.find(s => s.status === 'trialing')
      || subscriptions.data.find(s => s.status === 'incomplete')
      || subscriptions.data[0];

    if (!activeSub || activeSub.status === 'canceled') {
      // Sem assinatura válida — resetar para trial
      await admin
        .from('companies')
        .update({
          subscription_status: 'canceled',
          plan_type: 'trial',
          stripe_subscription_id: null,
          cancel_at_period_end: false,
        })
        .eq('id', companyId);

      return NextResponse.json({ synced: true, plan: 'trial', status: 'canceled' });
    }

    // 5. Resolver plano e atualizar banco
    const priceId = activeSub.items.data[0]?.price?.id;
    const planType = planFromPriceId(priceId) || activeSub.metadata?.planType || 'starter';
    const periodStart = (activeSub as any).current_period_start;
    const periodEnd = (activeSub as any).current_period_end;

    const updateData: Record<string, any> = {
      subscription_status: activeSub.status,
      plan_type: planType,
      stripe_subscription_id: activeSub.id,
      stripe_customer_id: customerId,
      cancel_at_period_end: activeSub.cancel_at_period_end,
    };
    if (periodStart) updateData.current_period_start = new Date(periodStart * 1000).toISOString();
    if (periodEnd) updateData.current_period_end = new Date(periodEnd * 1000).toISOString();

    const { error } = await admin
      .from('companies')
      .update(updateData)
      .eq('id', companyId);

    if (error) {
      console.error('[Stripe Sync] ❌ Erro ao atualizar:', error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    console.log(`[Stripe Sync] ✅ Sincronizado: plan=${planType} status=${activeSub.status} cancel=${activeSub.cancel_at_period_end}`);
    return NextResponse.json({
      synced: true,
      plan: planType,
      status: activeSub.status,
      priceId,
      cancelAtPeriodEnd: activeSub.cancel_at_period_end,
    });
  } catch (err: any) {
    console.error('[Stripe Sync] ❌ Erro:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
