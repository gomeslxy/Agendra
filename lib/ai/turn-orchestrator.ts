import crypto from 'crypto';
import { after } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logDebug, logError, logInfo } from '@/lib/logging';
import { sendChannelMessage, sendChannelTyping } from '@/lib/channels/send';
import type { Lead, LeadStatus, Message } from '@/lib/types/database';
import { getCompanyUsage, type CompanyUsage } from '@/lib/billing/limits';
import { getPlanLimits, type PlanLimits, type PlanType } from '@/lib/billing/plans';
import { createTimer, persistAILog } from '@/lib/ai/observability';
import { getDeadline, runWithDeadline } from '@/lib/ai/deadline';
import {
  appendScoreHistory,
  EMPTY_MEMORY,
  mountContext,
  processBackgroundAnalytics,
} from './memory';
import { validateAndNormalizeScore } from './scoring';
import { routeChat, routeGenerate } from './providers/router';
import type { NormalizedMessage, ProviderName, ToolCallRecord } from './providers/types';
import { isUnderHumanTakeover } from './takeover';
import { classifyIntent, type Intent } from './intent';
import { isResponseSuspicious, sanitizeAIResponse } from './sanitizer';
import { sanitizeToolError } from './error-sanitizer';
import { executeTool, getNeutralToolDefinitions } from './tools/registry';
import {
  buildSystemPrompt,
  detectClientProfileRule,
  formatTimeElapsed,
  type PersonaConfig,
  type ServiceSummary,
} from './prompt-builder';
import { getSemanticKnowledge } from './rag';
import { composeReplyParts, deliverReplyParts, truncateSentences } from './response-composer';
import { acquireOrCreateLeadLock, releaseLeadLock, requeueTurn } from './turn-lock';
import { withTimeout } from './timeout';

export type TurnState =
  | 'RECEIVED'
  | 'BUFFERED'
  | 'CLAIMED'
  | 'LOCKED'
  | 'CONTEXT_READY'
  | 'AI_EXECUTING'
  | 'DELIVERING'
  | 'COMPLETED'
  | 'REQUEUED'
  | 'SKIPPED_DEDUP'
  | 'SKIPPED_TAKEOVER'
  | 'FAILED_RETRYABLE'
  | 'FAILED_HANDOFF';

export type TurnOutcome =
  | { status: 'completed'; traceId: string; messageIds: string[] }
  | { status: 'requeued'; traceId: string; nextFlushAt: string; requeueCount: number }
  | {
      status: 'skipped';
      traceId: string;
      reason: 'dedup' | 'takeover' | 'paused' | 'billing_limit' | 'exhausted';
    };

export interface TurnContext {
  readonly traceId: string;
  readonly companyId: string;
  readonly phone: string;
  readonly senderName: string;
  readonly representativeMessageId?: string;
  readonly batchMessageIds: string[];
  readonly prePersistedIds: string[];
  readonly attemptCount: number;
  readonly requeueCount: number;
  readonly receivedAtMs: number;
}

export interface AIResult {
  reply: string;
  heat_score: number;
  status: Lead['status'];
  summary: string;
  tokens_input: number;
  tokens_output: number;
  tools_called: ToolCallRecord[];
  model_used: string;
  provider_used: ProviderName;
  attempted_providers: ProviderName[];
  fallback_used: boolean;
  intent_classified?: string;
}

function extractToolName(t: ToolCallRecord | string): string {
  return typeof t === 'string' ? t : t.name ?? '';
}

export async function processLeadMessage(
  lead: Lead,
  history: Message[],
  newMessage: string,
  companyId: string,
  persona: PersonaConfig,
  isNewConversation: boolean,
  planType: PlanType = 'trial',
  planLimits: PlanLimits = {} as PlanLimits,
  traceId?: string,
  intent?: Intent,
  ragContext?: string,
  previousLastMessageAt?: string | null,
): Promise<AIResult> {
  const memoryContext = mountContext(lead.lead_memory, lead.summary);

  const effectiveLastMsgAt = previousLastMessageAt ?? lead.last_message_at;
  const lastMessageAt = effectiveLastMsgAt ? new Date(effectiveLastMsgAt) : null;
  const timeSinceLastMs = lastMessageAt ? Date.now() - lastMessageAt.getTime() : null;
  const isSessionExpired = timeSinceLastMs !== null && timeSinceLastMs > 12 * 60 * 60 * 1000;
  const timeSinceLastStr = timeSinceLastMs !== null ? formatTimeElapsed(timeSinceLastMs) : '';

  const clientProfileRule = detectClientProfileRule(newMessage);

  const systemPrompt = buildSystemPrompt({
    persona,
    lead,
    memoryContext,
    isNewConversation,
    planType,
    planLimits,
    isSessionExpired,
    timeSinceLastStr,
    clientProfileRule,
    intent,
    ragContext,
  });

  const ctx = {
    companyId,
    leadId: lead.id,
    traceId,
    defaultTimezone: persona.timezone ?? 'America/Sao_Paulo',
  };

  // P1-ENG-04: preservar janela completa recebida (cap 12) em vez de truncar fixo em 5
  const normalizedHistory: NormalizedMessage[] = history
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }))
    .slice(-12);

  const isLitePlan = planLimits.hasAdvancedModel === false;
  const MAX_ITERATIONS = isLitePlan ? 3 : 5;
  const geminiModelOverride = isLitePlan ? 'gemini-2.5-flash-lite' : undefined;

  async function toolHandler(name: string, args: Record<string, unknown>): Promise<unknown> {
    try {
      return await executeTool(name, args, ctx);
    } catch (err: unknown) {
      return { error: sanitizeToolError(err) };
    }
  }

  const useToolsChain = intent ? intent.needsTools : true;
  const tools = getNeutralToolDefinitions();

  let systemPromptWithCorrection = systemPrompt;
  let result: Awaited<ReturnType<typeof routeChat>> | null = null;
  let reply = '';
  let attempts = 0;
  const maxAttempts = 2;

  while (attempts < maxAttempts) {
    attempts++;
    result = await routeChat(
      {
        systemPrompt: systemPromptWithCorrection,
        history: normalizedHistory,
        userMessage: newMessage,
        tools,
        toolHandler,
        maxIterations: MAX_ITERATIONS,
        preferredModel: geminiModelOverride,
        toolMode: 'AUTO',
      },
      { chain: useToolsChain ? 'tools' : 'conv', traceId },
    );

    reply = result.text.trim();

    if (!isResponseSuspicious(reply)) {
      break;
    }

    logError(
      `[Engine][${traceId?.slice(0, 8) ?? 'n/a'}] suspicious response on attempt ${attempts}`,
    );

    if (attempts < maxAttempts) {
      systemPromptWithCorrection = `${systemPrompt}\n\n⚠️ ATENÇÃO CRÍTICA (AUTO-CORREÇÃO): Na tentativa anterior, você gerou uma resposta contendo termos técnicos, formatação corrompida, tags XML/HTML ou placeholders que não deveriam aparecer em uma conversa real do WhatsApp. CERTIFIQUE-SE de que a resposta final seja 100% amigável, natural e legível por um cliente real. Você está TERMINANTEMENTE PROIBIDO de incluir: tags (como <...>, </...>, <=x>/>), placeholders (como {{nome}}, [inserir]), ou nomes de funções técnicas (como get_available_slots). Escreva puramente texto natural.`;
    }
  }

  if (!result) {
    throw new Error('AI_ALL_PROVIDERS_FAILED: no route result');
  }

  let heat_score = lead.heat_score;
  let status: LeadStatus = lead.status;
  const summary = lead.summary ?? '';

  const toolsCalled = result.toolsCalled ?? [];
  const calledBook = toolsCalled.some((t) => extractToolName(t) === 'bookAppointment');
  const calledCheck = toolsCalled.some((t) => {
    const name = extractToolName(t);
    return (
      name === 'checkAvailability' ||
      name === 'get_available_slots' ||
      name === 'listServices'
    );
  });

  if (calledBook) {
    status = 'success';
    heat_score = 100;
  } else if (calledCheck && status !== 'success') {
    status = 'warm';
  }

  reply = sanitizeAIResponse(
    reply
      .replace(/```json[\s\S]*?```/gi, '')
      .replace(/\n\s*\{\s*"heat_score"[\s\S]*\}\s*$/i, '')
      .trim(),
  );

  if (!calledCheck) {
    reply = truncateSentences(reply, 3);
  }

  return {
    reply,
    heat_score,
    status,
    summary,
    tokens_input: result.tokensInput,
    tokens_output: result.tokensOutput,
    tools_called: toolsCalled,
    model_used: result.modelUsed,
    provider_used: result.provider,
    attempted_providers: result.attemptedProviders ?? [result.provider],
    fallback_used: result.fallbackUsed,
  };
}

export async function executeTurn(
  companyId: string,
  phone: string,
  senderName: string,
  messageText: string,
  providerMessageId?: string,
  preloadedUsage?: CompanyUsage,
  incomingMetadata?: Record<string, unknown>,
): Promise<TurnOutcome> {
  if (!getDeadline()) {
    return runWithDeadline(() =>
      executeTurn(
        companyId,
        phone,
        senderName,
        messageText,
        providerMessageId,
        preloadedUsage,
        incomingMetadata,
      ),
    );
  }

  const admin = createAdminClient();
  const timer = createTimer();
  const startTime = Date.now();
  const receivedAt = incomingMetadata?.received_at;
  const t_debounce = typeof receivedAt === 'number' ? startTime - receivedAt : null;
  let t_rag: number | null = null;
  let t_ai: number | null = null;
  let t_send: number | null = null;

  const traceId = crypto.randomUUID();
  const tag = traceId.slice(0, 8);
  logInfo(
    `[Engine][${tag}] start company=${companyId} phone=${phone.slice(0, 6)}*** msgId=${providerMessageId?.slice(-8) ?? 'n/a'} len=${messageText.length}`,
  );

  const preSavedIds: string[] = Array.isArray(incomingMetadata?.pre_persisted_ids)
    ? (incomingMetadata.pre_persisted_ids as string[])
    : [];

  // 1. Atomic deduplication
  if (providerMessageId) {
    const { error: insErr } = await admin.from('processed_messages').insert({
      provider_message_id: providerMessageId,
      company_id: companyId,
      status: 'processing',
    });

    if (insErr) {
      if ((insErr as { code?: string }).code === '23505') {
        logDebug(`[Engine][${tag}] dedup race detected, skipping`);
        return { status: 'skipped', traceId, reason: 'dedup' };
      }
      logError(`[Engine][${tag}] processed_messages insert failed:`, insErr);
      return { status: 'skipped', traceId, reason: 'dedup' };
    }
  }

  // 2. Context loading
  const [{ data: company }, { data: services }, { count: knowledgeCount }, { data: preFetchedLead }] =
    await Promise.all([
      admin.from('companies').select('*').eq('id', companyId).single(),
      admin
        .from('services')
        .select('id, name, duration, price')
        .eq('company_id', companyId)
        .eq('active', true)
        .neq('is_paused', true),
      admin
        .from('company_knowledge')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', companyId)
        .limit(1),
      admin
        .from('leads')
        .select('*')
        .eq('company_id', companyId)
        .eq('phone', phone)
        .maybeSingle(),
    ]);

  if (!company) throw new Error('Empresa nao encontrada');

  const rawPersonaConfig = (company.persona_config ?? {}) as PersonaConfig;
  const persona: PersonaConfig = {
    ...rawPersonaConfig,
    name: (company.ai_name as string | null) || rawPersonaConfig.name,
    tone: (company.ai_tone as string | null) || rawPersonaConfig.tone,
    ai_forbidden: (company.ai_forbidden as string | null) || rawPersonaConfig.ai_forbidden,
    realServices: (services as ServiceSummary[] | null) ?? [],
  };

  // Check human takeover BEFORE acquiring turn lock if lead already exists
  if (preFetchedLead && isUnderHumanTakeover(preFetchedLead as Lead)) {
    const existingLead = preFetchedLead as Lead;
    logInfo(`[Engine][${tag}] skip — lead ${existingLead.id} in human takeover`);
    if (preSavedIds.length === 0) {
      await admin.from('messages').insert({
        lead_id: existingLead.id,
        company_id: companyId,
        role: 'user',
        content: messageText,
        metadata: incomingMetadata ?? null,
      });
    }
    if (providerMessageId) {
      await admin
        .from('processed_messages')
        .update({ status: 'completed', lead_id: existingLead.id })
        .eq('provider_message_id', providerMessageId);
    }
    return { status: 'skipped', traceId, reason: 'takeover' };
  }

  // 3. Atomic lead creation / lock acquisition (WITHOUT destructive 1s rate limit)
  const channelProvider =
    typeof incomingMetadata?.channelProvider === 'string'
      ? incomingMetadata.channelProvider
      : 'whatsapp';
  const channelId =
    typeof incomingMetadata?.channelId === 'string' ? incomingMetadata.channelId : null;

  const lockResult = await acquireOrCreateLeadLock(admin, {
    companyId,
    phone,
    senderName,
    channel: channelProvider,
    channelId,
    existingLead: (preFetchedLead as Lead | null) ?? null,
  });

  const activeLead = lockResult.lead;

  if (!lockResult.acquired) {
    if (isUnderHumanTakeover(activeLead)) {
      if (preSavedIds.length === 0) {
        await admin.from('messages').insert({
          lead_id: activeLead.id,
          company_id: companyId,
          role: 'user',
          content: messageText,
          metadata: incomingMetadata ?? null,
        });
      }
      if (providerMessageId) {
        await admin
          .from('processed_messages')
          .update({ status: 'completed', lead_id: activeLead.id })
          .eq('provider_message_id', providerMessageId);
      }
      return { status: 'skipped', traceId, reason: 'takeover' };
    }

    const requeueCount = Number(incomingMetadata?.requeue_count ?? 0);
    const reqResult = await requeueTurn(admin, {
      companyId,
      phone,
      senderName,
      messageText,
      providerMessageId,
      traceId,
      requeueCount,
      incomingMetadata,
      preSavedIds,
    });

    if (reqResult.status === 'requeued') {
      return {
        status: 'requeued',
        traceId,
        nextFlushAt: reqResult.nextFlushAt,
        requeueCount: reqResult.requeueCount,
      };
    }

    return { status: 'skipped', traceId, reason: 'exhausted' };
  }

  // Best-effort associate lead_id on processed_messages for diagnostics
  if (providerMessageId) {
    await admin
      .from('processed_messages')
      .update({ lead_id: activeLead.id })
      .eq('provider_message_id', providerMessageId)
      .then(
        () => {},
        () => {},
      );
  }

  const earlyPlanLimits =
    preloadedUsage?.limits ?? getPlanLimits(company.plan_type as PlanType);
  const intent = classifyIntent(messageText);

  let ragStatus: 'ok' | 'empty' | 'failed' | 'timeout' | null = null;
  let ragContext = '';

  if (earlyPlanLimits.hasRAG && intent.needsRAG && (knowledgeCount ?? 0) > 0) {
    try {
      const ragTimer = createTimer();
      const ragRes = await getSemanticKnowledge(companyId, messageText, admin);
      t_rag = ragTimer();
      ragStatus = ragRes.status;
      ragContext = ragRes.text;
    } catch (err) {
      logError('[Engine] RAG failure:', err);
      ragStatus = 'failed';
    }
  } else if (earlyPlanLimits.hasRAG && !intent.needsRAG) {
    ragStatus = 'empty';
  }

  // 4. Billing gate
  const usage = preloadedUsage ?? (await getCompanyUsage(companyId));
  if (usage.isLimitReached) {
    const fallback =
      'Ola! No momento estamos com alta demanda. Recebemos sua mensagem e um consultor humano entrara em contato em breve.';
    if (preSavedIds.length === 0) {
      await admin.from('messages').insert({
        lead_id: activeLead.id,
        company_id: companyId,
        role: 'user',
        content: messageText,
      });
    }
    await sendChannelMessage(phone, fallback, companyId);
    if (providerMessageId) {
      await admin
        .from('processed_messages')
        .update({ status: 'completed', lead_id: activeLead.id })
        .eq('provider_message_id', providerMessageId);
    }
    await releaseLeadLock(admin, companyId, activeLead.id);
    return { status: 'skipped', traceId, reason: 'billing_limit' };
  }

  // 5. History loading
  const historyLimit = intent.type === 'scheduling' ? 12 : 8;
  const [{ data: historyRaw }, { count: assistantTotal }] = await Promise.all([
    admin
      .from('messages')
      .select('id, role, content, created_at, metadata')
      .eq('lead_id', activeLead.id)
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })
      .limit(historyLimit),
    admin
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('lead_id', activeLead.id)
      .eq('company_id', companyId)
      .eq('role', 'assistant'),
  ]);
  const history = ((historyRaw ?? []) as Message[]).reverse();

  if (activeLead.is_paused && activeLead.control_mode !== 'shadow') {
    if (preSavedIds.length === 0) {
      await admin.from('messages').insert({
        lead_id: activeLead.id,
        company_id: companyId,
        role: 'user',
        content: messageText,
      });
    }
    if (providerMessageId) {
      await admin
        .from('processed_messages')
        .update({ status: 'completed', lead_id: activeLead.id })
        .eq('provider_message_id', providerMessageId);
    }
    await releaseLeadLock(admin, companyId, activeLead.id);
    return { status: 'skipped', traceId, reason: 'paused' };
  }

  // 6. Persist incoming message in parallel with AI inference
  const userMsgPromise: Promise<void> =
    preSavedIds.length === 0
      ? (async () => {
          const { error } = await admin.from('messages').insert({
            lead_id: activeLead.id,
            company_id: companyId,
            role: 'user',
            content: messageText,
          });
          if (error) logError(`[Engine][${tag}] failed to persist user message:`, error);
        })()
      : Promise.resolve();

  const isNewConversation = (assistantTotal ?? 0) === 0;
  const excludeSet = new Set(preSavedIds);
  const historyToSend =
    preSavedIds.length > 0 ? history.filter((m) => !excludeSet.has(m.id)) : history;

  let aiResult: AIResult | undefined;
  let finalReply = '';
  let sentMessageId: string | null = null;
  let leadFinalStatus: LeadStatus = activeLead.status;

  let typingActive = true;
  let typingInterval: ReturnType<typeof setInterval> | null = null;
  if (providerMessageId) {
    void sendChannelTyping(phone, companyId, providerMessageId);
    typingInterval = setInterval(() => {
      if (!typingActive) {
        if (typingInterval) clearInterval(typingInterval);
        return;
      }
      void sendChannelTyping(phone, companyId, providerMessageId);
    }, 4000);
  }

  try {
    const aiStart = Date.now();
    aiResult = await processLeadMessage(
      activeLead,
      historyToSend,
      messageText,
      companyId,
      persona,
      isNewConversation,
      usage.planType,
      usage.limits,
      traceId,
      intent,
      ragContext,
      lockResult.previousLastMessageAt,
    );
    t_ai = Date.now() - aiStart;

    const { score: finalScore, reason: scoreReason } = validateAndNormalizeScore(
      aiResult.heat_score,
      activeLead.heat_score,
      activeLead.lead_memory || EMPTY_MEMORY,
      messageText,
    );

    const calledCheck = aiResult.tools_called.some((t) => {
      const name = extractToolName(t);
      return (
        name === 'checkAvailability' ||
        name === 'get_available_slots' ||
        name === 'listServices'
      );
    });

    const parts = composeReplyParts(aiResult.reply, {
      applySentenceCap: !calledCheck,
      hasWatermark: usage.limits.hasWatermark,
      isNewConversation,
    });
    finalReply = parts.join('\n\n');

    await userMsgPromise;

    const delivery = await deliverReplyParts({
      admin,
      companyId,
      leadId: activeLead.id,
      phone,
      parts,
      isShadowMode: activeLead.control_mode === 'shadow',
      ttsEnabled: rawPersonaConfig.tts_enabled === true,
      isAudioIncoming: incomingMetadata?.is_audio === true,
      traceId,
    });
    sentMessageId = delivery.firstMessageId;
    t_send = delivery.sendDurationMs;

    const updatedMemory = appendScoreHistory(activeLead.lead_memory, finalScore, scoreReason);

    let finalStatus: LeadStatus = aiResult.status;
    if (finalStatus !== 'success') {
      if (finalScore >= 70) {
        finalStatus = 'hot';
      } else if (finalScore >= 35) {
        if (finalStatus === 'cold' || finalScore < 50) {
          finalStatus = 'warm';
        }
      } else {
        finalStatus = 'cold';
      }
    }
    leadFinalStatus = finalStatus;

    const leadPatch: Record<string, unknown> = {
      heat_score: finalScore,
      status: finalStatus,
      summary: aiResult.summary,
      lead_memory: updatedMemory,
    };

    if (persona.auto_escalate && finalScore < (persona.escalation_threshold ?? 25)) {
      leadPatch.is_paused = true;
      leadPatch.control_mode = 'manual';
      await admin.from('messages').insert({
        lead_id: activeLead.id,
        company_id: companyId,
        role: 'note',
        content: `IA escalou para humano (score ${finalScore} abaixo do limite de ${persona.escalation_threshold}).`,
      });
    }

    await admin.from('leads').update(leadPatch).eq('id', activeLead.id).eq('company_id', companyId);
    await releaseLeadLock(admin, companyId, activeLead.id, providerMessageId ?? undefined);

    if (providerMessageId) {
      await admin
        .from('processed_messages')
        .update({ status: 'completed', lead_id: activeLead.id })
        .eq('provider_message_id', providerMessageId);
    }

    await persistAILog({
      company_id: companyId,
      lead_id: activeLead.id,
      message_id: sentMessageId,
      flow_type: null,
      tools_called: aiResult.tools_called.map((t) => ({
        name: t.name,
        args_summary: t.args_summary,
        result_summary: '',
      })),
      heat_score_before: activeLead.heat_score,
      heat_score_after: finalScore,
      score_validated_to: finalScore,
      score_delta: finalScore - activeLead.heat_score,
      latency_ms: timer(),
      model: aiResult.model_used,
      tokens_input: aiResult.tokens_input,
      tokens_output: aiResult.tokens_output,
      cost: null,
      retries: aiResult.fallback_used ? 1 : 0,
      error: null,
      trace_id: traceId,
      rag_status: ragStatus,
      provider: aiResult.provider_used,
      provider_chain_used: aiResult.attempted_providers,
      chain_kind: intent.needsTools ? 'tools' : 'conv',
      metadata: {
        t_debounce,
        t_rag,
        t_ai,
        t_send,
        debounce_batch_size:
          typeof incomingMetadata?.debounce_batch_size === 'number'
            ? incomingMetadata.debounce_batch_size
            : 1,
        via_sql_fallback: Boolean(incomingMetadata?.via_sql_fallback),
      },
    });
  } catch (err: unknown) {
    await userMsgPromise.catch(() => {});

    const errObj = err instanceof Error ? err : new Error(String(err));
    const errMsg = errObj.message;
    const isDeadline =
      errMsg.includes('AI_DEADLINE_EXCEEDED') || errObj.name === 'DeadlineExceededError';
    const isAllProvidersFailed = errMsg.includes('AI_ALL_PROVIDERS_FAILED') || isDeadline;

    logError(`[Engine][${tag}] turn failed:`, errMsg.slice(0, 300));

    if (isAllProvidersFailed) {
      const attemptCount = Number(incomingMetadata?.attempt_count ?? 1);
      if (attemptCount < 3) {
        await releaseLeadLock(admin, companyId, activeLead.id).catch(() => {});
        if (providerMessageId) {
          await admin
            .from('processed_messages')
            .update({ status: 'error', error_message: errMsg.slice(0, 500) })
            .eq('provider_message_id', providerMessageId);
        }
        throw err;
      }

      const hours = rawPersonaConfig.fallback_takeover_hours ?? 2;
      const alreadyInTakeover =
        Boolean(activeLead.human_takeover_until) &&
        new Date(activeLead.human_takeover_until!).getTime() > Date.now();

      if (!alreadyInTakeover) {
        await sendChannelMessage(
          phone,
          'Recebi sua mensagem! Em instantes uma pessoa do nosso time vai responder. 🙏',
          companyId,
        ).catch((sendErr) => logError('[Engine] fallback msg send err:', sendErr));
      }

      await admin
        .from('leads')
        .update({
          is_paused: true,
          control_mode: 'manual',
          human_takeover_at: alreadyInTakeover
            ? activeLead.human_takeover_at
            : new Date().toISOString(),
          human_takeover_until: new Date(Date.now() + hours * 3_600_000).toISOString(),
        })
        .eq('id', activeLead.id)
        .eq('company_id', companyId);

      await admin
        .from('automation_events')
        .insert({
          company_id: companyId,
          lead_id: activeLead.id,
          type: 'ai_all_providers_failed',
          detail: `Handoff ${hours}h ${alreadyInTakeover ? '(estendido)' : '(novo)'}`,
          trace_id: traceId,
          payload: { extended: alreadyInTakeover, hours, error: errMsg.slice(0, 200) },
        })
        .then(
          () => {},
          () => {},
        );
    }

    await releaseLeadLock(admin, companyId, activeLead.id).catch(() => {});
    if (providerMessageId) {
      await admin
        .from('processed_messages')
        .update({ status: 'error', error_message: errMsg.slice(0, 500) })
        .eq('provider_message_id', providerMessageId);
    }
    throw err;
  } finally {
    typingActive = false;
    if (typingInterval) clearInterval(typingInterval);
  }

  // 7. Background analytics (non-blocking)
  if (aiResult && finalReply && (usage.limits.hasAnalytics ?? false)) {
    const { count: assistantCount, error: countErr } = await admin
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('lead_id', activeLead.id)
      .eq('company_id', companyId)
      .eq('role', 'assistant');

    const safeCount = countErr || assistantCount == null ? 0 : assistantCount;
    const cadenceN = usage.planType === 'business' ? 5 : 10;
    const meaningfulTools = [
      'bookAppointment',
      'cancelAppointment',
      'rescheduleAppointment',
      'requestHumanAgent',
      'generatePixCharge',
      'checkPaymentStatus',
    ];
    const calledMeaningfulTool = aiResult.tools_called.some((t) =>
      meaningfulTools.includes(extractToolName(t)),
    );
    const statusChanged = leadFinalStatus !== activeLead.status;
    const isFirstAssistantMsg = safeCount === 1;
    const cadenceTrigger = safeCount > 0 && safeCount % cadenceN === 0;
    const isComplexTurn =
      messageText.length > 150 ||
      /\b(pre[çc]o|valor|caro|desconto|pagar|pagamento|pix|cart[ãa]o|boleto|custo|gr[áa]tis|contrato|ruim|errado|problema|reclama|suporte|humano|atendente|falar|pessoa|funciona|dif[íi]cil|p[ée]ssimo|odiei|cancelar|mudar|alterar|d[úu]vida|pergunta|como fa[çc]o)\b/i.test(
        messageText,
      );

    const eventTrigger =
      isFirstAssistantMsg || statusChanged || calledMeaningfulTool || isComplexTurn;

    if (cadenceTrigger || eventTrigger) {
      const reason = eventTrigger
        ? isFirstAssistantMsg
          ? 'first_msg'
          : statusChanged
            ? `status:${activeLead.status}->${leadFinalStatus}`
            : calledMeaningfulTool
              ? 'tool_call'
              : 'cognitive_trigger'
        : `cadence_${cadenceN}`;

      const capturedResult = aiResult;
      const runAnalytics = async () => {
        try {
          const analytics = await withTimeout(
            processBackgroundAnalytics(
              history.slice(-5),
              messageText,
              finalReply,
              capturedResult.tools_called,
              capturedResult.summary,
            ),
            20_000,
            'Analytics timeout (20s)',
          );

          const { data: latestLead } = await admin
            .from('leads')
            .select('lead_memory')
            .eq('id', activeLead.id)
            .eq('company_id', companyId)
            .single();
          const currentMem = (latestLead?.lead_memory as typeof EMPTY_MEMORY | null) ?? {
            ...EMPTY_MEMORY,
          };

          const furtherUpdatedMem = {
            ...currentMem,
            services_mentioned: [
              ...new Set([...(currentMem.services_mentioned || []), ...(analytics.services || [])]),
            ],
            objections_raised: [
              ...new Set([
                ...(currentMem.objections_raised || []),
                ...(analytics.objections || []),
              ]),
            ],
            qualification_answers: {
              ...(currentMem.qualification_answers || {}),
              ...(analytics.answers || {}),
            },
          };

          const sentimentScore =
            typeof analytics.sentiment_score === 'number'
              ? Math.max(-1, Math.min(1, analytics.sentiment_score))
              : null;

          await admin
            .from('leads')
            .update({
              lead_memory: furtherUpdatedMem,
              summary: analytics.new_summary,
            })
            .eq('id', activeLead.id)
            .eq('company_id', companyId);

          if (sentimentScore !== null) {
            await admin
              .from('leads')
              .update({
                last_sentiment: sentimentScore,
                last_sentiment_at: new Date().toISOString(),
              })
              .eq('id', activeLead.id)
              .eq('company_id', companyId);
          }

          const { error: logErr } = await admin.from('ai_decision_logs').insert({
            company_id: companyId,
            lead_id: activeLead.id,
            message_id: sentMessageId,
            intent_detected: analytics.intent_detected,
            sentiment_score: sentimentScore,
            urgency_detected: analytics.urgency_detected,
            objection_handled: analytics.objection_handled,
            rationale: analytics.rationale,
            trace_id: traceId,
          });
          if (logErr) logError('[Engine] ai_decision_logs insert failed:', logErr);

          await admin
            .from('automation_events')
            .insert({
              company_id: companyId,
              lead_id: activeLead.id,
              type: 'analytics_processed',
              detail: `reason=${reason} sentiment=${sentimentScore?.toFixed(2) ?? 'n/a'} intent=${analytics.intent_detected}`,
              payload: {
                reason,
                sentiment_score: sentimentScore,
                intent: analytics.intent_detected,
              },
              trace_id: traceId,
            })
            .then(
              () => {},
              () => {},
            );
        } catch (e) {
          logError('[Engine] Background analytics failed:', e);
        }
      };

      try {
        after(runAnalytics);
      } catch {
        await runAnalytics();
      }
    }
  }

  return {
    status: 'completed',
    traceId,
    messageIds: sentMessageId ? [sentMessageId] : [],
  };
}

export async function triggerAutoFollowUp(
  leadId: string,
  preloadedUsage?: CompanyUsage,
): Promise<void> {
  const traceId = crypto.randomUUID();
  const admin = createAdminClient();

  const { data: lead } = await admin
    .from('leads')
    .select('*, companies(id, name, ai_name, ai_tone, persona_config)')
    .eq('id', leadId)
    .single();

  if (!lead || lead.is_paused || lead.status === 'success' || (lead.status as string) === 'disqualified') {
    return;
  }

  try {
    const usage = preloadedUsage ?? (await getCompanyUsage(lead.company_id as string));
    if (!usage.limits.hasFollowUp) return;
  } catch (billingErr) {
    logError('[Engine] triggerAutoFollowUp billing check failed:', billingErr);
    return;
  }

  const companyData = lead.companies as {
    id: string;
    name: string;
    ai_name?: string | null;
    persona_config?: PersonaConfig | null;
  } | null;

  const maxRetries = companyData?.persona_config?.followup_max_retries ?? 2;
  if ((lead.followup_count ?? 0) >= maxRetries) return;

  const { count: activeBookings } = await admin
    .from('events')
    .select('id', { count: 'exact', head: true })
    .eq('lead_id', leadId)
    .eq('company_id', lead.company_id)
    .neq('status', 'cancelled')
    .gte('start_time', new Date().toISOString());

  if ((activeBookings ?? 0) > 0) return;

  const { data: messages } = await admin
    .from('messages')
    .select('id, role, content, created_at')
    .eq('lead_id', leadId)
    .eq('company_id', lead.company_id)
    .order('created_at', { ascending: false })
    .limit(5);

  const lastMsg = messages?.[0];
  if (!lastMsg || lastMsg.role !== 'assistant') return;

  const followupDelayHours =
    (companyData?.persona_config as { followup_delay_hours?: number } | null)
      ?.followup_delay_hours ?? 24;
  const lockWindowAgo = new Date(Date.now() - followupDelayHours * 2 * 60 * 60 * 1000).toISOString();

  const { data: claimed } = await admin
    .from('leads')
    .update({ followup_in_progress: true })
    .eq('id', leadId)
    .eq('company_id', lead.company_id)
    .eq('followup_in_progress', false)
    .or(`last_followup_at.is.null,last_followup_at.lt.${lockWindowAgo}`)
    .select('id')
    .maybeSingle();

  if (!claimed) return;

  try {
    const memoryContext = mountContext(lead.lead_memory, lead.summary);
    const prompt = `Voce e ${companyData?.ai_name || 'Agendra'}, assistente do(a) ${companyData?.name || 'nossa empresa'}.
O lead ${lead.name} parou de responder apos nossa ultima mensagem.
Contexto: ${memoryContext}
Ultima mensagem enviada: "${lastMsg.content}"
 
Objetivo: Envie um follow-up curto (maximo 2 frases), gentil e sem pressao para ver se ele ainda tem interesse ou se ficou com alguma duvida. Nao use "Oi, voce esta ai?". Seja profissional e amigavel.
 
Mensagem de follow-up:`;

    let followupText = '';
    let modelUsed = '';
    try {
      const generateResult = await routeGenerate({ prompt }, { chain: 'bg', traceId });
      followupText = generateResult.text.trim().replace(/^"|"$/g, '');
      modelUsed = `${generateResult.provider}/${generateResult.text ? 'ok' : 'empty'}`;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logError('[Engine] Follow-up failed (all providers):', msg);
      return;
    }

    if (!followupText) return;
    followupText = sanitizeAIResponse(followupText);

    await sendChannelMessage(lead.phone as string, followupText, lead.company_id as string);

    await admin.from('messages').insert({
      lead_id: lead.id,
      company_id: lead.company_id,
      role: 'assistant',
      content: followupText,
      metadata: { type: 'auto-followup' },
    });

    await admin
      .from('leads')
      .update({
        followup_count: (lead.followup_count ?? 0) + 1,
        last_followup_at: new Date().toISOString(),
      })
      .eq('id', lead.id)
      .eq('company_id', lead.company_id);

    await admin
      .from('automation_events')
      .insert({
        company_id: lead.company_id,
        lead_id: lead.id,
        type: 'followup_sent',
        detail: `Follow-up enviado para ${(lead.name as string).split(' ')[0]}`,
        payload: { message_preview: followupText.slice(0, 120), model_used: modelUsed },
        trace_id: traceId,
      })
      .then(
        () => {},
        () => {},
      );
  } catch (err) {
    logError('[Engine] Follow-up failed or send failed:', err);
  } finally {
    await admin
      .from('leads')
      .update({ followup_in_progress: false })
      .eq('id', leadId)
      .eq('company_id', lead.company_id);
  }
}
