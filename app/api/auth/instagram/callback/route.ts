/**
 * Instagram OAuth Callback — Route Handler
 * 
 * GET /api/auth/instagram/callback  → Receives Meta code/state, exchanges it for long-lived page token and registers/updates channel
 */

import { NextRequest, NextResponse } from 'next/server';
import { exchangeCodeForInstagramChannel } from '@/lib/channels/adapters/instagram-auth';
import { revalidatePath } from 'next/cache';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);

  const code = searchParams.get('code');
  const companyId = searchParams.get('state');
  const error = searchParams.get('error');

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.agendra.site';

  if (error) {
    console.warn('[Instagram OAuth Callback] ⚠️ User denied access or error:', error);
    return NextResponse.redirect(
      new URL(`/settings?instagram=denied`, baseUrl)
    );
  }

  if (!code || !companyId) {
    console.error('[Instagram OAuth Callback] ❌ Missing code or companyId.');
    return NextResponse.redirect(
      new URL(`/settings?instagram=error&detail=missing_params`, baseUrl)
    );
  }

  try {
    const result = await exchangeCodeForInstagramChannel(code, companyId);

    if (!result.success) {
      console.error('[Instagram OAuth Callback] ❌ Exchange failed:', result.error);
      return NextResponse.redirect(
        new URL(`/settings?instagram=error&detail=${encodeURIComponent(result.error || '')}`, baseUrl)
      );
    }

    console.log(`[Instagram OAuth Callback] ✅ Instagram connected for company: ${companyId}`);
    
    revalidatePath('/settings');
    return NextResponse.redirect(
      new URL(`/settings?instagram=success`, baseUrl)
    );
  } catch (err: any) {
    console.error('[Instagram OAuth Callback] ❌ Callback exception:', err.message);
    return NextResponse.redirect(
      new URL(`/settings?instagram=error&detail=${encodeURIComponent(err.message)}`, baseUrl)
    );
  }
}
