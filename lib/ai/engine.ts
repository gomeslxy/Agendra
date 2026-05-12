/**
 * Agendra — AI Engine v3
 *
 * Core intelligence of the platform:
 * - Real Contextual Memory (LeadMemory + Summary)
 * - Deterministic Scoring (AI + Rule-based normalization)
 * - Strategic Tool Calling (Booking, Availability, Memory Updates)
 * - High-fidelity Observability (Cost, Tokens, Latency, Deltas)
 * - Post-turn Background Tasks (Auto-summarization, Fact extraction)
 */

import { GoogleGenerativeAI, type Content, FunctionCallingMode } from '@google/generative-ai';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendWhatsAppMessage } from '@/lib/whatsapp/client';
import type { Lead, Message } from '@/lib/types/database';
import {
  toolDeclarations,
  handleCheckAvailability,
  handleBookMeeting,
  handleUpdateLeadInfo,
  handleUpdateLeadMemory,
  type ToolContext,
} from './tools';
import { getCompanyUsage } from '@/lib/billing/limits';
import { persistAITrace, persistAILog, createTimer } from '@/lib/ai/observability';
import { mountContext, summarizeConversation, extractRelevantFacts, appendScoreHistory } from './memory';
import { validateAndNormalizeScore } from './scoring';

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY!);
const MAIN_MODEL = 'gemini-3.1-flash-lite';

// ─── System Prompt Builder ────────────────────────────────────────────────────

interface PersonaConfig {
  name?: string;
  business_name?: string;
  business_type?: string;
  services?: string[];
  tone?: string;
  greeting?: string;
  timezone?: string;
  slot_duration_minutes?: number;
  extra_instructions?: string;
  ai_forbidden?: string;
  auto_escalate?: boolean;
  escalation_threshold?: number;
}

function buildSystemPrompt(persona: PersonaConfig, lead: Lead, memoryContext: string): string {
  const aiName = persona.name ?? 'Agendra';
  const businessName = persona.business_name ?? 'nossa empresa';
  const businessType = persona.business_type ?? 'negócio';
  const services = persona.services?.length ? persona.services.join(', ') : 'nossos serviços';
  
  const toneMap = {
    cold: "Formal: Profissional, breve e direto ao ponto. Evite emojis ou intimidade.",
    warm: "Amigável: Atencioso, profissional e equilibrado. Pode usar emojis moderadamente.",
    hot:  "Persuasivo: Entusiasta, ágil e próximo. Use emojis e linguagem persuasiva para converter.",
  };

  const selectedToneKey = (lead.conversation_tone || persona.tone) as keyof typeof toneMap;
  const tone = toneMap[selectedToneKey] ?? (persona.tone || 'amigável, profissional e objetivo');
  const timezone = persona.timezone ?? 'America/Sao_Paulo';
  const firstName = lead.name.split(' ')[0];

  return `Você é ${aiName}, assistente de vendas estratégica do(a) ${businessName} (${businessType}).
Tom: ${tone}. Use o primeiro nome do lead: "${firstName}". Seja concisa, empática e focada em conversão.

Tipo de negócio: ${businessType}.
Serviços: ${services}.
Fuso horário: ${timezone}.

${memoryContext}

## Missão
Sua meta é qualificar o lead e agendar uma reunião. Se o lead estiver pronto, use as ferramentas de agenda. Se tiver dúvidas, responda com base nos serviços.

## Regras de Ouro
1. NUNCA invente horários. Use \`checkAvailability\`.
2. Use \`updateLeadMemory\` para registrar interesses, objeções ou respostas de qualificação.
3. Se o lead parecer desinteressado ou agressivo, use \`updateLeadMemory\` com \`event_type: "disqualified"\`.
4. Após sua resposta, adicione SEMPRE o bloco JSON para atualização de métricas.

---JSON---
{
  "heat_score": <0-100>,
  "status": "cold" | "warm" | "hot" | "success",
  "summary": "<resumo curtíssimo da última interação>"
}`;
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface AIResult {
  reply: string;
  heat_score: number;
  status: Lead['status'];
  summary: string;
  tokens_input: number;
  tokens_output: number;
  tools_called: any[];
}

// ─── Core: processLeadMessage ─────────────────────────────────────────────────

export async function processLeadMessage(
  lead: Lead,
  history: Message[],
  newMessage: string,
  companyId: string,
  persona: PersonaConfig,
): Promise<AIResult> {
  const timer = createTimer();
  const memoryContext = mountContext(lead.lead_memory, lead.summary);
  
  const model = genAI.getGenerativeModel({
    model: MAIN_MODEL,
    systemInstruction: buildSystemPrompt(persona, lead, memoryContext),
    tools: [toolDeclarations],
    toolConfig: { functionCallingConfig: { mode: FunctionCallingMode.AUTO } },
  });

  const ctx: ToolContext = { companyId, leadId: lead.id };
  let geminiHistory: Content[] = history
    .filter(m => m.role === 'user' || m.role === 'assistant')
    .map((m) => ({
      role: m.role === 'user' ? 'user' : 'model',
      parts: [{ text: m.content }],
    }));

  // Gemini history alignment
  const firstUserIndex = geminiHistory.findIndex(h => h.role === 'user');
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
          if (name === 'checkAvailability') result = await handleCheckAvailability(args, ctx);
          else if (name === 'bookMeeting') result = await handleBookMeeting(args, ctx);
          else if (name === 'updateLeadInfo') result = await handleUpdateLeadInfo(args, ctx);
          else if (name === 'updateLeadMemory') result = await handleUpdateLeadMemory(args, ctx);
          else result = { error: 'Ferramenta desconhecida' };

          return { name, response: result };
        } catch (err) {
          return { name, response: { error: err instanceof Error ? err.message : String(err) } };
        }
      })
    );

    const functionResponses = toolResults.map(r => ({ functionResponse: r }));
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
    tools_called: toolsCalled
  };
}

// ─── Entry Point: handleIncomingMessage ──────────────────────────────────────

export async function handleIncomingMessage(
  companyId: string,
  phone: string,
  senderName: string,
  messageText: string,
): Promise<void> {
  const admin = createAdminClient();
  const timer = createTimer();

  // 1. Context Loading
  const { data: company } = await admin
    .from('companies')
    .select('*')
    .eq('id', companyId)
    .single();

  if (!company) throw new Error('Empresa não encontrada');

  const persona: PersonaConfig = {
    ...((company.persona_config as any) ?? {}),
    name: company.ai_name || (company.persona_config as any)?.name,
    tone: company.ai_tone || (company.persona_config as any)?.tone,
    ai_forbidden: company.ai_forbidden || (company.persona_config as any)?.ai_forbidden,
  };

  // 2. Lead Upsert
  const { data: lead } = await admin
    .from('leads')
    .select('*')
    .eq('company_id', companyId)
    .eq('phone', phone)
    .maybeSingle();

  let activeLead: Lead;
  if (lead) {
    activeLead = lead as Lead;
  } else {
    const { data: created } = await admin
      .from('leads')
      .insert({ company_id: companyId, name: senderName, phone, channel: 'whatsapp', lead_memory: mountContext(null, null) })
      .select()
      .single();
    activeLead = created as Lead;
  }

  // 3. Billing Gate
  const usage = await getCompanyUsage(companyId);
  if (usage.isLimitReached) {
    const fallback = "Olá! No momento estamos com alta demanda. Recebemos sua mensagem e um consultor humano entrará em contato em breve.";
    await sendWhatsAppMessage(phone, fallback, companyId);
    return;
  }

  // 4. Persistence & History
  await admin.from('messages').insert({ lead_id: activeLead.id, company_id: companyId, role: 'user', content: messageText });
  const { data: history } = await admin
    .from('messages')
    .select('*')
    .eq('lead_id', activeLead.id)
    .order('created_at', { ascending: true })
    .limit(20);

  if (activeLead.is_paused) return;

  // 5. AI Turn
  const aiResult = await processLeadMessage(activeLead, (history ?? []) as Message[], messageText, companyId, persona);
  
  // 6. Deterministic Scoring
  const { score: finalScore, reason: scoreReason } = validateAndNormalizeScore(
    aiResult.heat_score,
    activeLead.heat_score,
    activeLead.lead_memory || mountContext(null, null) as any,
    messageText
  );

  // 7. Watermark & Response
  let finalReply = aiResult.reply;
  const isFirstResponse = (history ?? []).filter(m => m.role === 'assistant').length === 0;
  if (usage.limits.hasWatermark && isFirstResponse) {
    finalReply += '\n\n⚡ _Atendimento por Agendra_';
  }

  const { data: sentMessage } = await admin.from('messages').insert({
    lead_id: activeLead.id,
    company_id: companyId,
    role: 'assistant',
    content: finalReply,
  }).select().single();

  await sendWhatsAppMessage(phone, finalReply, companyId);

  // 8. Update Lead State
  const updatedMemory = appendScoreHistory(activeLead.lead_memory, finalScore, scoreReason);
  
  const leadPatch: any = {
    heat_score: finalScore,
    status: aiResult.status,
    summary: aiResult.summary,
    lead_memory: updatedMemory,
  };

  // Auto-escalation
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

  // 9. Observability (AILog)
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
    cost: null, // calculated in persistAILog
    retries: 0,
    error: null,
  });

  // 10. Post-turn Background Processing
  // Perform deeper extraction and summarization without blocking the response
  (async () => {
    try {
      const facts = await extractRelevantFacts(messageText);
      const newSummary = await summarizeConversation((history ?? []) as Message[], aiResult.summary);
      
      const { data: latestLead } = await admin.from('leads').select('lead_memory').eq('id', activeLead.id).single();
      const currentMem = latestLead?.lead_memory as any;
      
      const furtherUpdatedMem = {
        ...currentMem,
        services_mentioned: [...new Set([...(currentMem.services_mentioned || []), ...(facts.services || [])])],
        objections_raised: [...new Set([...(currentMem.objections_raised || []), ...(facts.objections || [])])],
        qualification_answers: { ...(currentMem.qualification_answers || {}), ...(facts.answers || {}) },
      };

      await admin.from('leads').update({
        lead_memory: furtherUpdatedMem,
        summary: newSummary
      }).eq('id', activeLead.id);
    } catch (e) {
      console.error('[AI Engine] Background processing failed', e);
    }
  })();
}
��─
  const leadPatch: Record<string, unknown> = { heat_score, status, summary };

  const autoEscalate = (persona as PersonaConfig).auto_escalate ?? false;
  const escalationThreshold = (persona as PersonaConfig).escalation_threshold ?? 25;
  const wasAutoRespond = !lead.is_paused;
  const shouldEscalate = autoEscalate && heat_score < escalationThreshold && wasAutoRespond;

  if (shouldEscalate) {
    leadPatch.is_paused = true;
    console.log(`[AI Engine] Auto-escalation triggered for lead ${lead.id} — score ${heat_score} < ${escalationThreshold}`);
  }

  await admin
    .from('leads')
    .update(leadPatch)
    .eq('id', lead.id);

  // ── Persistir resposta da IA ─────────────────────────────────────────────
  await admin.from('messages').insert({
    lead_id: lead.id,
    company_id: companyId,
    role: 'assistant',
    content: finalReply,
  });

  // ── Nota interna se escalou ───────────────────────────────────────────────
  if (shouldEscalate) {
    await admin.from('messages').insert({
      lead_id: lead.id,
      company_id: companyId,
      role: 'note',
      content: `IA pausou atendimento — score ${heat_score} (abaixo de ${escalationThreshold}). Aguardando atendente humano.`,
    });
  }

  // ── Enviar via WhatsApp ───────────────────────────────────────────────────
  await sendWhatsAppMessage(phone, finalReply, companyId);
}
