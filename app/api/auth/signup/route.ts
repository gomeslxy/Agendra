import { NextRequest, NextResponse } from "next/server";
import { randomInt } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/send";
import { verificationEmail } from "@/lib/email/templates/verification";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import { isPasswordCompromised, COMPROMISED_PASSWORD_MESSAGE } from "@/lib/auth/password-security";

function generateOtp(): string {
  // crypto.randomInt is CSPRNG — Math.random() is not safe for security tokens
  return String(randomInt(100000, 1000000));
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  
  if (!(await checkRateLimitAsync(`signup:${ip}`, 5, 60_000))) {
    return NextResponse.json({ error: "Muitas tentativas. Aguarde 1 minuto." }, { status: 429 });
  }

  let body: { email?: string; password?: string; companyName?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const companyName = typeof body.companyName === "string" ? body.companyName.trim() : "usuário";

  if (!email || !password || password.length < 8) {
    return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
  }

  // Leaked-password protection (HIBP). Reject known-compromised passwords at signup.
  if (await isPasswordCompromised(password)) {
    return NextResponse.json({ error: COMPROMISED_PASSWORD_MESSAGE }, { status: 400 });
  }

  const admin = createAdminClient();

  // 1. Create user via Admin API (Silent creation, no Supabase email)
  const { data: authUser, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: false, // Will confirm later in verify-otp
    user_metadata: {
      company_name: companyName,
      full_name: companyName,
    },
  });

  if (createError) {
    // If user already exists, check if they are unconfirmed and allow OTP recovery
    if (createError.message.includes("already registered") || createError.message.includes("already been registered")) {
      // Check if user is already confirmed using O(1) getUserByEmail
      const { data: userData, error: getErr } = await admin.auth.admin.getUserByEmail(email);
      if (!getErr && userData?.user?.email_confirmed_at) {
        return NextResponse.json({ error: "Este email já está cadastrado." }, { status: 400 });
      }

      const code = generateOtp();
          await admin
            .from("otp_codes")
            .update({ used: true })
            .eq("email", email)
            .eq("purpose", "signup")
            .eq("used", false);

          const { error: insertError } = await admin.from("otp_codes").insert({
            email,
            code,
            purpose: "signup",
          });

          if (insertError) {
            console.error("[api/auth/register] DB error for unconfirmed user:", insertError.message);
            return NextResponse.json({ error: "Erro interno" }, { status: 500 });
          }

          try {
            await sendEmail({
              to: email,
              subject: "Seu código de verificação Agendra",
              html: verificationEmail({ code, companyName }),
            });
          } catch (err) {
            console.error("[api/auth/register] Email error for unconfirmed user:", err);
            return NextResponse.json({ error: "Erro ao enviar email de verificação." }, { status: 500 });
          }

          return NextResponse.json({ ok: true, unconfirmed: true });
    }
    console.error("[api/auth/register] Create user error:", createError.message);
    return NextResponse.json({ error: "Erro ao criar conta." }, { status: 500 });
  }

  // 2. Generate and save OTP
  const code = generateOtp();
  await admin
    .from("otp_codes")
    .update({ used: true })
    .eq("email", email)
    .eq("purpose", "signup")
    .eq("used", false);

  const { error: insertError } = await admin.from("otp_codes").insert({
    email,
    code,
    purpose: "signup",
  });

  if (insertError) {
    console.error("[api/auth/register] DB error:", insertError.message);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }

  // 3. Send email via Resend
  try {
    await sendEmail({
      to: email,
      subject: "Seu código de verificação Agendra",
      html: verificationEmail({ code, companyName }),
    });
  } catch (err) {
    console.error("[api/auth/register] Email error:", err);
    // Even if email fails, user is created. We return error so they can try Resend.
    return NextResponse.json({ error: "Erro ao enviar email de verificação." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
