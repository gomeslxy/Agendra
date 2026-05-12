import { createAdminClient } from "@/lib/supabase/admin";

const WHATSAPP_API_BASE = 'https://graph.facebook.com/v19.0';

export async function sendWhatsAppMessage(to: string, text: string, companyId?: string): Promise<void> {
  let phoneId = process.env.WHATSAPP_PHONE_ID;
  let token = process.env.WHATSAPP_TOKEN;
  
  if (companyId) {
    const admin = createAdminClient();
    const { data: channel } = await admin
      .from("channels")
      .select("provider_id, access_token")
      .eq("company_id", companyId)
      .eq("provider", "whatsapp")
      .eq("status", "active")
      .single();

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

  // DIAGNÓSTICO
  console.log(`[WhatsApp Client] 🔍 Debug Token: length=${token.length} | startsWith=${token.substring(0, 10)}... | endsWith=...${token.substring(token.length - 5)}`);

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
    throw new Error(`WhatsApp API error ${res.status}: ${err}`);
  }
}
