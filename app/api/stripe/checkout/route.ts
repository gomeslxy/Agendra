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

/** Returns '/settings' or '/planos' based on referer — never allows external redirects. */
function resolveReturnPath(referer: string | null): '/settings' | '/planos' {
  if (referer) {
    try {
      const ref = new URL(referer);
      if (ref.pathname.startsWith('/settings')) return '/settings';
    } catch { /* ignore malformed referer */ }
  }
  return '/planos';
}

export async function POST(request: NextRequest) {
  try {
    const { priceId, planType: planTypeFromBody } = await request.json();
    // origin comes from the request origin header; fall back to env — never from user body
    const origin = process.env.NEXT_PUBLIC_APP_URL || request.headers.get('origin') || '';

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

    // 2. Se já é assinante e está ativo E tem customer_id, faz upgrade direto (1-click)
    if (company?.subscription_status === 'active' && company?.stripe_subscription_id && company?.stripe_customer_id) {
      console.log('[DEBUG CHECKOUT] Iniciando UPGRADE DIRETO (Usuário Ativo)');
      
      try {
        // 1. Recuperar a assinatura atual para identificar o item a ser substituído
        const subscription = await stripe.subscriptions.retrieve(company.stripe_subscription_id);
        const currentItemId = subscription.items.data[0].id;

        // 2. Realizar o swap do plano diretamente via API
        // Usamos proration_behavior: 'create_prorations' para cobrar a diferença proporcional
        const updatedSubscription = await stripe.subscriptions.update(
          company.stripe_subscription_id,
          {
            items: [
              { id: currentItemId, deleted: true }, // Remove o item atual
              { price: priceId },                    // Adiciona o novo plano
            ],
            proration_behavior: 'create_prorations',
            payment_behavior: 'pending_if_incomplete',
            expand: ['latest_invoice.payment_intent'],
            metadata: {
              companyId,
              planType: planFromPriceId(priceId),
            }
          }
        );

        const latestInvoice = updatedSubscription.latest_invoice as Stripe.Invoice;
        
        // 3. Verificar se o pagamento da diferença exige ação do usuário (ex: 3D Secure)
        if (latestInvoice.status === 'open' && latestInvoice.hosted_invoice_url) {
          console.log('[DEBUG CHECKOUT] Upgrade exige autenticação/pagamento manual:', latestInvoice.hosted_invoice_url);
          return NextResponse.json({ url: latestInvoice.hosted_invoice_url });
        }

        // Sucesso imediato — resolve path from referer with whitelist guard
        const returnPath = resolveReturnPath(request.headers.get('referer'));
        const successPath = `${returnPath}?tab=billing&stripe=success`;
        console.log('[DEBUG CHECKOUT] Upgrade processado instantaneamente. Redirect:', successPath);
        return NextResponse.json({
          url: `${origin}${successPath}`,
          directSuccess: true
        });

      } catch (upgradeError: any) {
        console.error('[DEBUG CHECKOUT] Falha no upgrade direto:', upgradeError.message);
        return NextResponse.json({ 
          error: `Não foi possível atualizar sua assinatura automaticamente: ${upgradeError.message}. Por favor, tente pelo portal de faturamento ou contate o suporte.` 
        }, { status: 500 });
      }
    }

    // 3. Determinar planType a partir do priceId (mais confiável que o body)
    const resolvedPlanType = planFromPriceId(priceId) || planTypeFromBody || 'pro';

    // 4. Criar Sessão de Checkout
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      mode: 'subscription',
      success_url: `${origin}${resolveReturnPath(request.headers.get('referer'))}?tab=billing&stripe=success`,
      cancel_url: `${origin}${resolveReturnPath(request.headers.get('referer'))}?tab=billing&stripe=cancel`,
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
