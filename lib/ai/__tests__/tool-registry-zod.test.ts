import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockHandleBookAppointment = vi.fn();

vi.mock('../tools/scheduling-tools', () => ({
  handleListServices: vi.fn(),
  handleGetAvailableSlots: vi.fn(),
  handleBookAppointment: (...args: unknown[]) => mockHandleBookAppointment(...args),
  handleCancelAppointment: vi.fn(),
  handleRescheduleAppointment: vi.fn(),
  handleMyAppointments: vi.fn(),
}));

vi.mock('@/lib/infra/redis', () => ({
  isAvailable: vi.fn().mockReturnValue(false),
  redis: { get: vi.fn(), set: vi.fn() },
}));

import {
  clearLocalToolIdempotencyCache,
  executeTool,
  getNeutralToolDefinitions,
} from '../tools/registry';
import { ToolValidationError } from '../error-sanitizer';

describe('Tool Registry — Zod validation, runtime flags & idempotency', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearLocalToolIdempotencyCache();
    delete process.env.ENABLE_FINTECH;
  });

  it('rejects non-UUID service_id in bookAppointment with ToolValidationError', async () => {
    await expect(
      executeTool(
        'bookAppointment',
        { service_id: 'not-a-uuid', start_time: '2026-12-01T14:00:00-03:00' },
        { companyId: 'comp-1', leadId: 'lead-1', traceId: 'trace-1' },
      ),
    ).rejects.toThrow(ToolValidationError);

    expect(mockHandleBookAppointment).not.toHaveBeenCalled();
  });

  it('rejects invalid ISO-8601 start_time without timezone offset', async () => {
    await expect(
      executeTool(
        'bookAppointment',
        {
          service_id: '11111111-1111-4111-8111-111111111111',
          start_time: 'amanhã às 14h',
        },
        { companyId: 'comp-1', leadId: 'lead-1', traceId: 'trace-2' },
      ),
    ).rejects.toThrow(ToolValidationError);
  });

  it('guarantees idempotency of mutating bookAppointment within the same traceId', async () => {
    const bookingPayload = { message: 'Confirmado!', event: { id: 'ev-1' } };
    mockHandleBookAppointment.mockResolvedValue(bookingPayload);

    const args = {
      service_id: '11111111-1111-4111-8111-111111111111',
      start_time: '2026-12-01T14:00:00-03:00',
    };
    const ctx = { companyId: 'comp-1', leadId: 'lead-1', traceId: 'trace-idem-1' };

    const first = await executeTool('bookAppointment', args, ctx);
    const second = await executeTool('bookAppointment', args, ctx);

    expect(first).toEqual(bookingPayload);
    expect(second).toEqual(bookingPayload);
    expect(mockHandleBookAppointment).toHaveBeenCalledTimes(1);
  });

  it('evaluates ENABLE_FINTECH dynamically at runtime', () => {
    const withoutFintech = getNeutralToolDefinitions().map((t) => t.name);
    expect(withoutFintech).not.toContain('generatePixCharge');

    process.env.ENABLE_FINTECH = 'true';
    const withFintech = getNeutralToolDefinitions().map((t) => t.name);
    expect(withFintech).toContain('generatePixCharge');
    expect(withFintech).toContain('checkPaymentStatus');
  });
});
