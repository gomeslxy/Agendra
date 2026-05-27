import type { Metadata, Viewport } from "next";
import { Inter_Tight, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const interTight = Inter_Tight({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-inter-tight",
  preload: true,
  adjustFontFallback: true,
});

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
  variable: "--font-jetbrains",
  preload: true,
  adjustFontFallback: true,
});

const CANONICAL_URL = "https://www.agendra.site";

export const metadata: Metadata = {
  metadataBase: new URL(CANONICAL_URL),
  title: {
    default: "Agendra — Lead novo, reunião marcada.",
    template: "%s | Agendra",
  },
  description:
    "A Agendra é a IA que responde, qualifica e agenda seus leads em segundos. Disponível 24/7 no WhatsApp e Instagram para garantir que você nunca mais perca um negócio.",
  keywords: ["IA para agendamento", "automação de leads", "agendamento whatsapp", "qualificação de leads", "SaaS agendamento", "Agendra"],
  authors: [{ name: "Agendra Team" }],
  creator: "Agendra",
  publisher: "Agendra",
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "Agendra — Lead novo, reunião marcada.",
    description: "IA que responde, qualifica e agenda seus leads 24/7. Converta mais com agendamentos automáticos no WhatsApp e Instagram.",
    url: CANONICAL_URL,
    siteName: "Agendra",
    images: [
      {
        url: "/assets/og-image.png",
        width: 1200,
        height: 630,
        alt: "Agendra - Automação de Agendamento com IA",
      },
    ],
    locale: "pt_BR",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Agendra — Lead novo, reunião marcada.",
    description: "IA que responde, qualifica e agenda seus leads 24/7.",
    images: ["/assets/og-image.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  icons: {
    icon: [
      { url: "/assets/agendra-glyph.svg", type: "image/svg+xml" },
      { url: "/favicon.ico", sizes: "any" },
    ],
    apple: "/assets/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#060A14",
  width: "device-width",
  initialScale: 1,
};

import { JsonLd } from "@/components/seo/json-ld";
import Script from "next/script";
import { GA_TRACKING_ID } from "@/lib/analytics";
import { Toaster } from "sonner";
import { SpeedInsights } from "@vercel/speed-insights/next";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="pt-BR"
      className={`${interTight.variable} ${jetbrains.variable}`}
      suppressHydrationWarning
    >
      <body className="antialiased" suppressHydrationWarning>
        {process.env.NEXT_PUBLIC_SUPABASE_URL && (
          <link
            rel="preconnect"
            href={process.env.NEXT_PUBLIC_SUPABASE_URL}
            crossOrigin="anonymous"
          />
        )}
        <link
          rel="preload"
          href="/assets/agendra-logo.svg"
          as="image"
          type="image/svg+xml"
        />
        <JsonLd />
        {children}
        <Toaster theme="dark" position="top-center" richColors />
        <SpeedInsights />
        {/* GA4 — lazyOnload defers until after LCP is painted */}
        <Script
          src={`https://www.googletagmanager.com/gtag/js?id=${GA_TRACKING_ID}`}
          strategy="lazyOnload"
        />
        <Script id="ga-init" strategy="lazyOnload">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', '${GA_TRACKING_ID}', { send_page_view: true });
          `}
        </Script>
      </body>
    </html>
  );
}
