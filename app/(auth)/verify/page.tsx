"use client";

import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
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

  function handlePaste(e: React.ClipboardEvent) {
    e.preventDefault();
    const rawData = e.clipboardData.getData("text/plain");
    const sanitizedData = rawData.replace(/\D/g, "").slice(0, 6);
    if (!sanitizedData) return;

    const next = [...code];
    sanitizedData.split("").forEach((char, i) => {
      if (i < 6) next[i] = char;
    });
    setCode(next);

    // Focus last filled or next empty
    const lastIdx = Math.min(sanitizedData.length - 1, 5);
    if (lastIdx >= 0) {
      inputRefs.current[lastIdx]?.focus();
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

    const supabase = createClient();
    
    // Tentar login automático se as credenciais estiverem no sessionStorage
    const storedEmail = sessionStorage.getItem("agendra_signup_email");
    const storedPassword = sessionStorage.getItem("agendra_signup_password");

    // Limpar imediatamente para não deixar credenciais na memória do browser
    sessionStorage.removeItem("agendra_signup_email");
    sessionStorage.removeItem("agendra_signup_password");

    if (storedEmail && storedPassword) {
      const { error: loginError } = await supabase.auth.signInWithPassword({
        email: storedEmail,
        password: storedPassword,
      });

      if (!loginError) {
        router.push("/inbox");
        router.refresh();
        return;
      }
    }

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
            <span className="font-medium text-[#09090B]">{email}</span>
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
                  onPaste={handlePaste}
                  disabled={loading}
                  className="input h-14 w-12 text-center text-xl font-bold tracking-widest disabled:opacity-50"
                />
              ))}
            </div>

            {error && (
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                className="w-full rounded-xl border border-[#FECACA] bg-[#FFF1F2] px-4 py-3 text-sm text-[#DC2626] text-center"
                role="alert"
              >
                {error}
              </motion.div>
            )}

            <div className="flex flex-col gap-2 w-full">
              <Button type="submit" variant="primary" className="w-full justify-center" disabled={loading}>
                {loading ? <Loader2 size={16} className="animate-spin" /> : <>Confirmar <ArrowRight size={16} /></>}
              </Button>

              <Button
                type="button"
                variant="secondary"
                className="w-full justify-center"
                disabled={loading}
                onClick={() => router.push("/")}
              >
                Cancelar
              </Button>
            </div>
          </form>

          <button
            onClick={handleResend}
            disabled={resendCooldown > 0}
            className="mt-5 flex w-full items-center justify-center gap-2 text-sm text-[#71717A] hover:text-[#09090B] disabled:opacity-40 transition-colors font-medium border-0 bg-transparent cursor-pointer"
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
