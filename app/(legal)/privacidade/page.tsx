import type { Metadata } from "next";
import Link from "next/link";
import { PrivacidadeContent } from "@/components/legal/legal-content";

export const metadata: Metadata = {
  title: "Política de Privacidade",
  description:
    "Política de privacidade e proteção de dados da plataforma Agendra, em conformidade com a LGPD.",
  alternates: {
    canonical: "/privacidade",
  },
};

export default function PrivacidadePage() {
  return (
    <main className="min-h-screen bg-[#FAFAFA] px-6 py-16">
      <div className="mx-auto max-w-2xl">
        <Link
          href="/signup"
          className="mb-8 inline-flex items-center gap-1.5 text-xs text-[#71717A] hover:text-[#3F3F46]"
        >
          ← Voltar ao cadastro
        </Link>
        <h1 className="mb-8 text-2xl font-bold text-[#09090B]">
          Política de Privacidade
        </h1>
        <PrivacidadeContent />
      </div>
    </main>
  );
}
