import type { Metadata } from "next";
import { Header } from "@/components/landing/header";
import { ContatoForm } from "./contato-form";
import { Footer } from "@/components/landing/footer";

// ── Static rendering — cached at the CDN edge ──────────────────
export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Contato — Agendra",
  description:
    "Entre em contato com a Agendra. Tire dúvidas sobre a nossa IA de agendamento para WhatsApp e Instagram, solicite uma demonstração ou acesse o suporte.",
  alternates: {
    canonical: "https://www.agendra.site/contato",
  },
  openGraph: {
    title: "Contato — Agendra",
    description:
      "Entre em contato com a Agendra. Nossa equipe está pronta para ajudar.",
    url: "https://www.agendra.site/contato",
  },
};

// ── Page ────────────────────────────────────────────────────────
export default function ContatoPage() {
  return (
    <div className="bg-aurora min-h-screen selection:bg-brand-blue-500/30">
      <Header isLoggedIn={false} />

      <main className="pt-24 pb-20 px-6">
        <ContatoForm />
      </main>

      <Footer />
    </div>
  );
}
