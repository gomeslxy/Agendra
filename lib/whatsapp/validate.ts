/**
 * WhatsApp Token Validation
 *
 * Verifica se um access_token + phone_number_id são válidos
 * chamando a API da Meta ANTES de salvar no banco.
 */

const META_API_BASE = 'https://graph.facebook.com/v19.0';

export interface TokenValidationResult {
  ok: boolean;
  displayPhone?: string;
  error?: string;
}

/**
 * Valida um token WhatsApp chamando a API da Meta.
 * Retorna o número de telefone formatado e a expiração do token.
 */
export async function validateWhatsAppToken(
  phoneId: string,
  token: string,
): Promise<TokenValidationResult & { expiresAt?: string }> {
  try {
    const cleanToken = token.startsWith('Bearer ') ? token.substring(7).trim() : token.trim();

    // 1. Validar o token e obter expiração (debug_token)
    // Nota: O debug_token requer o App Access Token ou o próprio token se for User/System User
    const debugRes = await fetch(
      `https://graph.facebook.com/debug_token?input_token=${cleanToken}&access_token=${cleanToken}`
    );
    const debugData = await debugRes.json();
    const expiresAt = debugData.data?.expires_at 
      ? new Date(debugData.data.expires_at * 1000).toISOString() 
      : undefined;

    // 2. Validar o Phone ID e pegar o display phone
    const res = await fetch(
      `${META_API_BASE}/${phoneId}?fields=display_phone_number,verified_name`,
      { headers: { Authorization: `Bearer ${cleanToken}` } },
    );

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      const metaMsg = data.error?.message ?? `HTTP ${res.status}`;
      return { ok: false, error: `Erro da Meta API: ${metaMsg}` };
    }

    const data = await res.json();
    return {
      ok: true,
      displayPhone: data.display_phone_number ?? undefined,
      expiresAt,
    };
  } catch (err: any) {
    return { ok: false, error: `Falha de rede: ${err.message}` };
  }
}
