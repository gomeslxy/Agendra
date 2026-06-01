import { createHmac } from 'crypto';
import crypto from 'crypto';
import { ChannelAdapter, ChannelCapabilities, ChannelConfig, OutgoingMessage, SendResult, ParsedWebhookResult, IncomingMessage } from '../types';
import { createAdminClient } from '@/lib/supabase/admin';
import { logInfo, logError, isDebug, logDebug } from '@/lib/logging';

const WHATSAPP_API_BASE = 'https://graph.facebook.com/v21.0';
const META_VERSION = 'v21.0';

export class WhatsAppAdapter implements ChannelAdapter {
  provider: 'whatsapp' = 'whatsapp';

  capabilities: ChannelCapabilities = {
    supportsText: true,
    supportsImage: true,
    supportsAudio: true,
    supportsVideo: true,
    supportsDocument: true,
    supportsSticker: true,
    supportsLocation: true,
    supportsReaction: true,
    supportsTypingIndicator: true,
    supportsTTS: true,
    supportsRichText: false,
    supportsButtons: true,
    maxTextLength: 4096,
    maxMediaSizeMB: 64,
    rateLimitPerSecond: 80,
    humanReadableName: 'WhatsApp',
    icon: 'MessageCircle',
    color: '#25D366',
    formatInstructions: 'Lembre-se: esta conversa é via WhatsApp. Use formatação do WhatsApp (ex: *negrito*, _itálico_). NÃO use markdown de headers (#) ou listas markdown (- ou * para listas sem estar em negrito), use emoji para listas.',
  };

  private async updateChannelStatus(channelId: string, status: 'active' | 'error', lastError: string | null) {
    try {
      const admin = createAdminClient();
      await admin
        .from('channels')
        .update({
          status,
          last_error: lastError,
          last_seen_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', channelId);
    } catch (err: any) {
      logError(`[WhatsApp Adapter] Erro ao atualizar status do canal ${channelId}:`, err.message);
    }
  }

  async sendText(channelConfig: ChannelConfig, msg: OutgoingMessage): Promise<SendResult> {
    const to = msg.to;
    const text = msg.text || '';
    const token = channelConfig.accessToken;
    const phoneId = channelConfig.providerId;

    logInfo(`[WhatsApp Adapter] 📤 Enviando texto para ${to.substring(0, 6)}*** via phoneId=${phoneId}`);

    try {
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
        logError('[WhatsApp Adapter] Erro de API:', errorMessage);
        
        const isAuthError = res.status === 401 || res.status === 403;
        await this.updateChannelStatus(channelConfig.id, isAuthError ? 'error' : 'active', errorMessage);
        return { ok: false, error: errorMessage };
      }

      const data = await res.json() as { messages?: { id: string }[] };
      const providerMessageId = data.messages?.[0]?.id;

      await this.updateChannelStatus(channelConfig.id, 'active', null);
      return { ok: true, providerMessageId };
    } catch (err: any) {
      logError('[WhatsApp Adapter] Erro ao enviar texto:', err.message);
      return { ok: false, error: err.message };
    }
  }

  async sendMedia(channelConfig: ChannelConfig, msg: OutgoingMessage): Promise<SendResult> {
    const to = msg.to;
    const token = channelConfig.accessToken;
    const phoneId = channelConfig.providerId;
    const mediaUrl = msg.mediaUrl || '';
    const mediaType = msg.mediaType || 'image';
    const caption = msg.mediaCaption || '';
    const filename = msg.filename || '';

    // Se tiver audioBuffer, significa que é um envio direto de TTS buffer
    if (mediaType === 'audio' && msg.audioBuffer) {
      return this.sendAudioBuffer(channelConfig, to, msg.audioBuffer);
    }

    logInfo(`[WhatsApp Adapter] 📎 Enviando mídia (${mediaType}) para ${to.substring(0, 6)}*** via phoneId=${phoneId}`);

    try {
      const mediaPayload: Record<string, any> = { link: mediaUrl };
      if (caption) mediaPayload.caption = caption;
      if (mediaType === 'document' && filename) mediaPayload.filename = filename;

      const res = await fetch(`${WHATSAPP_API_BASE}/${phoneId}/messages`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
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
        logError('[WhatsApp Adapter] Erro de Mídia API:', errorMessage);

        const isAuthError = res.status === 401 || res.status === 403;
        await this.updateChannelStatus(channelConfig.id, isAuthError ? 'error' : 'active', errorMessage);
        return { ok: false, error: errorMessage };
      }

      const data = await res.json() as { messages?: { id: string }[] };
      const providerMessageId = data.messages?.[0]?.id;

      await this.updateChannelStatus(channelConfig.id, 'active', null);
      return { ok: true, providerMessageId };
    } catch (err: any) {
      logError('[WhatsApp Adapter] Erro ao enviar mídia:', err.message);
      return { ok: false, error: err.message };
    }
  }

  private async sendAudioBuffer(channelConfig: ChannelConfig, to: string, audioBuffer: Buffer): Promise<SendResult> {
    const token = channelConfig.accessToken;
    const phoneId = channelConfig.providerId;

    logInfo(`[WhatsApp Adapter] 🎙️ Enviando áudio buffer para ${to.substring(0, 6)}*** via phoneId=${phoneId}`);

    try {
      // 1. Upload do áudio
      const form = new FormData();
      form.append('messaging_product', 'whatsapp');
      form.append('type', 'audio/mp3');
      form.append('file', new Blob([new Uint8Array(audioBuffer)], { type: 'audio/mp3' }), 'tts.mp3');

      const uploadRes = await fetch(`https://graph.facebook.com/${META_VERSION}/${phoneId}/media`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });

      if (!uploadRes.ok) {
        const err = await uploadRes.text();
        logError('[WhatsApp Adapter] Erro de Upload de Mídia:', err);
        return { ok: false, error: `Upload error: ${uploadRes.status} - ${err}` };
      }

      const { id: mediaId } = (await uploadRes.json()) as { id: string };

      // 2. Envio da mensagem de áudio usando o mediaId
      const sendRes = await fetch(`https://graph.facebook.com/${META_VERSION}/${phoneId}/messages`, {
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

      if (!sendRes.ok) {
        const err = await sendRes.text();
        logError('[WhatsApp Adapter] Erro de Envio de Áudio:', err);
        return { ok: false, error: `Send error: ${sendRes.status} - ${err}` };
      }

      const sendData = await sendRes.json() as { messages?: { id: string }[] };
      const providerMessageId = sendData.messages?.[0]?.id;

      await this.updateChannelStatus(channelConfig.id, 'active', null);
      return { ok: true, providerMessageId };
    } catch (err: any) {
      logError('[WhatsApp Adapter] Exceção no envio de áudio buffer:', err.message);
      return { ok: false, error: err.message };
    }
  }

  async sendTypingIndicator(channelConfig: ChannelConfig, recipientId: string): Promise<void> {
    const token = channelConfig.accessToken;
    const phoneId = channelConfig.providerId;

    try {
      // Como não temos o messageId original do webhook aqui, usamos a versão de text typing
      // O typing do whatsapp exige um status read ou typing com message_id se formos dar trigger nele
      // Se não tivermos o message_id, o Meta API do WhatsApp não suporta typing puro sem message context
      // Mas para manter compatibilidade, deixamos o adapter pronto se o recipientId/messageId for usado.
      // O typing do whatsapp legível usa o messageId original, então se recipientId parecer um messageId:
      const looksLikeMsgId = recipientId.startsWith('wamid.');
      if (looksLikeMsgId) {
        await fetch(`https://graph.facebook.com/${META_VERSION}/${phoneId}/messages`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            status: 'read',
            message_id: recipientId,
            typing_indicator: { type: 'text' },
          }),
          signal: AbortSignal.timeout(2_000),
        });
      }
    } catch {
      // silent
    }
  }

  validateWebhookSignature(rawBody: string, headers: Headers, secret: string): boolean {
    const signature = headers.get('x-hub-signature-256');
    if (!signature) {
      logError('[WhatsApp Adapter] ❌ Assinatura X-Hub-Signature-256 ausente.');
      return false;
    }

    const expectedSignature = createHmac('sha256', secret)
      .update(rawBody, 'utf8')
      .digest('hex');

    const actualSignature = signature.replace('sha256=', '');

    const expected = Buffer.from(expectedSignature, 'hex');
    const actual = Buffer.from(actualSignature.length === expectedSignature.length ? actualSignature : expectedSignature, 'hex');

    if (!crypto.timingSafeEqual(expected, actual) || actualSignature.length !== expectedSignature.length) {
      logError(`[WhatsApp Adapter] ❌ Assinatura inválida!`);
      return false;
    }

    return true;
  }

  async parseWebhookPayload(rawBody: string, headers: Headers): Promise<ParsedWebhookResult> {
    const payload = JSON.parse(rawBody);

    if (payload.object !== 'whatsapp_business_account') {
      throw new Error(`[WhatsApp Adapter] Payload object incorreto: ${payload.object}`);
    }

    const parsedMessages: IncomingMessage[] = [];
    const parsedStatusUpdates: { messageId: string; status: string }[] = [];
    let channelProviderId = '';

    for (const entry of payload.entry ?? []) {
      for (const change of entry.changes ?? []) {
        const value = change.value;
        if (!value) continue;

        channelProviderId = value.metadata?.phone_number_id || channelProviderId;

        // Process status updates
        if (value.statuses) {
          for (const status of value.statuses) {
            parsedStatusUpdates.push({
              messageId: status.id,
              status: status.status,
            });
          }
        }

        // Process incoming messages
        if (value.messages) {
          const contacts = value.contacts ?? [];
          for (const msg of value.messages) {
            const contact = contacts.find((c: any) => c.wa_id === msg.from);
            const senderName = contact?.profile?.name || msg.from;

            const incoming: IncomingMessage = {
              provider: 'whatsapp',
              channelId: '', // Resolvido no webhook route
              companyId: '', // Resolvido no webhook route
              providerMessageId: msg.id,
              senderIdentifier: msg.from,
              senderName,
              type: msg.type,
              rawPayload: msg,
              timestamp: new Date(parseInt(msg.timestamp) * 1000),
            };

            if (msg.type === 'text') {
              incoming.text = msg.text?.body;
            } else if (msg.type === 'image') {
              incoming.mediaId = msg.image?.id;
              incoming.mediaMimeType = msg.image?.mime_type;
              incoming.mediaCaption = msg.image?.caption;
            } else if (msg.type === 'audio') {
              incoming.mediaId = msg.audio?.id;
              incoming.mediaMimeType = msg.audio?.mime_type;
            } else if (msg.type === 'video') {
              incoming.mediaId = msg.video?.id;
              incoming.mediaMimeType = msg.video?.mime_type;
              incoming.mediaCaption = msg.video?.caption;
            } else if (msg.type === 'document') {
              incoming.mediaId = msg.document?.id;
              incoming.mediaMimeType = msg.document?.mime_type;
              incoming.mediaCaption = msg.document?.caption;
            } else if (msg.type === 'sticker') {
              incoming.mediaId = msg.sticker?.id;
            } else if (msg.type === 'location') {
              incoming.location = {
                lat: msg.location?.latitude,
                lng: msg.location?.longitude,
                name: msg.location?.name,
              };
            } else if (msg.type === 'reaction') {
              incoming.reaction = {
                messageId: msg.reaction?.message_id,
                emoji: msg.reaction?.emoji,
              };
            }

            parsedMessages.push(incoming);
          }
        }
      }
    }

    return {
      messages: parsedMessages,
      statusUpdates: parsedStatusUpdates,
      provider: 'whatsapp',
      channelProviderId,
    };
  }
}
