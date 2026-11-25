import { NextRequest, NextResponse } from 'next/server';
import { randomInt } from 'crypto';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendEmail } from '@/lib/email/send';
import { verificationEmail } from '@/lib/email/templates/verification';
import { checkRateLimitAsync } from '@/lib/rate-limit';
import { isPasswordCompromised, COMPROMISED_PASSWORD_MESSAGE } from '@/lib/auth/password-security';
import { getTrustedClientIp } from '@/lib/security/client-ip';
import { hashOtpCode } from '@/lib/auth/otp';
import { logError } from '@/lib/logging';

const SignupBodySchema = z.object({
  email: z.string().trim().toLowerCase().email('Dados inválidos'),
  password: z.string().min(8, 'Dados inválidos'),
  companyName: z.string().trim().min(1).max(120).optional().default('usuário'),
});

function generateOtp(): string {
  // crypto.randomInt is CSPRNG — Math.random() is not safe for security tokens
  return String(randomInt(100000, 1000000));
}

export async function POST(req: NextRequest) {
  const ip = getTrustedClientIp(req.headers);

  if (!(await checkRateLimitAsync(`signup:${ip}`, 5, 60_000))) {
    return NextResponse.json({ error: 'Muitas tentativas. Aguarde 1 minuto.' }, { status: 429 });
  }

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = SignupBodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 });
  }

  const { email, password, companyName } = parsed.data;

  // Leaked-password protection (HIBP). Reject known-compromised passwords at signup.
  if (await isPasswordCompromised(password)) {
    return NextResponse.json({ error: COMPROMISED_PASSWORD_MESSAGE }, { status: 400 });
  }

  const admin = createAdminClient();

  // 1. Create user via Admin API (Silent creation, no Supabase email)
  const { error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: false, // Will confirm later in verify-otp
    user_metadata: {
      company_name: companyName,
      full_name: companyName,
    },
  });

  if (createError) {
    // If user already exists, check if they are unconfirmed via indexed public.users lookup + getUserById
    if (
      createError.message.includes('already registered') ||
      createError.message.includes('already been registered')
    ) {
      const { data: userRow } = await admin
        .from('users')
        .select('id')
        .eq('email', email)
        .maybeSingle();

      if (userRow?.id) {
        const { data: authData, error: getErr } = await admin.auth.admin.getUserById(
          userRow.id as string,
        );
        if (!getErr && authData?.user?.email_confirmed_at) {
          return NextResponse.json({ error: 'Este email já está cadastrado.' }, { status: 400 });
        }
      }

      const code = generateOtp();
      await admin
        .from('otp_codes')
        .update({ used: true })
        .eq('email', email)
        .eq('purpose', 'signup')
        .eq('used', false);

      const { error: insertError } = await admin.from('otp_codes').insert({
        email,
        code: null,
        code_hash: hashOtpCode(code),
        purpose: 'signup',
      });

      if (insertError) {
        logError('[api/auth/register] DB error for unconfirmed user:', insertError.message);
        return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
      }

      try {
        await sendEmail({
          to: email,
          subject: 'Seu código de verificação Agendra',
          html: verificationEmail({ code, companyName }),
        });
      } catch (err) {
        logError('[api/auth/register] Email error for unconfirmed user:', err);
        return NextResponse.json({ error: 'Erro ao enviar email de verificação.' }, { status: 500 });
      }

      return NextResponse.json({ ok: true, unconfirmed: true });
    }
    logError('[api/auth/register] Create user error:', createError.message);
    return NextResponse.json({ error: 'Erro ao criar conta.' }, { status: 500 });
  }

  // 2. Generate and save OTP (SHA-256 hash only)
  const code = generateOtp();
  await admin
    .from('otp_codes')
    .update({ used: true })
    .eq('email', email)
    .eq('purpose', 'signup')
    .eq('used', false);

  const { error: insertError } = await admin.from('otp_codes').insert({
    email,
    code: null,
    code_hash: hashOtpCode(code),
    purpose: 'signup',
  });

  if (insertError) {
    logError('[api/auth/register] DB error:', insertError.message);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }

  // 3. Send email
  try {
    await sendEmail({
      to: email,
      subject: 'Seu código de verificação Agendra',
      html: verificationEmail({ code, companyName }),
    });
  } catch (err) {
    logError('[api/auth/register] Email error:', err);
    return NextResponse.json({ error: 'Erro ao enviar email de verificação.' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
