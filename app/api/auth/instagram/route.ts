/**
 * Instagram OAuth — Route Handler
 *
 * GET /api/auth/instagram → Redirects authenticated owner/admin to Meta/Facebook Login OAuth dialog
 */

import { NextResponse } from 'next/server';
import { getInstagramOAuthUrl } from '@/lib/channels/adapters/instagram-auth';
import { requireTenantContext, TenantContextError } from '@/lib/tenant/context';
import { createSignedOAuthState } from '@/lib/security/oauth-state';
import { logError } from '@/lib/logging';

export async function GET(): Promise<NextResponse> {
  let ctx;
  try {
    ctx = await requireTenantContext({ requireAdmin: true });
  } catch (err) {
    if (err instanceof TenantContextError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  }

  try {
    const { state, nonce, cookieName } = createSignedOAuthState({
      companyId: ctx.companyId,
      userId: ctx.userId,
      provider: 'instagram',
    });

    const authUrl = getInstagramOAuthUrl(state);
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
    logError('[Instagram OAuth] Error generating URL:', message);
    return NextResponse.json(
      { error: 'Erro de configuração OAuth' },
      { status: 500 },
    );
  }
}
