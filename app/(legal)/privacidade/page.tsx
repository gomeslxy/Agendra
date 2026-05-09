import type { Metadata } from "next";
import Link from "next/link";
import { PrivacidadeContent } from "@/components/legal/legal-content";

export const metadata: Metadata = {
  title: "Política de Privacidade — Agendra",
  description:
    "Política de privacidade e proteção de dados da plataforma Agendra, em conformidade com a LGPD.",
};

export default function PrivacidadePage() {
  return (
    <main className="min-h-screen bg-[#0a0c10] px-6 py-16">
      <div className="mx-auto max-w-2xl">
        <Link
          href="/signup"
          className="mb-8 inline-flex items-center gap-1.5 text-xs text-white/40 hover:text-white/70"
        >
          ← Voltar ao cadastro
        </Link>
        <h1 className="mb-8 text-2xl font-bold text-white">
          Política de Privacidade
        </h1>
        <PrivacidadeContent />
      </div>
    </main>
  );
}
