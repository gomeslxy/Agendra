/**
 * Server-only helper for creating notifications.
 * Uses admin client to bypass RLS — call only from server actions / route handlers.
 */
import { createAdminClient } from '@/lib/supabase/admin';
import type { NotificationType, NotificationPriority } from '@/lib/types/database';

export interface CreateNotificationInput {
  company_id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  body: string;
  action_url?: string;
  metadata?: Record<string, unknown>;
  priority?: NotificationPriority;
}

/**
 * Creates a notification row. Returns the new notification id.
 * Fire-and-forget safe — errors are logged but do not throw.
 */
export async function createNotification(input: CreateNotificationInput): Promise<string | null> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
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
      })
      .select('id')
      .single();

    if (error) {
      console.error('[createNotification] error:', error.message);
      return null;
    }
    return data.id;
  } catch (err: any) {
    console.error('[createNotification] unexpected error:', err.message);
    return null;
  }
}

/**
 * Creates the same notification for multiple users (e.g. all members of a company).
 */
export async function createNotificationForUsers(
  users: Array<{ user_id: string }>,
  base: Omit<CreateNotificationInput, 'user_id'>
): Promise<void> {
  if (!users.length) return;
  try {
    const admin = createAdminClient();
    const rows = users.map(({ user_id }) => ({
      company_id: base.company_id,
      user_id,
      type: base.type,
      title: base.title,
      body: base.body,
      action_url: base.action_url ?? null,
      metadata: base.metadata ?? {},
      priority: base.priority ?? 'medium',
      read: false,
    }));
    const { error } = await admin.from('notifications').insert(rows);
    if (error) console.error('[createNotificationForUsers] error:', error.message);
  } catch (err: any) {
    console.error('[createNotificationForUsers] unexpected error:', err.message);
  }
}
