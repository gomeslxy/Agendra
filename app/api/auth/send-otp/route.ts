import { NextRequest, NextResponse } from 'next/server';
import { randomInt } from 'crypto';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendEmail } from '@/lib/email/send';
import { verificationEmail } from '@/lib/email/templates/verification';
import { checkRateLimitAsync } from '@/lib/rate-limit';
import { getTrustedClientIp } from '@/lib/security/client-ip';
import { hashOtpCode } from '@/lib/auth/otp';
import { logError } from '@/lib/logging';

const SendOtpBodySchema = z.object({
  email: z.string().trim().toLowerCase().email('Email inválido'),
  companyName: z.string().trim().min(1).max(120).optional().default('usuário'),
});

function generateOtp(): string {
  return String(randomInt(100000, 1000000));
}

export async function POST(req: NextRequest) {
  const ip = getTrustedClientIp(req.headers);
  if (!(await checkRateLimitAsync(`send-otp:${ip}`, 20, 60_000))) {
    return NextResponse.json({ error: 'Muitas tentativas. Aguarde 1 minuto.' }, { status: 429 });
  }

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = SendOtpBodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Email inválido' }, { status: 400 });
  }

  const { email, companyName } = parsed.data;
  const admin = createAdminClient();

  // Rate limit: max 10 OTPs per email per 15 minutes
  const { count } = await admin
    .from('otp_codes')
    .select('id', { count: 'exact', head: true })
    .eq('email', email)
    .eq('purpose', 'signup')
    .gt('created_at', new Date(Date.now() - 15 * 60 * 1000).toISOString());

  if ((count ?? 0) >= 10) {
    return NextResponse.json(
      { error: 'Muitas tentativas. Aguarde 15 minutos.' },
      { status: 429 },
    );
  }

  // Invalidate previous codes for this email+purpose
  await admin
    .from('otp_codes')
    .update({ used: true })
    .eq('email', email)
    .eq('purpose', 'signup')
    .eq('used', false);

  const code = generateOtp();

  const { error: insertError } = await admin.from('otp_codes').insert({
    email,
    code: null,
    code_hash: hashOtpCode(code),
    purpose: 'signup',
  });

  if (insertError) {
    logError('[send-otp] DB error:', insertError.message);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }

  try {
    await sendEmail({
      to: email,
      subject: 'Seu código de verificação Agendra',
      html: verificationEmail({ code, companyName }),
    });
  } catch (err) {
    logError('[send-otp] Email error:', err);
    return NextResponse.json({ error: 'Erro ao enviar email' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
