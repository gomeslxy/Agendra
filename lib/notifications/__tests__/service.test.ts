import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isTimeInQuietHours, NotificationService } from '../service';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendEmail } from '@/lib/email/send';

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(),
}));

vi.mock('@/lib/email/send', () => ({
  sendEmail: vi.fn().mockResolvedValue(undefined),
}));

function mockSupabaseChain(data: any, error: any = null) {
  const chain: any = {};
  const returnSelf = () => chain;
  chain.select = returnSelf;
  chain.insert = returnSelf;
  chain.update = returnSelf;
  chain.delete = returnSelf;
  chain.eq = returnSelf;
  chain.neq = returnSelf;
  chain.gt = returnSelf;
  chain.gte = returnSelf;
  chain.lt = returnSelf;
  chain.lte = returnSelf;
  chain.in = returnSelf;
  chain.order = returnSelf;
  chain.limit = returnSelf;
  chain.single = vi.fn().mockResolvedValue({ data, error });
  chain.maybeSingle = vi.fn().mockResolvedValue({ data, error });
  return chain;
}

describe('Notifications Service & Evolution Rules', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('isTimeInQuietHours helper', () => {
    it('returns true when time falls in a simple range', () => {
      expect(isTimeInQuietHours('23:00', '22:00', '08:00')).toBe(true);
      expect(isTimeInQuietHours('02:00', '22:00', '08:00')).toBe(true);
      expect(isTimeInQuietHours('07:59', '22:00', '08:00')).toBe(true);
    });

    it('returns false when time is outside a simple range', () => {
      expect(isTimeInQuietHours('12:00', '22:00', '08:00')).toBe(false);
      expect(isTimeInQuietHours('08:01', '22:00', '08:00')).toBe(false);
      expect(isTimeInQuietHours('21:59', '22:00', '08:00')).toBe(false);
    });

    it('handles quiet hours range within same day correctly', () => {
      expect(isTimeInQuietHours('14:00', '13:00', '17:00')).toBe(true);
      expect(isTimeInQuietHours('18:00', '13:00', '17:00')).toBe(false);
    });
  });

  describe('NotificationService.sendNotification', () => {
    it('returns duplicate notification ID on deduplication hit', async () => {
      const mockFrom = vi.fn().mockImplementation((table: string) => {
        if (table === 'notifications') {
          return mockSupabaseChain({ id: 'dup-id-123' });
        }
        return mockSupabaseChain({});
      });

      (createAdminClient as any).mockReturnValue({
        from: mockFrom,
      });

      const res = await NotificationService.sendNotification({
        company_id: 'co-1',
        user_id: 'usr-1',
        type: 'lead_hot',
        title: 'Lead Quente',
        body: 'Lucas Gomes virou quente',
      });

      expect(res).toBe('dup-id-123');
      expect(mockFrom).toHaveBeenCalledWith('notifications');
    });

    it('creates notification and sends email if preferences are active', async () => {
      // Build chain mock
      const mockFrom = vi.fn().mockImplementation((table: string) => {
        if (table === 'notifications') {
          // First call is deduplication check: return null
          // Second call is insert: return new-id-999
          if (mockFrom.mock.calls.filter(c => c[0] === 'notifications').length === 1) {
            return mockSupabaseChain(null);
          }
          return mockSupabaseChain({ id: 'new-id-999' });
        }
        if (table === 'users') {
          return mockSupabaseChain({ email: 'lucas@example.com' });
        }
        if (table === 'user_notification_settings') {
          return mockSupabaseChain({
            email_enabled: true,
            in_app_enabled: true,
            whatsapp_enabled: false,
            enabled_types: ['lead_hot'],
            quiet_hours_enabled: false,
            quiet_hours_start: '22:00',
            quiet_hours_end: '08:00',
          });
        }
        return mockSupabaseChain({});
      });

      (createAdminClient as any).mockReturnValue({
        from: mockFrom,
      });

      const res = await NotificationService.sendNotification({
        company_id: 'co-1',
        user_id: 'usr-1',
        type: 'lead_hot',
        title: 'Lead Quente',
        body: 'Lucas Gomes virou quente',
      });

      expect(res).toBe('new-id-999');
      expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({
        to: 'lucas@example.com',
        subject: '[Agendra] Lead Quente',
      }));
    });

    it('sets delivery_status=pending and skips email if quiet hours are active and not critical', async () => {
      // Build chain mock
      const mockFrom = vi.fn().mockImplementation((table: string) => {
        if (table === 'notifications') {
          if (mockFrom.mock.calls.filter(c => c[0] === 'notifications').length === 1) {
            return mockSupabaseChain(null);
          }
          return mockSupabaseChain({ id: 'pending-id-888' });
        }
        if (table === 'users') {
          return mockSupabaseChain({ email: 'lucas@example.com' });
        }
        if (table === 'user_notification_settings') {
          return mockSupabaseChain({
            email_enabled: true,
            in_app_enabled: true,
            whatsapp_enabled: false,
            enabled_types: ['lead_hot'],
            quiet_hours_enabled: true,
            quiet_hours_start: '00:00',
            quiet_hours_end: '23:59',
          });
        }
        if (table === 'companies') {
          return mockSupabaseChain({ persona_config: { timezone: 'America/Sao_Paulo' } });
        }
        return mockSupabaseChain({});
      });

      (createAdminClient as any).mockReturnValue({
        from: mockFrom,
      });

      const res = await NotificationService.sendNotification({
        company_id: 'co-1',
        user_id: 'usr-1',
        type: 'lead_hot',
        title: 'Lead Quente',
        body: 'Lucas Gomes virou quente',
      });

      expect(res).toBe('pending-id-888');
      expect(sendEmail).not.toHaveBeenCalled();
    });
  });
});
