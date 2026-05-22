import { createAdminClient } from '@/lib/supabase/admin';

const DEFAULT_HOURS = 24;

export async function activateTakeover(args: {
  companyId: string; leadId: string; userId: string; durationHours?: number;
}): Promise<void> {
  const admin = createAdminClient();
  const hours = args.durationHours ?? DEFAULT_HOURS;
  const until = new Date(Date.now() + hours * 3_600_000).toISOString();
  await admin.from('leads').update({
    is_paused: true, control_mode: 'manual',
    human_takeover_at: new Date().toISOString(),
    human_takeover_until: until, human_takeover_by: args.userId,
  }).eq('id', args.leadId).eq('company_id', args.companyId);

  await admin.from('automation_events').insert({
    company_id: args.companyId, lead_id: args.leadId,
    type: 'human_takeover_activated',
    detail: `IA pausada até ${until}`,
    payload: { until, by: args.userId, hours },
  }).then(() => {}, () => {});
}

export async function extendTakeoverOnHumanMessage(args: {
  companyId: string; leadId: string; userId: string; extendHours?: number;
}): Promise<void> {
  const admin = createAdminClient();
  const until = new Date(Date.now() + (args.extendHours ?? DEFAULT_HOURS) * 3_600_000).toISOString();
  await admin.from('leads').update({
    human_takeover_until: until, human_takeover_by: args.userId,
  }).eq('id', args.leadId).eq('company_id', args.companyId);
}

export function isUnderHumanTakeover(lead: { human_takeover_until?: string | null }): boolean {
  if (!lead.human_takeover_until) return false;
  return new Date(lead.human_takeover_until).getTime() > Date.now();
}

export async function deactivateTakeover(args: {
  companyId: string; leadId: string;
}): Promise<void> {
  const admin = createAdminClient();
  await admin.from('leads').update({
    is_paused: false, control_mode: 'auto',
    human_takeover_at: null, human_takeover_until: null, human_takeover_by: null,
  }).eq('id', args.leadId).eq('company_id', args.companyId);
}
