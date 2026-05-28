import type { Metadata } from "next";
import Link from "next/link";
import { TermosContent } from "@/components/legal/legal-content";

export const metadata: Metadata = {
  title: "Termos de Uso",
  description: "Termos e condições de uso da plataforma Agendra.",
  alternates: {
    canonical: "/termos",
  },
};

export default function TermosPage() {
  return (
    <main className="min-h-screen bg-[#FAFAFA] px-6 py-16">
      <div className="mx-auto max-w-2xl">
        <Link
          href="/signup"
          className="mb-8 inline-flex items-center gap-1.5 text-xs text-[#71717A] hover:text-[#3F3F46]"
        >
          ← Voltar ao cadastro
        </Link>
        <h1 className="mb-8 text-2xl font-bold text-[#09090B]">Termos de Uso</h1>
        <TermosContent />
      </div>
    </main>
  );
}
