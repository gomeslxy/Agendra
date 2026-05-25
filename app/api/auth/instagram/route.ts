/**
 * Instagram OAuth — Route Handler
 * 
 * GET /api/auth/instagram  → Redirects the user to the Meta/Facebook Login OAuth dialog
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getInstagramOAuthUrl } from '@/lib/channels/adapters/instagram-auth';

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

export async function GET(request: NextRequest): Promise<NextResponse> {
  const companyId = await getSessionCompanyId();
  if (!companyId) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  }

  try {
    const authUrl = getInstagramOAuthUrl(companyId);
    return NextResponse.redirect(authUrl);
  } catch (err: any) {
    console.error('[Instagram OAuth] Error generating URL:', err.message);
    return NextResponse.json(
      { error: 'Erro de configuração OAuth', detail: err.message },
      { status: 500 }
    );
  }
}
