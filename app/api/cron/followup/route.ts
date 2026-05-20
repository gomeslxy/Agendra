import { createAdminClient } from "@/lib/supabase/admin";
import { triggerAutoFollowUp } from "@/lib/ai/engine";
import { getPlanLimits } from "@/lib/billing/plans";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = (req as any).headers?.get?.('authorization') ?? '';
    const querySecret = new URL(req.url).searchParams.get('secret') ?? '';
    if (authHeader !== `Bearer ${cronSecret}` && querySecret !== cronSecret) {
      return new NextResponse("Unauthorized", { status: 401 });
    }
  }

  const supabase = createAdminClient();

  try {
    // Fetch all active companies and filter by plan limits at runtime.
    // Enforces company_id isolation — every leads query must filter by company_id.
    const { data: companies, error: coErr } = await supabase
      .from('companies')
      .select('id, plan_type, persona_config')
      .eq('subscription_status', 'active');

    if (coErr) throw coErr;

    const results: { id: string; company_id: string; status: string; error?: string }[] = [];

    for (const company of companies ?? []) {
      if (!getPlanLimits(company.plan_type).hasFollowUp) continue;

      // delay configurável via persona_config.followup_delay_hours (padrão: 24h)
      const delayHours = (company.persona_config as any)?.followup_delay_hours ?? 24;
      const intervalHours = delayHours * 2; // reenvia só após 2x o delay
      const delayAgo = new Date(Date.now() - delayHours * 60 * 60 * 1000).toISOString();
      const intervalAgo = new Date(Date.now() - intervalHours * 60 * 60 * 1000).toISOString();

      const { data: leads, error } = await supabase
        .from('leads')
        .select('id')
        .eq('company_id', company.id)
        .eq('is_paused', false)
        .not('status', 'in', '("success","disqualified")')
        .lt('updated_at', delayAgo)
        .or(`last_followup_at.is.null,last_followup_at.lt.${intervalAgo}`)
        .limit(10);

      if (error) {
        console.error(`[Cron Followup] Erro ao buscar leads da empresa ${company.id}:`, error.message);
        continue;
      }

      for (const lead of leads ?? []) {
        try {
          await triggerAutoFollowUp(lead.id);
          results.push({ id: lead.id, company_id: company.id, status: 'success' });
        } catch (err: any) {
          results.push({ id: lead.id, company_id: company.id, status: 'error', error: err.message });
        }
      }
    }

    return NextResponse.json({
      message: 'Processamento de follow-ups concluído',
      processed: results.length,
      results,
    });

  } catch (error: any) {
    console.error('[Cron Followup] Erro:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
