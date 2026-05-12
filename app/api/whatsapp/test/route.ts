/**
 * WhatsApp Channel Health Check — POST /api/whatsapp/test
 *
 * Testa se o token do canal WhatsApp de uma empresa ainda é válido.
 * Atualiza `last_seen_at` / `last_error` no banco e retorna o resultado.
 *
 * Requer sessão autenticada (usa RLS via createClient).
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient, getUserProfile } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { validateWhatsAppToken } from "@/lib/whatsapp/validate";

export async function POST(_req: NextRequest) {
  try {
    const profile = await getUserProfile();
    if (!profile) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const companyId = profile.memberships?.[0]?.company_id;
    if (!companyId) {
      return NextResponse.json({ error: "No company" }, { status: 400 });
    }

    // Buscar canal ativo via admin (precisa ler o access_token que é sensível)
    const admin = createAdminClient();
    const { data: channel, error: channelError } = await admin
      .from("channels")
      .select("id, provider_id, access_token, status")
      .eq("company_id", companyId)
      .eq("provider", "whatsapp")
      .maybeSingle();

    if (channelError || !channel) {
      return NextResponse.json(
        { ok: false, error: "Nenhum canal WhatsApp configurado." },
        { status: 404 },
      );
    }

    if (!channel.access_token) {
      return NextResponse.json(
        { ok: false, error: "Token não encontrado no canal." },
        { status: 400 },
      );
    }

    // Chamar a Meta API para validar
    const result = await validateWhatsAppToken(channel.provider_id, channel.access_token);

    const now = new Date().toISOString();

    // Atualizar estado de saúde do canal
    await admin.from("channels").update({
      ...(result.ok
        ? { last_seen_at: now, last_error: null, status: "active" as const }
        : { last_error: result.error ?? "Token inválido", status: "error" as const }),
    }).eq("id", channel.id);

    return NextResponse.json({
      ok: result.ok,
      displayPhone: result.displayPhone,
      error: result.error,
      checkedAt: now,
    });
  } catch (err: any) {
    console.error("[WhatsApp Test] Error:", err.message);
    return NextResponse.json(
      { ok: false, error: "Erro interno ao testar conexão." },
      { status: 500 },
    );
  }
}
