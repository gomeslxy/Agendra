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
