import { createAdminClient } from '@/lib/supabase/admin';
import type { NotificationType, NotificationPriority } from '@/lib/types/database';
import { sendEmail } from '@/lib/email/send';

export interface CreateNotificationInput {
  company_id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  body: string;
  action_url?: string;
  metadata?: Record<string, unknown>;
  priority?: NotificationPriority;
  idempotency_key?: string;
}

/**
 * Checks if a specific time is within a quiet hours range.
 * Time strings are in 'HH:MM' format.
 */
export function isTimeInQuietHours(timeStr: string, start: string, end: string): boolean {
  if (!start || !end) return false;
  const parseMinutes = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  };
  const current = parseMinutes(timeStr);
  const startMin = parseMinutes(start);
  const endMin = parseMinutes(end);

  if (startMin <= endMin) {
    return current >= startMin && current <= endMin;
  } else {
    // Quiet hours cross midnight (e.g. 22:00 to 08:00)
    return current >= startMin || current <= endMin;
  }
}

/**
 * Enterprise Notification Service
 */
export class NotificationService {
  /**
   * Dispatches a notification to a single user.
   * Enforces multi-tenancy, deduplication, user preferences, and quiet hours.
   */
  static async sendNotification(input: CreateNotificationInput): Promise<string | null> {
    try {
      const admin = createAdminClient();

      // 1. Deduplication (Idempotency) check
      // Avoid inserting duplicates created in the last 2 minutes
      const timeLimit = new Date(Date.now() - 2 * 60 * 1000).toISOString();
      const dupQuery = admin
        .from('notifications')
        .select('id')
        .eq('company_id', input.company_id)
        .eq('user_id', input.user_id)
        .eq('title', input.title)
        .eq('body', input.body)
        .gt('created_at', timeLimit);

      if (input.idempotency_key) {
        dupQuery.eq('idempotency_key', input.idempotency_key);
      }

      const { data: duplicate } = await dupQuery.limit(1).maybeSingle();
      if (duplicate) {
        console.log(`[NotificationService] Duplicate detected for user ${input.user_id}, skipping.`);
        return duplicate.id;
      }

      // 2. Fetch target user profile and notification settings
      const [userRes, settingsRes] = await Promise.all([
        admin.from('users').select('email').eq('id', input.user_id).single(),
        admin
          .from('user_notification_settings')
          .select('*')
          .eq('user_id', input.user_id)
          .eq('company_id', input.company_id)
          .maybeSingle()
      ]);

      const userEmail = userRes.data?.email;
      if (!userEmail) {
        console.warn(`[NotificationService] Target user ${input.user_id} has no email, aborting.`);
        return null;
      }

      // Default settings if none are configured yet
      const settings = settingsRes.data || {
        email_enabled: true,
        in_app_enabled: true,
        whatsapp_enabled: false,
        enabled_types: ['invite', 'member_joined', 'member_left', 'channel_error', 'payment_failed', 'lead_hot', 'system'],
        quiet_hours_enabled: false,
        quiet_hours_start: '22:00',
        quiet_hours_end: '08:00',
      };

      // Check if this type of notification is disabled by the user
      if (!settings.enabled_types.includes(input.type)) {
        console.log(`[NotificationService] Notification type ${input.type} disabled for user ${input.user_id}`);
        return null;
      }

      // 3. Evaluate Quiet Hours (Silent Window)
      let isSilent = false;
      const isCritical = ['payment_failed', 'invite'].includes(input.type);

      if (settings.quiet_hours_enabled && !isCritical) {
        // Resolve timezone (fallback to America/Sao_Paulo)
        const { data: company } = await admin
          .from('companies')
          .select('persona_config')
          .eq('id', input.company_id)
          .single();
        const tz = (company?.persona_config as any)?.timezone ?? 'America/Sao_Paulo';

        const fmt = new Intl.DateTimeFormat('pt-BR', {
          timeZone: tz,
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        });
        const localTimeStr = fmt.format(new Date());
        
        if (isTimeInQuietHours(localTimeStr, settings.quiet_hours_start, settings.quiet_hours_end)) {
          isSilent = true;
          console.log(`[NotificationService] Quiet hours active (${localTimeStr}) for user ${input.user_id}. Storing pending/silent.`);
        }
      }

      // If user disabled in-app notifications, don't write to DB
      if (!settings.in_app_enabled) {
        console.log(`[NotificationService] In-app notifications disabled for user ${input.user_id}`);
        return null;
      }

      // 4. Insert notification record
      const deliveryStatus = isSilent ? 'pending' : 'delivered';
      const { data: notif, error: insertErr } = await admin
        .from('notifications')
        .insert({
          company_id: input.company_id,
          user_id: input.user_id,
          type: input.type,
          title: input.title,
          body: input.body,
          action_url: input.action_url ?? null,
          metadata: input.metadata ?? {},
          priority: input.priority ?? 'medium',
          read: false,
          delivery_status: deliveryStatus,
          delivered_at: isSilent ? null : new Date().toISOString(),
          idempotency_key: input.idempotency_key ?? null,
        })
        .select('id')
        .single();

      if (insertErr || !notif) {
        console.error('[NotificationService] Database insert failed:', insertErr?.message);
        return null;
      }

      // 5. Send out-of-app dispatches if not silent
      if (!isSilent) {
        // Email Dispatch
        if (settings.email_enabled && userEmail) {
          try {
            await sendEmail({
              to: userEmail,
              subject: `[Agendra] ${input.title}`,
              html: `
                <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e4e4e7; rounded: 12px;">
                  <h2 style="color: #09090b; font-size: 18px; font-weight: bold;">${input.title}</h2>
                  <p style="color: #3f3f46; font-size: 14px; line-height: 1.5; margin-top: 12px;">${input.body}</p>
                  ${input.action_url ? `
                    <div style="margin-top: 24px;">
                      <a href="${process.env.NEXT_PUBLIC_APP_URL || 'https://www.agendra.site'}${input.action_url}" style="background-color: #2563eb; color: white; padding: 10px 16px; border-radius: 8px; text-decoration: none; font-size: 12px; font-weight: bold;">
                        Visualizar no painel
                      </a>
                    </div>
                  ` : ''}
                  <hr style="border: 0; border-top: 1px solid #e4e4e7; margin-top: 32px;" />
                  <p style="color: #71717a; font-size: 11px;">Este é um e-mail automático enviado pelo Agendra. Você pode gerenciar suas preferências de notificação a qualquer momento no menu de configurações.</p>
                </div>
              `
            });
          } catch (mailErr: any) {
            console.error(`[NotificationService] Email delivery failed for ${userEmail}:`, mailErr.message);
            // Log error to notification row
            await admin
              .from('notifications')
              .update({ error_log: `Email delivery error: ${mailErr.message}` })
              .eq('id', notif.id);
          }
        }

        // WhatsApp Dispatch (if configured, we can implement it as a future hook, currently logged)
        if (settings.whatsapp_enabled) {
          console.log(`[NotificationService] WhatsApp user dispatch triggered for ${input.user_id} (Not implemented in this channel)`);
        }
      }

      return notif.id;
    } catch (err: any) {
      console.error('[NotificationService] Unexpected exception:', err.message);
      return null;
    }
  }

  /**
   * Send the same notification to multiple users.
   */
  static async sendNotificationToUsers(
    users: Array<{ user_id: string }>,
    base: Omit<CreateNotificationInput, 'user_id'>
  ): Promise<void> {
    for (const { user_id } of users) {
      // Use sequential send to correctly resolve individual settings/quiet hours
      await this.sendNotification({
        ...base,
        user_id,
      });
    }
  }

  /**
   * Releases pending notifications (runs periodically/cron to deliver quiet-hours held messages).
   */
  static async flushPendingNotifications(companyId: string): Promise<number> {
    try {
      const admin = createAdminClient();
      const { data: company } = await admin
        .from('companies')
        .select('persona_config')
        .eq('id', companyId)
        .single();
      const tz = (company?.persona_config as any)?.timezone ?? 'America/Sao_Paulo';

      // Check current local time
      const fmt = new Intl.DateTimeFormat('pt-BR', {
        timeZone: tz,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });
      const localTimeStr = fmt.format(new Date());

      // Fetch pending notifications
      const { data: pending, error } = await admin
        .from('notifications')
        .select('id, user_id, type, title, body, action_url, metadata, priority')
        .eq('company_id', companyId)
        .eq('delivery_status', 'pending');

      if (error || !pending?.length) return 0;

      let released = 0;
      for (const n of pending) {
        const { data: settings } = await admin
          .from('user_notification_settings')
          .select('quiet_hours_enabled, quiet_hours_start, quiet_hours_end, email_enabled, whatsapp_enabled')
          .eq('user_id', n.user_id)
          .eq('company_id', companyId)
          .maybeSingle();

        const quietStart = settings?.quiet_hours_start ?? '22:00';
        const quietEnd = settings?.quiet_hours_end ?? '08:00';
        const quietEnabled = settings?.quiet_hours_enabled ?? false;

        // If quiet hours are no longer active, release and deliver!
        if (!quietEnabled || !isTimeInQuietHours(localTimeStr, quietStart, quietEnd)) {
          // Update delivery status
          await admin
            .from('notifications')
            .update({
              delivery_status: 'delivered',
              delivered_at: new Date().toISOString(),
            })
            .eq('id', n.id);

          // Get target user email
          const { data: user } = await admin.from('users').select('email').eq('id', n.user_id).single();

          if (settings?.email_enabled && user?.email) {
            try {
              await sendEmail({
                to: user.email,
                subject: `[Agendra] [Lembrete] ${n.title}`,
                html: `<p>Este é o envio postergado da sua notificação:</p><p>${n.body}</p>`
              });
            } catch (err) {
              console.error(`[NotificationService] Delayed email release failed:`, err);
            }
          }
          released++;
        }
      }
      return released;
    } catch (err) {
      console.error('[NotificationService] Error flushing pending:', err);
      return 0;
    }
  }
}
