import { GoogleGenerativeAI } from '@google/generative-ai';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendWhatsAppMessage } from '@/lib/whatsapp/client';
import type { Lead, Message } from '@/lib/types/database';

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY!);

const SYSTEM_PROMPT = `Você é Agendra, uma assistente de IA especializada em qualificação de leads e agendamentos.
Tom: amigável, profissional, objetivo. Use o primeiro nome do lead. Seja concisa.

Ao analisar cada mensagem, você deve:
1. Responder ao lead de forma natural e útil
2. No FINAL da sua resposta, adicionar um bloco JSON separado por "---JSON---" com:
{
  "heat_score": <0-100>,
  "status": "cold" | "warm" | "hot" | "success",
  "summary": "<resumo de 1 linha da situação do lead>"
}

Critérios de heat_score:
- 0-30 (cold): apenas pesquisando, sem intenção clara
- 31-60 (warm): interesse demonstrado, buscando informações
- 61-85 (hot): intenção de compra/agendamento clara
- 86-100 (hot/success): pronto para fechar ou já fechou`;

interface AIResult {
  reply: string;
  heat_score: number;
  status: Lead['status'];
  summary: string;
}

export async function processLeadMessage(
  lead: Lead,
  history: Message[],
  newMessage: string,
): Promise<AIResult> {
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.0-flash',
    systemInstruction: SYSTEM_PROMPT,
  });

  const chat = model.startChat({
    history: history.map((m) => ({
      role: m.role === 'user' ? 'user' : 'model',
      parts: [{ text: m.content }],
    })),
  });

  const result = await chat.sendMessage(newMessage);
  const fullText = result.response.text();

  const [replyPart, jsonPart] = fullText.split('---JSON---');
  const reply = replyPart.trim();

  let heat_score = lead.heat_score;
  let status = lead.status;
  let summary = lead.summary ?? '';

  if (jsonPart) {
    try {
      const parsed = JSON.parse(jsonPart.trim());
      heat_score = typeof parsed.heat_score === 'number' ? parsed.heat_score : heat_score;
      status = parsed.status ?? status;
      summary = parsed.summary ?? summary;
    } catch {
      // Gemini didn't return valid JSON block — keep existing values
    }
  }

  return { reply, heat_score, status, summary };
}

export async function handleIncomingMessage(
  companyId: string,
  phone: string,
  senderName: string,
  messageText: string,
): Promise<void> {
  const admin = createAdminClient();

  // Upsert lead
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
    if (error || !created) throw new Error(`Failed to create lead: ${error?.message}`);
    lead = created as Lead;
  }

  // Persist incoming message
  await admin.from('messages').insert({
    lead_id: lead.id,
    company_id: companyId,
    role: 'user',
    content: messageText,
  });

  // Fetch conversation history (last 20 messages)
  const { data: history } = await admin
    .from('messages')
    .select('*')
    .eq('lead_id', lead.id)
    .order('created_at', { ascending: true })
    .limit(20);

  const { reply, heat_score, status, summary } = await processLeadMessage(
    lead,
    (history ?? []) as Message[],
    messageText,
  );

  // Update lead classification
  await admin
    .from('leads')
    .update({ heat_score, status, summary })
    .eq('id', lead.id);

  // Persist AI reply
  await admin.from('messages').insert({
    lead_id: lead.id,
    company_id: companyId,
    role: 'assistant',
    content: reply,
  });

  // Send reply via WhatsApp
  await sendWhatsAppMessage(phone, reply);
}
