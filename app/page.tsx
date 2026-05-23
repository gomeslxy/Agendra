import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Agendra — Lead novo, reunião marcada em segundos",
  description:
    "Agendra responde, qualifica e agenda leads do WhatsApp e Instagram em 4 segundos, 24/7. Sem fila, sem espera, sem lead perdido. Comece grátis.",
  alternates: {
    canonical: "https://www.agendra.site",
  },
  openGraph: {
    title: "Agendra — Lead novo, reunião marcada em segundos",
    description:
      "IA que responde, qualifica e agenda leads em 4 segundos, 24/7, pelo WhatsApp e Instagram.",
    url: "https://www.agendra.site",
  },
  twitter: {
    title: "Agendra — Lead novo, reunião marcada em segundos",
    description:
      "IA que responde, qualifica e agenda leads em 4 segundos, 24/7, pelo WhatsApp e Instagram.",
  },
};

import { Header } from "@/components/landing/header";
import { Hero } from "@/components/landing/hero";
import { HowItWorks } from "@/components/landing/how-it-works";
import { getUser } from "@/lib/supabase/server";

// Below-fold sections lazy loaded
import dynamic from "next/dynamic";
const ProductDemo = dynamic(() => import("@/components/landing/product-demo").then((m) => m.ProductDemo));
const Benefits = dynamic(() => import("@/components/landing/benefits").then((m) => m.Benefits));
const Proof = dynamic(() => import("@/components/landing/proof").then((m) => m.Proof));
const UseCases = dynamic(() => import("@/components/landing/use-cases").then((m) => m.UseCases));
const FAQ = dynamic(() => import("@/components/landing/faq").then((m) => m.FAQ));
const FinalCTA = dynamic(() => import("@/components/landing/final-cta").then((m) => m.FinalCTA));
const Footer = dynamic(() => import("@/components/landing/footer").then((m) => m.Footer));

export default async function LandingPage() {
  const user = await getUser();

  return (
    <div className="bg-aurora min-h-screen">
      <Header isLoggedIn={!!user} />
      <main className="pt-[68px]">
        <Hero />
        <HowItWorks />
        <ProductDemo />
        <Benefits />
        <Proof />
        <UseCases />
        <FAQ />
        <FinalCTA />
      </main>
      <Footer />
    </div>
  );
}
