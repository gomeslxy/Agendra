import { genAI } from './client';
import { logInfo } from '@/lib/logging';

const MAX_AUDIO_SIZE = 25 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 10_000;
const TRANSCRIBE_TIMEOUT_MS = 15_000;
const GROQ_URL = 'https://api.groq.com/openai/v1/audio/transcriptions';
const GROQ_MODEL = 'whisper-large-v3-turbo';

interface TranscribeResult {
  text: string;
  error?: string;
  provider?: 'groq' | 'gemini';
}

export async function transcribeWhatsAppAudio(
  mediaId: string,
  accessToken: string
): Promise<TranscribeResult> {
  let buffer: Buffer;
  let mimeType = 'audio/ogg';

  // 1. Resolver media URL ou usar diretamente se for link completo (Instagram)
  if (mediaId.startsWith('http://') || mediaId.startsWith('https://')) {
    logInfo(`[Transcribe] Direct URL detected, fetching directly: ${mediaId.substring(0, 30)}...`);
    const audioRes = await fetch(mediaId, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!audioRes.ok) return { text: '[Áudio recebido — falha no download direto]', error: `audio_direct ${audioRes.status}` };
    const contentLength = audioRes.headers.get('content-length');
    if (contentLength && parseInt(contentLength, 10) > MAX_AUDIO_SIZE) {
      return { text: '[Áudio recebido — muito grande]', error: 'too large' };
    }
    buffer = Buffer.from(await audioRes.arrayBuffer());
    if (buffer.length > MAX_AUDIO_SIZE) {
      return { text: '[Áudio recebido — muito grande]', error: 'too large' };
    }
    const contentType = audioRes.headers.get('content-type');
    if (contentType) mimeType = contentType;
  } else {
    // Resolver via WhatsApp Cloud API
    const metaRes = await fetch(`https://graph.facebook.com/v21.0/${mediaId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!metaRes.ok) return { text: '[Áudio recebido — falha ao resolver mídia]', error: `meta ${metaRes.status}` };
    const meta = (await metaRes.json()) as { url?: string; mime_type?: string; file_size?: number };
    if (!meta.url) return { text: '[Áudio recebido — URL ausente]', error: 'no url' };
    if (meta.file_size && meta.file_size > MAX_AUDIO_SIZE) {
      return { text: '[Áudio recebido — muito grande]', error: 'too large' };
    }

    // Baixar bytes
    const audioRes = await fetch(meta.url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!audioRes.ok) return { text: '[Áudio recebido — falha no download]', error: `audio ${audioRes.status}` };
    buffer = Buffer.from(await audioRes.arrayBuffer());
    if (meta.mime_type) mimeType = meta.mime_type;
  }

  // 2. Tentar Groq Whisper (grátis, ~5x mais rápido que Gemini)
  if (process.env.GROQ_API_KEY) {
    try {
      const form = new FormData();
      const blob = new Blob([new Uint8Array(buffer)], { type: mimeType });
      form.append('file', blob, 'audio.ogg');
      form.append('model', GROQ_MODEL);
      form.append('language', 'pt');
      form.append('response_format', 'text');

      const groqRes = await Promise.race([
        fetch(GROQ_URL, {
          method: 'POST',
          headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
          body: form,
        }),
        new Promise<never>((_, r) => setTimeout(() => r(new Error('groq timeout')), TRANSCRIBE_TIMEOUT_MS)),
      ]);

      if (groqRes.ok) {
        const text = (await groqRes.text()).trim();
        return { text: text || '[Áudio sem fala detectada]', provider: 'groq' };
      }
      console.warn(`[Transcribe] Groq ${groqRes.status} — fallback Gemini`);
    } catch (err: any) {
      console.warn('[Transcribe] Groq err:', err.message);
    }
  }

  // 3. Fallback Gemini multimodal
  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-lite' });
    const result = await Promise.race([
      model.generateContent([
        { inlineData: { data: buffer.toString('base64'), mimeType: mimeType } },
        { text: 'Transcreva este áudio para português brasileiro de forma fiel. Responda APENAS com o texto transcrito.' },
      ]),
      new Promise<never>((_, r) => setTimeout(() => r(new Error('gemini timeout')), TRANSCRIBE_TIMEOUT_MS)),
    ]);
    const text = result.response.text().trim();
    return { text: text || '[Áudio sem fala detectada]', provider: 'gemini' };
  } catch (err: any) {
    console.error('[Transcribe] Gemini fail:', err.message);
    return { text: '[Áudio recebido — falha em todos providers]', error: err.message };
  }
}

