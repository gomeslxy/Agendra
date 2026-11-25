/**
 * Google Calendar OAuth — Route Handler
 *
 * GET  /api/auth/google          → Redireciona o usuário autenticado (owner/admin) para o Google OAuth
 * GET  /api/auth/google?code=... → Valida sessão + HMAC state + nonce cookie, troca code e salva no Vault
 */

import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { createAdminClient } from '@/lib/supabase/admin';
import { buildGoogleOAuthUrl, exchangeCodeForTokens } from '@/lib/calendar/google';
import { setCompanyGCalRefreshToken } from '@/lib/calendar/gcal-token';
import { getCompanyUsage } from '@/lib/billing/limits';
import { requireTenantContext, TenantContextError } from '@/lib/tenant/context';
import {
  createSignedOAuthState,
  getOAuthNonceCookieName,
  verifySignedOAuthState,
} from '@/lib/security/oauth-state';
import { logError, logInfo } from '@/lib/logging';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const callbackCode = searchParams.get('code');
  const callbackState = searchParams.get('state');
  const callbackError = searchParams.get('error');

  if (callbackError) {
    logInfo('[GCal OAuth] Usuário negou acesso ou erro:', callbackError);
    return NextResponse.redirect(new URL('/settings?gcal=denied', request.url));
  }

  let ctx;
  try {
    ctx = await requireTenantContext({ requireAdmin: true });
  } catch (err) {
    if (err instanceof TenantContextError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  }

  if (callbackCode && callbackState) {
    return handleOAuthCallback(request, callbackCode, callbackState, ctx.userId);
  }

  try {
    const { state, nonce, cookieName } = createSignedOAuthState({
      companyId: ctx.companyId,
      userId: ctx.userId,
      provider: 'google',
    });

    const authUrl = buildGoogleOAuthUrl(state);
    const res = NextResponse.redirect(authUrl);
    res.cookies.set(cookieName, nonce, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 600,
    });
    return res;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logError('[GCal OAuth] Erro ao gerar URL de autorização:', message);
    return NextResponse.json(
      { error: 'Erro de configuração OAuth' },
      { status: 500 },
    );
  }
}

async function handleOAuthCallback(
  request: NextRequest,
  code: string,
  state: string,
  userId: string,
): Promise<NextResponse> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? request.nextUrl.origin;
  const cookieStore = await cookies();
  const cookieName = getOAuthNonceCookieName('google');
  const cookieNonce = cookieStore.get(cookieName)?.value;

  const verification = verifySignedOAuthState({
    state,
    expectedProvider: 'google',
    expectedUserId: userId,
    cookieNonce,
  });

  if (!verification.valid) {
    logInfo('[GCal OAuth] Invalid OAuth state:', verification.reason);
    const failRes = NextResponse.redirect(new URL('/settings?gcal=error', baseUrl));
    failRes.cookies.delete(cookieName);
    return failRes;
  }

  const { companyId } = verification;

  try {
    // Re-verify that the authenticated user is still owner/admin of the signed state's companyId
    await requireTenantContext({ requireAdmin: true, targetCompanyId: companyId });

    // Gate: maxCalendars — current model is 1 calendar per company
    const usage = await getCompanyUsage(companyId);
    const admin = createAdminClient();
    const { data: co } = await admin
      .from('companies')
      .select('google_refresh_token, google_refresh_token_secret_id')
      .eq('id', companyId)
      .single();

    const currentCalendars =
      co?.google_refresh_token || co?.google_refresh_token_secret_id ? 1 : 0;
    if (currentCalendars >= usage.limits.maxCalendars) {
      logInfo(`[GCal OAuth] maxCalendars atingido para empresa=${companyId} plano=${usage.planType}`);
      const limitRes = NextResponse.redirect(new URL('/settings?gcal=limit_reached', baseUrl));
      limitRes.cookies.delete(cookieName);
      return limitRes;
    }

    const { refresh_token, email } = await exchangeCodeForTokens(code);

    await setCompanyGCalRefreshToken(companyId, refresh_token);

    const { error } = await admin
      .from('companies')
      .update({
        google_calendar_email: email,
        google_calendar_id: 'primary',
      })
      .eq('id', companyId);

    if (error) {
      logError('[GCal OAuth] Erro ao salvar metadados do calendário:', error.message);
      const errRes = NextResponse.redirect(new URL('/settings?gcal=error', baseUrl));
      errRes.cookies.delete(cookieName);
      return errRes;
    }

    logInfo(`[GCal OAuth] Google Calendar conectado | company=${companyId}`);

    revalidatePath('/settings');
    const okRes = NextResponse.redirect(new URL('/settings?gcal=success', baseUrl));
    okRes.cookies.delete(cookieName);
    return okRes;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logError('[GCal OAuth] Falha no callback:', message);
    const errRes = NextResponse.redirect(new URL('/settings?gcal=error', baseUrl));
    errRes.cookies.delete(cookieName);
    return errRes;
  }
}
