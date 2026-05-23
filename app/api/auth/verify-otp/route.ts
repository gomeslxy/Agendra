import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/send";
import { welcomeEmail } from "@/lib/email/templates/welcome";
import { checkRateLimitAsync } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!(await checkRateLimitAsync(`verify-otp:${ip}`, 15, 60_000))) {
    return NextResponse.json({ error: "Muitas tentativas. Aguarde um momento." }, { status: 429 });
  }

  let body: { email?: string; code?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const code = typeof body.code === "string" ? body.code.trim() : "";

  if (!email || !code) {
    return NextResponse.json({ error: "Email e código são obrigatórios" }, { status: 400 });
  }

  if (!/^\d{6}$/.test(code)) {
    return NextResponse.json({ error: "Código inválido" }, { status: 400 });
  }

  const admin = createAdminClient();

  await admin.rpc("cleanup_expired_otps");

  const { data: otpRow, error: fetchError } = await admin
    .from("otp_codes")
    .select("id, code, expires_at, used")
    .eq("email", email)
    .eq("purpose", "signup")
    .eq("used", false)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (fetchError || !otpRow) {
    return NextResponse.json({ error: "Código não encontrado ou expirado" }, { status: 400 });
  }

  if (new Date(otpRow.expires_at) < new Date()) {
    return NextResponse.json({ error: "Código expirado. Solicite um novo." }, { status: 400 });
  }

  if (otpRow.code !== code) {
    return NextResponse.json({ error: "Código incorreto" }, { status: 400 });
  }

  const { error: markUsedError } = await admin
    .from("otp_codes")
    .update({ used: true })
    .eq("id", otpRow.id);
  if (markUsedError) {
    console.error("[verify-otp] failed to mark OTP used:", markUsedError.message);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }

  // Look up user id via public.users table (indexed on email, no full table scan)
  const { data: userRow, error: getUserError } = await admin
    .from("users")
    .select("id")
    .eq("email", email)
    .maybeSingle();
  if (getUserError || !userRow) {
    return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 });
  }
  const authUserId = userRow.id as string;

  const { data: updatedUser, error: updateError } = await admin.auth.admin.updateUserById(authUserId, {
    email_confirm: true,
  });

  if (updateError) {
    console.error("[verify-otp] updateUser error:", updateError.message);
    return NextResponse.json({ error: "Erro ao confirmar conta" }, { status: 500 });
  }

  const companyName =
    (updatedUser?.user?.user_metadata?.company_name as string | undefined) ?? email.split("@")[0];
  void sendEmail({
    to: email,
    subject: "Bem-vindo ao Agendra!",
    html: welcomeEmail({ companyName }),
  }).catch((err) => console.error("[verify-otp] welcome email failed:", err));

  return NextResponse.json({ ok: true });
}
