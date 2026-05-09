/**
 * Stripe Checkout — Route Handler
 * 
 * POST /api/stripe/checkout
 * 
 * Cria uma sessão de checkout para assinatura de planos (Starter/Pro).
 * Vincula o company_id aos metadados para processar no webhook.
 */

import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-01-27.acacia' as any,
});

export async function POST(request: NextRequest) {
  try {
    const { priceId } = await request.json();
    
    // 1. Validar autenticação e pegar o company_id
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll: () => cookieStore.getAll(),
          setAll: () => {}, // não precisamos setar aqui
        },
      }
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

    const { data: membership } = await supabase
      .from('memberships')
      .select('company_id, companies(name, google_calendar_email)')
      .eq('user_id', user.id)
      .single();

    const companyId = membership?.company_id;
    if (!companyId) return NextResponse.json({ error: 'Empresa não encontrada' }, { status: 404 });

    // 2. Criar Sessão de Checkout
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      mode: 'subscription',
      success_url: `${process.env.NEXT_PUBLIC_APP_URL}/app/settings?stripe=success`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/app/settings?stripe=cancel`,
      customer_email: user.email,
      metadata: {
        companyId: companyId,
        userId: user.id,
      },
      subscription_data: {
        metadata: {
          companyId: companyId,
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
