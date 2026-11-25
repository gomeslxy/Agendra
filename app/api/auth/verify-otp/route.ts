import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendEmail } from '@/lib/email/send';
import { welcomeEmail } from '@/lib/email/templates/welcome';
import { checkRateLimitAsync } from '@/lib/rate-limit';
import { getTrustedClientIp } from '@/lib/security/client-ip';
import { hashOtpCode, OtpVerifyBodySchema } from '@/lib/auth/otp';
import { logError } from '@/lib/logging';

interface VerifyOtpRpcRow {
  valid: boolean;
  reason: string;
}

export async function POST(req: NextRequest) {
  const ip = getTrustedClientIp(req.headers);
  if (!(await checkRateLimitAsync(`verify-otp:${ip}`, 15, 60_000))) {
    return NextResponse.json({ error: 'Muitas tentativas. Aguarde um momento.' }, { status: 429 });
  }

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = OtpVerifyBodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Dados inválidos' },
      { status: 400 },
    );
  }

  const { email, code } = parsed.data;
  const admin = createAdminClient();

  await admin.rpc('cleanup_expired_otps');

  const { data: rpcData, error: rpcError } = await admin.rpc('verify_otp_atomic', {
    p_email: email,
    p_purpose: 'signup',
    p_code_hash: hashOtpCode(code),
    p_max_attempts: 5,
  });

  if (rpcError) {
    logError('[verify-otp] RPC error:', rpcError.message);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }

  const result = (Array.isArray(rpcData) ? rpcData[0] : rpcData) as VerifyOtpRpcRow | null;
  if (!result?.valid) {
    if (result?.reason === 'max_attempts') {
      return NextResponse.json(
        { error: 'Limite de tentativas excedido. Solicite um novo código.' },
        { status: 429 },
      );
    }
    if (result?.reason === 'expired') {
      return NextResponse.json({ error: 'Código expirado. Solicite um novo.' }, { status: 400 });
    }
    if (result?.reason === 'mismatch') {
      return NextResponse.json({ error: 'Código incorreto' }, { status: 400 });
    }
    return NextResponse.json({ error: 'Código não encontrado ou expirado' }, { status: 400 });
  }

  // Look up user id via public.users table (indexed on email, no full table scan)
  const { data: userRow, error: getUserError } = await admin
    .from('users')
    .select('id')
    .eq('email', email)
    .maybeSingle();
  if (getUserError || !userRow) {
    return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });
  }
  const authUserId = userRow.id as string;

  const { data: updatedUser, error: updateError } = await admin.auth.admin.updateUserById(
    authUserId,
    {
      email_confirm: true,
    },
  );

  if (updateError) {
    logError('[verify-otp] updateUser error:', updateError.message);
    return NextResponse.json({ error: 'Erro ao confirmar conta' }, { status: 500 });
  }

  const companyName =
    (updatedUser?.user?.user_metadata?.company_name as string | undefined) ?? email.split('@')[0];
  void sendEmail({
    to: email,
    subject: 'Bem-vindo ao Agendra!',
    html: welcomeEmail({ companyName }),
  }).catch((err) => logError('[verify-otp] welcome email failed:', err));

  return NextResponse.json({ ok: true });
}
