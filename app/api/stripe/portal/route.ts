/**
 * Stripe Billing Portal — Route Handler
 *
 * POST /api/stripe/portal
 * Exige owner/admin no tenant ativo.
 */

import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireTenantContext, TenantContextError } from '@/lib/tenant/context';
import { logError } from '@/lib/logging';

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
    const stripe = getStripe();

    const admin = createAdminClient();
    const { data: company } = await admin
      .from('companies')
      .select('stripe_customer_id')
      .eq('id', ctx.companyId)
      .maybeSingle();

    const customerId = company?.stripe_customer_id;

    if (!customerId) {
      return NextResponse.json(
        { error: 'Nenhuma assinatura ativa encontrada. Assine um plano primeiro.' },
        { status: 400 },
      );
    }

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${process.env.NEXT_PUBLIC_APP_URL}/settings?tab=billing`,
    });

    return NextResponse.json({ url: portalSession.url });
  } catch (err: unknown) {
    if (err instanceof TenantContextError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    const message = err instanceof Error ? err.message : 'Erro interno';
    logError('[Stripe Portal] Erro:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
