"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { motion } from "framer-motion";
import { ArrowRight, Chrome, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Glass } from "@/components/ui/glass";
import { LegalModal } from "@/components/ui/legal-modal";
import { createClient } from "@/lib/supabase/client";
import { trackEvent } from "@/lib/analytics";
import { TermosContent, PrivacidadeContent } from "@/components/legal/legal-content";

// Mensagens de erro Supabase → pt-BR
function translateError(msg: string): string {
  if (msg.includes("User already registered") || msg.includes("already been registered"))
    return "Este email já está cadastrado. Tente entrar ou recuperar a senha.";
  if (msg.includes("Password should be at least"))
    return "A senha deve ter pelo menos 8 caracteres.";
  if (msg.includes("Unable to validate email"))
    return "Email inválido. Verifique o endereço digitado.";
  if (msg.includes("Too many requests"))
    return "Muitas tentativas. Aguarde alguns minutos.";
  if (msg.includes("Signup is disabled"))
    return "Cadastros temporariamente desativados. Tente mais tarde.";
  return "Ocorreu um erro ao criar sua conta. Tente novamente.";
}

// Validação de senha no frontend
function validatePassword(password: string): string | null {
  if (password.length < 8) return "A senha deve ter pelo menos 8 caracteres.";
  if (!/[A-Za-z]/.test(password)) return "A senha deve conter letras.";
  return null;
}

export default function SignupPage() {
  const router = useRouter();

  const [companyName, setCompanyName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [legalModal, setLegalModal] = useState<"termos" | "privacidade" | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const pwError = validatePassword(password);
    if (pwError) { setError(pwError); return; }
    if (!companyName.trim()) { setError("Informe o nome do seu negócio."); return; }

    setLoading(true);

    const res = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim(), password, companyName: companyName.trim() }),
    });

    const data = await res.json();

    if (!res.ok) {
      trackEvent("critical_error", { 
        category: "auth", 
        action: "signup", 
        message: data.error ?? "Unknown signup error" 
      });
      setError(data.error ?? "Erro ao criar conta.");
      setLoading(false);
      return;
    }

    trackEvent("signup", { method: "email" });

    // Armazenar temporariamente para login automático após verificação
    sessionStorage.setItem("agendra_signup_email", email.trim());
    sessionStorage.setItem("agendra_signup_password", password);

    router.push(
      `/verify?email=${encodeURIComponent(email.trim())}&company=${encodeURIComponent(companyName.trim())}`
    );
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
          <div className="mb-6">
            <Link
              href="/"
              className="inline-flex items-center gap-2 text-xs font-medium transition-colors hover:text-white"
              style={{ color: "var(--color-fg-3)" }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
              Voltar para o site
            </Link>
          </div>
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
            Comece grátis
          </h1>
          <p
            className="mb-7 mt-1 text-center text-sm"
            style={{ color: "var(--color-fg-2)" }}
          >
            7 dias para testar. Sem cartão.
          </p>

          <form className="flex flex-col gap-3.5" onSubmit={handleSubmit}>
            <Field label="Nome do negócio">
              <input
                required
                placeholder="Clínica Sorriso"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                disabled={loading}
                className="input disabled:opacity-50"
              />
            </Field>
            <Field label="Email de trabalho">
              <input
                type="email"
                required
                placeholder="voce@empresa.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
                className="input disabled:opacity-50"
              />
            </Field>
            <Field label="Senha">
              <input
                type="password"
                required
                minLength={8}
                placeholder="Mínimo 8 caracteres"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                className="input disabled:opacity-50"
              />
            </Field>

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
              pulse
              className="w-full justify-center"
              disabled={loading}
            >
              {loading ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <>
                  Criar conta
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
              Cadastrar com Google
            </Button>

            <p
              className="mt-2 text-center text-xs leading-relaxed"
              style={{ color: "var(--color-fg-3)" }}
            >
              Ao criar, você concorda com nossos{" "}
              <button
                type="button"
                onClick={() => setLegalModal("termos")}
                className="text-brand-blue-300 hover:underline"
              >
                Termos
              </button>{" "}
              e{" "}
              <button
                type="button"
                onClick={() => setLegalModal("privacidade")}
                className="text-brand-blue-300 hover:underline"
              >
                Privacidade (LGPD)
              </button>
              .
            </p>

            <LegalModal
              open={legalModal === "termos"}
              onClose={() => setLegalModal(null)}
              title="Termos de Uso"
            >
              <TermosContent />
            </LegalModal>

            <LegalModal
              open={legalModal === "privacidade"}
              onClose={() => setLegalModal(null)}
              title="Política de Privacidade (LGPD)"
            >
              <PrivacidadeContent />
            </LegalModal>
          </form>

          <div
            className="mt-5 text-center text-sm"
            style={{ color: "var(--color-fg-3)" }}
          >
            Já tem conta?{" "}
            <Link href="/login" className="text-brand-blue-300 hover:underline">
              Entrar
            </Link>
          </div>
        </Glass>
      </motion.div>
    </div>
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
