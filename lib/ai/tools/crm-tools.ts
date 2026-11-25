import { createAdminClient } from '@/lib/supabase/admin';
import { handleUpdateLeadMemory } from '../memory';
import type { ToolContext } from './types';

export { handleUpdateLeadMemory };

export async function handleUpdateLeadInfo(
  args: { email?: string; city?: string; source?: string },
  ctx: ToolContext,
): Promise<{ updated: boolean; fields?: string[] }> {
  const admin = createAdminClient();
  const patch: { email?: string; city?: string; source?: string } = {};
  if (args.email) patch.email = args.email.trim().toLowerCase();
  if (args.city) patch.city = args.city.trim();
  if (args.source) patch.source = args.source.trim();

  if (Object.keys(patch).length === 0) return { updated: false };

  const { error } = await admin
    .from('leads')
    .update(patch)
    .eq('id', ctx.leadId)
    .eq('company_id', ctx.companyId);

  if (error) throw error;
  return { updated: true, fields: Object.keys(patch) };
}

export async function handleRequestHumanAgent(
  args: { reason?: string },
  ctx: ToolContext,
): Promise<{ message: string; paused: boolean }> {
  const admin = createAdminClient();

  // P0-ENG-06: NUNCA gravar status: 'manual' (viola LeadStatus); controle humano usa is_paused + control_mode.
  const { error } = await admin
    .from('leads')
    .update({
      is_paused: true,
      control_mode: 'manual',
      summary: `[TRANSFERÊNCIA] ${args.reason || 'Lead solicitou falar com humano.'}`,
    })
    .eq('id', ctx.leadId)
    .eq('company_id', ctx.companyId);

  if (error) throw error;

  return {
    message:
      'Entendido. Estou pausando meu atendimento e notificando um atendente humano para te ajudar. Por favor, aguarde um momento.',
    paused: true,
  };
}
