/**
 * WhatsApp Channel Health Check — POST /api/whatsapp/test
 *
 * Testa se o token do canal WhatsApp da empresa ativa (owner/admin) ainda é válido.
 * Lê o segredo via Vault RPC (`channel_get_access_token`) com fallback temporário.
 */

import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { validateWhatsAppToken } from '@/lib/whatsapp/validate';
import { requireTenantContext, TenantContextError } from '@/lib/tenant/context';
import { logError } from '@/lib/logging';

export async function POST() {
  try {
    const { companyId } = await requireTenantContext({ requireAdmin: true });

    const admin = createAdminClient();
    const { data: channel, error: channelError } = await admin
      .from('channels')
      .select('id, provider_id, access_token, access_token_secret_id, status')
      .eq('company_id', companyId)
      .eq('provider', 'whatsapp')
      .maybeSingle();

    if (channelError || !channel) {
      return NextResponse.json(
        { ok: false, error: 'Nenhum canal WhatsApp configurado.' },
        { status: 404 },
      );
    }

    let token: string | null = null;
    if (channel.access_token_secret_id) {
      const { data: tokenData } = await admin.rpc('channel_get_access_token', {
        p_channel_id: channel.id,
      });
      token = (tokenData as string | null) ?? null;
    }
    if (!token && channel.access_token) {
      token = channel.access_token;
    }

    if (!token) {
      return NextResponse.json(
        { ok: false, error: 'Token não encontrado no canal.' },
        { status: 400 },
      );
    }

    const result = await validateWhatsAppToken(channel.provider_id, token);
    const now = new Date().toISOString();

    await admin
      .from('channels')
      .update({
        ...(result.ok
          ? { last_seen_at: now, last_error: null, status: 'active' as const }
          : { last_error: result.error ?? 'Token inválido', status: 'error' as const }),
      })
      .eq('id', channel.id)
      .eq('company_id', companyId);

    return NextResponse.json({
      ok: result.ok,
      displayPhone: result.displayPhone,
      error: result.error,
      checkedAt: now,
    });
  } catch (err: unknown) {
    if (err instanceof TenantContextError) {
      return NextResponse.json({ ok: false, error: err.message }, { status: err.status });
    }
    const msg = err instanceof Error ? err.message : String(err);
    logError('[WhatsApp Test] Error:', msg);
    return NextResponse.json(
      { ok: false, error: 'Erro interno ao testar conexão.' },
      { status: 500 },
    );
  }
}
