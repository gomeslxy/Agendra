import { createAdminClient } from "@/lib/supabase/admin";

const WHATSAPP_API_BASE = 'https://graph.facebook.com/v19.0';

async function resolveWaCreds(companyId?: string): Promise<{ phoneId: string; token: string; admin: ReturnType<typeof createAdminClient> | null }> {
  const admin = companyId ? createAdminClient() : null;
  let phoneId: string | undefined;
  let token: string | undefined;

  if (process.env.NODE_ENV === 'development') {
    phoneId = process.env.WHATSAPP_PHONE_ID;
    token = process.env.WHATSAPP_TOKEN;
  }

  if (companyId && admin) {
    const { data: channels } = await admin
      .from("channels")
      .select("id, provider_id, access_token")
      .eq("company_id", companyId)
      .eq("provider", "whatsapp")
      .eq("status", "active")
      .limit(1);
    const channel = channels?.[0];
    if (channel?.provider_id) {
      phoneId = channel.provider_id;
      const { data: tokenData } = await admin.rpc('channel_get_access_token', { p_channel_id: channel.id });
      token = (tokenData as string) || channel.access_token;
    }
  }

  if (!phoneId || !token) throw new Error('Missing WhatsApp configuration (neither channel in DB nor environment variables are set)');
  if (token.startsWith('Bearer ')) token = token.substring(7);
  return { phoneId, token: token.trim(), admin };
}

export async function sendWhatsAppMessage(to: string, text: string, companyId?: string): Promise<void> {
  const { phoneId, token, admin } = await resolveWaCreds(companyId);

  // Diagnóstico seguro — sem expor o token
  console.log(`[WhatsApp Client] 📤 Enviando para ${to.substring(0, 6)}*** via phone_id=${phoneId}`);

  const res = await fetch(`${WHATSAPP_API_BASE}/${phoneId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body: text },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    const errorMessage = `WhatsApp API error ${res.status}: ${err}`;

    if (companyId && admin) {
      const isAuthError = res.status === 401 || res.status === 403;
      admin.from("channels")
        .update({
          last_error: errorMessage,
          status: isAuthError ? "error" : "active",
          updated_at: new Date().toISOString(),
        })
        .eq("company_id", companyId)
        .eq("provider", "whatsapp")
        .then();
    }

    throw new Error(errorMessage);
  }

  if (companyId && admin) {
    admin.from("channels")
      .update({
        last_error: null,
        last_seen_at: new Date().toISOString(),
        status: "active",
        updated_at: new Date().toISOString(),
      })
      .eq("company_id", companyId)
      .eq("provider", "whatsapp")
      .then();
  }
}

export async function sendWhatsAppMedia(
  to: string,
  mediaUrl: string,
  mediaType: 'image' | 'document' | 'video' | 'audio',
  filename: string,
  caption: string,
  companyId?: string
): Promise<void> {
  const { phoneId, token, admin } = await resolveWaCreds(companyId);
  console.log(`[WhatsApp Client] 📎 Enviando mídia (${mediaType}) para ${to.substring(0, 6)}***`);

  const mediaPayload: Record<string, any> = { link: mediaUrl };
  if (caption) mediaPayload.caption = caption;
  if (mediaType === 'document') mediaPayload.filename = filename;

  const res = await fetch(`${WHATSAPP_API_BASE}/${phoneId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: mediaType,
      [mediaType]: mediaPayload,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    const errorMessage = `WhatsApp Media API error ${res.status}: ${err}`;
    if (companyId && admin) {
      const isAuthError = res.status === 401 || res.status === 403;
      admin.from("channels")
        .update({ last_error: errorMessage, status: isAuthError ? "error" : "active", updated_at: new Date().toISOString() })
        .eq("company_id", companyId).eq("provider", "whatsapp").then();
    }
    throw new Error(errorMessage);
  }

  if (companyId && admin) {
    admin.from("channels")
      .update({ last_error: null, last_seen_at: new Date().toISOString(), status: "active", updated_at: new Date().toISOString() })
      .eq("company_id", companyId).eq("provider", "whatsapp").then();
  }
}

/**
 * Sobe um buffer de áudio mp3 ao WhatsApp Cloud e envia para o lead.
 * Fluxo: POST /media (multipart) → recebe media_id → POST /messages com type=audio + id.
 */
export async function sendWhatsAppAudio(
  companyId: string,
  to: string,
  audioBuffer: Buffer
): Promise<{ ok: boolean; error?: string }> {
  // 1. Resolver canal
  const { phoneId, token } = await resolveWaCreds(companyId);
  if (!phoneId || !token) return { ok: false, error: 'no channel' };

  // 2. Upload media
  const form = new FormData();
  form.append('messaging_product', 'whatsapp');
  form.append('type', 'audio/mp3');
  form.append('file', new Blob([audioBuffer], { type: 'audio/mp3' }), 'tts.mp3');

  const uploadRes = await fetch(`https://graph.facebook.com/v21.0/${phoneId}/media`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  if (!uploadRes.ok) return { ok: false, error: `upload ${uploadRes.status}` };
  const { id: mediaId } = (await uploadRes.json()) as { id: string };

  // 3. Send message
  const sendRes = await fetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'audio',
      audio: { id: mediaId },
    }),
  });

  if (!sendRes.ok) return { ok: false, error: `send ${sendRes.status}` };
  return { ok: true };
}
