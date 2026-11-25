import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { checkRateLimitAsync } from '@/lib/rate-limit';
import { isPasswordCompromised, COMPROMISED_PASSWORD_MESSAGE } from '@/lib/auth/password-security';
import { getTrustedClientIp } from '@/lib/security/client-ip';
import { hashOtpCode, OtpResetBodySchema } from '@/lib/auth/otp';
import { logError } from '@/lib/logging';

interface VerifyOtpRpcRow {
  valid: boolean;
  reason: string;
}

export async function POST(req: NextRequest) {
  const ip = getTrustedClientIp(req.headers);
  if (!(await checkRateLimitAsync(`reset-password:${ip}`, 15, 60_000))) {
    return NextResponse.json({ error: 'Muitas tentativas. Aguarde um momento.' }, { status: 429 });
  }

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = OtpResetBodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Dados inválidos' },
      { status: 400 },
    );
  }

  const { email, code, password } = parsed.data;

  // Leaked-password protection (HIBP). Reject known-compromised passwords on reset.
  if (await isPasswordCompromised(password)) {
    return NextResponse.json({ error: COMPROMISED_PASSWORD_MESSAGE }, { status: 400 });
  }

  const admin = createAdminClient();
  await admin.rpc('cleanup_expired_otps');

  const { data: rpcData, error: rpcError } = await admin.rpc('verify_otp_atomic', {
    p_email: email,
    p_purpose: 'password_reset',
    p_code_hash: hashOtpCode(code),
    p_max_attempts: 5,
  });

  if (rpcError) {
    logError('[reset-password] RPC error:', rpcError.message);
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
    if (result?.reason === 'mismatch') {
      return NextResponse.json({ error: 'Código incorreto' }, { status: 400 });
    }
    return NextResponse.json(
      { error: 'Código expirado ou inválido. Solicite um novo.' },
      { status: 400 },
    );
  }

  // Find user via public.users table
  const { data: userRow, error: getUserError } = await admin
    .from('users')
    .select('id')
    .eq('email', email)
    .maybeSingle();

  if (getUserError || !userRow) {
    return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });
  }

  const { error: updateError } = await admin.auth.admin.updateUserById(userRow.id as string, {
    password,
  });

  if (updateError) {
    logError('[reset-password] update error:', updateError.message);
    return NextResponse.json({ error: 'Erro ao atualizar senha' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
