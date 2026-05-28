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
            Digite o código enviado para{" "}
            <span className="font-medium text-[#09090B]">{email}</span>{" "}
            e defina sua nova senha.
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
                className="rounded-xl border border-[#FECACA] bg-[#FFF1F2] px-4 py-3 text-sm text-[#DC2626]"
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
            <Link href="/login" className="text-brand-blue-600 hover:underline">Voltar ao login</Link>
          </div>
        </Glass>
      </motion.div>
    </div>
  );
}

export default function NovaSenhaPage() {
  return <Suspense fallback={null}><NovaSenhaContent /></Suspense>;
}
