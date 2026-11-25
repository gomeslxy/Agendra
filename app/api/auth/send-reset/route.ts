import { NextRequest, NextResponse } from 'next/server';
import { randomInt } from 'crypto';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendEmail } from '@/lib/email/send';
import { passwordResetEmail } from '@/lib/email/templates/password-reset';
import { checkRateLimitAsync } from '@/lib/rate-limit';
import { getTrustedClientIp } from '@/lib/security/client-ip';
import { hashOtpCode } from '@/lib/auth/otp';
import { logError } from '@/lib/logging';

const SendResetBodySchema = z.object({
  email: z.string().trim().toLowerCase().email('Email inválido'),
});

function generateOtp(): string {
  // randomInt is CSPRNG — Math.random() is not safe for security tokens
  return String(randomInt(100000, 1000000));
}

export async function POST(req: NextRequest) {
  const ip = getTrustedClientIp(req.headers);
  if (!(await checkRateLimitAsync(`send-reset:${ip}`, 5, 60_000))) {
    return NextResponse.json({ error: 'Muitas tentativas. Aguarde 1 minuto.' }, { status: 429 });
  }

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = SendResetBodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Email inválido' }, { status: 400 });
  }

  const { email } = parsed.data;
  const admin = createAdminClient();

  // Rate limit: max 3 reset codes per email per 15 minutes
  const { count } = await admin
    .from('otp_codes')
    .select('id', { count: 'exact', head: true })
    .eq('email', email)
    .eq('purpose', 'password_reset')
    .gt('created_at', new Date(Date.now() - 15 * 60 * 1000).toISOString());

  if ((count ?? 0) >= 3) {
    return NextResponse.json(
      { error: 'Muitas tentativas. Aguarde 15 minutos.' },
      { status: 429 },
    );
  }

  // Check if user exists via public.users table (don't reveal whether email is registered — always return 200)
  const { data: userRow } = await admin
    .from('users')
    .select('id')
    .eq('email', email)
    .maybeSingle();

  if (userRow) {
    // Invalidate previous reset codes
    await admin
      .from('otp_codes')
      .update({ used: true })
      .eq('email', email)
      .eq('purpose', 'password_reset')
      .eq('used', false);

    const code = generateOtp();

    await admin.from('otp_codes').insert({
      email,
      code: null,
      code_hash: hashOtpCode(code),
      purpose: 'password_reset',
    });

    await sendEmail({
      to: email,
      subject: 'Código para redefinir sua senha — Agendra',
      html: passwordResetEmail({ code }),
    }).catch((err) => logError('[send-reset] email error:', err));
  }

  // Always return 200 to avoid email enumeration
  return NextResponse.json({ ok: true });
}
