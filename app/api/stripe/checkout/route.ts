/**
 * Stripe Checkout — Route Handler
 *
 * POST /api/stripe/checkout
 * Exige sessão owner/admin no tenant ativo e priceId válido (rejeita desconhecidos com 400).
 */

import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { planFromPriceId } from '@/lib/billing/plans';
import { requireTenantContext, TenantContextError } from '@/lib/tenant/context';
import { logError, logInfo } from '@/lib/logging';

function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error('STRIPE_SECRET_KEY não configurada');
  }
  return new Stripe(key);
}

const CheckoutBodySchema = z.object({
  priceId: z.string().trim().min(1, 'priceId é obrigatório').max(128),
});

/** Returns '/settings' or '/planos' based on referer — never allows external redirects. */
function resolveReturnPath(referer: string | null): '/settings' | '/planos' {
  if (referer) {
    try {
      const ref = new URL(referer);
      if (ref.pathname.startsWith('/settings')) return '/settings';
    } catch {
      /* ignore malformed referer */
    }
  }
  return '/planos';
}

export async function POST(request: NextRequest) {
  try {
    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
    }

    const parsed = CheckoutBodySchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'priceId é obrigatório' },
        { status: 400 },
      );
    }

    const { priceId } = parsed.data;
    const resolvedPlanType = planFromPriceId(priceId);
    if (!resolvedPlanType) {
      return NextResponse.json({ error: 'priceId inválido ou não reconhecido' }, { status: 400 });
    }

    const origin = process.env.NEXT_PUBLIC_APP_URL || request.headers.get('origin') || '';
    const ctx = await requireTenantContext({ requireAdmin: true });

    const stripe = getStripe();
    const admin = createAdminClient();
    const { data: company, error: companyError } = await admin
      .from('companies')
      .select('name, stripe_subscription_id, stripe_customer_id, subscription_status')
      .eq('id', ctx.companyId)
      .maybeSingle();

    if (companyError) {
      logError('[Checkout] Company lookup error:', companyError.message);
      return NextResponse.json({ error: 'Erro ao buscar empresa' }, { status: 500 });
    }

    if (!company) {
      return NextResponse.json(
        { error: 'Sua conta não está vinculada a nenhuma empresa. Entre em contato com o suporte.' },
        { status: 404 },
      );
    }

    const companyId = ctx.companyId;
    logInfo('[Checkout] Iniciando processamento', {
      userId: ctx.userId,
      companyId,
      currentStatus: company.subscription_status,
      planType: resolvedPlanType,
    });

    // Upgrade direto (1-click) para assinante ativo
    if (
      company.subscription_status === 'active' &&
      company.stripe_subscription_id &&
      company.stripe_customer_id
    ) {
      try {
        const subscription = await stripe.subscriptions.retrieve(company.stripe_subscription_id);
        const currentItemId = subscription.items.data[0]?.id;
        if (!currentItemId) {
          throw new Error('Item da assinatura atual não encontrado.');
        }

        const updatedSubscription = await stripe.subscriptions.update(
          company.stripe_subscription_id,
          {
            items: [{ id: currentItemId, deleted: true }, { price: priceId }],
            proration_behavior: 'create_prorations',
            payment_behavior: 'pending_if_incomplete',
            expand: ['latest_invoice.payment_intent'],
            metadata: {
              companyId,
              planType: resolvedPlanType,
            },
          },
        );

        const latestInvoice = updatedSubscription.latest_invoice as Stripe.Invoice | null;
        if (latestInvoice?.status === 'open' && latestInvoice.hosted_invoice_url) {
          return NextResponse.json({ url: latestInvoice.hosted_invoice_url });
        }

        const returnPath = resolveReturnPath(request.headers.get('referer'));
        return NextResponse.json({
          url: `${origin}${returnPath}?tab=billing&stripe=success`,
          directSuccess: true,
        });
      } catch (upgradeError: unknown) {
        const msg = upgradeError instanceof Error ? upgradeError.message : String(upgradeError);
        logError('[Checkout] Falha no upgrade direto:', msg);
        return NextResponse.json(
          {
            error: `Não foi possível atualizar sua assinatura automaticamente: ${msg}. Por favor, tente pelo portal de faturamento ou contate o suporte.`,
          },
          { status: 500 },
        );
      }
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      mode: 'subscription',
      success_url: `${origin}${resolveReturnPath(request.headers.get('referer'))}?tab=billing&stripe=success`,
      cancel_url: `${origin}${resolveReturnPath(request.headers.get('referer'))}?tab=billing&stripe=cancel`,
      ...(company.stripe_customer_id
        ? { customer: company.stripe_customer_id }
        : { customer_email: ctx.userEmail || undefined }),
      metadata: {
        companyId,
        userId: ctx.userId,
      },
      subscription_data: {
        metadata: {
          companyId,
          planType: resolvedPlanType,
        },
      },
    });

    return NextResponse.json({ url: session.url });
  } catch (err: unknown) {
    if (err instanceof TenantContextError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    const message = err instanceof Error ? err.message : 'Erro interno';
    logError('[Stripe Checkout] Erro:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
