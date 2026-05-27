import type { Metadata } from "next";
import nextDynamic from "next/dynamic";
import { Header } from "@/components/landing/header";

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

// ── Lazy-loaded client islands ──────────────────────────────────
const ContatoForm = nextDynamic(
  () => import("./contato-form").then((m) => m.ContatoForm),
  {
    loading: () => (
      <div className="mx-auto max-w-[1200px] min-h-[600px] flex items-center justify-center opacity-20">
        <div className="h-8 w-8 rounded-full border-2 border-white/20 border-t-white animate-spin" />
      </div>
    ),
  }
);

const Footer = nextDynamic(
  () => import("@/components/landing/footer").then((m) => m.Footer),
  { loading: () => null }
);

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
