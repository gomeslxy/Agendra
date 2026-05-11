/**
 * Stripe Billing Portal — Route Handler
 *
 * POST /api/stripe/portal
 *
 * Cria uma sessão no Stripe Customer Portal para gerenciar assinatura.
 * Permite: trocar cartão, ver faturas, cancelar, fazer upgrade/downgrade.
 */

import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createServerClient } from '@supabase/ssr';
import { createAdminClient } from '@/lib/supabase/admin';
import { cookies } from 'next/headers';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2026-04-22.dahlia' as any,
});

export async function POST(request: NextRequest) {
  try {
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

    const admin = createAdminClient();
    const { data: membership } = await admin
      .from('memberships')
      .select('company_id, companies(stripe_customer_id)')
      .eq('user_id', user.id)
      .single();

    const company = Array.isArray(membership?.companies)
      ? membership?.companies[0]
      : (membership?.companies as any);

    const customerId = company?.stripe_customer_id;

    if (!customerId) {
      return NextResponse.json(
        { error: 'Nenhuma assinatura ativa encontrada. Assine um plano primeiro.' },
        { status: 400 }
      );
    }

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${process.env.NEXT_PUBLIC_APP_URL}/settings?tab=billing`,
    });

    return NextResponse.json({ url: portalSession.url });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro interno';
    console.error('[Stripe Portal] ❌ Erro:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
