/**
 * Server-only helper for creating notifications.
 * Uses admin client to bypass RLS — call only from server actions / route handlers.
 * Compatibility layer pointing to the new enterprise NotificationService.
 */
import { NotificationService, type CreateNotificationInput } from './service';

export type { CreateNotificationInput };

/**
 * Creates a notification row. Returns the new notification id.
 * Fire-and-forget safe — errors are logged but do not throw.
 */
export async function createNotification(input: CreateNotificationInput): Promise<string | null> {
  return NotificationService.sendNotification(input);
}

/**
 * Creates the same notification for multiple users (e.g. all members of a company).
 */
export async function createNotificationForUsers(
  users: Array<{ user_id: string }>,
  base: Omit<CreateNotificationInput, 'user_id'>
): Promise<void> {
  return NotificationService.sendNotificationToUsers(users, base);
}
