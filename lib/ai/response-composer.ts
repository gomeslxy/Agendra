import type { createAdminClient } from '@/lib/supabase/admin';
import { sendChannelMessage } from '@/lib/channels/send';
import { logDebug, logError, logInfo } from '@/lib/logging';
import { sanitizeAIResponse } from './sanitizer';

type Admin = ReturnType<typeof createAdminClient>;

const ABBREV_PROTECT_RE = /\b(Dr|Dra|Sr|Sra|Prof|Profa|Obs|Tel|Av|Eng|Adm|Ex|Etc)\./gi;
const ABBREV_MARKER = '\u0000DOT\u0000';

/**
 * Limita a resposta a no máximo `maxSentences` sentenças usando `Intl.Segmenter`
 * em pt-BR, preservando valores monetários (`R$ 150.00`), abreviações (`Dr.`) e URLs.
 */
export function truncateSentences(text: string, maxSentences = 3): string {
  if (!text) return '';

  const protectedText = text.replace(ABBREV_PROTECT_RE, (_m, abbr: string) => `${abbr}${ABBREV_MARKER}`);
  const segmenter = new Intl.Segmenter('pt-BR', { granularity: 'sentence' });
  const segments = Array.from(segmenter.segment(protectedText), (s) => s.segment);

  const output =
    segments.length > maxSentences
      ? segments.slice(0, maxSentences).join('').trim()
      : protectedText.trim();

  return output.replaceAll(ABBREV_MARKER, '.');
}

export interface ComposeReplyOptions {
  applySentenceCap: boolean;
  hasWatermark: boolean;
  isNewConversation: boolean;
}

/**
 * Divide em no máximo 2 partes (`---MSG---`), aplica sanitização e marca d'água.
 */
export function composeReplyParts(rawReply: string, opts: ComposeReplyOptions): string[] {
  const preCleaned = sanitizeAIResponse(
    rawReply
      .replace(/```json[\s\S]*?```/gi, '')
      .replace(/\n\s*\{\s*"heat_score"[\s\S]*\}\s*$/i, '')
      .trim(),
  );

  let parts = preCleaned
    .split(/---MSG---/gi)
    .map((p) => p.trim())
    .filter(Boolean);

  if (parts.length > 2) {
    parts = [parts.join('\n\n')];
  }

  let sanitizedParts = parts
    .map((p) => sanitizeAIResponse(p))
    .map((p) => (opts.applySentenceCap ? truncateSentences(p, 3) : p))
    .filter(Boolean);

  if (sanitizedParts.length === 0) {
    sanitizedParts = ['Entendido! Como posso ajudar você hoje?'];
  }

  if (opts.hasWatermark && opts.isNewConversation) {
    sanitizedParts[sanitizedParts.length - 1] += '\n\n_Atendimento via Agendra_ ✦';
  }

  return sanitizedParts;
}

export interface DeliverReplyParams {
  admin: Admin;
  companyId: string;
  leadId: string;
  phone: string;
  parts: string[];
  isShadowMode: boolean;
  ttsEnabled: boolean;
  isAudioIncoming: boolean;
  traceId: string;
}

export interface DeliverReplyResult {
  firstMessageId: string | null;
  sendDurationMs: number | null;
}

async function persistAssistantMessage(
  admin: Admin,
  companyId: string,
  leadId: string,
  content: string,
  metadata: Record<string, unknown> | null,
): Promise<{ id: string } | null> {
  const { data, error } = await admin
    .from('messages')
    .insert({
      lead_id: leadId,
      company_id: companyId,
      role: 'assistant',
      content,
      metadata,
    })
    .select('id')
    .single();

  if (error) {
    logError('[ResponseComposer] failed to persist assistant message:', error.message);
    return null;
  }
  return data ? { id: data.id as string } : null;
}

async function sendPart(
  admin: Admin,
  params: {
    companyId: string;
    phone: string;
    text: string;
    messageId: string | null;
    replyInAudio: boolean;
  },
): Promise<{ ok: boolean; error?: string }> {
  if (params.replyInAudio && params.text) {
    const { synthesizeSpeech } = await import('@/lib/whatsapp/tts');
    const audio = await synthesizeSpeech(params.text);
    if (audio) {
      const { sendChannelMedia } = await import('@/lib/channels/send');
      const result = await sendChannelMedia(
        params.phone,
        '',
        'audio',
        'tts.mp3',
        '',
        params.companyId,
        audio,
      );
      if (result.ok) {
        if (params.messageId) {
          await admin
            .from('messages')
            .update({ metadata: { tts: true } })
            .eq('id', params.messageId);
        }
        return { ok: true };
      }
    }
  }

  try {
    const res = await sendChannelMessage(params.phone, params.text, params.companyId);
    if (res.ok) {
      if (res.providerMessageId && params.messageId) {
        await admin
          .from('messages')
          .update({ metadata: { provider_message_id: res.providerMessageId } })
          .eq('id', params.messageId);
      }
      return { ok: true };
    }
    return { ok: false, error: res.error ?? 'unknown send failure' };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logError('[ResponseComposer] sendChannelMessage failed:', msg);
    return { ok: false, error: msg };
  }
}

export async function deliverReplyParts(params: DeliverReplyParams): Promise<DeliverReplyResult> {
  const { admin, companyId, leadId, phone, parts, isShadowMode, ttsEnabled, isAudioIncoming, traceId } =
    params;

  if (isShadowMode) {
    const msg1 = await persistAssistantMessage(admin, companyId, leadId, parts[0], {
      is_draft: true,
      part: 1,
      total_parts: parts.length,
    });
    if (parts.length > 1) {
      await persistAssistantMessage(admin, companyId, leadId, parts[1], {
        is_draft: true,
        part: 2,
        total_parts: parts.length,
      });
    }
    logInfo(`[ResponseComposer] shadow drafts persisted (${parts.length})`);
    return { firstMessageId: msg1?.id ?? null, sendDurationMs: null };
  }

  const sendStart = Date.now();
  const replyInAudio = ttsEnabled && isAudioIncoming;

  const msg1 = await persistAssistantMessage(admin, companyId, leadId, parts[0], null);
  const sendRes1 = await sendPart(admin, {
    companyId,
    phone,
    text: parts[0],
    messageId: msg1?.id ?? null,
    replyInAudio,
  });

  if (!sendRes1.ok && msg1) {
    const errMsg = (sendRes1.error ?? 'unknown send failure').slice(0, 300);
    logError(`[ResponseComposer] reply NOT delivered to lead (${errMsg})`);
    await admin
      .from('messages')
      .update({ metadata: { send_failed: true, send_error: errMsg } })
      .eq('id', msg1.id);
    await admin
      .from('automation_events')
      .insert({
        company_id: companyId,
        lead_id: leadId,
        type: 'reply_delivery_failed',
        detail: errMsg.slice(0, 200),
        trace_id: traceId,
        payload: { message_id: msg1.id },
      })
      .then(
        () => {},
        () => {},
      );
  } else {
    logDebug(`[ResponseComposer] part 1 sent to ${phone.substring(0, 6)}***`);
  }

  if (parts.length > 1 && sendRes1.ok) {
    await new Promise((resolve) => setTimeout(resolve, 1200));
    const msg2 = await persistAssistantMessage(admin, companyId, leadId, parts[1], null);
    await sendPart(admin, {
      companyId,
      phone,
      text: parts[1],
      messageId: msg2?.id ?? null,
      replyInAudio,
    });
  }

  return { firstMessageId: msg1?.id ?? null, sendDurationMs: Date.now() - sendStart };
}
