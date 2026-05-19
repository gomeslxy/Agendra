import { createAdminClient } from "@/lib/supabase/admin";
import { triggerAutoFollowUp } from "@/lib/ai/engine";
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
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

  try {
    // Scope by company: only process companies with business plan (hasFollowUp=true).
    // Enforces company_id isolation — every leads query must filter by company_id.
    const { data: companies, error: coErr } = await supabase
      .from('companies')
      .select('id')
      .eq('plan_type', 'business')
      .eq('subscription_status', 'active');

    if (coErr) throw coErr;

    const results: { id: string; company_id: string; status: string; error?: string }[] = [];

    for (const company of companies ?? []) {
      const { data: leads, error } = await supabase
        .from('leads')
        .select('id')
        .eq('company_id', company.id)
        .eq('is_paused', false)
        .not('status', 'in', '("success","disqualified")')
        .lt('updated_at', twentyFourHoursAgo)
        .or(`last_followup_at.is.null,last_followup_at.lt.${fortyEightHoursAgo}`)
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
