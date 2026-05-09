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
  title: "Agendra — Lead novo, reunião marcada.",
  description:
    "Agendra responde, qualifica e agenda — em segundos, 24/7, em todos os canais. Sem fila, sem espera, sem lead perdido.",
  icons: { icon: "/assets/agendra-glyph.svg" },
};

export const viewport: Viewport = {
  themeColor: "#060A14",
  width: "device-width",
  initialScale: 1,
};

import { MotionProvider } from "@/components/motion/motion-provider";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="pt-BR"
      className={`${interTight.variable} ${jetbrains.variable}`}
    >
      <body className="antialiased">
        <MotionProvider>{children}</MotionProvider>
      </body>
    </html>
  );
}
