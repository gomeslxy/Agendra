import { NextRequest, NextResponse } from "next/server";
import { randomInt } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/send";
import { verificationEmail } from "@/lib/email/templates/verification";
import { checkRateLimitAsync } from "@/lib/rate-limit";

function generateOtp(): string {
  return String(randomInt(100000, 1000000));
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!(await checkRateLimitAsync(`send-otp:${ip}`, 20, 60_000))) {
    return NextResponse.json({ error: "Muitas tentativas. Aguarde 1 minuto." }, { status: 429 });
  }

  let body: { email?: string; companyName?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const companyName = typeof body.companyName === "string" ? body.companyName.trim() : "usuário";

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Email inválido" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Rate limit: max 10 OTPs per email per 15 minutes
  const { count } = await admin
    .from("otp_codes")
    .select("id", { count: "exact", head: true })
    .eq("email", email)
    .eq("purpose", "signup")
    .gt("created_at", new Date(Date.now() - 15 * 60 * 1000).toISOString());

  if ((count ?? 0) >= 10) {
    return NextResponse.json(
      { error: "Muitas tentativas. Aguarde 15 minutos." },
      { status: 429 },
    );
  }

  // Invalidate previous codes for this email+purpose
  await admin
    .from("otp_codes")
    .update({ used: true })
    .eq("email", email)
    .eq("purpose", "signup")
    .eq("used", false);

  const code = generateOtp();

  const { error: insertError } = await admin.from("otp_codes").insert({
    email,
    code,
    purpose: "signup",
  });

  if (insertError) {
    console.error("[send-otp] DB error:", insertError.message);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }

  try {
    await sendEmail({
      to: email,
      subject: "Seu código de verificação Agendra",
      html: verificationEmail({ code, companyName }),
    });
  } catch (err) {
    console.error("[send-otp] Email error:", err);
    return NextResponse.json({ error: "Erro ao enviar email" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
