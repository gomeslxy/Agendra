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
  apiVersion: '2026-04-22.dahlia' as any,
});

export async function POST(request: NextRequest) {
  try {
    const { priceId, planType: planTypeFromBody } = await request.json();
    const origin = request.headers.get('origin') || process.env.NEXT_PUBLIC_APP_URL;

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
    const { data: profile, error: profileError } = await admin
      .from('users')
      .select('company_id, companies(name, stripe_subscription_id, stripe_customer_id, subscription_status)')
      .eq('id', user.id)
      .maybeSingle();

    if (profileError) {
      console.error('[Checkout] User profile error:', profileError);
      return NextResponse.json({ 
        error: `Erro ao buscar perfil: ${profileError.message}`
      }, { status: 500 });
    }

    if (!profile || !profile.company_id) {
      console.error('[Checkout] No company linked to user:', user.id);
      return NextResponse.json({ 
        error: 'Sua conta não está vinculada a nenhuma empresa. Entre em contato com o suporte.'
      }, { status: 404 });
    }

    const companyId = profile.company_id;
    const company = profile.companies as any;

    // 1. Validar empresa e IDs
    console.log('[DEBUG CHECKOUT] Iniciando processamento:', {
      userId: user.id,
      companyId: companyId,
      stripeCustomerId: company?.stripe_customer_id,
      currentStatus: company?.subscription_status,
      priceIdRequested: priceId
    });

    if (!company?.stripe_customer_id) {
      console.error('[DEBUG CHECKOUT] ERRO: Empresa sem stripe_customer_id');
      return NextResponse.json({ error: 'Sua conta não tem um ID de cliente do Stripe vinculado.' }, { status: 400 });
    }

    // Se já é assinante e está ativo, manda para o portal de faturamento
    if (company?.subscription_status === 'active' && company?.stripe_subscription_id) {
      console.log('[DEBUG CHECKOUT] Redirecionando para PORTAL (Usuário Ativo)');
      
      try {
        const portalSession = await stripe.billingPortal.sessions.create({
          customer: company.stripe_customer_id,
          return_url: `${origin}/settings?tab=billing`,
          flow_data: {
            type: 'subscription_update',
            subscription_update: {
              subscription: company.stripe_subscription_id,
            },
          },
        });
        console.log('[DEBUG CHECKOUT] Portal Session (Update) criada:', portalSession.url);
        return NextResponse.json({ url: portalSession.url });
      } catch (portalError: any) {
        console.error('[DEBUG CHECKOUT] Falha no flow_data do Portal:', portalError.message);
        
        try {
          console.log('[DEBUG CHECKOUT] Tentando fallback para Portal Geral...');
          const fallbackSession = await stripe.billingPortal.sessions.create({
            customer: company.stripe_customer_id,
            return_url: `${origin}/settings?tab=billing`,
          });
          return NextResponse.json({ url: fallbackSession.url });
        } catch (fallbackError: any) {
          console.error('[DEBUG CHECKOUT] Falha total no Portal:', fallbackError.message);
          return NextResponse.json({ error: fallbackError.message }, { status: 500 });
        }
      }
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
      // [FIX] Stripe does not allow both customer and customer_email
      ...(company?.stripe_customer_id 
        ? { customer: company.stripe_customer_id } 
        : { customer_email: user.email }
      ),
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
