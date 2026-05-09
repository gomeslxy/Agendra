"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent, Suspense } from "react";
import { motion } from "framer-motion";
import { ArrowRight, Chrome, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Glass } from "@/components/ui/glass";
import { createClient } from "@/lib/supabase/client";

// Mensagens de erro Supabase → pt-BR
function translateError(msg: string): string {
  if (msg.includes("Invalid login credentials"))
    return "Email ou senha incorretos. Verifique seus dados.";
  if (msg.includes("Email not confirmed"))
    return "Confirme seu email antes de entrar. Verifique sua caixa de entrada.";
  if (msg.includes("Too many requests"))
    return "Muitas tentativas. Aguarde alguns minutos e tente novamente.";
  if (msg.includes("User not found"))
    return "Nenhuma conta encontrada com esse email.";
  return "Ocorreu um erro. Tente novamente.";
}

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/inbox";
  const message = searchParams.get("message");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (error) {
      setError(translateError(error.message));
      setLoading(false);
      return;
    }

    // Redirecionar para destino original (ou inbox)
    router.push(next);
    router.refresh();
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
            <Image
              src="/assets/agendra-logo.svg"
              alt="Agendra"
              width={136}
              height={34}
              priority
            />
          </div>
          <h1 className="text-center text-[26px] font-bold tracking-[-0.02em]">
            Bem-vindo de volta
          </h1>
          <p
            className="mb-7 mt-1 text-center text-sm"
            style={{ color: "var(--color-fg-2)" }}
          >
            Entre para ver seus leads e agendamentos.
          </p>

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

          <form className="flex flex-col gap-3.5" onSubmit={handleSubmit}>
            <Field label="Email">
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
            </Field>
            <Field label="Senha">
              <input
                type="password"
                required
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                className="input w-full disabled:opacity-50"
              />
            </Field>

            <div className="flex items-center justify-between text-xs">
              <label
                className="flex cursor-pointer items-center gap-2"
                style={{ color: "var(--color-fg-2)" }}
              >
                <input type="checkbox" className="accent-brand-blue-600" />
                Lembrar deste dispositivo
              </label>
              <Link
                href="/recuperar-senha"
                className="text-brand-blue-300 hover:underline"
              >
                Esqueci a senha
              </Link>
            </div>

            {/* Mensagem de erro */}
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

            <Button
              type="submit"
              variant="primary"
              className="w-full justify-center"
              disabled={loading}
            >
              {loading ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <>
                  Entrar
                  <ArrowRight size={16} />
                </>
              )}
            </Button>

            <Divider>OU</Divider>

            <Button
              type="button"
              variant="secondary"
              className="w-full justify-center"
              disabled={loading}
              onClick={async () => {
                const supabase = createClient();
                await supabase.auth.signInWithOAuth({
                  provider: "google",
                  options: { redirectTo: `${window.location.origin}/auth/callback` },
                });
              }}
            >
              <Chrome size={16} />
              Continuar com Google
            </Button>
          </form>

          <div
            className="mt-5 text-center text-sm"
            style={{ color: "var(--color-fg-3)" }}
          >
            Ainda não tem conta?{" "}
            <Link href="/signup" className="text-brand-blue-300 hover:underline">
              Crie grátis
            </Link>
          </div>
        </Glass>
      </motion.div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginContent />
    </Suspense>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span
        className="font-mono text-xs uppercase tracking-wider"
        style={{ color: "var(--color-fg-3)" }}
      >
        {label}
      </span>
      {children}
    </label>
  );
}

function Divider({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="flex items-center gap-3 font-mono text-xs"
      style={{ color: "var(--color-fg-3)" }}
    >
      <span className="h-px flex-1 bg-white/[0.08]" />
      {children}
      <span className="h-px flex-1 bg-white/[0.08]" />
    </div>
  );
}
