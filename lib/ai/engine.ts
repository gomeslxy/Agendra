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
}

function buildSystemPrompt(persona: PersonaConfig, lead: Lead): string {
  const aiName = persona.name ?? 'Agendra';
  const businessName = persona.business_name ?? 'nossa empresa';
  const businessType = persona.business_type ?? 'negócio';
  const services = persona.services?.join(', ') ?? 'nossos serviços';
  const tone = persona.tone ?? 'amigável, profissional e objetivo';
  const timezone = persona.timezone ?? 'America/Sao_Paulo';
  const firstName = lead.name.split(' ')[0];

  return `Você é ${aiName}, assistente de vendas inteligente do(a) ${businessName} (${businessType}).
Tom: ${tone}. Use sempre o primeiro nome do lead: "${firstName}". Seja concisa e direta.

Serviços que você representa: ${services}.
Fuso horário do negócio: ${timezone}.

## Missão Principal
Qualificar o lead e agendar uma reunião/consulta. Conduza a conversa nessa direção.

## Regras de Uso das Ferramentas
1. Quando o lead pedir horários disponíveis OU demonstrar intenção de agendar → use \`checkAvailability\`
2. Quando o lead CONFIRMAR explicitamente um horário específico → use \`bookMeeting\`
3. Quando o lead mencionar seu email, cidade ou como conheceu a empresa → use \`updateLeadInfo\` silenciosamente
4. NUNCA invente horários — sempre use \`checkAvailability\` primeiro
5. Após \`bookMeeting\` ser bem-sucedido, confirme o agendamento com entusiasmo e próximos passos

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
    model: 'gemini-2.0-flash',
    systemInstruction: buildSystemPrompt(persona, lead),
    tools: [toolDeclarations],
    toolConfig: { functionCallingConfig: { mode: FunctionCallingMode.AUTO } },
  });

  const ctx: ToolContext = { companyId, leadId: lead.id };

  // Converter histórico para o formato do Gemini
  const geminiHistory: Content[] = history.map((m) => ({
    role: m.role === 'user' ? 'user' : 'model',
    parts: [{ text: m.content }],
  }));

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

  // ── Processar com Gemini + Tools ─────────────────────────────────────────
  const { reply, heat_score, status, summary } = await processLeadMessage(
    lead,
    (history ?? []) as Message[],
    messageText,
    companyId,
    persona,
  );

  // ── Atualizar classificação do lead ──────────────────────────────────────
  await admin
    .from('leads')
    .update({ heat_score, status, summary })
    .eq('id', lead.id);

  // ── Persistir resposta da IA ─────────────────────────────────────────────
  await admin.from('messages').insert({
    lead_id: lead.id,
    company_id: companyId,
    role: 'assistant',
    content: reply,
  });

  // ── Enviar via WhatsApp ───────────────────────────────────────────────────
  await sendWhatsAppMessage(phone, reply);
}
