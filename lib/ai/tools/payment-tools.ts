import crypto from 'crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { BusinessRuleError } from '../error-sanitizer';
import type { ToolContext } from './types';

function assertFintechReady(): void {
  if (process.env.ENABLE_FINTECH !== 'true') {
    throw new BusinessRuleError('Fintech feature desativada.');
  }
}

export async function handleGeneratePixCharge(
  args: { service_id?: string; amount: number },
  ctx: ToolContext,
): Promise<{ message: string; transaction_id: string; pix_key: string }> {
  assertFintechReady();

  // P1-ENG-01: Bloquear geração mockada em produção sem gateway real configurado
  if (process.env.NODE_ENV === 'production' && process.env.PIX_GATEWAY_ENABLED !== 'true') {
    throw new BusinessRuleError(
      'Cobrança Pix automática não está habilitada no momento. Solicite o atendimento humano para pagamento.',
    );
  }

  const admin = createAdminClient();
  const suffix = crypto.randomBytes(2).toString('hex').toUpperCase();
  const pixKey =
    '00020101021226830014br.gov.bcb.pix2561api.agendra.site/v2/cobv/' +
    ctx.companyId.replace(/-/g, '').substring(0, 15) +
    '5802BR5920Agendra Tecnologia6009Sao Paulo62070503***6304' +
    suffix;

  const { data: tx, error } = await admin
    .from('transactions')
    .insert({
      company_id: ctx.companyId,
      lead_id: ctx.leadId,
      amount: args.amount,
      status: 'pending',
      pix_qrcode: pixKey,
      pix_image_url: null,
    })
    .select('id')
    .single();

  if (error || !tx) {
    throw new Error(`Falha ao criar cobrança Pix: ${error?.message ?? 'unknown'}`);
  }

  return {
    message: `Cobrança Pix de *R$ ${args.amount.toFixed(2)}* gerada com sucesso!\n\n*Pix Copia e Cola*:\n${pixKey}\n\n_Efetue o pagamento e a confirmação será automática._`,
    transaction_id: tx.id as string,
    pix_key: pixKey,
  };
}

export async function handleCheckPaymentStatus(
  args: { transaction_id: string },
  ctx: ToolContext,
): Promise<{ status: string; paid_at?: string | null; amount?: number; message: string }> {
  assertFintechReady();

  const admin = createAdminClient();

  const { data: tx, error } = await admin
    .from('transactions')
    .select('id, status, paid_at, amount')
    .eq('id', args.transaction_id)
    .eq('company_id', ctx.companyId)
    .maybeSingle();

  if (error || !tx) {
    return { status: 'not_found', message: 'Transação não encontrada.' };
  }

  const amountNum = Number(tx.amount);
  const statusStr = String(tx.status);
  const statusMsg =
    statusStr === 'paid'
      ? `Pagamento de R$ ${amountNum.toFixed(2)} confirmado! ✅ Confirme o agendamento.`
      : statusStr === 'pending'
        ? `Aguardando pagamento de R$ ${amountNum.toFixed(2)}. Lead ainda não pagou.`
        : `Pagamento com status: ${statusStr}.`;

  return {
    status: statusStr,
    paid_at: tx.paid_at as string | null,
    amount: amountNum,
    message: statusMsg,
  };
}
