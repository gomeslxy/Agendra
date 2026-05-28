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

export const dynamic = "force-static";

import { Header } from "@/components/landing/header";
import { Hero } from "@/components/landing/hero";
import { HowItWorks } from "@/components/landing/how-it-works";
import nextDynamic from "next/dynamic";
import { SectionSkeleton } from "@/components/landing/section-skeleton";

// Below-fold — SSR mantido (default ssr: true), client JS lazy
const ProductDemo = nextDynamic(
  () => import("@/components/landing/product-demo").then((m) => m.ProductDemo),
  { loading: () => <SectionSkeleton minHeight={600} /> }
);
const Benefits = nextDynamic(
  () => import("@/components/landing/benefits").then((m) => m.Benefits),
  { loading: () => <SectionSkeleton minHeight={500} /> }
);
const Proof = nextDynamic(
  () => import("@/components/landing/proof").then((m) => m.Proof),
  { loading: () => <SectionSkeleton minHeight={300} /> }
);
const UseCases = nextDynamic(
  () => import("@/components/landing/use-cases").then((m) => m.UseCases),
  { loading: () => <SectionSkeleton minHeight={400} /> }
);
const FAQ = nextDynamic(
  () => import("@/components/landing/faq").then((m) => m.FAQ),
  { loading: () => <SectionSkeleton minHeight={450} /> }
);
const FinalCTA = nextDynamic(
  () => import("@/components/landing/final-cta").then((m) => m.FinalCTA),
  { loading: () => <SectionSkeleton minHeight={300} /> }
);
const Footer = nextDynamic(
  () => import("@/components/landing/footer").then((m) => m.Footer),
  { loading: () => <SectionSkeleton minHeight={200} /> }
);

export default function LandingPage() {
  return (
    <div className="bg-aurora min-h-screen">
      <Header isLoggedIn={false} />
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
