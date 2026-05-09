"use server";

import { createClient, getUserProfile } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { isValidUuid } from "@/lib/utils";

const VALID_CHANNELS = ["whatsapp", "instagram", "form"] as const;
type Channel = (typeof VALID_CHANNELS)[number];

export async function exportLeads(): Promise<string> {
  const profile = await getUserProfile();
  if (!profile) throw new Error("Unauthorized");

  const companyId = profile.memberships?.[0]?.company_id;
  if (!companyId) throw new Error("No company");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("leads")
    .select("name, phone, email, channel, source, city, status, heat_score, created_at")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);

  const headers = ["Nome", "Telefone", "Email", "Canal", "Origem", "Cidade", "Status", "Score", "Criado em"];
  const rows = (data ?? []).map((l) => [
    l.name, l.phone, l.email ?? "", l.channel, l.source ?? "", l.city ?? "",
    l.status, String(l.heat_score), new Date(l.created_at).toLocaleString("pt-BR"),
  ]);

  const csv = [headers, ...rows]
    .map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
    .join("\n");

  // UTF-8 BOM so Excel renders accents correctly
  return "﻿" + csv;
}

export async function createLead(formData: FormData) {
  const profile = await getUserProfile();
  if (!profile) throw new Error("Unauthorized");

  const companyId = profile.memberships?.[0]?.company_id;
  if (!companyId || !isValidUuid(companyId)) throw new Error("No company");

  const name = (formData.get("name") as string | null)?.trim() ?? "";
  const phone = (formData.get("phone") as string | null)?.trim() ?? "";
  const channel = (formData.get("channel") as string | null)?.trim() ?? "";
  const source = (formData.get("source") as string | null)?.trim() || null;
  const city = (formData.get("city") as string | null)?.trim() || null;
  const email = (formData.get("email") as string | null)?.trim() || null;

  if (!name || name.length > 200) throw new Error("Nome inválido (máx 200 chars)");
  if (!phone || phone.length > 30) throw new Error("Telefone inválido");
  if (!VALID_CHANNELS.includes(channel as Channel)) throw new Error("Canal inválido");
  if (source && source.length > 200) throw new Error("Source inválida");
  if (city && city.length > 100) throw new Error("Cidade inválida");
  if (email && (email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
    throw new Error("Email inválido");
  }

  const supabase = await createClient();
  const { error } = await supabase.from("leads").insert({
    company_id: companyId,
    name,
    phone,
    channel,
    source,
    city,
    email,
    status: "cold",
    heat_score: 0,
  });

  if (error) throw new Error(error.message);

  revalidatePath("/leads");
}
