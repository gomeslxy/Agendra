import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Retrieves the Google Calendar refresh token for a company via Vault RPC
 * (`company_get_gcal_token`), falling back to legacy plaintext column if needed.
 */
export async function getCompanyGCalRefreshToken(companyId: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data: rpcToken, error: rpcErr } = await admin.rpc('company_get_gcal_token', {
    p_company_id: companyId,
  });

  if (!rpcErr && typeof rpcToken === 'string' && rpcToken.length > 0) {
    return rpcToken;
  }

  const { data: company } = await admin
    .from('companies')
    .select('google_refresh_token')
    .eq('id', companyId)
    .maybeSingle();

  return company?.google_refresh_token ?? null;
}

/**
 * Stores or clears the Google Calendar refresh token in Supabase Vault via RPC.
 */
export async function setCompanyGCalRefreshToken(
  companyId: string,
  refreshToken: string | null,
): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.rpc('company_set_gcal_token', {
    p_company_id: companyId,
    p_refresh_token: refreshToken ?? '',
  });
  if (error) {
    throw new Error(`Falha ao gravar token GCal no Vault: ${error.message}`);
  }
}
