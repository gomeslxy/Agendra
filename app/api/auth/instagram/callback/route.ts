/**
 * Instagram OAuth Callback — Route Handler
 *
 * GET /api/auth/instagram/callback → Validates authenticated owner/admin + HMAC state + nonce cookie
 */

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { exchangeCodeForInstagramChannel } from '@/lib/channels/adapters/instagram-auth';
import { enforceChannelType } from '@/lib/billing/gate';
import { requireTenantContext } from '@/lib/tenant/context';
import { getOAuthNonceCookieName, verifySignedOAuthState } from '@/lib/security/oauth-state';
import { invalidateCompanyChannelCaches } from '@/lib/channels/channel-cache';
import { logError, logInfo } from '@/lib/logging';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? request.nextUrl.origin;
  const cookieName = getOAuthNonceCookieName('instagram');

  if (error) {
    logInfo('[Instagram OAuth Callback] User denied access or error:', error);
    const res = NextResponse.redirect(new URL('/settings?instagram=denied', baseUrl));
    res.cookies.delete(cookieName);
    return res;
  }

  if (!code || !state) {
    logError('[Instagram OAuth Callback] Missing code or state.');
    const res = NextResponse.redirect(
      new URL('/settings?instagram=error&detail=missing_params', baseUrl),
    );
    res.cookies.delete(cookieName);
    return res;
  }

  try {
    const ctx = await requireTenantContext({ requireAdmin: true });
    const cookieStore = await cookies();
    const cookieNonce = cookieStore.get(cookieName)?.value;

    const verification = verifySignedOAuthState({
      state,
      expectedProvider: 'instagram',
      expectedUserId: ctx.userId,
      cookieNonce,
    });

    if (!verification.valid) {
      logInfo('[Instagram OAuth Callback] Invalid OAuth state:', verification.reason);
      const res = NextResponse.redirect(
        new URL('/settings?instagram=error&detail=invalid_state', baseUrl),
      );
      res.cookies.delete(cookieName);
      return res;
    }

    const { companyId } = verification;
    await requireTenantContext({ requireAdmin: true, targetCompanyId: companyId });
    await enforceChannelType(companyId, 'instagram');

    const result = await exchangeCodeForInstagramChannel(code, companyId);

    if (!result.success) {
      logError('[Instagram OAuth Callback] Exchange failed:', result.error);
      const res = NextResponse.redirect(
        new URL(
          `/settings?instagram=error&detail=${encodeURIComponent(result.error || '')}`,
          baseUrl,
        ),
      );
      res.cookies.delete(cookieName);
      return res;
    }

    await invalidateCompanyChannelCaches(companyId);
    logInfo(`[Instagram OAuth Callback] Instagram connected for company: ${companyId}`);
    revalidatePath('/settings');
    const okRes = NextResponse.redirect(new URL('/settings?instagram=success', baseUrl));
    okRes.cookies.delete(cookieName);
    return okRes;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logError('[Instagram OAuth Callback] Callback exception:', message);
    const res = NextResponse.redirect(
      new URL(`/settings?instagram=error&detail=${encodeURIComponent(message)}`, baseUrl),
    );
    res.cookies.delete(cookieName);
    return res;
  }
}
