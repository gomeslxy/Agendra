import { createAdminClient } from "@/lib/supabase/admin";

const WHATSAPP_API_BASE = 'https://graph.facebook.com/v19.0';

export async function sendWhatsAppMessage(to: string, text: string, companyId?: string): Promise<void> {
  // Fallback para env vars APENAS em dev (evita usar seu token pessoal em produção)
  let phoneId: string | undefined;
  let token: string | undefined;

  if (process.env.NODE_ENV === 'development') {
    phoneId = process.env.WHATSAPP_PHONE_ID;
    token = process.env.WHATSAPP_TOKEN;
  }
  
  if (companyId) {
    const admin = createAdminClient();
    const { data: channels } = await admin
      .from("channels")
      .select("provider_id, access_token")
      .eq("company_id", companyId)
      .eq("provider", "whatsapp")
      .eq("status", "active")
      .not("access_token", "is", null)
      .limit(1);
    const channel = channels?.[0];

    if (channel?.provider_id && channel?.access_token) {
      phoneId = channel.provider_id;
      token = channel.access_token;
    }
  }

  if (!phoneId || !token) {
    throw new Error('Missing WhatsApp configuration (neither channel in DB nor environment variables are set)');
  }

  // Se o token já vier com "Bearer " da variável de ambiente, limpamos
  if (token.startsWith('Bearer ')) {
    token = token.substring(7);
  }

  token = token.trim();

  // Diagnóstico seguro — sem expor o token
  console.log(`[WhatsApp Client] 📤 Enviando para ${to.substring(0, 6)}*** via phone_id=${phoneId}`);

  const res = await fetch(`${WHATSAPP_API_BASE}/${phoneId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token.trim()}`,
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
    
    if (companyId) {
      const admin = createAdminClient();
      const isAuthError = res.status === 401 || res.status === 403;
      admin.from("channels")
        .update({
          meta: { last_error: errorMessage },
          status: isAuthError ? "error" : "active",
          updated_at: new Date().toISOString()
        })
        .eq("company_id", companyId)
        .eq("provider", "whatsapp")
        .then();
    }

    throw new Error(errorMessage);
  }

  if (companyId) {
    const admin = createAdminClient();
    admin.from("channels")
      .update({
        meta: { last_error: null },
        status: 'active',
        updated_at: new Date().toISOString(),
      })
      .eq("company_id", companyId)
      .eq("provider", "whatsapp")
      .then();
  }
}
