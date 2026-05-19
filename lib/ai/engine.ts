import { GoogleGenerativeAI, type Content, FunctionCallingMode } from '@google/generative-ai';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendWhatsAppMessage } from '@/lib/whatsapp/client';
import type { Lead, Message } from '@/lib/types/database';
import {
  toolDeclarations,
  handleListServices,
  handleCheckAvailability,
  handleBookAppointment,
  handleCancelAppointment,
  handleRescheduleAppointment,
  handleMyAppointments,
  handleUpdateLeadInfo,
  handleUpdateLeadMemory,
  handleRequestHumanAgent,
  handleGeneratePixCharge,
  type ToolContext,
} from './tools';
import { getCompanyUsage } from '@/lib/billing/limits';
import type { PlanLimits, PlanType } from '@/lib/billing/plans';
import { persistAILog, createTimer } from '@/lib/ai/observability';
import { EMPTY_MEMORY, mountContext, processBackgroundAnalytics, appendScoreHistory } from './memory';
import { validateAndNormalizeScore } from './scoring';

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY!);
const MAIN_MODEL = 'gemini-2.5-flash';

interface Service {
  id: string;
  name: string;
  duration: number;
  price: number | null;
}

interface PersonaConfig {
  name?: string;
  business_name?: string;
  business_type?: string;
  services?: string[];
  realServices?: Service[];
  tone?: string;
  greeting?: string;
  timezone?: string;
  slot_duration_minutes?: number;
  extra_instructions?: string;
  ai_forbidden?: string;
  auto_escalate?: boolean;
  escalation_threshold?: number;
}

/** Formata os limites de plano em linguagem natural para o system prompt. */
function buildPlanContext(planType: PlanType, limits: PlanLimits): string {
  const yn = (v: boolean) => (v ? 'Liberado' : 'BLOQUEADO');
  return `## Plano Ativo desta Empresa
Plano contratado: *${planType.toUpperCase()}*
- Limite de leads/mês: ${limits.maxLeads}
- WhatsApps conectados: até ${limits.maxChannels}
- Calendários sincronizados: até ${limits.maxCalendars}
- Marca d'água Agendra: ${limits.hasWatermark ? 'Sim (somente 1ª mensagem por lead)' : 'Não'}
- Follow-up automático: ${yn(limits.hasFollowUp)}
- Webhooks (Zapier/Make): ${yn(limits.hasWebhooks)}
- Onboarding dedicado: ${yn(limits.hasDedicatedOnboarding)}

REGRA DE OURO: Você NUNCA deve oferecer, prometer, mencionar ou insinuar recursos marcados como BLOQUEADO acima.
Se o cliente perguntar sobre um recurso bloqueado, informe de forma direta, educada e breve que não está disponível no plano atual.
Se houver upgrade disponível, sugira de forma natural e sem insistência. Nunca invente permissões.`;
}

function buildSystemPrompt(
  persona: PersonaConfig,
  lead: Lead,
  memoryContext: string,
  isNewConversation: boolean,
  planType: PlanType,
  planLimits: PlanLimits,
): string {
  const aiName = persona.name ?? 'Agendra';
  const businessName = persona.business_name ?? 'nossa empresa';
  const businessType = persona.business_type ?? 'negocio';

  const toneMap: Record<string, string> = {
    cold: 'Formal: Profissional, breve e direto ao ponto. Evite emojis ou intimidade.',
    warm: 'Amigavel: Atencioso, profissional e equilibrado. Pode usar emojis moderadamente.',
    hot: 'Persuasivo: Entusiasta, agil e proximo. Use emojis e linguagem persuasiva para converter.',
  };

  const selectedToneKey = (lead.conversation_tone || persona.tone) as string;
  const tone = toneMap[selectedToneKey] ?? (persona.tone || 'amigavel, profissional e objetivo');
  const timezone = persona.timezone ?? 'America/Sao_Paulo';
  const firstName = lead.name.split(' ')[0];
  const nowInTz = new Intl.DateTimeFormat('pt-BR', {
    timeZone: timezone,
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).format(new Date());

  let servicesDisplay = persona.services?.length ? persona.services.join(', ') : 'nossos servicos';
  if (persona.realServices?.length) {
    servicesDisplay = persona.realServices
      .map((s) => `- ${s.name} (${s.duration}min)${s.price ? ` - R$ ${s.price}` : ''} [ID: ${s.id}]`)
      .join('\n');
  }

  const extraInstructions = persona.extra_instructions
    ? `\n## Instrucoes Adicionais da Empresa\n${persona.extra_instructions}`
    : '';
  const forbidden = persona.ai_forbidden
    ? `\n## O que NAO fazer (PROIBIDO)\n${persona.ai_forbidden}`
    : '';

  const planContext = buildPlanContext(planType, planLimits);

  return `Voce e ${aiName}, assistente de vendas estrategica do(a) ${businessName} (${businessType}).
Tom: ${tone}. Use o primeiro nome do lead: "${firstName}". Seja concisa, empatica e focada em conversao.

Data e hora atual: ${nowInTz} (${timezone}).
Tipo de negocio: ${businessType}.
Servicos disponiveis:
${servicesDisplay}
Fuso horario: ${timezone}.

FORMATACAO (CRITICO): Esta conversa e via WhatsApp. Use APENAS formatacao WhatsApp:
- Negrito: *texto* (UM asterisco). NUNCA use **texto** (dois asteriscos).
- Italico: _texto_. NUNCA use markdown como #, ##, ---, backticks.
- Listas: use hifen simples "-" ou numero "1."

${planContext}

${memoryContext}

## Missao
Sua meta e qualificar o lead e agendar uma reuniao. Se o lead estiver pronto, use as ferramentas de agenda.
IMPORTANTE: Para checkAvailability ou bookAppointment, use SEMPRE o UUID [ID: ...] listado acima. Se nao tiver certeza de qual servico o lead quer, pergunte ou use listServices.

## Regras de Ouro
1. NUNCA invente horarios. Use checkAvailability. Se o lead pedir um horario que nao aparece nos slots, diga que nao ha disponibilidade e sugira os mais proximos.
2. Use updateLeadMemory para registrar interesses, objecoes ou respostas de qualificacao.
3. Se o lead parecer desinteressado ou agressivo, use updateLeadMemory com event_type: "disqualified".
4. Apos sua resposta, adicione SEMPRE o bloco JSON para atualizacao de metricas.
5. ${isNewConversation ? 'Esta e a PRIMEIRA mensagem deste lead. Pode cumprimentar normalmente.' : 'Conversa JA iniciada. NAO cumprimente novamente (sem "Ola", "Tudo bem?", "Opa"). Responda diretamente ao que o lead disse.'}${extraInstructions}${forbidden}

---JSON---
{
  "heat_score": <0-100>,
  "status": "cold" | "warm" | "hot" | "success",
  "summary": "<resumo curtissimo da ultima interacao>"
}`;
}

interface AIResult {
  reply: string;
  heat_score: number;
  status: Lead['status'];
  summary: string;
  tokens_input: number;
  tokens_output: number;
  tools_called: any[];
  model_used: string;
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
): Promise<AIResult> {
  const memoryContext = mountContext(lead.lead_memory, lead.summary);

  const ctx: ToolContext = { companyId, leadId: lead.id };
  let geminiHistory: Content[] = history
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => ({
      role: m.role === 'user' ? 'user' : 'model',
      parts: [{ text: m.content }],
    }));

  const firstUserIndex = geminiHistory.findIndex((h) => h.role === 'user');
  geminiHistory = firstUserIndex !== -1 ? geminiHistory.slice(firstUserIndex) : [];

  let response: any;
  let chat: any;
  let modelUsed = MAIN_MODEL;
  let lastErr: any;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const currentModel = attempt === 0 ? MAIN_MODEL : 'gemini-2.5-flash-lite';
      const model = genAI.getGenerativeModel({
        model: currentModel,
        systemInstruction: buildSystemPrompt(persona, lead, memoryContext, isNewConversation, planType, planLimits),
        tools: [toolDeclarations],
        toolConfig: { functionCallingConfig: { mode: FunctionCallingMode.AUTO } },
      });
      chat = model.startChat({ history: geminiHistory });
      response = await chat.sendMessage(newMessage);
      modelUsed = currentModel;
      break;
    } catch (err) {
      lastErr = err;
      if (attempt === 1) throw err;
      console.log(`[AI Engine] 🔄 Fallback para gemini-2.5-flash-lite`);
      await new Promise(r => setTimeout(r, 500));
    }
  }

  let iterations = 0;
  const MAX_ITERATIONS = 5;

  const toolsCalled: any[] = [];
  let totalInputTokens = response.response.usageMetadata?.promptTokenCount ?? 0;
  let totalOutputTokens = response.response.usageMetadata?.candidatesTokenCount ?? 0;

  while (iterations < MAX_ITERATIONS) {
    iterations++;
    const candidate = response.response.candidates?.[0];
    if (!candidate) break;

    const functionCalls = candidate.content.parts
      .filter((p: any) => p.functionCall)
      .map((p: any) => p.functionCall!);

    if (functionCalls.length === 0) break;

    const toolResults = await Promise.all(
      functionCalls.map(async (fc: any) => {
        const name = fc.name;
        const args = (fc.args ?? {}) as any;
        toolsCalled.push({ name, args_summary: JSON.stringify(args).substring(0, 100) });

        try {
          let result: any;
          if (name === 'listServices') result = await handleListServices(args, ctx);
          else if (name === 'checkAvailability') result = await handleCheckAvailability(args, ctx);
          else if (name === 'bookAppointment') result = await handleBookAppointment(args, ctx);
          else if (name === 'cancelAppointment') result = await handleCancelAppointment(args, ctx);
          else if (name === 'rescheduleAppointment') result = await handleRescheduleAppointment(args, ctx);
          else if (name === 'myAppointments') result = await handleMyAppointments(args, ctx);
          else if (name === 'updateLeadInfo') result = await handleUpdateLeadInfo(args, ctx);
          else if (name === 'updateLeadMemory') result = await handleUpdateLeadMemory(args, ctx);
          else if (name === 'requestHumanAgent') result = await handleRequestHumanAgent(args, ctx);
          else if (name === 'generatePixCharge') result = await handleGeneratePixCharge(args, ctx);
          else result = { error: 'Ferramenta desconhecida' };

          return { name, response: result };
        } catch (err) {
          return { name, response: { error: err instanceof Error ? err.message : String(err) } };
        }
      }),
    );

    const functionResponses = toolResults.map((r) => ({ functionResponse: r }));
    response = await chat.sendMessage(functionResponses);

    totalInputTokens += response.response.usageMetadata?.promptTokenCount ?? 0;
    totalOutputTokens += response.response.usageMetadata?.candidatesTokenCount ?? 0;
  }

  const fullText = response.response.text() || '';
  const [replyPart, jsonPart] = fullText.split('---JSON---');
  const reply = replyPart ? replyPart.trim() : '';

  let heat_score = lead.heat_score;
  let status = lead.status;
  let summary = lead.summary ?? '';

  if (jsonPart) {
    try {
      const parsed = JSON.parse(jsonPart.trim());
      heat_score = parsed.heat_score ?? heat_score;
      status = parsed.status ?? status;
      summary = parsed.summary ?? summary;
    } catch (e) {
      console.warn('[AI Engine] JSON parse failed', e);
    }
  }

  return {
    reply,
    heat_score,
    status,
    summary,
    tokens_input: totalInputTokens,
    tokens_output: totalOutputTokens,
    tools_called: toolsCalled,
    model_used: modelUsed,
  };
}

/**
 * getSemanticKnowledge — Busca no Supabase conhecimento vetorial relevante
 * e ajusta embeddings do Gemini 768 para 1536 dimensões compatíveis com o banco.
 */
async function getSemanticKnowledge(companyId: string, query: string, admin: any): Promise<string> {
  try {
    if (!process.env.GOOGLE_AI_API_KEY) return '';
    const embedModel = genAI.getGenerativeModel({ model: 'text-embedding-005' });
    const result = await embedModel.embedContent(query);
    let values = result.embedding?.values;
    if (!values || values.length === 0) return '';
    
    // Ajusta para 1536 dimensões (pgvector VECTOR(1536) na tabela)
    if (values.length < 1536) {
      const padding = new Array(1536 - values.length).fill(0);
      values = [...values, ...padding];
    } else if (values.length > 1536) {
      values = values.slice(0, 1536);
    }
    
    const { data: matches, error } = await admin.rpc('match_knowledge', {
      p_company_id: companyId,
      p_embedding: values,
      p_match_threshold: 0.7,
      p_match_count: 3
    });

    if (error) {
      console.error('[RAG] match_knowledge RPC error:', error);
      return '';
    }

    if (matches && matches.length > 0) {
      const formatted = matches.map((m: any) => `- ${m.content}`).join('\n');
      return `\n## Informações de Suporte Encontradas (RAG)\nUse estes dados de FAQ e base de conhecimento se forem relevantes à dúvida do lead:\n${formatted}\n`;
    }
  } catch (err) {
    console.error('[RAG] Semantic search failed, fallback to none:', err);
  }
  return '';
}



export async function handleIncomingMessage(
  companyId: string,
  phone: string,
  senderName: string,
  messageText: string,
  providerMessageId?: string,
): Promise<void> {
  const admin = createAdminClient();
  const timer = createTimer();

  // 1. Atomic deduplication — INSERT with PK conflict means duplicate webhook.
  // Race-safe: PostgreSQL guarantees only one inserter wins.
  if (providerMessageId) {
    const { error: insErr } = await admin.from('processed_messages').insert({
      provider_message_id: providerMessageId,
      company_id: companyId,
      status: 'processing',
    });

    if (insErr) {
      // Unique violation = already being processed or completed by another worker.
      // Any other error: surface and abort to avoid blind retries.
      if ((insErr as any).code === '23505') {
        console.log(`[AI Engine] Mensagem ${providerMessageId} ja em processamento (race detectada). Ignorando.`);
        return;
      }
      console.error('[AI Engine] processed_messages insert failed:', insErr);
      return;
    }
  }

  // 2. Context loading
  const { data: company } = await admin.from('companies').select('*').eq('id', companyId).single();
  if (!company) throw new Error('Empresa nao encontrada');

  const { data: services } = await admin
    .from('services')
    .select('id, name, duration, price')
    .eq('company_id', companyId)
    .eq('active', true);

  const persona: PersonaConfig = {
    ...((company.persona_config as any) ?? {}),
    name: company.ai_name || (company.persona_config as any)?.name,
    tone: company.ai_tone || (company.persona_config as any)?.tone,
    ai_forbidden: company.ai_forbidden || (company.persona_config as any)?.ai_forbidden,
    realServices: (services as any[]) || [],
  };

  // 3. Lead upsert
  const { data: lead } = await admin
    .from('leads')
    .select('*')
    .eq('company_id', companyId)
    .eq('phone', phone)
    .maybeSingle();

  let activeLead: Lead;
  if (lead) {
    activeLead = lead as Lead;
    // Atomic lock acquisition: only succeeds if is_processing was false.
    // Two concurrent webhooks for the same lead cannot both win.
    const { data: locked } = await admin
      .from('leads')
      .update({ is_processing: true })
      .eq('id', activeLead.id)
      .eq('is_processing', false)
      .select('id')
      .maybeSingle();

    if (!locked) {
      console.warn(`[AI Engine] Lead ${phone} ja esta sendo processado (lock atomico). Abortando.`);
      if (providerMessageId) {
        await admin
          .from('processed_messages')
          .update({ status: 'error', error_message: 'lead lock contention' })
          .eq('provider_message_id', providerMessageId);
      }
      return;
    }
  } else {
    const { data: created } = await admin
      .from('leads')
      .insert({
        company_id: companyId,
        name: senderName,
        phone,
        channel: 'whatsapp',
        lead_memory: EMPTY_MEMORY,
        is_processing: true,
      })
      .select()
      .single();
    activeLead = created as Lead;
  }

  // v4: Testes A/B e Versionamento de Prompts (Cognitive Control)
  let activeVersionId: string | null = null;
  let activeVariantGroup: string | null = null;
  
  try {
    const { data: experiment } = await admin
      .from('prompt_experiments')
      .select('*, version_a:version_a_id(*), version_b:version_b_id(*)')
      .eq('company_id', companyId)
      .eq('status', 'active')
      .maybeSingle();

    if (experiment) {
      const leadHash = parseInt(activeLead.id.replace(/-/g, '').substring(0, 8), 16);
      const group = (leadHash % 100) < experiment.traffic_split ? 'A' : 'B';
      const selectedVersion = group === 'A' ? experiment.version_a : experiment.version_b;

      if (selectedVersion) {
        persona.name = selectedVersion.ai_name;
        persona.tone = selectedVersion.ai_tone;
        persona.extra_instructions = selectedVersion.system_instructions;
        persona.ai_forbidden = selectedVersion.ai_forbidden;
        activeVersionId = selectedVersion.id;
        activeVariantGroup = group;
        console.log(`[AI Engine] Experimento A/B ativo. Lead roteado para Grupo ${group} (Versao ${selectedVersion.version})`);
      }
    }
  } catch (err) {
    console.warn('[AI Engine] Falha ao carregar experimento A/B (tabela pode nao existir):', err);
  }

  // v4: RAG Semântico (Retrieval-Augmented Generation)
  try {
    const semanticContext = await getSemanticKnowledge(companyId, messageText, admin);
    if (semanticContext) {
      persona.extra_instructions = (persona.extra_instructions || '') + '\n' + semanticContext;
      console.log('[AI Engine] RAG Semantico injetado com sucesso.');
    }
  } catch (err) {
    console.warn('[AI Engine] Falha ao carregar RAG Semantico:', err);
  }

  const releaseLock = () =>
    admin.from('leads').update({ is_processing: false }).eq('id', activeLead.id);

  // 4. Billing gate
  const usage = await getCompanyUsage(companyId);
  if (usage.isLimitReached) {
    const fallback =
      'Ola! No momento estamos com alta demanda. Recebemos sua mensagem e um consultor humano entrara em contato em breve.';
    await sendWhatsAppMessage(phone, fallback, companyId);
    await releaseLock();
    return;
  }

  // 5. Persist incoming message + load history
  await admin
    .from('messages')
    .insert({ lead_id: activeLead.id, company_id: companyId, role: 'user', content: messageText });

  // Fetch last 20 for Gemini context (most recent, then reverse for chronological order)
  const { data: historyRaw } = await admin
    .from('messages')
    .select('*')
    .eq('lead_id', activeLead.id)
    .order('created_at', { ascending: false })
    .limit(20);
  const history = (historyRaw ?? []).reverse();

  // Reliable first-response check: query count directly, not from the windowed history
  const { count: assistantTotal } = await admin
    .from('messages')
    .select('*', { count: 'exact', head: true })
    .eq('lead_id', activeLead.id)
    .eq('role', 'assistant');

  if (activeLead.is_paused) {
    await releaseLock();
    return;
  }

  // 6. AI turn
  const historyList = history as Message[];
  const isNewConversation = (assistantTotal ?? 0) === 0;

  let aiResult: Awaited<ReturnType<typeof processLeadMessage>>;
  try {
    aiResult = await processLeadMessage(
      activeLead,
      historyList,
      messageText,
      companyId,
      persona,
      isNewConversation,
      usage.planType,
      usage.limits,
    );
  } catch (aiErr) {
    console.error('[AI Engine] processLeadMessage failed:', aiErr);
    await releaseLock();
    throw aiErr;
  }

  // 7. Deterministic scoring
  const { score: finalScore, reason: scoreReason } = validateAndNormalizeScore(
    aiResult.heat_score,
    activeLead.heat_score,
    activeLead.lead_memory || EMPTY_MEMORY,
    messageText,
  );

  // 8. Watermark — only on truly first assistant response, never repeated
  let finalReply = aiResult.reply;
  if (usage.limits.hasWatermark && isNewConversation) {
    // Single-fire: isNewConversation = assistantTotal === 0 (db-level check, not history window)
    finalReply += '\n\n_Atendimento via Agendra_ ✦';
  }

  const isShadowMode = activeLead.control_mode === 'shadow';

  const { data: sentMessage } = await admin
    .from('messages')
    .insert({
      lead_id: activeLead.id,
      company_id: companyId,
      role: 'assistant',
      content: finalReply,
      metadata: isShadowMode ? { is_draft: true } : null,
    })
    .select()
    .single();

  if (!isShadowMode) {
    await sendWhatsAppMessage(phone, finalReply, companyId);
  } else {
    console.log(`[AI Engine] Modo Shadow ativo para lead ${phone}. Mensagem persistida como rascunho (is_draft: true).`);
  }

  // 9. Update lead state
  const updatedMemory = appendScoreHistory(activeLead.lead_memory, finalScore, scoreReason);

  const leadPatch: any = {
    heat_score: finalScore,
    status: aiResult.status,
    summary: aiResult.summary,
    lead_memory: updatedMemory,
  };

  if (persona.auto_escalate && finalScore < (persona.escalation_threshold ?? 25)) {
    leadPatch.is_paused = true;
    await admin.from('messages').insert({
      lead_id: activeLead.id,
      company_id: companyId,
      role: 'note',
      content: `IA escalou para humano (score ${finalScore} abaixo do limite de ${persona.escalation_threshold}).`,
    });
  }

  await admin.from('leads').update(leadPatch).eq('id', activeLead.id);

  // 10. Release lock + mark processed BEFORE background tasks
  await admin
    .from('leads')
    .update({ is_processing: false, last_message_id: providerMessageId ?? null })
    .eq('id', activeLead.id);

  if (providerMessageId) {
    await admin
      .from('processed_messages')
      .update({ status: 'completed' })
      .eq('provider_message_id', providerMessageId);
  }

  // 11. Observability
  await persistAILog({
    company_id: companyId,
    lead_id: activeLead.id,
    message_id: sentMessage?.id ?? null,
    flow_type: null,
    tools_called: aiResult.tools_called,
    heat_score_before: activeLead.heat_score,
    heat_score_after: finalScore,
    score_validated_to: finalScore,
    score_delta: finalScore - activeLead.heat_score,
    latency_ms: timer(),
    model: aiResult.model_used,
    tokens_input: aiResult.tokens_input,
    tokens_output: aiResult.tokens_output,
    cost: null,
    retries: 0,
    error: null,
  });

  // 12. Background post-processing (P2 Analytics) — lock already released
  (async () => {
    try {
      // Load Shedding: If we used lite for the main reply, the system is degraded. Skip P2.
      if (aiResult.model_used === 'gemini-2.5-flash-lite') {
        console.log(`[AI Engine] ⚠️ Load Shedding: Pulando P2 Analytics para lead ${phone} devido a degradação.`);
        return;
      }

      const analytics = await processBackgroundAnalytics(
        historyList,
        messageText,
        finalReply,
        aiResult.tools_called || [],
        aiResult.summary
      );

      const { data: latestLead } = await admin
        .from('leads')
        .select('lead_memory')
        .eq('id', activeLead.id)
        .single();
      const currentMem = (latestLead?.lead_memory as any) ?? { ...EMPTY_MEMORY };

      const furtherUpdatedMem = {
        ...currentMem,
        services_mentioned: [
          ...new Set([...(currentMem.services_mentioned || []), ...(analytics.services || [])]),
        ],
        objections_raised: [
          ...new Set([...(currentMem.objections_raised || []), ...(analytics.objections || [])]),
        ],
        qualification_answers: {
          ...(currentMem.qualification_answers || {}),
          ...(analytics.answers || {}),
        },
      };

      await admin
        .from('leads')
        .update({ 
          lead_memory: furtherUpdatedMem, 
          summary: analytics.new_summary,
          last_sentiment: analytics.sentiment
        })
        .eq('id', activeLead.id);

      await admin.from('ai_decision_logs').insert({
        company_id: companyId,
        lead_id: activeLead.id,
        message_id: sentMessage?.id ?? null,
        intent_detected: analytics.intent_detected,
        sentiment_score: analytics.sentiment_score,
        urgency_detected: analytics.urgency_detected,
        objection_handled: analytics.objection_handled,
        rationale: analytics.rationale,
      });
      console.log('[AI Engine] Log cognitivo e de background gravado com sucesso.');

    } catch (e) {
      console.error('[AI Engine] Background analytics failed (non-critical):', e);
    }
  })();
}

export async function triggerAutoFollowUp(leadId: string): Promise<void> {
  const admin = createAdminClient();

  const { data: lead } = await admin
    .from('leads')
    .select('*, companies(*)')
    .eq('id', leadId)
    .single();

  if (!lead || lead.is_paused || lead.status === 'success' || lead.status === 'disqualified') return;

  // ── Plan gate: follow-up only for plans that allow it ──────────────────────
  try {
    const usage = await getCompanyUsage(lead.company_id);
    if (!usage.limits.hasFollowUp) {
      console.log(`[AI Engine] triggerAutoFollowUp bloqueado — plano ${usage.planType} nao inclui follow-up automatico. Lead: ${leadId}`);
      return;
    }
  } catch (billingErr) {
    console.error('[AI Engine] triggerAutoFollowUp: billing check failed, abortando por seguranca.', billingErr);
    return;
  }

  // Skip se lead já tem agendamento futuro ativo — sem necessidade de follow-up.
  const { count: activeBookings } = await admin
    .from('events')
    .select('id', { count: 'exact', head: true })
    .eq('lead_id', leadId)
    .neq('status', 'cancelled')
    .gte('start_time', new Date().toISOString());

  if ((activeBookings ?? 0) > 0) return;

  const company = lead.companies as any;
  const { data: messages } = await admin
    .from('messages')
    .select('*')
    .eq('lead_id', leadId)
    .order('created_at', { ascending: false })
    .limit(5);

  const lastMsg = messages?.[0];
  if (!lastMsg || lastMsg.role !== 'assistant') return;

  // Atomic claim: marca last_followup_at agora pra evitar disparo duplicado por crons concorrentes.
  // Se outro worker já fez follow-up nas últimas 48h, abortamos.
  const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  const { data: claimed } = await admin
    .from('leads')
    .update({ last_followup_at: new Date().toISOString() })
    .eq('id', leadId)
    .or(`last_followup_at.is.null,last_followup_at.lt.${fortyEightHoursAgo}`)
    .select('id')
    .maybeSingle();

  if (!claimed) return;

  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
  const memoryContext = mountContext(lead.lead_memory, lead.summary);

  const prompt = `Voce e ${company.ai_name || 'Agendra'}, assistente do(a) ${company.name}.
O lead ${lead.name} parou de responder apos nossa ultima mensagem.
Contexto: ${memoryContext}
Ultima mensagem enviada: "${lastMsg.content}"

Objetivo: Envie um follow-up curto (maximo 2 frases), gentil e sem pressao para ver se ele ainda tem interesse ou se ficou com alguma duvida. Nao use "Oi, voce esta ai?". Seja profissional e amigavel.

Mensagem de follow-up:`;

  try {
    const result = await model.generateContent(prompt);
    const followupText = result.response.text().trim().replace(/^"|"$/g, '');

    await sendWhatsAppMessage(lead.phone, followupText, lead.company_id);

    await admin.from('messages').insert({
      lead_id: lead.id,
      company_id: lead.company_id,
      role: 'assistant',
      content: followupText,
      metadata: { type: 'auto-followup' },
    });
  } catch (err) {
    console.error('[AI Engine] Follow-up failed:', err);
  }
}
