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
  type ToolContext,
} from './tools';
import { getCompanyUsage } from '@/lib/billing/limits';
import { persistAILog, createTimer } from '@/lib/ai/observability';
import { EMPTY_MEMORY, mountContext, summarizeConversation, extractRelevantFacts, appendScoreHistory } from './memory';
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

function buildSystemPrompt(persona: PersonaConfig, lead: Lead, memoryContext: string, isNewConversation: boolean): string {
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
}

export async function processLeadMessage(
  lead: Lead,
  history: Message[],
  newMessage: string,
  companyId: string,
  persona: PersonaConfig,
  isNewConversation: boolean,
): Promise<AIResult> {
  const memoryContext = mountContext(lead.lead_memory, lead.summary);

  const model = genAI.getGenerativeModel({
    model: MAIN_MODEL,
    systemInstruction: buildSystemPrompt(persona, lead, memoryContext, isNewConversation),
    tools: [toolDeclarations],
    toolConfig: { functionCallingConfig: { mode: FunctionCallingMode.AUTO } },
  });

  const ctx: ToolContext = { companyId, leadId: lead.id };
  let geminiHistory: Content[] = history
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => ({
      role: m.role === 'user' ? 'user' : 'model',
      parts: [{ text: m.content }],
    }));

  const firstUserIndex = geminiHistory.findIndex((h) => h.role === 'user');
  geminiHistory = firstUserIndex !== -1 ? geminiHistory.slice(firstUserIndex) : [];

  const chat = model.startChat({ history: geminiHistory });

  let iterations = 0;
  const MAX_ITERATIONS = 5;
  let response = await chat.sendMessage(newMessage);

  const toolsCalled: any[] = [];
  let totalInputTokens = response.response.usageMetadata?.promptTokenCount ?? 0;
  let totalOutputTokens = response.response.usageMetadata?.candidatesTokenCount ?? 0;

  while (iterations < MAX_ITERATIONS) {
    iterations++;
    const candidate = response.response.candidates?.[0];
    if (!candidate) break;

    const functionCalls = candidate.content.parts
      .filter((p) => p.functionCall)
      .map((p) => p.functionCall!);

    if (functionCalls.length === 0) break;

    const toolResults = await Promise.all(
      functionCalls.map(async (fc) => {
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
  };
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

  // 1. Deduplication
  if (providerMessageId) {
    const { data: existing } = await admin
      .from('processed_messages')
      .select('status')
      .eq('provider_message_id', providerMessageId)
      .maybeSingle();

    if (existing?.status === 'completed' || existing?.status === 'processing') {
      console.log(`[AI Engine] Mensagem ${providerMessageId} ja processada. Ignorando.`);
      return;
    }

    await admin.from('processed_messages').upsert({
      provider_message_id: providerMessageId,
      company_id: companyId,
      status: 'processing',
    });
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
    if (activeLead.is_processing) {
      console.warn(`[AI Engine] Lead ${phone} ja esta sendo processado. Abortando.`);
      return;
    }
    await admin.from('leads').update({ is_processing: true }).eq('id', activeLead.id);
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

  // 8. Watermark — only on truly first assistant response
  let finalReply = aiResult.reply;
  if (usage.limits.hasWatermark && isNewConversation) {
    finalReply += '\n\n Atendimento por Agendra';
  }

  const { data: sentMessage } = await admin
    .from('messages')
    .insert({
      lead_id: activeLead.id,
      company_id: companyId,
      role: 'assistant',
      content: finalReply,
    })
    .select()
    .single();

  await sendWhatsAppMessage(phone, finalReply, companyId);

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
    model: MAIN_MODEL,
    tokens_input: aiResult.tokens_input,
    tokens_output: aiResult.tokens_output,
    cost: null,
    retries: 0,
    error: null,
  });

  // 12. Background post-processing (memory/summary enrichment) — lock already released
  (async () => {
    try {
      const facts = await extractRelevantFacts(messageText);
      const newSummary = await summarizeConversation((history ?? []) as Message[], aiResult.summary);

      const { data: latestLead } = await admin
        .from('leads')
        .select('lead_memory')
        .eq('id', activeLead.id)
        .single();
      const currentMem = (latestLead?.lead_memory as any) ?? { ...EMPTY_MEMORY };

      const furtherUpdatedMem = {
        ...currentMem,
        services_mentioned: [
          ...new Set([...(currentMem.services_mentioned || []), ...(facts.services || [])]),
        ],
        objections_raised: [
          ...new Set([...(currentMem.objections_raised || []), ...(facts.objections || [])]),
        ],
        qualification_answers: {
          ...(currentMem.qualification_answers || {}),
          ...(facts.answers || {}),
        },
      };

      await admin
        .from('leads')
        .update({ lead_memory: furtherUpdatedMem, summary: newSummary })
        .eq('id', activeLead.id);
    } catch (e) {
      console.error('[AI Engine] Background enrichment failed (non-critical):', e);
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

  const company = lead.companies as any;
  const { data: messages } = await admin
    .from('messages')
    .select('*')
    .eq('lead_id', leadId)
    .order('created_at', { ascending: false })
    .limit(5);

  const lastMsg = messages?.[0];
  if (!lastMsg || lastMsg.role !== 'assistant') return;

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

    await admin.from('leads').update({ last_followup_at: new Date().toISOString() }).eq('id', lead.id);
  } catch (err) {
    console.error('[AI Engine] Follow-up failed:', err);
  }
}
