/**
 * Agendra — AI Engine v2 (Gemini 2.0 Flash + Tool Calling)
 *
 * Evolução do engine.ts original:
 *   - Persona dinâmica: carregada da tabela companies.persona_config
 *   - Tool Calling: checkAvailability, bookMeeting, updateLeadInfo
 *   - Loop agêntico: executa ferramentas até a IA decidir responder
 *   - Mantém o contrato original de handleIncomingMessage()
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
  type ToolContext,
} from './tools';
import { getCompanyUsage } from '@/lib/billing/limits';

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY!);

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

function buildSystemPrompt(persona: PersonaConfig, lead: Lead): string {
  const aiName = persona.name ?? 'Agendra';
  const businessName = persona.business_name ?? 'nossa empresa';
  const businessType = persona.business_type ?? 'negócio';
  const services = persona.services?.length
    ? persona.services.join(', ')
    : 'nossos serviços';
  const toneMap = {
    cold: "Formal: Profissional, breve e direto ao ponto. Evite emojis ou intimidade.",
    warm: "Amigável: Atencioso, profissional e equilibrado. Pode usar emojis moderadamente.",
    hot:  "Persuasivo: Entusiasta, ágil e próximo. Use emojis e linguagem persuasiva para converter.",
  };

  const selectedToneKey = (lead.conversation_tone || persona.tone) as keyof typeof toneMap;
  const tone = toneMap[selectedToneKey] ?? (persona.tone || 'amigável, profissional e objetivo');
  const timezone = persona.timezone ?? 'America/Sao_Paulo';
  const firstName = lead.name.split(' ')[0];

  const forbiddenBlock = persona.ai_forbidden?.trim()
    ? `\n## Frases Proibidas\nNUNCA use estas expressões na sua resposta: ${persona.ai_forbidden}.`
    : '';

  const extraBlock = persona.extra_instructions?.trim()
    ? `\n## Regras Adicionais do Negócio\n${persona.extra_instructions}`
    : '';

  const escalationThreshold = persona.escalation_threshold ?? 25;
  const escalationBlock = persona.auto_escalate
    ? `\n## Escalação\nSe o score do lead estiver abaixo de ${escalationThreshold}, encerre a conversa gentilmente dizendo que um atendente humano entrará em contato em breve. Não tente forçar o agendamento com leads frios.`
    : '';

  return `Você é ${aiName}, assistente de vendas inteligente do(a) ${businessName} (${businessType}).
Tom: ${tone}. Use sempre o primeiro nome do lead: "${firstName}". Seja concisa e direta.

Tipo de negócio: ${businessType}.
Serviços que você representa: ${services}.
Fuso horário do negócio: ${timezone}.

## Missão Principal
Qualificar o lead e agendar uma reunião/consulta. Conduza a conversa nessa direção de forma natural.

## Regras de Uso das Ferramentas
1. Quando o lead pedir horários disponíveis OU demonstrar intenção de agendar → use \`checkAvailability\`
2. Quando o lead CONFIRMAR explicitamente um horário específico → use \`bookMeeting\`
3. Quando o lead mencionar seu email, cidade ou como conheceu a empresa → use \`updateLeadInfo\` silenciosamente
4. NUNCA invente horários — sempre use \`checkAvailability\` primeiro
5. Após \`bookMeeting\` ser bem-sucedido, confirme o agendamento com entusiasmo e próximos passos
${forbiddenBlock}${extraBlock}${escalationBlock}

## Qualificação (inclua no bloco JSON ao final)
Após sua resposta textual, adicione SEMPRE um bloco separado por "---JSON---":
{
  "heat_score": <0-100>,
  "status": "cold" | "warm" | "hot" | "success",
  "summary": "<resumo de 1 linha da situação do lead>"
}

Critérios de heat_score:
- 0-30 (cold): apenas pesquisando, sem intenção clara
- 31-60 (warm): interesse demonstrado, quer saber mais
- 61-85 (hot): intenção de agendar clara
- 86-100 (success): reunião agendada ou negócio fechado`;
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface AIResult {
  reply: string;
  heat_score: number;
  status: Lead['status'];
  summary: string;
}

// ─── Core: processLeadMessage ─────────────────────────────────────────────────

export async function processLeadMessage(
  lead: Lead,
  history: Message[],
  newMessage: string,
  companyId: string,
  persona: PersonaConfig,
): Promise<AIResult> {
  const model = genAI.getGenerativeModel({
    model: 'gemini-3.1-flash-lite',
    systemInstruction: buildSystemPrompt(persona, lead),
    tools: [toolDeclarations],
    toolConfig: { functionCallingConfig: { mode: FunctionCallingMode.AUTO } },
  });

  console.log(`[AI Engine] 🧠 Processando mensagem para leadId=${lead.id} | model=${model.model}`);
  
  const ctx: ToolContext = { companyId, leadId: lead.id };

  // Converter histórico para o formato do Gemini
  // O Gemini EXIGE que o histórico comece com uma mensagem de 'user'
  let geminiHistory: Content[] = history
    .filter(m => m.role === 'user' || m.role === 'assistant') // Ignorar 'notes'
    .map((m) => ({
      role: m.role === 'user' ? 'user' : 'model',
      parts: [{ text: m.content }],
    }));

  // Encontrar o primeiro índice de mensagem 'user'
  const firstUserIndex = geminiHistory.findIndex(h => h.role === 'user');
  if (firstUserIndex !== -1) {
    geminiHistory = geminiHistory.slice(firstUserIndex);
  } else {
    // Se não houver nenhuma mensagem de usuário no histórico (improvável mas possível),
    // começamos com um histórico vazio e deixamos a newMessage ser a primeira.
    geminiHistory = [];
  }

  const chat = model.startChat({ history: geminiHistory });

  // ── Loop Agêntico ──────────────────────────────────────────────────────────
  // O Gemini pode chamar ferramentas múltiplas vezes antes de responder.
  // Limitamos a 5 iterações para prevenir loops infinitos.
  let response = await chat.sendMessage(newMessage);
  let iterations = 0;
  const MAX_ITERATIONS = 5;

  while (iterations < MAX_ITERATIONS) {
    iterations++;
    const candidate = response.response.candidates?.[0];

    if (!candidate) break;

    // Coletar function calls desta iteração
    const functionCalls = candidate.content.parts
      .filter((p) => p.functionCall)
      .map((p) => p.functionCall!);

    if (functionCalls.length === 0) break; // IA decidiu responder — sair do loop

    // Executar todas as ferramentas solicitadas
    const toolResults = await Promise.allSettled(
      functionCalls.map(async (fc) => {
        const name = fc.name;
        const args = (fc.args ?? {}) as Record<string, unknown>;

        console.log(`[AI Engine] 🔧 Tool call: ${name}`, args);

        let result: unknown;
        try {
          if (name === 'checkAvailability') {
            result = await handleCheckAvailability(
              args as { days_ahead?: number },
              ctx,
            );
          } else if (name === 'bookMeeting') {
            result = await handleBookMeeting(
              args as { start_time: string; end_time: string; title: string },
              ctx,
            );
          } else if (name === 'updateLeadInfo') {
            result = await handleUpdateLeadInfo(
              args as { email?: string; city?: string; source?: string },
              ctx,
            );
          } else {
            result = { error: `Ferramenta desconhecida: ${name}` };
          }

          console.log(`[AI Engine] ✅ Tool result: ${name}`, result);
          return { name, response: result };
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.error(`[AI Engine] ❌ Tool error: ${name}`, message);
          return { name, response: { error: message } };
        }
      }),
    );

    // Enviar resultados de volta ao Gemini
    const functionResponses = toolResults
      .filter((r) => r.status === 'fulfilled')
      .map((r) => {
        const { name, response: toolResponse } = (r as PromiseFulfilledResult<{ name: string; response: unknown }>).value;
        return {
          functionResponse: {
            name,
            response: toolResponse as Record<string, unknown>,
          },
        };
      });

    response = await chat.sendMessage(functionResponses);
  }

  // ── Extrair resposta final ─────────────────────────────────────────────────
  const fullText = response.response.text();
  const [replyPart, jsonPart] = fullText.split('---JSON---');
  const reply = replyPart.trim();

  let heat_score = lead.heat_score;
  let status = lead.status;
  let summary = lead.summary ?? '';

  if (jsonPart) {
    try {
      const parsed = JSON.parse(jsonPart.trim()) as {
        heat_score?: number;
        status?: Lead['status'];
        summary?: string;
      };
      heat_score = typeof parsed.heat_score === 'number' ? parsed.heat_score : heat_score;
      status = parsed.status ?? status;
      summary = parsed.summary ?? summary;
    } catch {
      // Gemini não retornou JSON válido — mantém valores existentes
    }
  }

  return { reply, heat_score, status, summary };
}

// ─── Entry Point: handleIncomingMessage ──────────────────────────────────────

export async function handleIncomingMessage(
  companyId: string,
  phone: string,
  senderName: string,
  messageText: string,
): Promise<void> {
  const admin = createAdminClient();

  // ── Carregar configuração da empresa (persona + Google tokens) ────────────
  const { data: company } = await admin
    .from('companies')
    .select('persona_config, google_refresh_token, google_calendar_id')
    .eq('id', companyId)
    .single();

  const persona = (company?.persona_config ?? {}) as PersonaConfig;

  // ── Upsert lead ──────────────────────────────────────────────────────────
  let lead: Lead;
  const { data: existing } = await admin
    .from('leads')
    .select('*')
    .eq('company_id', companyId)
    .eq('phone', phone)
    .maybeSingle();

  let isNewLead = false;
  if (existing) {
    lead = existing as Lead;
  } else {
    const { data: created, error } = await admin
      .from('leads')
      .insert({ company_id: companyId, name: senderName, phone, channel: 'whatsapp' })
      .select()
      .single();
    if (error || !created) throw new Error(`Falha ao criar lead: ${error?.message}`);
    lead = created as Lead;
    isNewLead = true;
  }

  // ── Verifica Limites de Billing ──────────────────────────────────────────
  const usage = await getCompanyUsage(companyId);
  
  if (usage.isLimitReached && isNewLead) {
    console.log(`[AI Engine] 🚨 Company ${companyId} atingiu o limite de ${usage.limits.maxLeads} leads. Pausando atendimento para novo lead.`);
    
    // Salva a mensagem recebida para não perder histórico
    await admin.from('messages').insert({
      lead_id: lead.id,
      company_id: companyId,
      role: 'user',
      content: messageText,
    });
    
    const fallbackMessage = "No momento todos os nossos atendentes estão ocupados. Seu contato foi registrado e retornaremos em breve!";
    
    await admin.from('messages').insert({
      lead_id: lead.id,
      company_id: companyId,
      role: 'assistant',
      content: fallbackMessage,
    });
    
    await sendWhatsAppMessage(phone, fallbackMessage);
    
    // Define o lead como 'paused' ou atualiza status para avisar no dashboard
    await admin.from('leads').update({ auto_respond: false, summary: 'Límite de plano excedido' }).eq('id', lead.id);
    return;
  }

  // ── Persistir mensagem recebida ──────────────────────────────────────────
  await admin.from('messages').insert({
    lead_id: lead.id,
    company_id: companyId,
    role: 'user',
    content: messageText,
  });

  // ── Histórico de conversa (últimas 20 mensagens) ─────────────────────────
  const { data: history } = await admin
    .from('messages')
    .select('*')
    .eq('lead_id', lead.id)
    .order('created_at', { ascending: true })
    .limit(20);

  // ── Processar com Gemini + Tools (Apenas se auto_respond estiver ativo) ───
  if (!lead.auto_respond) {
    console.log(`[AI Engine] 🔇 Automação desligada para o lead ${lead.id}. Apenas registrando mensagem.`);
    return;
  }

  const { reply, heat_score, status, summary } = await processLeadMessage(
    lead,
    (history ?? []) as Message[],
    messageText,
    companyId,
    persona,
  );

  // ── Watermark Logic ───────────────────────────────────────────────────────
  let finalReply = reply;
  const isFirstAssistantMessage = !history || history.filter(m => m.role === 'assistant').length === 0;
  
  if (usage.limits.hasWatermark && isFirstAssistantMessage) {
    finalReply += '\n\n⚡ _Powered by Agendra_';
  }

  // ── Atualizar classificação do lead ──────────────────────────────────────
  const leadPatch: Record<string, unknown> = { heat_score, status, summary };

  const autoEscalate = (persona as PersonaConfig).auto_escalate ?? false;
  const escalationThreshold = (persona as PersonaConfig).escalation_threshold ?? 25;
  const wasAutoRespond = lead.auto_respond;
  const shouldEscalate = autoEscalate && heat_score < escalationThreshold && wasAutoRespond;

  if (shouldEscalate) {
    leadPatch.auto_respond = false;
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
  await sendWhatsAppMessage(phone, finalReply);
}
