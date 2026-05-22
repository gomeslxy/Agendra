const META_VERSION = 'v21.0';

export async function sendTypingIndicator(
  providerId: string,
  accessToken: string,
  messageId: string
): Promise<void> {
  try {
    await fetch(`https://graph.facebook.com/${META_VERSION}/${providerId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        status: 'read',
        message_id: messageId,
        typing_indicator: { type: 'text' },
      }),
      signal: AbortSignal.timeout(2_000),
    });
  } catch {
    // silent — typing é nice-to-have
  }
}
