import type { Metadata } from "next";
import { Header } from "@/components/landing/header";

export const metadata: Metadata = {
  title: "Agendra — Lead novo, reunião marcada em segundos",
  description:
    "Agendra responde, qualifica e agenda leads do WhatsApp e Instagram em 4 segundos, 24/7. Sem fila, sem espera, sem lead perdido. Comece grátis.",
  openGraph: {
    title: "Agendra — Lead novo, reunião marcada em segundos",
    description:
      "IA que responde, qualifica e agenda leads em 4 segundos, 24/7, pelo WhatsApp e Instagram.",
    url: "https://agendra.com.br",
    siteName: "Agendra",
    locale: "pt_BR",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Agendra — Lead novo, reunião marcada em segundos",
    description:
      "IA que responde, qualifica e agenda leads em 4 segundos, 24/7, pelo WhatsApp e Instagram.",
  },
  alternates: {
    canonical: "https://agendra.com.br",
  },
};
import { Hero } from "@/components/landing/hero";
import { HowItWorks } from "@/components/landing/how-it-works";
import { ProductDemo } from "@/components/landing/product-demo";
import { Benefits } from "@/components/landing/benefits";
import { Proof } from "@/components/landing/proof";
import { UseCases } from "@/components/landing/use-cases";
import { FAQ } from "@/components/landing/faq";
import { FinalCTA } from "@/components/landing/final-cta";
import { Footer } from "@/components/landing/footer";

export default function LandingPage() {
  return (
    <div className="bg-aurora min-h-screen">
      <Header />
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
