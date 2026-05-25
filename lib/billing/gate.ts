// lib/billing/gate.ts
import { getCompanyUsage } from '@/lib/billing/limits';
import { createAdminClient } from '@/lib/supabase/admin';

export async function enforceLimits(companyId: string) {
  const usage = await getCompanyUsage(companyId);
  const admin = createAdminClient();

  // Channels limit check
  const { count: channelCount } = await admin
    .from('channels')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .eq('status', 'active');
  if ((channelCount ?? 0) >= usage.limits.maxChannels) {
    throw new Error(
      `Seu plano ${usage.planType.toUpperCase()} permite até ${usage.limits.maxChannels} canal(is) ativo(s).`,
    );
  }
  
  // Calendars limit check
  const { count: calendarCount } = await admin
    .from('calendars')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', companyId);
  if ((calendarCount ?? 0) >= usage.limits.maxCalendars) {
    throw new Error(
      `Seu plano ${usage.planType.toUpperCase()} permite até ${usage.limits.maxCalendars} calendário(s) ativo(s).`,
    );
  }
  
  // Webhooks (hasWebhooks) limit check
  if (usage.limits.hasWebhooks === false) {
    // Assuming webhooks are stored in table webhook_subscriptions
    const { count: webhookCount } = await admin
      .from('webhook_subscriptions')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId);
    if ((webhookCount ?? 0) > 0) {
      throw new Error('Seu plano não permite webhooks externos.');
    }
  }
  // All checks passed
  return true;
}

/**
 * Enforces that the company plan allows connecting a specific channel provider type (e.g. instagram).
 */
export async function enforceChannelType(companyId: string, provider: string): Promise<boolean> {
  const usage = await getCompanyUsage(companyId);
  
  const allowed = usage.limits.allowedChannels || ['whatsapp'];
  
  if (!allowed.includes(provider as any)) {
    const formattedProvider = provider === 'instagram' ? 'Instagram DMs' : provider.toUpperCase();
    throw new Error(
      `Seu plano atual (${usage.planType.toUpperCase()}) não permite conectar canais do tipo ${formattedProvider}. Faça um upgrade para liberar esta funcionalidade! 🚀`
    );
  }
  
  return true;
}

