/**
 * API Route: /api/cron/reactivate
 *
 * Endpoint de cron-job para reativar leads frios.
 * Deve ser chamado diariamente via pg_cron ou Vercel Cron.
 * Seguro por chave secreta (CRON_SECRET).
 *
 * Lógica:
 * 1. Itera por todas as empresas com plano Business (hasFollowUp = true).
 * 2. Busca leads com status cold/warm que não respondem há X dias.
 * 3. Gera mensagem personalizada via Gemini.
 * 4. Envia via WhatsApp e registra em automation_events.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { sendWhatsAppMessage } from '@/lib/whatsapp/client';

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY!);

// Segurança: apenas crons autorizados
function isAuthorized(req: NextRequest): boolean {
  const secret = req.headers.get('x-cron-secret') ?? req.nextUrl.searchParams.get('secret');
  return secret === process.env.CRON_SECRET;
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();
  const results: Array<{ company: string; leads_processed: number; errors: number }> = [];

  try {
    // 1. Buscar empresas Business ativas
    const { data: companies } = await admin
      .from('companies')
      .select('id, name, ai_name, ai_tone, persona_config')
      .eq('plan_type', 'business');

    if (!companies?.length) {
      return NextResponse.json({ ok: true, message: 'Nenhuma empresa Business encontrada' });
    }

    for (const company of companies) {
      const pc = (company.persona_config ?? {}) as Record<string, any>;
      const inactivityDays: number = pc.reactivation_days ?? 5;
      const cutoffDate = new Date(Date.now() - inactivityDays * 24 * 60 * 60 * 1000).toISOString();
      let leadsProcessed = 0;
      let errors = 0;

      try {
        // 2. Buscar leads frios elegíveis
        const { data: leads } = await admin
          .from('leads')
          .select('id, name, phone, summary, lead_memory, heat_score, last_message_at')
          .eq('company_id', company.id)
          .not('status', 'in', '("success","disqualified")')
          .not('is_paused', 'eq', true)
          .lt('last_message_at', cutoffDate)
          .not('phone', 'is', null)
          .order('last_message_at', { ascending: true })
          .limit(20); // Máx 20 leads por empresa por execução

        if (!leads?.length) continue;

        // Buscar canal WhatsApp ativo da empresa
        const { data: channel } = await admin
          .from('channels')
          .select('provider_id')
          .eq('company_id', company.id)
          .eq('provider', 'whatsapp')
          .eq('status', 'active')
          .maybeSingle();

        if (!channel) continue;

        const aiName = company.ai_name ?? 'Agendra';
        const businessName = company.name ?? 'nossa empresa';
        const customHook = pc.reactivation_hook ?? '';

        for (const lead of leads) {
          try {
            // 3. Verificar se já foi enviada reativação recente (últimas 72h)
            const recentCutoff = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString();
            const { count: recentCount } = await admin
              .from('automation_events')
              .select('id', { count: 'exact', head: true })
              .eq('lead_id', lead.id)
              .eq('company_id', company.id)
              .eq('type', 'reactivation_sent')
              .gte('created_at', recentCutoff);

            if ((recentCount ?? 0) > 0) continue;

            // 4. Gerar mensagem personalizada via Gemini
            const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
            const firstName = lead.name?.split(' ')[0] ?? lead.name ?? 'cliente';
            const lastSummary = lead.summary ?? 'Demonstrou interesse em nossos serviços.';
            const daysSilent = Math.floor(
              (Date.now() - new Date(lead.last_message_at ?? Date.now()).getTime()) /
              (1000 * 60 * 60 * 24)
            );

            const prompt = `Você é ${aiName}, assistente de ${businessName}.
Escreva UMA mensagem curta e amigável de reativação para o lead "${firstName}".
Contexto: ${lastSummary}
Silêncio: ${daysSilent} dias sem resposta.
${customHook ? `Oferta/gancho especial: ${customHook}` : ''}
Regras:
- Máximo 2 frases curtas.
- Tom amigável, sem pressão.
- Use formato WhatsApp (sem markdown com ##, **, etc.).
- NÃO use "Olá" ou cumprimentos formais longos.
- Seja direto e pessoal.
Escreva APENAS a mensagem, sem aspas ou explicações adicionais.`;

            const result = await model.generateContent(prompt);
            const message = result.response.text().trim();

            if (!message) continue;

            // 5. Enviar via WhatsApp
            await sendWhatsAppMessage(lead.phone, message, company.id);

            // 6. Registrar na tabela messages
            await admin.from('messages').insert({
              lead_id: lead.id,
              company_id: company.id,
              role: 'assistant',
              content: message,
              metadata: { type: 'reactivation' },
            });

            // 7. Registrar em automation_events
            await admin.from('automation_events').insert({
              company_id: company.id,
              lead_id: lead.id,
              type: 'reactivation_sent',
              detail: `Reativação enviada para ${lead.name} após ${daysSilent} dias`,
            });

            // 8. Atualizar last_message_at do lead
            await admin
              .from('leads')
              .update({ last_message_at: new Date().toISOString() })
              .eq('id', lead.id)
              .eq('company_id', company.id);

            leadsProcessed++;
          } catch (leadErr: any) {
            console.error(`[Reactivation] Erro no lead ${lead.id}:`, leadErr.message);
            errors++;
          }
        }
      } catch (companyErr: any) {
        console.error(`[Reactivation] Erro na empresa ${company.id}:`, companyErr.message);
        errors++;
      }

      results.push({ company: company.id, leads_processed: leadsProcessed, errors });
    }

    return NextResponse.json({ ok: true, results });
  } catch (err: any) {
    console.error('[Reactivation Cron] Erro fatal:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// GET para ping de saúde
export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return NextResponse.json({ ok: true, message: 'Reactivation cron endpoint healthy' });
}
