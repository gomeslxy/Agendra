/**
 * Transcrição de áudio via Gemini multimodal.
 * Recebe URL do WhatsApp media, baixa o blob e envia inline para o modelo.
 */
import { genAI } from './client';

const TRANSCRIBE_MODEL = 'gemini-2.5-flash';
const MAX_AUDIO_SIZE = 20 * 1024 * 1024; // 20 MB
const FETCH_TIMEOUT_MS = 10_000;

interface TranscribeResult {
  text: string;
  durationSeconds?: number;
  error?: string;
}

/**
 * Baixa áudio do WhatsApp Cloud API (endpoint /v21.0/<media-id>) e transcreve.
 * @param mediaId ID retornado pelo webhook (msg.audio.id)
 * @param accessToken Token do canal (Bearer)
 */
export async function transcribeWhatsAppAudio(
  mediaId: string,
  accessToken: string
): Promise<TranscribeResult> {
  try {
    // 1. Resolver media URL
    const metaRes = await fetch(`https://graph.facebook.com/v21.0/${mediaId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!metaRes.ok) return { text: '[Áudio recebido — falha ao resolver mídia]', error: `meta ${metaRes.status}` };
    const meta = (await metaRes.json()) as { url?: string; mime_type?: string; file_size?: number };
    if (!meta.url) return { text: '[Áudio recebido — URL ausente]', error: 'no url' };
    if (meta.file_size && meta.file_size > MAX_AUDIO_SIZE) {
      return { text: '[Áudio recebido — muito grande para transcrever]', error: 'too large' };
    }

    // 2. Baixar bytes
    const audioRes = await fetch(meta.url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!audioRes.ok) return { text: '[Áudio recebido — falha no download]', error: `audio ${audioRes.status}` };
    const buffer = Buffer.from(await audioRes.arrayBuffer());

    // 3. Transcrever via Gemini multimodal
    const model = genAI.getGenerativeModel({ model: TRANSCRIBE_MODEL });
    const result = await model.generateContent([
      {
        inlineData: {
          data: buffer.toString('base64'),
          mimeType: meta.mime_type ?? 'audio/ogg',
        },
      },
      {
        text: 'Transcreva este áudio para português brasileiro de forma fiel. Responda APENAS com o texto transcrito, sem comentários, prefixos ou aspas. Se o áudio estiver inaudível, responda: [inaudível].',
      },
    ]);

    const text = result.response.text().trim();
    return { text: text || '[Áudio recebido — transcrição vazia]' };
  } catch (err: any) {
    console.error('[Transcribe] Erro:', err);
    return { text: '[Áudio recebido — erro na transcrição]', error: err?.message };
  }
}
