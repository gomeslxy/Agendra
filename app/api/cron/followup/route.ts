import { createAdminClient } from "@/lib/supabase/admin";
import { triggerAutoFollowUp } from "@/lib/ai/engine";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const secret = searchParams.get("secret");

  if (process.env.NODE_ENV === "production" && secret !== process.env.CRON_SECRET) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const supabase = createAdminClient();
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

  try {
    // Buscar leads que pararam de responder há mais de 24h
    // E que não receberam follow-up nas últimas 48h (para evitar spam)
    const { data: leads, error } = await supabase
      .from("leads")
      .select("id")
      .eq("is_paused", false)
      .not("status", "in", '("success","disqualified")')
      .lt("updated_at", twentyFourHoursAgo)
      .or(`last_followup_at.is.null,last_followup_at.lt.${fortyEightHoursAgo}`)
      .limit(10); // Processar em lotes pequenos por segurança

    if (error) throw error;

    const results = [];
    for (const lead of (leads || [])) {
      try {
        await triggerAutoFollowUp(lead.id);
        results.push({ id: lead.id, status: 'success' });
      } catch (err: any) {
        results.push({ id: lead.id, status: 'error', error: err.message });
      }
    }

    return NextResponse.json({
      message: "Processamento de follow-ups concluído",
      processed: results.length,
      results
    });

  } catch (error: any) {
    console.error("[Cron Followup] Erro:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
