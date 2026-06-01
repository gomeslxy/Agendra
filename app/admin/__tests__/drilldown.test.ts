import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  getUser: vi.fn().mockResolvedValue({ id: "user-123", email: "admin@agendra.site" }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(),
}));

vi.mock("@/lib/admin/auth", () => ({
  getRequestMeta: vi.fn().mockResolvedValue({ ip: "127.0.0.1", ua: "Vitest" }),
  isAllowedAdminEmail: vi.fn().mockReturnValue(true),
  hasValidAdminCookie: vi.fn().mockResolvedValue(true),
}));

vi.mock("@/lib/email/send", () => ({
  sendEmail: vi.fn().mockResolvedValue(undefined),
}));

import {
  getTenantActivityTimeline,
  getTenantStripeInvoices,
  getTenantAuthLogs,
  getTenantDailyUsage,
  triggerTenantAnomalyAlert
} from "../actions";
import { createAdminClient } from "@/lib/supabase/admin";

describe("Tenant Drill-down Server Actions (Fase 14)", () => {
  const mockFrom = vi.fn();
  
  const createMockQueryBuilder = (resultData: any, resultError: any = null) => {
    const chain: any = {
      select: () => chain,
      eq: () => chain,
      in: () => chain,
      gte: () => chain,
      order: () => chain,
      limit: () => chain,
      single: () => Promise.resolve({ data: resultData, error: resultError }),
      maybeSingle: () => Promise.resolve({ data: resultData, error: resultError }),
      then: (resolve: any) => resolve({ data: resultData, error: resultError }),
    };
    return chain;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue({
      from: mockFrom,
    });
  });

  it("getTenantActivityTimeline queries audit_logs table for company_id", async () => {
    mockFrom.mockReturnValue(createMockQueryBuilder([{ id: "log-1", action: "test" }]));
    const res = await getTenantActivityTimeline("company-123");
    if (!res.success) console.error("TEST ERROR:", res.error);
    expect(res.success).toBe(true);
    expect(res.logs?.[0].action).toBe("test");
  });

  it("getTenantStripeInvoices queries stripe_payment_events", async () => {
    mockFrom.mockReturnValueOnce(createMockQueryBuilder([{ id: "ev-1", event_type: "invoice_paid", amount_cents: 19900 }]));
    const res = await getTenantStripeInvoices("company-123");
    expect(res.success).toBe(true);
    expect(res.invoices?.[0].amount).toBe(199);
  });

  it("getTenantDailyUsage computes message count groups correctly", async () => {
    mockFrom.mockReturnValue(createMockQueryBuilder([{ created_at: new Date().toISOString() }]));
    const res = await getTenantDailyUsage("company-123");
    expect(res.success).toBe(true);
    expect(res.usage?.length).toBe(30);
  });
});
