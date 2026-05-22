/**
 * Geração de áudio sintético via OpenAI TTS-1.
 * Retorna Buffer (mp3) pronto para upload no WhatsApp Cloud.
 */
const TTS_ENDPOINT = 'https://api.openai.com/v1/audio/speech';
const TTS_MODEL = 'tts-1';
const TTS_VOICE = 'nova'; // feminina pt-BR aceitável; alternativas: alloy, echo, fable, onyx, shimmer
const MAX_TTS_CHARS = 4000;

export async function synthesizeSpeech(text: string): Promise<Buffer | null> {
  if (process.env.ENABLE_TTS !== 'true') return null;
  if (!process.env.OPENAI_API_KEY) return null;
  const truncated = text.slice(0, MAX_TTS_CHARS);

  const res = await fetch(TTS_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: TTS_MODEL,
      voice: TTS_VOICE,
      input: truncated,
      response_format: 'mp3',
    }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    console.error('[TTS] OpenAI falhou:', res.status, await res.text());
    return null;
  }

  return Buffer.from(await res.arrayBuffer());
}
