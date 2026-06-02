import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Mock Dependencies ────────────────────────────────────────────────────────

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(),
}));

vi.mock("@/lib/email/send", () => ({
  sendEmail: vi.fn().mockResolvedValue({ id: "mock-email-id" }),
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimitAsync: vi.fn().mockResolvedValue(true),
}));

vi.mock("@/lib/auth/password-security", () => ({
  isPasswordCompromised: vi.fn().mockResolvedValue(false),
  COMPROMISED_PASSWORD_MESSAGE: "Compromised",
}));

// Import mock targets
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/send";
import { POST } from "../../../app/api/auth/signup/route";

describe("Signup API Route — Recovery of Unconfirmed Users", () => {
  const mockInsert = vi.fn();
  const mockUpdate = vi.fn();
  const mockEq = vi.fn();
  const mockFrom = vi.fn();
  const mockCreateUser = vi.fn();
  const mockListUsers = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup Supabase Database Mock Chains
    mockEq.mockReturnValue({ eq: mockEq });
    mockUpdate.mockReturnValue({ eq: mockEq });
    mockInsert.mockReturnValue({ error: null });
    mockFrom.mockReturnValue({
      update: mockUpdate,
      insert: mockInsert,
    });

    // Setup GoTrueAdminApi Mock
    (createAdminClient as any).mockReturnValue({
      from: mockFrom,
      auth: {
        admin: {
          createUser: mockCreateUser,
          listUsers: mockListUsers,
        },
      },
    });
  });

  function createMockRequest(body: any) {
    return new NextRequest("http://localhost/api/auth/signup", {
      method: "POST",
      body: JSON.stringify(body),
      headers: {
        "x-forwarded-for": "127.0.0.1",
      },
    });
  }

  it("Scenario A: Creates a new user successfully when email is completely new", async () => {
    mockCreateUser.mockResolvedValue({
      data: { user: { id: "new-user-id" } },
      error: null,
    });

    const req = createMockRequest({
      email: "newuser@example.com",
      password: "securepassword123",
      companyName: "Acme Corp",
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body).toEqual({ ok: true });
    expect(mockCreateUser).toHaveBeenCalled();
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "newuser@example.com",
        purpose: "signup",
      })
    );
    expect(sendEmail).toHaveBeenCalled();
  });

  it("Scenario B: Rejects signup with 400 when email is already registered and confirmed", async () => {
    mockCreateUser.mockResolvedValue({
      data: { user: null },
      error: { message: "already registered" },
    });

    mockListUsers.mockResolvedValue({
      data: {
        users: [
          {
            id: "existing-user-id",
            email: "confirmed@example.com",
            email_confirmed_at: "2026-05-30T00:00:00Z",
          },
        ],
        aud: "",
      },
      error: null,
    });

    const req = createMockRequest({
      email: "confirmed@example.com",
      password: "securepassword123",
      companyName: "Acme Corp",
    });

    const res = await POST(req);
    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body.error).toBe("Este email já está cadastrado.");
    expect(mockInsert).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("Scenario C: Automatically generates and resends a new OTP for an existing unconfirmed user", async () => {
    mockCreateUser.mockResolvedValue({
      data: { user: null },
      error: { message: "already registered" },
    });

    mockListUsers.mockResolvedValue({
      data: {
        users: [
          {
            id: "existing-unconfirmed-id",
            email: "unconfirmed@example.com",
            email_confirmed_at: null,
          },
        ],
        aud: "",
      },
      error: null,
    });

    const req = createMockRequest({
      email: "unconfirmed@example.com",
      password: "securepassword123",
      companyName: "Acme Corp",
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body).toEqual({ ok: true, unconfirmed: true });

    // Verifies that unconfirmed OTP sequence triggered
    expect(mockFrom).toHaveBeenCalledWith("otp_codes");
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "unconfirmed@example.com",
        purpose: "signup",
      })
    );
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "unconfirmed@example.com",
        subject: "Seu código de verificação Agendra",
      })
    );
  });
});
