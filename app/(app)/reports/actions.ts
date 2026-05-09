"use server";

import { createClient, getUserProfile } from "@/lib/supabase/server";

export async function exportReportsCsv(): Promise<string> {
  const profile = await getUserProfile();
  if (!profile) throw new Error("Unauthorized");

  const companyId = profile.memberships?.[0]?.company_id;
  if (!companyId) throw new Error("No company");

  const supabase = await createClient();

  const [{ data: leads }, { data: events }] = await Promise.all([
    supabase
      .from("leads")
      .select("name, phone, email, channel, source, city, status, heat_score, created_at")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false }),
    supabase
      .from("events")
      .select("title, start_time, status, created_at")
      .eq("company_id", companyId)
      .order("start_time", { ascending: false }),
  ]);

  const leadsHeaders = ["Nome", "Telefone", "Email", "Canal", "Origem", "Cidade", "Status", "Score", "Criado em"];
  const leadsRows = (leads ?? []).map((l) => [
    l.name, l.phone, l.email ?? "", l.channel, l.source ?? "", l.city ?? "",
    l.status, String(l.heat_score), new Date(l.created_at).toLocaleString("pt-BR"),
  ]);

  const eventsHeaders = ["Título", "Início", "Status", "Criado em"];
  const eventsRows = (events ?? []).map((e) => [
    e.title ?? "", new Date(e.start_time).toLocaleString("pt-BR"),
    e.status ?? "", new Date(e.created_at).toLocaleString("pt-BR"),
  ]);

  function toCsvSection(headers: string[], rows: string[][]) {
    return [headers, ...rows]
      .map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
      .join("\n");
  }

  const csv =
    "=== LEADS ===\n" +
    toCsvSection(leadsHeaders, leadsRows) +
    "\n\n=== AGENDAMENTOS ===\n" +
    toCsvSection(eventsHeaders, eventsRows);

  // UTF-8 BOM
  return "﻿" + csv;
}
