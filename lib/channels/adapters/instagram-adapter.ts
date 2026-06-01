import { createHmac } from 'crypto';
import crypto from 'crypto';
import { ChannelAdapter, ChannelCapabilities, ChannelConfig, OutgoingMessage, SendResult, ParsedWebhookResult, IncomingMessage } from '../types';
import { createAdminClient } from '@/lib/supabase/admin';
import { logInfo, logError } from '@/lib/logging';

const META_API_BASE = 'https://graph.facebook.com/v21.0';

export class InstagramAdapter implements ChannelAdapter {
  provider: 'instagram' = 'instagram';

  capabilities: ChannelCapabilities = {
    supportsText: true,
    supportsImage: true,
    supportsAudio: true,
    supportsVideo: true,
    supportsDocument: false,
    supportsSticker: false,
    supportsLocation: false,
    supportsReaction: true,
    supportsTypingIndicator: false,
    supportsTTS: false,
    supportsRichText: false,
    supportsButtons: true,
    maxTextLength: 1000,
    maxMediaSizeMB: 8,
    rateLimitPerSecond: 10,
    humanReadableName: 'Instagram',
    icon: 'Instagram',
    color: '#E1306C',
    formatInstructions: 'Lembre-se: esta conversa é via Instagram. O Instagram NÃO aceita formatação em markdown (como *negrito*, _itálico_). Envie respostas em TEXTO PURO sem markdown, usando emojis de forma harmônica.',
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
      logError(`[Instagram Adapter] Erro ao atualizar status do canal ${channelId}:`, err.message);
    }
  }

  async sendText(channelConfig: ChannelConfig, msg: OutgoingMessage): Promise<SendResult> {
    const to = msg.to;
    const text = msg.text || '';
    const token = channelConfig.accessToken;

    logInfo(`[Instagram Adapter] 📤 Enviando texto para ${to.substring(0, 6)}***`);

    try {
      // Endpoint da Messenger API para envio de mensagens
      const res = await fetch(`${META_API_BASE}/me/messages`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          recipient: { id: to },
          message: { text: text },
        }),
      });

      if (!res.ok) {
        const err = await res.text();
        const errorMessage = `Instagram API error ${res.status}: ${err}`;
        logError('[Instagram Adapter] Erro de API ao enviar texto:', errorMessage);
        
        const isAuthError = res.status === 401 || res.status === 403;
        await this.updateChannelStatus(channelConfig.id, isAuthError ? 'error' : 'active', errorMessage);
        return { ok: false, error: errorMessage };
      }

      const data = await res.json() as { message_id?: string };
      const providerMessageId = data.message_id;

      await this.updateChannelStatus(channelConfig.id, 'active', null);
      return { ok: true, providerMessageId };
    } catch (err: any) {
      logError('[Instagram Adapter] Erro no envio de texto:', err.message);
      return { ok: false, error: err.message };
    }
  }

  async sendMedia(channelConfig: ChannelConfig, msg: OutgoingMessage): Promise<SendResult> {
    const to = msg.to;
    const token = channelConfig.accessToken;
    const mediaUrl = msg.mediaUrl || '';
    const mediaType = msg.mediaType || 'image'; // image, video, audio

    logInfo(`[Instagram Adapter] 📎 Enviando mídia (${mediaType}) para ${to.substring(0, 6)}***`);

    try {
      const res = await fetch(`${META_API_BASE}/me/messages`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          recipient: { id: to },
          message: {
            attachment: {
              type: mediaType,
              payload: {
                url: mediaUrl,
                is_reusable: true,
              },
            },
          },
        }),
      });

      if (!res.ok) {
        const err = await res.text();
        const errorMessage = `Instagram Media API error ${res.status}: ${err}`;
        logError('[Instagram Adapter] Erro de Mídia API:', errorMessage);

        const isAuthError = res.status === 401 || res.status === 403;
        await this.updateChannelStatus(channelConfig.id, isAuthError ? 'error' : 'active', errorMessage);
        return { ok: false, error: errorMessage };
      }

      const data = await res.json() as { message_id?: string };
      const providerMessageId = data.message_id;

      await this.updateChannelStatus(channelConfig.id, 'active', null);
      return { ok: true, providerMessageId };
    } catch (err: any) {
      logError('[Instagram Adapter] Erro no envio de mídia:', err.message);
      return { ok: false, error: err.message };
    }
  }

  validateWebhookSignature(rawBody: string, headers: Headers, secret: string): boolean {
    // Instagram usa o mesmo webhook da Meta Developer, validado pela assinatura do Meta App
    const signature = headers.get('x-hub-signature-256');
    if (!signature) {
      logError('[Instagram Adapter] ❌ Assinatura X-Hub-Signature-256 ausente.');
      return false;
    }

    const expectedSignature = createHmac('sha256', secret)
      .update(rawBody, 'utf8')
      .digest('hex');

    const actualSignature = signature.replace('sha256=', '');

    const expected = Buffer.from(expectedSignature, 'hex');
    const actual = Buffer.from(actualSignature.length === expectedSignature.length ? actualSignature : expectedSignature, 'hex');

    if (!crypto.timingSafeEqual(expected, actual) || actualSignature.length !== expectedSignature.length) {
      logError(`[Instagram Adapter] ❌ Assinatura inválida!`);
      return false;
    }

    return true;
  }

  async parseWebhookPayload(rawBody: string, headers: Headers): Promise<ParsedWebhookResult> {
    const payload = JSON.parse(rawBody);

    if (payload.object !== 'instagram') {
      throw new Error(`[Instagram Adapter] Payload object incorreto: ${payload.object}`);
    }

    const parsedMessages: IncomingMessage[] = [];
    const parsedStatusUpdates: { messageId: string; status: string }[] = [];
    let channelProviderId = '';

    for (const entry of payload.entry ?? []) {
      // O entry.id é o ID da conta do Instagram conectada
      channelProviderId = entry.id || channelProviderId;

      for (const change of entry.changes ?? []) {
        // Mudanças genéricas (ex: instagram mentions, etc.) se houver
      }

      // No Instagram, o fluxo de mensagens de chat vem no array messaging
      if (entry.messaging) {
        for (const record of entry.messaging) {
          const senderId = record.sender?.id;
          const recipientId = record.recipient?.id;

          // Se for echo (mensagem enviada pela própria página/bot), filtramos para não responder a si mesmo
          if (record.message?.is_echo) {
            if (record.message?.mid) {
              parsedStatusUpdates.push({
                messageId: record.message.mid,
                status: 'sent',
              });
            }
            continue;
          }

          // Tratar status updates (delivery, read)
          if (record.delivery) {
            for (const mid of record.delivery.mids ?? []) {
              parsedStatusUpdates.push({
                messageId: mid,
                status: 'delivered',
              });
            }
          }

          if (record.read) {
            // Instagram read watermark
            if (record.message?.mid) {
              parsedStatusUpdates.push({
                messageId: record.message.mid,
                status: 'read',
              });
            }
          }

          // Tratar mensagem recebida
          if (record.message) {
            const msg = record.message;
            const timestamp = record.timestamp ? new Date(record.timestamp) : new Date();

            const incoming: IncomingMessage = {
              provider: 'instagram',
              channelId: '', // Resolvido no webhook
              companyId: '', // Resolvido no webhook
              providerMessageId: msg.mid,
              senderIdentifier: senderId,
              senderName: `Usuário do Instagram`, // No Instagram direct, o nome do perfil não vem por padrão no payload.
              type: 'text',
              rawPayload: record,
              timestamp,
            };

            // Se for texto
            if (msg.text) {
              incoming.type = 'text';
              incoming.text = msg.text;
            }

            // Se for attachments (imagens, vídeos, áudios)
            if (msg.attachments && msg.attachments[0]) {
              const attachment = msg.attachments[0];
              const attType = attachment.type; // image, video, audio, file

              if (attType === 'image') {
                incoming.type = 'image';
                incoming.mediaId = attachment.payload?.url; // Armazena a URL da imagem
                incoming.mediaCaption = msg.text || '';
              } else if (attType === 'audio') {
                incoming.type = 'audio';
                incoming.mediaId = attachment.payload?.url;
              } else if (attType === 'video') {
                incoming.type = 'video';
                incoming.mediaId = attachment.payload?.url;
              }
            }

            parsedMessages.push(incoming);
          }
        }
      }
    }

    return {
      messages: parsedMessages,
      statusUpdates: parsedStatusUpdates,
      provider: 'instagram',
      channelProviderId,
    };
  }
}
