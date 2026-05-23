/**
 * Google Calendar OAuth — Route Handler
 *
 * GET  /api/auth/google          → Redireciona o usuário para o Google OAuth
 * GET  /api/auth/google/callback → Recebe o code, troca por tokens, salva no banco
 *
 * Fluxo:
 *   1. Usuário clica em "Conectar Google Calendar" na UI
 *   2. UI faz GET /api/auth/google → 302 para accounts.google.com
 *   3. Usuário autoriza → Google redireciona para GOOGLE_REDIRECT_URI
 *   4. Callback troca o code por refresh_token e salva na tabela companies
 *   5. Redireciona para /app/settings?gcal=success
 */

import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { buildGoogleOAuthUrl, exchangeCodeForTokens } from '@/lib/calendar/google';
import { getCompanyUsage } from '@/lib/billing/limits';

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function getSessionCompanyId(): Promise<string | null> {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: membership } = await supabase
    .from('memberships')
    .select('company_id')
    .eq('user_id', user.id)
    .single();

  return membership?.company_id ?? null;
}

// ─── GET /api/auth/google — Initiate OAuth ───────────────────────────────────

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const callbackCode = searchParams.get('code');
  const callbackState = searchParams.get('state');
  const callbackError = searchParams.get('error');

  // ── Callback do Google (tem ?code= na URL) ──────────────────────────────
  if (callbackCode && callbackState) {
    return handleOAuthCallback(callbackCode, callbackState);
  }

  // ── Erro retornado pelo Google (ex: usuário cancelou) ───────────────────
  if (callbackError) {
    console.warn('[GCal OAuth] ⚠️ Usuário negou acesso ou erro:', callbackError);
    return NextResponse.redirect(
      new URL(`/settings?gcal=denied`, request.url),
    );
  }

  // ── Iniciar fluxo OAuth ─────────────────────────────────────────────────
  const companyId = await getSessionCompanyId();
  if (!companyId) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  }

  try {
    const authUrl = buildGoogleOAuthUrl(companyId);
    return NextResponse.redirect(authUrl);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[GCal OAuth] ❌ Erro ao gerar URL de autorização:', message);
    return NextResponse.json(
      { error: 'Erro de configuração OAuth', detail: message },
      { status: 500 },
    );
  }
}

// ─── Callback Handler ─────────────────────────────────────────────────────────

async function handleOAuthCallback(
  code: string,
  companyId: string,
): Promise<NextResponse> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.agendra.site';

  try {
    // Gate: maxCalendars — current model is 1 calendar per company
    const usage = await getCompanyUsage(companyId);
    const adminCheck = createAdminClient();
    const { data: co } = await adminCheck
      .from('companies')
      .select('google_refresh_token')
      .eq('id', companyId)
      .single();
    const currentCalendars = co?.google_refresh_token ? 1 : 0;
    if (currentCalendars >= usage.limits.maxCalendars) {
      console.warn(`[GCal OAuth] ⛔ maxCalendars atingido para empresa=${companyId} plano=${usage.planType}`);
      return NextResponse.redirect(new URL('/settings?gcal=limit_reached', baseUrl));
    }

    // Trocar code por tokens
    const { refresh_token, email } = await exchangeCodeForTokens(code);

    // Salvar no banco via Admin Client (service_role bypassa RLS)
    const admin = createAdminClient();
    const { error } = await admin
      .from('companies')
      .update({
        google_refresh_token: refresh_token,
        google_calendar_email: email,
        google_calendar_id: 'primary', // padrão — pode ser alterado na UI
      })
      .eq('id', companyId);

    if (error) {
      console.error('[GCal OAuth] ❌ Erro ao salvar tokens:', error.message);
      return NextResponse.redirect(
        new URL('/settings?gcal=error', baseUrl),
      );
    }

    console.log(
      `[GCal OAuth] ✅ Google Calendar conectado | company=${companyId} | email=${email}`,
    );

    revalidatePath('/settings');
    return NextResponse.redirect(
      new URL('/settings?gcal=success', baseUrl),
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[GCal OAuth] ❌ Falha no callback:', message);
    return NextResponse.redirect(
      new URL(`/settings?gcal=error`, baseUrl),
    );
  }
}
