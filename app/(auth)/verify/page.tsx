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
