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
  preload: false,
  adjustFontFallback: true,
});

export const metadata: Metadata = {
  metadataBase: new URL("https://www.agendra.site"),
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
    url: "https://www.agendra.site",
    siteName: "Agendra",
    images: [
      {
        url: "/assets/og-image.png", // We will generate this
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
    icon: "/assets/agendra-glyph.svg",
    apple: "/assets/agendra-glyph.svg",
  },
};

export const viewport: Viewport = {
  themeColor: "#060A14",
  width: "device-width",
  initialScale: 1,
};

import { MotionProvider } from "@/components/motion/motion-provider";
import { JsonLd } from "@/components/seo/json-ld";
import { GoogleAnalytics } from "@next/third-parties/google";
import { GA_TRACKING_ID } from "@/lib/analytics";
import { Toaster } from "sonner";

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
        <JsonLd />
        <MotionProvider>{children}</MotionProvider>
        <Toaster theme="dark" position="top-center" richColors />
      </body>
      <GoogleAnalytics gaId={GA_TRACKING_ID} />
    </html>
  );
}
