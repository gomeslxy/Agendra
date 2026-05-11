const WHATSAPP_API_BASE = 'https://graph.facebook.com/v19.0';

export async function sendWhatsAppMessage(to: string, text: string): Promise<void> {
  const phoneId = process.env.WHATSAPP_PHONE_ID;
  let token = process.env.WHATSAPP_TOKEN;
  
  if (!phoneId || !token) {
    throw new Error('Missing WHATSAPP_PHONE_ID or WHATSAPP_TOKEN env vars');
  }

  // Se o token já vier com "Bearer " da variável de ambiente, limpamos
  if (token.startsWith('Bearer ')) {
    token = token.substring(7);
  }

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
