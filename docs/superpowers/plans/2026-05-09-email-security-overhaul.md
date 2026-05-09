# Email & Security Overhaul — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Supabase magic-link confirmation with a 6-digit OTP code flow, fix broken password reset, add beautiful branded HTML email templates via Resend, and harden the entire app against SQL injection, IDOR, and RLS tenant-leak vulnerabilities.

**Architecture:** Email sending centralised in `lib/email/` with Resend SDK; OTP verification stored in a Supabase table with TTL; password reset handled by a custom code flow (not Supabase magic link) to avoid redirect complexity. Security hardening touches server actions, API routes, and RLS policies in Supabase.

**Tech Stack:** Next.js 15 App Router, Supabase Auth + PostgreSQL, Resend (`resend` npm package), TypeScript, pnpm, shadcn/ui Glass components.

---

## Scope Overview

This plan is split into 4 independent sub-projects that can be executed in order:

1. **Task 1–2:** Resend setup + HTML email templates
2. **Task 3–4:** OTP verification on signup
3. **Task 5–6:** Password reset flow (custom OTP-based)
4. **Task 7–9:** Security audit + RLS hardening

---

## File Map

### New files
- `lib/email/resend.ts` — Resend client singleton
- `lib/email/templates/verification.tsx` — OTP email template (React Email or raw HTML)
- `lib/email/templates/password-reset.tsx` — Password reset email template
- `lib/email/templates/welcome.tsx` — Post-verification welcome email
- `lib/email/send.ts` — Typed `sendEmail()` wrapper
- `app/api/auth/send-otp/route.ts` — POST: generate + email OTP code
- `app/api/auth/verify-otp/route.ts` — POST: validate OTP, confirm user
- `app/api/auth/send-reset/route.ts` — POST: generate + email password reset OTP
- `app/api/auth/reset-password/route.ts` — POST: validate reset OTP, set new password
- `app/(auth)/verify/page.tsx` — OTP entry screen (post-signup)
- `app/(auth)/recuperar-senha/page.tsx` — "Enter your email" screen (replaces broken link)
- `app/(auth)/nova-senha/page.tsx` — "Enter reset OTP + new password" screen
- `supabase/migrations/003_otp_codes.sql` — `otp_codes` table + RLS + cleanup function

### Modified files
- `app/(auth)/signup/page.tsx` — redirect to `/verify?email=X` instead of showing success state
- `app/(auth)/login/page.tsx` — add "forgot password" link pointing to `/recuperar-senha`
- `middleware.ts` — add `/verify` and `/nova-senha` and `/recuperar-senha` to auth routes (no auth required)
- `app/(app)/leads/actions.ts` — add input validation/sanitization
- `app/(app)/agenda/actions.ts` — add UUID format check on `eventId` before delete
- `supabase/fix_rls_recursion.sql` — extend with `leads` DELETE policy + `events` DELETE policy (currently missing)

---

## Task 1: Install Resend and create email client

**Files:**
- Create: `lib/email/resend.ts`
- Create: `lib/email/send.ts`

- [ ] **Step 1: Install Resend**

```bash
pnpm add resend
```

Expected: resend appears in `package.json` dependencies.

- [ ] **Step 2: Create Resend singleton**

Create `lib/email/resend.ts`:

```typescript
import { Resend } from "resend";

if (!process.env.RESEND_API_KEY) {
  throw new Error("RESEND_API_KEY env var is required");
}

export const resend = new Resend(process.env.RESEND_API_KEY);
```

- [ ] **Step 3: Create typed sendEmail wrapper**

Create `lib/email/send.ts`:

```typescript
import { resend } from "./resend";

export type EmailPayload = {
  to: string;
  subject: string;
  html: string;
};

export async function sendEmail(payload: EmailPayload): Promise<void> {
  const { error } = await resend.emails.send({
    from: "Agendra <noreply@agendra.app>",
    to: payload.to,
    subject: payload.subject,
    html: payload.html,
  });

  if (error) {
    console.error("[sendEmail] Resend error:", error);
    throw new Error(`Failed to send email: ${error.message}`);
  }
}
```

- [ ] **Step 4: Add RESEND_API_KEY to .env.local**

```
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

Get the key from: https://resend.com/api-keys (create domain `agendra.app` or use `onboarding@resend.dev` for testing).

- [ ] **Step 5: Commit**

```bash
git add lib/email/resend.ts lib/email/send.ts package.json pnpm-lock.yaml
git commit -m "feat: add Resend email client and typed sendEmail wrapper"
```

---

## Task 2: HTML email templates (dark glassmorphism brand)

**Files:**
- Create: `lib/email/templates/verification.ts`
- Create: `lib/email/templates/password-reset.ts`
- Create: `lib/email/templates/welcome.ts`

> Note: These are plain TypeScript functions returning HTML strings (no React Email dependency needed). This avoids adding another build dependency.

- [ ] **Step 1: Create shared email base style helper**

Create `lib/email/templates/_base.ts`:

```typescript
export function emailWrapper(content: string): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Agendra</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      background-color: #0A0A0F;
      color: #E8E8F0;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 40px 16px;
    }
    .container {
      max-width: 480px;
      width: 100%;
      margin: 0 auto;
    }
    .card {
      background: rgba(255, 255, 255, 0.04);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 20px;
      padding: 40px 36px;
    }
    .logo {
      display: block;
      margin: 0 auto 28px;
      width: 120px;
    }
    h1 {
      font-size: 22px;
      font-weight: 700;
      letter-spacing: -0.02em;
      text-align: center;
      margin-bottom: 8px;
    }
    .subtitle {
      color: #9898B0;
      font-size: 14px;
      text-align: center;
      margin-bottom: 32px;
      line-height: 1.5;
    }
    .otp-box {
      background: rgba(99, 102, 241, 0.12);
      border: 1px solid rgba(99, 102, 241, 0.3);
      border-radius: 16px;
      padding: 20px;
      text-align: center;
      margin: 24px 0;
    }
    .otp-code {
      font-size: 36px;
      font-weight: 800;
      letter-spacing: 0.15em;
      color: #818CF8;
      font-family: 'Courier New', monospace;
    }
    .otp-label {
      font-size: 12px;
      color: #6B6B88;
      margin-top: 6px;
      font-family: monospace;
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }
    .cta-btn {
      display: block;
      background: linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%);
      color: #fff !important;
      text-decoration: none;
      border-radius: 12px;
      padding: 14px 24px;
      font-size: 15px;
      font-weight: 600;
      text-align: center;
      margin: 24px 0;
    }
    .footer {
      color: #4A4A66;
      font-size: 12px;
      text-align: center;
      margin-top: 28px;
      line-height: 1.6;
    }
    .divider {
      height: 1px;
      background: rgba(255,255,255,0.06);
      margin: 28px 0;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="card">
      <img
        src="https://agendra.app/assets/agendra-logo.svg"
        alt="Agendra"
        class="logo"
      />
      ${content}
    </div>
    <p class="footer" style="margin-top:20px;">
      © 2025 Agendra · Todos os direitos reservados<br/>
      Você está recebendo este email pois se cadastrou em agendra.app
    </p>
  </div>
</body>
</html>`;
}
```

- [ ] **Step 2: Create OTP verification template**

Create `lib/email/templates/verification.ts`:

```typescript
import { emailWrapper } from "./_base";

export function verificationEmail(opts: { code: string; companyName: string }): string {
  return emailWrapper(`
    <h1>Confirme seu email</h1>
    <p class="subtitle">
      Olá, ${opts.companyName}! Use o código abaixo para ativar sua conta Agendra.
    </p>

    <div class="otp-box">
      <div class="otp-code">${opts.code}</div>
      <div class="otp-label">Código de verificação · Válido por 15 minutos</div>
    </div>

    <div class="divider"></div>

    <p class="footer">
      Se você não criou uma conta, ignore este email com segurança.<br/>
      Nunca compartilhe este código com ninguém.
    </p>
  `);
}
```

- [ ] **Step 3: Create password reset template**

Create `lib/email/templates/password-reset.ts`:

```typescript
import { emailWrapper } from "./_base";

export function passwordResetEmail(opts: { code: string }): string {
  return emailWrapper(`
    <h1>Redefinir senha</h1>
    <p class="subtitle">
      Recebemos um pedido para redefinir a senha da sua conta Agendra.<br/>
      Use o código abaixo para criar uma nova senha.
    </p>

    <div class="otp-box">
      <div class="otp-code">${opts.code}</div>
      <div class="otp-label">Código de redefinição · Válido por 15 minutos</div>
    </div>

    <div class="divider"></div>

    <p class="footer">
      Se você não solicitou a redefinição, ignore este email.<br/>
      Sua senha atual permanece a mesma. Nunca compartilhe este código.
    </p>
  `);
}
```

- [ ] **Step 4: Create welcome email template**

Create `lib/email/templates/welcome.ts`:

```typescript
import { emailWrapper } from "./_base";

export function welcomeEmail(opts: { companyName: string }): string {
  return emailWrapper(`
    <h1>Bem-vindo ao Agendra! 🎉</h1>
    <p class="subtitle">
      ${opts.companyName}, sua conta está ativa. Comece a transformar leads em clientes agora.
    </p>

    <a href="https://agendra.app/inbox" class="cta-btn">
      Acessar minha conta →
    </a>

    <div class="divider"></div>

    <p class="footer">
      Qualquer dúvida, responda este email.<br/>
      Equipe Agendra
    </p>
  `);
}
```

- [ ] **Step 5: Commit**

```bash
git add lib/email/templates/
git commit -m "feat: add branded HTML email templates for OTP verification, password reset, and welcome"
```

---

## Task 3: OTP codes table + database migration

**Files:**
- Create: `supabase/migrations/003_otp_codes.sql`

- [ ] **Step 1: Write migration SQL**

Create `supabase/migrations/003_otp_codes.sql`:

```sql
-- ============================================================
-- Agendra — OTP Codes Table
-- Stores short-lived 6-digit codes for email verification
-- and password reset. Uses RLS + TTL cleanup.
-- ============================================================

create table if not exists public.otp_codes (
  id          uuid primary key default uuid_generate_v4(),
  email       text not null,
  code        text not null,
  purpose     text not null check (purpose in ('signup', 'password_reset')),
  used        boolean not null default false,
  expires_at  timestamptz not null default (now() + interval '15 minutes'),
  created_at  timestamptz not null default now()
);

-- Index for fast lookup by email + purpose
create index if not exists otp_codes_email_purpose_idx
  on public.otp_codes(email, purpose);

-- RLS: nobody reads OTP codes directly (only service role via API routes)
alter table public.otp_codes enable row level security;

-- No select/insert/update/delete policies for authenticated or anon roles.
-- All access goes through service_role (admin client in API routes).

-- Grant service_role full access
grant all on public.otp_codes to service_role;

-- Cleanup function: delete expired codes (call via pg_cron or on each verification attempt)
create or replace function public.cleanup_expired_otps()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.otp_codes where expires_at < now();
$$;
```

- [ ] **Step 2: Apply migration in Supabase Dashboard**

Go to Supabase Dashboard → SQL Editor → paste the contents of `supabase/migrations/003_otp_codes.sql` → Run.

Verify: `select * from public.otp_codes limit 1;` returns no error.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/003_otp_codes.sql
git commit -m "feat: add otp_codes table with TTL and service_role-only RLS"
```

---

## Task 4: OTP signup flow — API routes + UI

**Files:**
- Create: `app/api/auth/send-otp/route.ts`
- Create: `app/api/auth/verify-otp/route.ts`
- Create: `app/(auth)/verify/page.tsx`
- Modify: `app/(auth)/signup/page.tsx`
- Modify: `middleware.ts`

- [ ] **Step 1: Create send-otp API route**

Create `app/api/auth/send-otp/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/send";
import { verificationEmail } from "@/lib/email/templates/verification";

function generateOtp(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export async function POST(req: NextRequest) {
  let body: { email?: string; companyName?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const companyName = typeof body.companyName === "string" ? body.companyName.trim() : "usuário";

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Email inválido" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Rate limit: max 3 OTPs per email per 15 minutes
  const { count } = await admin
    .from("otp_codes")
    .select("id", { count: "exact", head: true })
    .eq("email", email)
    .eq("purpose", "signup")
    .gt("created_at", new Date(Date.now() - 15 * 60 * 1000).toISOString());

  if ((count ?? 0) >= 3) {
    return NextResponse.json(
      { error: "Muitas tentativas. Aguarde 15 minutos." },
      { status: 429 },
    );
  }

  // Invalidate previous codes for this email+purpose
  await admin
    .from("otp_codes")
    .update({ used: true })
    .eq("email", email)
    .eq("purpose", "signup")
    .eq("used", false);

  const code = generateOtp();

  const { error: insertError } = await admin.from("otp_codes").insert({
    email,
    code,
    purpose: "signup",
  });

  if (insertError) {
    console.error("[send-otp] DB error:", insertError.message);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }

  try {
    await sendEmail({
      to: email,
      subject: "Seu código de verificação Agendra",
      html: verificationEmail({ code, companyName }),
    });
  } catch (err) {
    console.error("[send-otp] Email error:", err);
    return NextResponse.json({ error: "Erro ao enviar email" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Create verify-otp API route**

Create `app/api/auth/verify-otp/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/send";
import { welcomeEmail } from "@/lib/email/templates/welcome";

export async function POST(req: NextRequest) {
  let body: { email?: string; code?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const code = typeof body.code === "string" ? body.code.trim() : "";

  if (!email || !code) {
    return NextResponse.json({ error: "Email e código são obrigatórios" }, { status: 400 });
  }

  // Only accept 6-digit numeric codes
  if (!/^\d{6}$/.test(code)) {
    return NextResponse.json({ error: "Código inválido" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Clean up expired codes first
  await admin.rpc("cleanup_expired_otps");

  const { data: otpRow, error: fetchError } = await admin
    .from("otp_codes")
    .select("id, code, expires_at, used")
    .eq("email", email)
    .eq("purpose", "signup")
    .eq("used", false)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (fetchError || !otpRow) {
    return NextResponse.json({ error: "Código não encontrado ou expirado" }, { status: 400 });
  }

  if (new Date(otpRow.expires_at) < new Date()) {
    return NextResponse.json({ error: "Código expirado. Solicite um novo." }, { status: 400 });
  }

  if (otpRow.code !== code) {
    return NextResponse.json({ error: "Código incorreto" }, { status: 400 });
  }

  // Mark OTP as used
  await admin.from("otp_codes").update({ used: true }).eq("id", otpRow.id);

  // Confirm the user's email in Supabase Auth
  const { data: users, error: listError } = await admin.auth.admin.listUsers();
  if (listError) {
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }

  const authUser = users.users.find((u) => u.email === email);
  if (!authUser) {
    return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 });
  }

  const { error: updateError } = await admin.auth.admin.updateUserById(authUser.id, {
    email_confirm: true,
  });

  if (updateError) {
    console.error("[verify-otp] updateUser error:", updateError.message);
    return NextResponse.json({ error: "Erro ao confirmar conta" }, { status: 500 });
  }

  // Send welcome email (fire-and-forget, don't block response)
  const companyName =
    (authUser.user_metadata?.company_name as string | undefined) ?? email.split("@")[0];
  void sendEmail({
    to: email,
    subject: "Bem-vindo ao Agendra!",
    html: welcomeEmail({ companyName }),
  }).catch((err) => console.error("[verify-otp] welcome email failed:", err));

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: Create /verify page**

Create `app/(auth)/verify/page.tsx`:

```tsx
"use client";

import Image from "next/image";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useState, type FormEvent, Suspense, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { ArrowRight, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Glass } from "@/components/ui/glass";
import { createClient } from "@/lib/supabase/client";

function VerifyContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const email = searchParams.get("email") ?? "";
  const companyName = searchParams.get("company") ?? "";

  const [code, setCode] = useState(["", "", "", "", "", ""]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState(60);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setInterval(() => setResendCooldown((c) => c - 1), 1000);
    return () => clearInterval(t);
  }, [resendCooldown]);

  function handleDigit(index: number, value: string) {
    if (!/^\d*$/.test(value)) return;
    const next = [...code];
    next[index] = value.slice(-1);
    setCode(next);
    if (value && index < 5) inputRefs.current[index + 1]?.focus();
  }

  function handleKeyDown(index: number, e: React.KeyboardEvent) {
    if (e.key === "Backspace" && !code[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const fullCode = code.join("");
    if (fullCode.length !== 6) {
      setError("Digite os 6 dígitos do código.");
      return;
    }

    setLoading(true);

    const res = await fetch("/api/auth/verify-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, code: fullCode }),
    });

    const data = await res.json();

    if (!res.ok) {
      setError(data.error ?? "Erro ao verificar código.");
      setLoading(false);
      return;
    }

    // Sign in automatically after verification
    const supabase = createClient();
    // Trigger a session refresh — user is now confirmed
    await supabase.auth.refreshSession();
    router.push("/inbox");
  }

  async function handleResend() {
    if (resendCooldown > 0) return;
    await fetch("/api/auth/send-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, companyName }),
    });
    setResendCooldown(60);
  }

  return (
    <div className="grid min-h-screen place-items-center px-6 py-12">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-md"
      >
        <Glass className="p-9">
          <div className="mb-5 flex justify-center">
            <Image src="/assets/agendra-logo.svg" alt="Agendra" width={136} height={34} priority />
          </div>
          <h1 className="text-center text-[26px] font-bold tracking-[-0.02em]">
            Verifique seu email
          </h1>
          <p className="mb-7 mt-1 text-center text-sm" style={{ color: "var(--color-fg-2)" }}>
            Enviamos um código de 6 dígitos para{" "}
            <span className="font-medium text-white">{email}</span>
          </p>

          <form onSubmit={handleSubmit} className="flex flex-col items-center gap-5">
            <div className="flex gap-2">
              {code.map((digit, i) => (
                <input
                  key={i}
                  ref={(el) => { inputRefs.current[i] = el; }}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  onChange={(e) => handleDigit(i, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(i, e)}
                  disabled={loading}
                  className="input h-14 w-12 text-center text-xl font-bold tracking-widest disabled:opacity-50"
                />
              ))}
            </div>

            {error && (
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                className="w-full rounded-xl border border-[#F43F5E]/30 bg-[#F43F5E]/10 px-4 py-3 text-sm text-center"
                style={{ color: "#FB7185" }}
                role="alert"
              >
                {error}
              </motion.div>
            )}

            <Button type="submit" variant="primary" className="w-full justify-center" disabled={loading}>
              {loading ? <Loader2 size={16} className="animate-spin" /> : <>Confirmar <ArrowRight size={16} /></>}
            </Button>
          </form>

          <button
            onClick={handleResend}
            disabled={resendCooldown > 0}
            className="mt-5 flex w-full items-center justify-center gap-2 text-sm disabled:opacity-40"
            style={{ color: "var(--color-fg-3)" }}
          >
            <RefreshCw size={13} />
            {resendCooldown > 0 ? `Reenviar em ${resendCooldown}s` : "Reenviar código"}
          </button>
        </Glass>
      </motion.div>
    </div>
  );
}

export default function VerifyPage() {
  return (
    <Suspense fallback={null}>
      <VerifyContent />
    </Suspense>
  );
}
```

- [ ] **Step 4: Modify signup page to redirect to /verify**

In `app/(auth)/signup/page.tsx`, find the `handleSubmit` function. Replace the `setSuccess(true)` block and the `success` early-return JSX with a redirect:

```typescript
// After successful supabase.auth.signUp, send OTP and redirect
await fetch("/api/auth/send-otp", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: email.trim(), companyName: companyName.trim() }),
});

router.push(
  `/verify?email=${encodeURIComponent(email.trim())}&company=${encodeURIComponent(companyName.trim())}`
);
return; // don't setLoading(false) — navigation happening
```

Remove the `success` state and the `if (success)` early return entirely from the component.

Remove `const [success, setSuccess] = useState(false);` from state declarations.

- [ ] **Step 5: Add /verify to middleware unprotected routes**

In `middleware.ts`, update `AUTH_PREFIXES`:

```typescript
const AUTH_PREFIXES = ["/login", "/signup", "/verify", "/recuperar-senha", "/nova-senha"];
```

- [ ] **Step 6: Commit**

```bash
git add app/api/auth/send-otp/ app/api/auth/verify-otp/ app/(auth)/verify/ app/(auth)/signup/page.tsx middleware.ts
git commit -m "feat: replace email confirmation link with 6-digit OTP code flow"
```

---

## Task 5: Password reset — API routes

**Files:**
- Create: `app/api/auth/send-reset/route.ts`
- Create: `app/api/auth/reset-password/route.ts`

- [ ] **Step 1: Create send-reset route**

Create `app/api/auth/send-reset/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/send";
import { passwordResetEmail } from "@/lib/email/templates/password-reset";

function generateOtp(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export async function POST(req: NextRequest) {
  let body: { email?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Email inválido" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Rate limit: max 3 reset codes per email per 15 minutes
  const { count } = await admin
    .from("otp_codes")
    .select("id", { count: "exact", head: true })
    .eq("email", email)
    .eq("purpose", "password_reset")
    .gt("created_at", new Date(Date.now() - 15 * 60 * 1000).toISOString());

  if ((count ?? 0) >= 3) {
    return NextResponse.json(
      { error: "Muitas tentativas. Aguarde 15 minutos." },
      { status: 429 },
    );
  }

  // Check if user exists (don't reveal whether email is registered — always return 200)
  const { data: users } = await admin.auth.admin.listUsers();
  const userExists = users?.users.some((u) => u.email === email);

  if (userExists) {
    // Invalidate previous reset codes
    await admin
      .from("otp_codes")
      .update({ used: true })
      .eq("email", email)
      .eq("purpose", "password_reset")
      .eq("used", false);

    const code = generateOtp();

    await admin.from("otp_codes").insert({
      email,
      code,
      purpose: "password_reset",
    });

    await sendEmail({
      to: email,
      subject: "Código para redefinir sua senha — Agendra",
      html: passwordResetEmail({ code }),
    }).catch((err) => console.error("[send-reset] email error:", err));
  }

  // Always return 200 to avoid email enumeration
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Create reset-password route**

Create `app/api/auth/reset-password/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(req: NextRequest) {
  let body: { email?: string; code?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const code = typeof body.code === "string" ? body.code.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!email || !code || !password) {
    return NextResponse.json({ error: "Todos os campos são obrigatórios" }, { status: 400 });
  }

  if (!/^\d{6}$/.test(code)) {
    return NextResponse.json({ error: "Código inválido" }, { status: 400 });
  }

  if (password.length < 8) {
    return NextResponse.json({ error: "A senha deve ter ao menos 8 caracteres" }, { status: 400 });
  }

  const admin = createAdminClient();

  await admin.rpc("cleanup_expired_otps");

  const { data: otpRow } = await admin
    .from("otp_codes")
    .select("id, code, expires_at, used")
    .eq("email", email)
    .eq("purpose", "password_reset")
    .eq("used", false)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!otpRow || new Date(otpRow.expires_at) < new Date()) {
    return NextResponse.json({ error: "Código expirado ou inválido. Solicite um novo." }, { status: 400 });
  }

  if (otpRow.code !== code) {
    return NextResponse.json({ error: "Código incorreto" }, { status: 400 });
  }

  // Mark OTP as used first (prevent replay)
  await admin.from("otp_codes").update({ used: true }).eq("id", otpRow.id);

  // Find user
  const { data: users } = await admin.auth.admin.listUsers();
  const authUser = users?.users.find((u) => u.email === email);

  if (!authUser) {
    return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 });
  }

  const { error: updateError } = await admin.auth.admin.updateUserById(authUser.id, { password });

  if (updateError) {
    console.error("[reset-password] update error:", updateError.message);
    return NextResponse.json({ error: "Erro ao atualizar senha" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: Commit**

```bash
git add app/api/auth/send-reset/ app/api/auth/reset-password/
git commit -m "feat: add password reset API routes with OTP verification and rate limiting"
```

---

## Task 6: Password reset UI pages

**Files:**
- Create: `app/(auth)/recuperar-senha/page.tsx`
- Create: `app/(auth)/nova-senha/page.tsx`

- [ ] **Step 1: Create /recuperar-senha page**

Create `app/(auth)/recuperar-senha/page.tsx`:

```tsx
"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { motion } from "framer-motion";
import { ArrowRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Glass } from "@/components/ui/glass";

export default function RecuperarSenhaPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const res = await fetch("/api/auth/send-reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim() }),
    });

    setLoading(false);

    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "Erro ao enviar código.");
      return;
    }

    setSent(true);
    // Navigate to nova-senha with email pre-filled
    router.push(`/nova-senha?email=${encodeURIComponent(email.trim())}`);
  }

  return (
    <div className="grid min-h-screen place-items-center px-6 py-12">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-md"
      >
        <Glass className="p-9">
          <div className="mb-5 flex justify-center">
            <Image src="/assets/agendra-logo.svg" alt="Agendra" width={136} height={34} priority />
          </div>
          <h1 className="text-center text-[26px] font-bold tracking-[-0.02em]">
            Recuperar senha
          </h1>
          <p className="mb-7 mt-1 text-center text-sm" style={{ color: "var(--color-fg-2)" }}>
            Digite seu email e enviaremos um código de redefinição.
          </p>

          <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
            <label className="flex flex-col gap-1.5">
              <span className="font-mono text-xs uppercase tracking-wider" style={{ color: "var(--color-fg-3)" }}>
                Email
              </span>
              <input
                type="email"
                required
                autoComplete="email"
                placeholder="voce@empresa.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
                className="input w-full disabled:opacity-50"
              />
            </label>

            {error && (
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-xl border border-[#F43F5E]/30 bg-[#F43F5E]/10 px-4 py-3 text-sm"
                style={{ color: "#FB7185" }}
                role="alert"
              >
                {error}
              </motion.div>
            )}

            <Button type="submit" variant="primary" className="w-full justify-center" disabled={loading}>
              {loading ? <Loader2 size={16} className="animate-spin" /> : <>Enviar código <ArrowRight size={16} /></>}
            </Button>
          </form>

          <div className="mt-5 text-center text-sm" style={{ color: "var(--color-fg-3)" }}>
            <Link href="/login" className="text-brand-blue-300 hover:underline">
              Voltar ao login
            </Link>
          </div>
        </Glass>
      </motion.div>
    </div>
  );
}
```

- [ ] **Step 2: Create /nova-senha page**

Create `app/(auth)/nova-senha/page.tsx`:

```tsx
"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent, Suspense, useRef } from "react";
import { motion } from "framer-motion";
import { ArrowRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Glass } from "@/components/ui/glass";

function NovaSenhaContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const email = searchParams.get("email") ?? "";

  const [code, setCode] = useState(["", "", "", "", "", ""]);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  function handleDigit(index: number, value: string) {
    if (!/^\d*$/.test(value)) return;
    const next = [...code];
    next[index] = value.slice(-1);
    setCode(next);
    if (value && index < 5) inputRefs.current[index + 1]?.focus();
  }

  function handleKeyDown(index: number, e: React.KeyboardEvent) {
    if (e.key === "Backspace" && !code[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const fullCode = code.join("");
    if (fullCode.length !== 6) { setError("Digite os 6 dígitos do código."); return; }
    if (password.length < 8) { setError("A senha deve ter ao menos 8 caracteres."); return; }
    if (password !== confirmPassword) { setError("As senhas não coincidem."); return; }

    setLoading(true);

    const res = await fetch("/api/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, code: fullCode, password }),
    });

    const data = await res.json();

    if (!res.ok) {
      setError(data.error ?? "Erro ao redefinir senha.");
      setLoading(false);
      return;
    }

    router.push("/login?message=password_reset_success");
  }

  return (
    <div className="grid min-h-screen place-items-center px-6 py-12">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-md"
      >
        <Glass className="p-9">
          <div className="mb-5 flex justify-center">
            <Image src="/assets/agendra-logo.svg" alt="Agendra" width={136} height={34} priority />
          </div>
          <h1 className="text-center text-[26px] font-bold tracking-[-0.02em]">
            Nova senha
          </h1>
          <p className="mb-7 mt-1 text-center text-sm" style={{ color: "var(--color-fg-2)" }}>
            Digite o código enviado para <span className="font-medium text-white">{email}</span> e defina sua nova senha.
          </p>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <span className="mb-1.5 block font-mono text-xs uppercase tracking-wider" style={{ color: "var(--color-fg-3)" }}>
                Código de verificação
              </span>
              <div className="flex gap-2">
                {code.map((digit, i) => (
                  <input
                    key={i}
                    ref={(el) => { inputRefs.current[i] = el; }}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handleDigit(i, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(i, e)}
                    disabled={loading}
                    className="input h-12 w-10 text-center text-lg font-bold disabled:opacity-50"
                  />
                ))}
              </div>
            </div>

            <label className="flex flex-col gap-1.5">
              <span className="font-mono text-xs uppercase tracking-wider" style={{ color: "var(--color-fg-3)" }}>
                Nova senha
              </span>
              <input
                type="password"
                required
                minLength={8}
                placeholder="Mínimo 8 caracteres"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                className="input w-full disabled:opacity-50"
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="font-mono text-xs uppercase tracking-wider" style={{ color: "var(--color-fg-3)" }}>
                Confirmar senha
              </span>
              <input
                type="password"
                required
                minLength={8}
                placeholder="Repita a senha"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={loading}
                className="input w-full disabled:opacity-50"
              />
            </label>

            {error && (
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-xl border border-[#F43F5E]/30 bg-[#F43F5E]/10 px-4 py-3 text-sm"
                style={{ color: "#FB7185" }}
                role="alert"
              >
                {error}
              </motion.div>
            )}

            <Button type="submit" variant="primary" className="w-full justify-center" disabled={loading}>
              {loading ? <Loader2 size={16} className="animate-spin" /> : <>Redefinir senha <ArrowRight size={16} /></>}
            </Button>
          </form>

          <div className="mt-5 text-center text-sm" style={{ color: "var(--color-fg-3)" }}>
            <Link href="/login" className="text-brand-blue-300 hover:underline">Voltar ao login</Link>
          </div>
        </Glass>
      </motion.div>
    </div>
  );
}

export default function NovaSenhaPage() {
  return <Suspense fallback={null}><NovaSenhaContent /></Suspense>;
}
```

- [ ] **Step 3: Add success message display to login page**

In `app/(auth)/login/page.tsx`, add inside `LoginContent` before the return:

```tsx
const message = searchParams.get("message");
```

And add this block above the form, after the subtitle `<p>`:

```tsx
{message === "password_reset_success" && (
  <motion.div
    initial={{ opacity: 0, y: -6 }}
    animate={{ opacity: 1, y: 0 }}
    className="mb-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-center"
    style={{ color: "#34D399" }}
  >
    Senha redefinida com sucesso! Faça login com sua nova senha.
  </motion.div>
)}
```

- [ ] **Step 4: Commit**

```bash
git add app/(auth)/recuperar-senha/ app/(auth)/nova-senha/ app/(auth)/login/page.tsx
git commit -m "feat: add password reset UI pages with OTP code entry and success feedback"
```

---

## Task 7: Security — input validation in server actions

**Files:**
- Modify: `app/(app)/leads/actions.ts`
- Modify: `app/(app)/agenda/actions.ts`

**Context:** Current server actions do basic presence checks but no format validation on UUIDs, no max-length enforcement, and the `deleteEvent` action has an IDOR risk — it filters by `company_id` via the profile, which is good, but has no UUID format validation on `eventId` before hitting the DB.

- [ ] **Step 1: Add UUID validator helper**

Add to `lib/utils.ts` (read it first to find the right place to append):

```typescript
/** Returns true if string is a valid UUID v4 format */
export function isValidUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
```

- [ ] **Step 2: Harden leads actions**

Replace `app/(app)/leads/actions.ts` content:

```typescript
"use server";

import { createClient, getUserProfile } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { isValidUuid } from "@/lib/utils";

const VALID_CHANNELS = ["whatsapp", "instagram", "form"] as const;
type Channel = (typeof VALID_CHANNELS)[number];

export async function createLead(formData: FormData) {
  const profile = await getUserProfile();
  if (!profile) throw new Error("Unauthorized");

  const companyId = profile.memberships?.[0]?.company_id;
  if (!companyId || !isValidUuid(companyId)) throw new Error("No company");

  const name = (formData.get("name") as string | null)?.trim() ?? "";
  const phone = (formData.get("phone") as string | null)?.trim() ?? "";
  const channel = (formData.get("channel") as string | null)?.trim() ?? "";
  const source = (formData.get("source") as string | null)?.trim() || null;
  const city = (formData.get("city") as string | null)?.trim() || null;
  const email = (formData.get("email") as string | null)?.trim() || null;

  if (!name || name.length > 200) throw new Error("Nome inválido (máx 200 chars)");
  if (!phone || phone.length > 30) throw new Error("Telefone inválido");
  if (!VALID_CHANNELS.includes(channel as Channel)) throw new Error("Canal inválido");
  if (source && source.length > 200) throw new Error("Source inválida");
  if (city && city.length > 100) throw new Error("Cidade inválida");
  if (email && (email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
    throw new Error("Email inválido");
  }

  const supabase = await createClient();
  const { error } = await supabase.from("leads").insert({
    company_id: companyId,
    name,
    phone,
    channel,
    source,
    city,
    email,
    status: "cold",
    heat_score: 0,
  });

  if (error) throw new Error(error.message);

  revalidatePath("/leads");
}
```

- [ ] **Step 3: Harden agenda actions**

Replace `app/(app)/agenda/actions.ts` content:

```typescript
"use server";

import { createClient, getUserProfile } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { isValidUuid } from "@/lib/utils";

export async function createEvent(formData: FormData) {
  const profile = await getUserProfile();
  if (!profile) throw new Error("Unauthorized");

  const companyId = profile.memberships?.[0]?.company_id;
  if (!companyId || !isValidUuid(companyId)) throw new Error("No company");

  const leadId = (formData.get("lead_id") as string | null)?.trim() || null;
  const title = (formData.get("title") as string | null)?.trim() ?? "";
  const startTime = (formData.get("start_time") as string | null)?.trim() ?? "";
  const endTime = (formData.get("end_time") as string | null)?.trim() ?? "";

  if (!title || title.length > 300) throw new Error("Título inválido");
  if (leadId && !isValidUuid(leadId)) throw new Error("lead_id inválido");

  const start = new Date(startTime);
  const end = new Date(endTime);

  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    throw new Error("Data/hora inválida");
  }
  if (end <= start) throw new Error("end_time deve ser posterior a start_time");

  const supabase = await createClient();
  const { error } = await supabase.from("events").insert({
    company_id: companyId,
    lead_id: leadId,
    title,
    start_time: start.toISOString(),
    end_time: end.toISOString(),
  });

  if (error) throw new Error(error.message);

  revalidatePath("/agenda");
}

export async function deleteEvent(eventId: string) {
  if (!isValidUuid(eventId)) throw new Error("eventId inválido");

  const profile = await getUserProfile();
  if (!profile) throw new Error("Unauthorized");

  const companyId = profile.memberships?.[0]?.company_id;
  if (!companyId || !isValidUuid(companyId)) throw new Error("No company");

  const supabase = await createClient();
  const { error } = await supabase
    .from("events")
    .delete()
    .eq("id", eventId)
    .eq("company_id", companyId); // IDOR protection: only delete own company's events

  if (error) throw new Error(error.message);

  revalidatePath("/agenda");
}
```

- [ ] **Step 4: Commit**

```bash
git add lib/utils.ts app/(app)/leads/actions.ts app/(app)/agenda/actions.ts
git commit -m "security: add UUID validation, input length limits, and IDOR protection in server actions"
```

---

## Task 8: RLS audit — fix missing DELETE policies + apply fix_rls_recursion.sql

**Files:**
- Modify: `supabase/fix_rls_recursion.sql` — add missing DELETE policies
- Modify: `supabase/schema_v2.sql` — note about running fix_rls_recursion.sql after

**Context:** `fix_rls_recursion.sql` rewrites leads/messages/events policies using `get_my_company_ids()` to avoid RLS recursion. BUT it's missing DELETE policies for leads and events (currently schema_v2 also has no DELETE policies). This means a user CAN delete any lead/event because there's no RLS blocking it — they'd need to hit the DB directly, but it's still a vulnerability.

- [ ] **Step 1: Append DELETE policies to fix_rls_recursion.sql**

Append to end of `supabase/fix_rls_recursion.sql`:

```sql
-- ============================================================
-- 5. ADD MISSING DELETE POLICIES
--    Previously missing — users could delete any row via
--    direct DB access if RLS wasn't enforced for DELETE.
-- ============================================================

-- leads DELETE
drop policy if exists "leads: delete own company" on public.leads;
create policy "leads: delete own company"
  on public.leads for delete
  using (company_id in (select public.get_my_company_ids()));

-- events DELETE
drop policy if exists "events: delete own company" on public.events;
create policy "events: delete own company"
  on public.events for delete
  using (company_id in (select public.get_my_company_ids()));

-- messages DELETE (usually not needed, but close the gap)
drop policy if exists "messages: delete own company" on public.messages;
create policy "messages: delete own company"
  on public.messages for delete
  using (company_id in (select public.get_my_company_ids()));

-- ============================================================
-- 6. VERIFY: list all RLS policies for sanity check
-- ============================================================
-- Run this after applying to verify coverage:
-- select tablename, policyname, cmd
-- from pg_policies
-- where schemaname = 'public'
-- order by tablename, cmd;
```

- [ ] **Step 2: Apply updated fix_rls_recursion.sql in Supabase**

In Supabase Dashboard → SQL Editor: paste the FULL contents of `supabase/fix_rls_recursion.sql` and run. This is idempotent (`drop policy if exists` before each `create policy`).

Run the verification query at the bottom and confirm these policies exist for each table:

| Table | Policies expected |
|-------|------------------|
| companies | SELECT, UPDATE |
| memberships | SELECT |
| leads | SELECT, INSERT, UPDATE, DELETE |
| messages | SELECT, INSERT, DELETE |
| events | SELECT, INSERT, UPDATE, DELETE |

- [ ] **Step 3: Verify users table has no cross-tenant leak**

Run in SQL Editor:

```sql
select policyname, cmd, qual
from pg_policies
where schemaname = 'public' and tablename = 'users';
```

Expected: `users: select own` (SELECT using `auth.uid() = id`) and `users: update own`. No INSERT policy (handled by trigger). This is correct — users can only see their own row.

- [ ] **Step 4: Commit**

```bash
git add supabase/fix_rls_recursion.sql
git commit -m "security: add missing DELETE RLS policies for leads, events, messages tables"
```

---

## Task 9: Rate limiting on auth API routes via Supabase (IP-based)

**Context:** Tasks 4 and 5 already implement per-email rate limiting via DB counts. This task adds a lightweight IP-based rate limit via request headers as a secondary defense layer.

**Files:**
- Create: `lib/rate-limit.ts`
- Modify: `app/api/auth/send-otp/route.ts`
- Modify: `app/api/auth/send-reset/route.ts`

- [ ] **Step 1: Create in-memory rate limiter**

Create `lib/rate-limit.ts`:

```typescript
type RateLimitEntry = { count: number; resetAt: number };

const store = new Map<string, RateLimitEntry>();

/**
 * Simple in-memory rate limiter.
 * Works per-instance (sufficient for single-server or Vercel warm instances).
 * For multi-instance, use Upstash Redis or similar.
 *
 * @returns true if request is allowed, false if rate limited
 */
export function checkRateLimit(key: string, maxRequests: number, windowMs: number): boolean {
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || now > entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (entry.count >= maxRequests) {
    return false;
  }

  entry.count++;
  return true;
}
```

- [ ] **Step 2: Add IP rate limit to send-otp route**

In `app/api/auth/send-otp/route.ts`, add at the top of the POST handler, before the JSON parse:

```typescript
import { checkRateLimit } from "@/lib/rate-limit";

// At start of POST handler:
const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
if (!checkRateLimit(`send-otp:${ip}`, 5, 60_000)) {
  return NextResponse.json({ error: "Muitas tentativas. Aguarde 1 minuto." }, { status: 429 });
}
```

- [ ] **Step 3: Add IP rate limit to send-reset route**

Same pattern in `app/api/auth/send-reset/route.ts`:

```typescript
import { checkRateLimit } from "@/lib/rate-limit";

// At start of POST handler:
const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
if (!checkRateLimit(`send-reset:${ip}`, 5, 60_000)) {
  return NextResponse.json({ error: "Muitas tentativas. Aguarde 1 minuto." }, { status: 429 });
}
```

- [ ] **Step 4: Commit**

```bash
git add lib/rate-limit.ts app/api/auth/send-otp/route.ts app/api/auth/send-reset/route.ts
git commit -m "security: add IP-based rate limiting to auth email endpoints"
```

---

## Self-Review: Spec Coverage Check

| Requirement | Covered by |
|---|---|
| HTML email templates — dark glassmorphism brand | Task 2 (`_base.ts`, `verification.ts`, `password-reset.ts`, `welcome.ts`) |
| Resend integration | Task 1 (`lib/email/resend.ts`, `lib/email/send.ts`) |
| 6-digit OTP on signup instead of magic link | Task 3 (DB table) + Task 4 (API + UI) |
| Verification screen on site | Task 4 (`app/(auth)/verify/page.tsx`) |
| Password reset — broken flow fixed | Task 5 (API) + Task 6 (UI pages) |
| SQL injection protection | Task 7 (all inputs validated before DB, Supabase parameterises queries) |
| IDOR — users accessing other tenant data | Task 7 (`deleteEvent` UUID+companyId check) + Task 8 (RLS) |
| RLS policies — tenant isolation | Task 8 (fix_rls_recursion.sql extended with DELETE policies) |
| Input validation + sanitization (server) | Task 7 (length limits, format checks, enum validation) |
| Rate limiting on auth endpoints | Task 4 (per-email DB count) + Task 5 (per-email DB count) + Task 9 (IP-based) |
| Check fix_rls_recursion.sql | Task 8 (verified + extended) |
| Fix all vulnerabilities found | Tasks 7–9 |

**Placeholder scan:** No TBDs, no "similar to" references, no empty steps. All code is complete.

**Type consistency:** `isValidUuid` defined in Task 7 Step 1, imported in Steps 2 and 3. `sendEmail` defined in Task 1 Step 3, used in Tasks 4 and 5. `emailWrapper` defined in Task 2 Step 1, imported by all templates. All consistent.

---

## Known Limitations

1. **`auth.admin.listUsers()` pagination** — If the app grows to >1000 users, `listUsers()` in verify-otp and reset-password routes will need pagination. Add `listUsers({ perPage: 1000 })` and loop or switch to `getUserByEmail` if Supabase exposes it in admin API.

2. **In-memory rate limiter** — Task 9's `checkRateLimit` resets on server restart and doesn't share state across Vercel serverless instances. Acceptable for MVP; replace with Upstash Redis when scaling.

3. **Resend domain** — `from: "noreply@agendra.app"` requires DNS verification in Resend dashboard. During development, use `onboarding@resend.dev` as sender.
