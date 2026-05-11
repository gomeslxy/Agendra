/**
 * Stripe Checkout — Route Handler
 *
 * POST /api/stripe/checkout
 *
 * Cria uma sessão de checkout para assinatura de planos.
 * Vincula o company_id aos metadados para processar no webhook.
 *
 * [FIX CRIT-4] Verifica assinatura existente antes de criar nova sessão.
 * [FIX MED-8]  success_url aponta para /settings (não /app/settings).
 */

import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createServerClient } from '@supabase/ssr';
import { createAdminClient } from '@/lib/supabase/admin';
import { cookies } from 'next/headers';
import { planFromPriceId } from '@/lib/billing/plans';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-01-27.acacia' as any,
});

export async function POST(request: NextRequest) {
  try {
    const { priceId, planType: planTypeFromBody } = await request.json();

    if (!priceId) {
      return NextResponse.json({ error: 'priceId é obrigatório' }, { status: 400 });
    }

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

    // 2. Resolver company e verificar assinatura existente
    const admin = createAdminClient();
    const { data: membership } = await admin
      .from('memberships')
      .select('company_id, companies(name, stripe_subscription_id, stripe_customer_id, subscription_status)')
      .eq('user_id', user.id)
      .single();

    const companyId = membership?.company_id;
    if (!companyId) return NextResponse.json({ error: 'Empresa não encontrada' }, { status: 404 });

    const company = Array.isArray(membership?.companies)
      ? membership?.companies[0]
      : (membership?.companies as any);

    // [FIX CRIT-4] Se já tem assinatura ativa, redireciona para portal em vez de criar nova
    if (company?.subscription_status === 'active' && company?.stripe_subscription_id) {
      // Criar sessão no portal de billing para upgrade/downgrade
      const portalSession = await stripe.billingPortal.sessions.create({
        customer: company.stripe_customer_id as string,
        return_url: `${process.env.NEXT_PUBLIC_APP_URL}/settings?tab=billing`,
      });
      return NextResponse.json({ url: portalSession.url });
    }

    // 3. Determinar planType a partir do priceId (mais confiável que o body)
    const resolvedPlanType = planFromPriceId(priceId) || planTypeFromBody || 'pro';

    // 4. Criar Sessão de Checkout
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      mode: 'subscription',
      // [FIX MED-8] URL correta: /settings, não /app/settings
      success_url: `${process.env.NEXT_PUBLIC_APP_URL}/settings?tab=billing&stripe=success`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/planos?stripe=cancel`,
      customer_email: user.email,
      // Pré-popular customer se já existe
      ...(company?.stripe_customer_id ? { customer: company.stripe_customer_id } : {}),
      metadata: {
        companyId,
        userId: user.id,
      },
      subscription_data: {
        metadata: {
          companyId,
          planType: resolvedPlanType,
        },
      },
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro interno';
    console.error('[Stripe Checkout] ❌ Erro:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
