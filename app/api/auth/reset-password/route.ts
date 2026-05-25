import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimitAsync } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!(await checkRateLimitAsync(`reset-password:${ip}`, 15, 60_000))) {
    return NextResponse.json({ error: "Muitas tentativas. Aguarde um momento." }, { status: 429 });
  }

  let body: { email?: string; code?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const code = typeof body.code === "string" ? body.code.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!email || !code || !password) {
    return NextResponse.json({ error: "Todos os campos são obrigatórios" }, { status: 400 });
  }

  if (!/^\d{6}$/.test(code)) {
    return NextResponse.json({ error: "Código inválido" }, { status: 400 });
  }

  if (password.length < 8) {
    return NextResponse.json({ error: "A senha deve ter ao menos 8 caracteres" }, { status: 400 });
  }

  const admin = createAdminClient();

  await admin.rpc("cleanup_expired_otps");

  const { data: otpRow } = await admin
    .from("otp_codes")
    .select("id, code, expires_at, used")
    .eq("email", email)
    .eq("purpose", "password_reset")
    .eq("used", false)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!otpRow || new Date(otpRow.expires_at) < new Date()) {
    return NextResponse.json({ error: "Código expirado ou inválido. Solicite um novo." }, { status: 400 });
  }

  if (otpRow.code !== code) {
    return NextResponse.json({ error: "Código incorreto" }, { status: 400 });
  }

  // Mark OTP as used first (prevent replay)
  const { error: markUsedError } = await admin
    .from("otp_codes")
    .update({ used: true })
    .eq("id", otpRow.id);
  if (markUsedError) {
    console.error("[reset-password] failed to mark OTP used:", markUsedError.message);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }

  // Find user via public.users table
  const { data: userRow, error: getUserError } = await admin
    .from("users")
    .select("id")
    .eq("email", email)
    .maybeSingle();

  if (getUserError || !userRow) {
    return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 });
  }

  const { error: updateError } = await admin.auth.admin.updateUserById(
    userRow.id as string,
    { password }
  );

  if (updateError) {
    console.error("[reset-password] update error:", updateError.message);
    return NextResponse.json({ error: "Erro ao atualizar senha" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
