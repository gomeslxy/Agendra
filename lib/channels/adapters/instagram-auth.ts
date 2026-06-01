import { createAdminClient } from '@/lib/supabase/admin';
import { logInfo, logError } from '@/lib/logging';

const META_API_BASE = 'https://graph.facebook.com/v21.0';

function getRedirectUri() {
  // SERVER_APP_URL takes priority (server-only, not exposed to client).
  // Falls back to NEXT_PUBLIC_APP_URL, then to production domain.
  // In local dev: set SERVER_APP_URL=http://localhost:3000 in .env.local
  const base =
    process.env.SERVER_APP_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    'https://www.agendra.site';
  return `${base}/api/auth/instagram/callback`;
}

/**
 * Generates the Facebook OAuth dialog URL to authenticate page and messaging scopes.
 */
export function getInstagramOAuthUrl(companyId: string): string {
  const appId = process.env.NEXT_PUBLIC_INSTAGRAM_APP_ID;
  if (!appId) {
    throw new Error('NEXT_PUBLIC_INSTAGRAM_APP_ID is not configured.');
  }

  const redirectUri = getRedirectUri();
  const scopes = [
    'instagram_manage_messages',
    'pages_manage_metadata',
    'pages_show_list',
    'pages_messaging'
  ].join(',');

  return `https://www.facebook.com/v21.0/dialog/oauth?client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scopes)}&state=${companyId}`;
}

/**
 * Exchanges OAuth callback code for tokens and registers the Instagram Business channel.
 */
export async function exchangeCodeForInstagramChannel(
  code: string,
  companyId: string
): Promise<{ success: boolean; error?: string }> {
  const appId = process.env.NEXT_PUBLIC_INSTAGRAM_APP_ID;
  const appSecret = process.env.INSTAGRAM_APP_SECRET;

  if (!appId || !appSecret) {
    return { success: false, error: 'Configuração da Meta (App ID ou Secret) ausente no servidor.' };
  }

  const redirectUri = getRedirectUri();

  try {
    logInfo(`[Instagram OAuth] Iniciando troca de código para empresa: ${companyId}`);

    // 1. Obter short-lived User Access Token
    const tokenUrl = `${META_API_BASE}/oauth/access_token?client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&client_secret=${appSecret}&code=${code}`;
    const tokenRes = await fetch(tokenUrl);
    const tokenData = await tokenRes.json();

    if (!tokenRes.ok) {
      logError('[Instagram OAuth] Erro ao obter short-lived token:', tokenData.error?.message);
      return { success: false, error: `Erro no token da Meta: ${tokenData.error?.message || 'Token exchange failed'}` };
    }

    const shortLivedToken = tokenData.access_token;

    // 2. Trocar por long-lived User Access Token (~60 dias)
    const longLivedUrl = `${META_API_BASE}/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${shortLivedToken}`;
    const longLivedRes = await fetch(longLivedUrl);
    const longLivedData = await longLivedRes.json();

    if (!longLivedRes.ok) {
      logError('[Instagram OAuth] Erro ao obter long-lived token:', longLivedData.error?.message);
      return { success: false, error: `Erro no long-lived token: ${longLivedData.error?.message}` };
    }

    const longLivedToken = longLivedData.access_token;

    // 3. Buscar as Facebook Pages administradas pelo usuário
    const pagesUrl = `${META_API_BASE}/me/accounts?access_token=${longLivedToken}`;
    const pagesRes = await fetch(pagesUrl);
    const pagesData = await pagesRes.json();

    if (!pagesRes.ok || !pagesData.data) {
      logError('[Instagram OAuth] Erro ao obter páginas:', pagesData.error?.message);
      return { success: false, error: `Erro ao listar páginas do Facebook: ${pagesData.error?.message || 'No pages found'}` };
    }

    // 4. Encontrar a página vinculada a uma conta Instagram Business
    let connectedPage: any = null;
    let instagramBusinessAccountId: string = '';

    logInfo(`[Instagram OAuth] Varrendo ${pagesData.data.length} páginas do Facebook conectadas...`);

    for (const page of pagesData.data) {
      const pageId = page.id;
      const pageAccessToken = page.access_token;

      const pageDetailsUrl = `${META_API_BASE}/${pageId}?fields=instagram_business_account,name&access_token=${pageAccessToken}`;
      const detailsRes = await fetch(pageDetailsUrl);
      
      if (detailsRes.ok) {
        const detailsData = await detailsRes.json();
        if (detailsData.instagram_business_account?.id) {
          connectedPage = page;
          instagramBusinessAccountId = detailsData.instagram_business_account.id;
          break; // Encontramos o canal correspondente!
        }
      }
    }

    if (!connectedPage || !instagramBusinessAccountId) {
      logError('[Instagram OAuth] Nenhuma conta do Instagram Business vinculada às páginas.');
      return {
        success: false,
        error: 'Nenhuma conta profissional do Instagram (Instagram Business) foi encontrada vinculada às suas páginas do Facebook. Certifique-se de conectar seu Instagram profissional a uma Página do Facebook antes.'
      };
    }

    logInfo(`[Instagram OAuth] Conectado com sucesso! IG Account ID: ${instagramBusinessAccountId}, Página: ${connectedPage.name}`);

    // 5. Cadastrar ou Atualizar o canal no Supabase
    const admin = createAdminClient();

    // Seta expiração de token para 59 dias a partir de hoje
    const tokenExpiresAt = new Date(Date.now() + 59 * 24 * 60 * 60 * 1000).toISOString();

    // Verifica se já existe um canal cadastrado para esta empresa e provider_id
    const { data: existingChannel } = await admin
      .from('channels')
      .select('id')
      .eq('company_id', companyId)
      .eq('provider', 'instagram')
      .eq('provider_id', instagramBusinessAccountId)
      .maybeSingle();

    let channelId = existingChannel?.id;

    if (existingChannel) {
      // Atualizar dados cadastrais básicos
      const { error: updateErr } = await admin
        .from('channels')
        .update({
          display_name: connectedPage.name,
          status: 'active',
          meta: {
            page_id: connectedPage.id,
            page_name: connectedPage.name,
            connected_at: new Date().toISOString()
          },
          token_expires_at: tokenExpiresAt,
          token_refreshed_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', existingChannel.id);

      if (updateErr) throw updateErr;
    } else {
      // Inserir novo canal
      const { data: newChannel, error: insertErr } = await admin
        .from('channels')
        .insert({
          company_id: companyId,
          provider: 'instagram',
          provider_id: instagramBusinessAccountId,
          display_name: connectedPage.name,
          status: 'active',
          meta: {
            page_id: connectedPage.id,
            page_name: connectedPage.name,
            connected_at: new Date().toISOString()
          },
          token_expires_at: tokenExpiresAt,
          token_refreshed_at: new Date().toISOString()
        })
        .select('id')
        .single();

      if (insertErr) throw insertErr;
      channelId = newChannel.id;
    }

    // 6. Criptografar o Page Access Token no Supabase Vault RPC
    const { error: rpcErr } = await admin.rpc('channel_set_access_token', {
      p_channel_id: channelId,
      p_token: connectedPage.access_token
    });

    if (rpcErr) {
      logError('[Instagram OAuth] Erro ao criptografar o token via Vault RPC:', rpcErr.message);
      return { success: false, error: `Erro de criptografia de token: ${rpcErr.message}` };
    }

    logInfo(`[Instagram OAuth] Canal configurado com sucesso e criptografado no Vault: ${channelId}`);
    return { success: true };
  } catch (err: any) {
    logError('[Instagram OAuth] Falha crítica de integração:', err.message);
    return { success: false, error: `Falha interna no servidor: ${err.message}` };
  }
}

/**
 * Refreshes an Instagram long-lived page token dynamically if needed.
 */
export async function refreshInstagramLongLivedToken(
  channelId: string,
  currentToken: string
): Promise<{ success: boolean; token?: string; error?: string }> {
  const appId = process.env.NEXT_PUBLIC_INSTAGRAM_APP_ID;
  const appSecret = process.env.INSTAGRAM_APP_SECRET;

  if (!appId || !appSecret) {
    return { success: false, error: 'Configuração da Meta (App ID ou Secret) ausente no servidor.' };
  }

  try {
    logInfo(`[Instagram Token Refresh] Refreshing token for channel: ${channelId}`);

    // Exchange the current long-lived token for a new one to reset the 60-day counter
    const refreshUrl = `${META_API_BASE}/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${currentToken}`;
    const res = await fetch(refreshUrl);
    const data = await res.json();

    if (!res.ok) {
      logError('[Instagram Token Refresh] Erro ao trocar token:', data.error?.message);
      return { success: false, error: data.error?.message || 'Token exchange failed' };
    }

    const newToken = data.access_token;
    
    // Seta expiração de token para 59 dias a partir de hoje
    const tokenExpiresAt = new Date(Date.now() + 59 * 24 * 60 * 60 * 1000).toISOString();
    const admin = createAdminClient();

    // Atualizar datas de expiração e refresh
    const { error: dbErr } = await admin
      .from('channels')
      .update({
        token_expires_at: tokenExpiresAt,
        token_refreshed_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', channelId);

    if (dbErr) throw dbErr;

    // Criptografar o novo access token no Supabase Vault
    const { error: rpcErr } = await admin.rpc('channel_set_access_token', {
      p_channel_id: channelId,
      p_token: newToken
    });

    if (rpcErr) throw rpcErr;

    logInfo(`[Instagram Token Refresh] Token atualizado com sucesso no Vault para o canal: ${channelId}`);
    return { success: true, token: newToken };
  } catch (err: any) {
    logError(`[Instagram Token Refresh] Falha crítica ao atualizar token do canal ${channelId}:`, err.message);
    return { success: false, error: err.message };
  }
}
