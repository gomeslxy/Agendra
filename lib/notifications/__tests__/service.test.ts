import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isTimeInQuietHours, NotificationService, renderNotificationEmailHtml } from '../service';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendEmail } from '@/lib/email/send';
import { sendChannelMessage } from '@/lib/channels/send';

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(),
}));

vi.mock('@/lib/email/send', () => ({
  sendEmail: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/channels/send', () => ({
  sendChannelMessage: vi.fn().mockResolvedValue({ ok: true }),
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
  chain.then = (resolve: any) => resolve({ data, error });
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

  describe('renderNotificationEmailHtml helper', () => {
    it('renders HTML with title and body correctly', () => {
      const html = renderNotificationEmailHtml('Test Alert', 'Something happened', '/dashboard');
      expect(html).toContain('Test Alert');
      expect(html).toContain('Something happened');
      expect(html).toContain('/dashboard');
      expect(html).toContain('border-radius: 12px');
    });

    it('renders delayed heading and intro if isDelayed=true', () => {
      const html = renderNotificationEmailHtml('Test Alert', 'Something happened', null, true);
      expect(html).toContain('[Lembrete] Test Alert');
      expect(html).toContain('horário silencioso');
    });
  });

  describe('WhatsApp delivery on sendNotification', () => {
    it('sends WhatsApp notification if user has phone and settings.whatsapp_enabled is true', async () => {
      const mockFrom = vi.fn().mockImplementation((table: string) => {
        if (table === 'notifications') {
          if (mockFrom.mock.calls.filter(c => c[0] === 'notifications').length === 1) {
            return mockSupabaseChain(null);
          }
          return mockSupabaseChain({ id: 'wa-notif-123' });
        }
        if (table === 'users') {
          return mockSupabaseChain({ email: 'lucas@example.com', phone: '5511999999999' });
        }
        if (table === 'user_notification_settings') {
          return mockSupabaseChain({
            email_enabled: false,
            in_app_enabled: true,
            whatsapp_enabled: true,
            enabled_types: ['lead_hot'],
            quiet_hours_enabled: false,
          });
        }
        return mockSupabaseChain({});
      });

      (createAdminClient as any).mockReturnValue({ from: mockFrom });

      const res = await NotificationService.sendNotification({
        company_id: 'co-1',
        user_id: 'usr-1',
        type: 'lead_hot',
        title: 'Lead Quente',
        body: 'Lucas Gomes virou quente',
      });

      expect(res).toBe('wa-notif-123');
      expect(sendChannelMessage).toHaveBeenCalledWith(
        '5511999999999',
        expect.stringContaining('Lead Quente'),
        'co-1'
      );
    });

    it('captures WhatsApp delivery errors defensively and logs to notifications table', async () => {
      (sendChannelMessage as any).mockRejectedValueOnce(new Error('WhatsApp service down'));

      const mockUpdate = vi.fn().mockReturnValue(mockSupabaseChain({}));
      const mockFrom = vi.fn().mockImplementation((table: string) => {
        if (table === 'notifications') {
          if (mockFrom.mock.calls.filter(c => c[0] === 'notifications').length === 1) {
            return mockSupabaseChain(null);
          }
          // Insert query
          const chain = mockSupabaseChain({ id: 'wa-fail-notif-123' });
          // Mock update for this chain
          chain.update = mockUpdate;
          return chain;
        }
        if (table === 'users') {
          return mockSupabaseChain({ email: 'lucas@example.com', phone: '5511999999999' });
        }
        if (table === 'user_notification_settings') {
          return mockSupabaseChain({
            email_enabled: false,
            in_app_enabled: true,
            whatsapp_enabled: true,
            enabled_types: ['lead_hot'],
            quiet_hours_enabled: false,
          });
        }
        return mockSupabaseChain({});
      });

      (createAdminClient as any).mockReturnValue({ from: mockFrom });

      const res = await NotificationService.sendNotification({
        company_id: 'co-1',
        user_id: 'usr-1',
        type: 'lead_hot',
        title: 'Lead Quente',
        body: 'Lucas Gomes virou quente',
      });

      expect(res).toBe('wa-fail-notif-123');
      expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({
        error_log: expect.stringContaining('WhatsApp delivery error: WhatsApp service down'),
      }));
    });
  });

  describe('NotificationService.flushPendingNotifications', () => {
    it('releases pending notifications if quiet hours are no longer active', async () => {
      const mockUpdate = vi.fn().mockReturnValue(mockSupabaseChain({}));
      const mockFrom = vi.fn().mockImplementation((table: string) => {
        if (table === 'companies') {
          return mockSupabaseChain({ persona_config: { timezone: 'America/Sao_Paulo' } });
        }
        if (table === 'notifications') {
          // Select returns list of pending
          const chain = mockSupabaseChain([
            {
              id: 'pending-1',
              user_id: 'usr-1',
              type: 'lead_hot',
              title: 'Delayed Alert',
              body: 'Released body',
              action_url: '/settings',
            }
          ]);
          chain.update = mockUpdate;
          return chain;
        }
        if (table === 'user_notification_settings') {
          return mockSupabaseChain({
            quiet_hours_enabled: true,
            quiet_hours_start: '22:00',
            quiet_hours_end: '08:00',
            email_enabled: true,
            whatsapp_enabled: true,
          });
        }
        if (table === 'users') {
          return mockSupabaseChain({ email: 'lucas@example.com', phone: '5511999999999' });
        }
        return mockSupabaseChain({});
      });

      (createAdminClient as any).mockReturnValue({ from: mockFrom });

      const mockFormat = vi.fn().mockReturnValue('14:00');
      const spy = vi.spyOn(Intl, 'DateTimeFormat').mockImplementation(
        class {
          format = mockFormat;
        } as any
      );

      try {
        const releasedCount = await NotificationService.flushPendingNotifications('co-1');
        expect(releasedCount).toBe(1);
        expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({
          delivery_status: 'delivered',
        }));
        expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({
          to: 'lucas@example.com',
          subject: '[Agendra] [Lembrete] Delayed Alert',
        }));
        expect(sendChannelMessage).toHaveBeenCalledWith(
          '5511999999999',
          expect.stringContaining('Delayed Alert'),
          'co-1'
        );
      } finally {
        spy.mockRestore();
      }
    });
  });
});
