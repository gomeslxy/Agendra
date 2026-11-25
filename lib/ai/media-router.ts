import { genAI } from './client';
import { transcribeWhatsAppAudio } from './transcribe';
import type { IncomingMessage } from '../channels/types';
import { logDebug, logError } from '@/lib/logging';
import { ImageAnalysisSchema } from './schemas/analytics.schema';
import { withTimeout } from './timeout';
import { isAllowedMetaMediaUrl } from '@/lib/security/url-guard';

const FETCH_TIMEOUT_MS = 10_000;
const VISION_TIMEOUT_MS = 15_000;
const MAX_IMAGE_SIZE = 8 * 1024 * 1024;

export interface MediaRouteResult {
  body: string;
  metadata: Record<string, unknown>;
}

export async function routeMedia(
  msg: IncomingMessage,
  accessToken: string,
  traceId?: string,
): Promise<MediaRouteResult> {
  if (traceId) {
    logDebug(`[MediaRouter] routing type=${msg.type} trace=${traceId}`);
  }
  switch (msg.type) {
    case 'text':
      return { body: msg.text ?? '', metadata: {} };

    case 'audio': {
      if (!msg.mediaId) {
        return { body: '[Áudio sem ID]', metadata: { media_error: 'no_audio_id' } };
      }
      const audio = await transcribeWhatsAppAudio(msg.mediaId, accessToken);
      return {
        body: `[ÁUDIO TRANSCRITO] ${audio.text}`,
        metadata: {
          is_audio: true,
          audio_id: msg.mediaId,
          transcribe_provider: audio.provider,
          ...(audio.error ? { transcribe_error: audio.error } : {}),
        },
      };
    }

    case 'image': {
      if (!msg.mediaId) return { body: '[Imagem sem ID]', metadata: {} };
      const vision = await analyzeImage(msg.mediaId, accessToken, msg.mediaCaption);
      return {
        body: vision.body,
        metadata: { is_image: true, image_id: msg.mediaId, image_analysis: vision.analysis },
      };
    }

    case 'sticker':
      return { body: '[Lead enviou sticker]', metadata: { is_sticker: true } };

    case 'location': {
      const loc = msg.location;
      if (!loc) return { body: '[Localização vazia]', metadata: {} };
      return {
        body: `[Localização recebida: ${loc.lat},${loc.lng}${loc.name ? ` — ${loc.name}` : ''}]`,
        metadata: { is_location: true, lat: loc.lat, lng: loc.lng, name: loc.name },
      };
    }

    case 'reaction': {
      const r = msg.reaction;
      if (!r) return { body: '[Reação vazia]', metadata: {} };
      return {
        body: `[Lead reagiu com ${r.emoji} à mensagem anterior]`,
        metadata: { is_reaction: true, emoji: r.emoji, reacted_message_id: r.messageId },
      };
    }

    case 'video':
      return {
        body: '[Vídeo recebido — peça ao cliente para descrever ou aguarde atendente humano]',
        metadata: { is_video: true },
      };

    case 'document':
      return {
        body: '[Documento recebido — atendente humano vai analisar]',
        metadata: { is_document: true },
      };

    default:
      return {
        body: `[Mídia tipo "${msg.type}" não suportada]`,
        metadata: { unsupported_type: msg.type },
      };
  }
}

async function analyzeImage(
  mediaId: string,
  accessToken: string,
  caption?: string,
): Promise<{ body: string; analysis: Record<string, unknown> }> {
  try {
    let buffer: Buffer;
    let mimeType = 'image/jpeg';

    if (mediaId.startsWith('http://') || mediaId.startsWith('https://')) {
      if (!isAllowedMetaMediaUrl(mediaId)) {
        return {
          body: '[URL de mídia não permitida]',
          analysis: { error: 'blocked_media_url' },
        };
      }
      const imgRes = await fetch(mediaId, {
        redirect: 'error',
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (!imgRes.ok) {
        return {
          body: '[Falha download imagem direta]',
          analysis: { error: 'download_direct' },
        };
      }
      buffer = Buffer.from(await imgRes.arrayBuffer());
      const contentType = imgRes.headers.get('content-type');
      if (contentType) mimeType = contentType;
    } else {
      const metaRes = await fetch(`https://graph.facebook.com/v21.0/${mediaId}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (!metaRes.ok) return { body: '[Imagem ilegível]', analysis: { error: 'meta fail' } };
      const meta = (await metaRes.json()) as {
        url?: string;
        mime_type?: string;
        file_size?: number;
      };
      if (!meta.url) return { body: '[Imagem sem URL]', analysis: { error: 'no_url' } };
      if (!isAllowedMetaMediaUrl(meta.url)) {
        return { body: '[URL de mídia não permitida]', analysis: { error: 'blocked_media_url' } };
      }
      if (meta.file_size && meta.file_size > MAX_IMAGE_SIZE) {
        return {
          body: '[Imagem muito grande para análise]',
          analysis: { error: 'too_large' },
        };
      }

      const imgRes = await fetch(meta.url, {
        redirect: 'error',
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (!imgRes.ok) {
        return { body: '[Falha download imagem]', analysis: { error: 'download' } };
      }
      buffer = Buffer.from(await imgRes.arrayBuffer());
      if (meta.mime_type) mimeType = meta.mime_type;
    }

    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash-lite',
      generationConfig: { responseMimeType: 'application/json' },
    });

    const prompt = `Você analisa imagens em conversa de vendas. Se for comprovante PIX, extraia valor, beneficiário, data, txid, banco. Se for outra coisa, descreva em 1 frase. Caption do lead: "${caption ?? ''}".

Responda JSON: {"type":"pix"|"other","description":string,"payment":{"amount":number,"beneficiary":string,"date":string,"txid":string,"bank":string}|null}`;

    const result = await withTimeout(
      model.generateContent([
        { inlineData: { data: buffer.toString('base64'), mimeType } },
        { text: prompt },
      ]),
      VISION_TIMEOUT_MS,
      'vision timeout',
    );

    const raw = result.response.text().trim();
    const parsedRaw: unknown = JSON.parse(raw);
    const validated = ImageAnalysisSchema.safeParse(parsedRaw);

    if (!validated.success) {
      logError('[Vision] ImageAnalysisSchema validation failed:', validated.error.message);
      return {
        body: '[Imagem recebida — análise inválida]',
        analysis: { error: 'invalid_schema' },
      };
    }

    const analysis = validated.data;
    const body =
      analysis.type === 'pix' && analysis.payment
        ? `[COMPROVANTE PIX detectado] Valor: R$ ${analysis.payment.amount}, Beneficiário: ${analysis.payment.beneficiary}, Banco: ${analysis.payment.bank}`
        : `[Imagem: ${analysis.description}]`;

    return { body, analysis };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logError('[Vision] err:', msg);
    return { body: '[Imagem recebida — análise falhou]', analysis: { error: msg } };
  }
}
