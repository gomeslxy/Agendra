"use server";

import { createClient, getUser, getCachedUserProfile } from "@/lib/supabase/server";
import ExcelJS from "exceljs";

export async function exportReportsXlsx(): Promise<string> {
  const user = await getUser();
  if (!user) throw new Error("Unauthorized");
  
  const profile = await getCachedUserProfile(user.id);
  const companyId = profile?.memberships?.[0]?.company_id;
  if (!companyId) throw new Error("No company found");

  const supabase = await createClient();
  const since90 = new Date();
  since90.setDate(since90.getDate() - 90);

  const [
    { data: company },
    { data: leads }, 
    { data: events }, 
    { data: messages }
  ] = await Promise.all([
    supabase.from("companies").select("name").eq("id", companyId).single(),
    supabase.from("leads").select("*").eq("company_id", companyId).gte("created_at", since90.toISOString()),
    supabase.from("events").select("*").eq("company_id", companyId).gte("created_at", since90.toISOString()),
    supabase.from("messages").select("*").eq("company_id", companyId).gte("created_at", since90.toISOString())
  ]);

  const allLeads = leads ?? [];
  const allEvents = events ?? [];
  const allMessages = messages ?? [];
  
  const eventMap = new Map();
  allEvents.forEach((e) => {
    if (e.lead_id && (!eventMap.has(e.lead_id) || new Date(e.created_at) < new Date(eventMap.get(e.lead_id).created_at))) {
      eventMap.set(e.lead_id, e);
    }
  });

  const messageStats = new Map();
  allMessages.forEach((m) => {
    if (!m.lead_id) return;
    const stats = messageStats.get(m.lead_id) || { total: 0, ai: 0 };
    stats.total++;
    if (m.role === "assistant") stats.ai++;
    messageStats.set(m.lead_id, stats);
  });

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Agendra BI";
  workbook.lastModifiedBy = "Agendra Engine";
  workbook.created = new Date();
  workbook.modified = new Date();

  // ── SHEET 1: RESUMO EXECUTIVO ──
  const summarySheet = workbook.addWorksheet("Resumo Executivo", {
    views: [{ showGridLines: false }]
  });

  // Estilos
  const titleFont = { name: "Arial", size: 24, bold: true, color: { argb: "FF1A1A1A" } };
  const subtitleFont = { name: "Arial", size: 12, color: { argb: "FF666666" } };
  const headerFont = { name: "Arial", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
  const dataFont = { name: "Arial", size: 11, color: { argb: "FF333333" } };
  
  // Header
  summarySheet.mergeCells("A2:E2");
  const titleCell = summarySheet.getCell("A2");
  titleCell.value = "Relatório de Business Intelligence";
  titleCell.font = titleFont;

  summarySheet.mergeCells("A3:E3");
  const subtitleCell = summarySheet.getCell("A3");
  subtitleCell.value = `${company?.name || 'Sua Empresa'} | Últimos 90 dias (${since90.toLocaleDateString('pt-BR')} - ${new Date().toLocaleDateString('pt-BR')})`;
  subtitleCell.font = subtitleFont;

  // KPIs
  const totalLeads = allLeads.length;
  const hotLeads = allLeads.filter(l => l.status === "hot").length;
  const convertedLeads = allLeads.filter(l => l.status === "success" || l.status === "converted").length;
  const totalEventsCount = allEvents.length;
  
  let totalMsgs = 0, totalAiMsgs = 0;
  for (const stats of messageStats.values()) {
    totalMsgs += stats.total;
    totalAiMsgs += stats.ai;
  }
  const aiRatio = totalMsgs > 0 ? Math.round((totalAiMsgs / totalMsgs) * 100) : 0;
  const conversionRate = totalLeads > 0 ? Math.round((convertedLeads / totalLeads) * 100) : 0;

  summarySheet.getRow(6).values = ["Métricas Principais", "Valor"];
  summarySheet.getRow(6).font = headerFont;
  summarySheet.getRow(6).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2563EB" } }; // Blue-600
  
  const kpiData = [
    ["Total de Leads Captados", totalLeads],
    ["Leads Qualificados (Quentes)", hotLeads],
    ["Taxa de Conversão Real", `${conversionRate}%`],
    ["Total de Agendamentos", totalEventsCount],
    ["Eficiência da IA", `${aiRatio}% (${totalAiMsgs} msgs IA)`]
  ];

  kpiData.forEach((row, i) => {
    const r = summarySheet.getRow(7 + i);
    r.values = row;
    r.font = dataFont;
    r.getCell(1).border = { left: { style: 'thin', color: { argb: 'FFE5E7EB' } }, right: { style: 'thin', color: { argb: 'FFE5E7EB' } }, bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } } };
    r.getCell(2).border = { left: { style: 'thin', color: { argb: 'FFE5E7EB' } }, right: { style: 'thin', color: { argb: 'FFE5E7EB' } }, bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } } };
  });

  summarySheet.getColumn(1).width = 40;
  summarySheet.getColumn(2).width = 25;

  // ── SHEET 2: DADOS DOS LEADS ──
  const leadsSheet = workbook.addWorksheet("Base de Leads", {
    views: [{ state: 'frozen', ySplit: 1 }]
  });

  leadsSheet.columns = [
    { header: "Nome", key: "name", width: 25 },
    { header: "Telefone", key: "phone", width: 20 },
    { header: "Status", key: "status", width: 15 },
    { header: "Canal", key: "channel", width: 15 },
    { header: "Heat Score", key: "heat_score", width: 12 },
    { header: "Data de Criação", key: "created_at", width: 20 },
    { header: "Agendou?", key: "scheduled", width: 12 },
    { header: "Data Agendamento", key: "schedule_date", width: 20 },
    { header: "Msgs Cliente", key: "client_msgs", width: 15 },
    { header: "Msgs IA", key: "ai_msgs", width: 15 },
    { header: "% IA", key: "ai_ratio", width: 10 },
    { header: "Resumo da IA", key: "summary", width: 50 },
  ];

  leadsSheet.getRow(1).font = headerFont;
  leadsSheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E293B" } }; // Slate-800

  allLeads.forEach(lead => {
    const event = eventMap.get(lead.id);
    const stats = messageStats.get(lead.id) || { total: 0, ai: 0 };
    const clientMsgs = stats.total - stats.ai;
    const leadAiRatio = stats.total > 0 ? Math.round((stats.ai / stats.total) * 100) : 0;
    
    // Status translation
    const statusMap: Record<string, string> = {
      new: "Novo", warm: "Morno", hot: "Quente", cold: "Frio", 
      success: "Convertido", converted: "Convertido"
    };

    leadsSheet.addRow({
      name: lead.name || "Desconhecido",
      phone: lead.phone || "-",
      status: statusMap[lead.status] || lead.status,
      channel: lead.channel || "whatsapp",
      heat_score: lead.heat_score || 0,
      created_at: new Date(lead.created_at).toLocaleString("pt-BR"),
      scheduled: event ? "Sim" : "Não",
      schedule_date: event ? new Date(event.created_at).toLocaleString("pt-BR") : "-",
      client_msgs: clientMsgs,
      ai_msgs: stats.ai,
      ai_ratio: `${leadAiRatio}%`,
      summary: lead.summary || "Sem resumo gerado"
    });
  });

  // Apply zebra striping to leads sheet
  leadsSheet.eachRow((row, rowNumber) => {
    if (rowNumber > 1) {
      row.font = dataFont;
      if (rowNumber % 2 === 0) {
        row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF9FAFB" } };
      }
    }
  });

  // Write to Base64 to return to client
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer).toString("base64");
}
