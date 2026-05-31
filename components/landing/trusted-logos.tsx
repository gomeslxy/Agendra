"use client";

import React from "react";
import Image from "next/image";
import { InfiniteSlider } from "@/components/ui/infinite-slider";

const LOGOS = [
  { name: "WhatsApp",        url: "/logos/whatsapp.svg" },
  { name: "Google Calendar", url: "/logos/google-calendar.svg" },
  { name: "Stripe",          url: "/logos/stripe.svg" },
  { name: "HubSpot",         url: "/logos/hubspot.svg" },
  { name: "Salesforce",      url: "/logos/salesforce.svg" },
  { name: "Zapier",          url: "/logos/zapier.svg" },
  { name: "Instagram",       url: "/logos/instagram.svg" },
];

export function TrustedLogos() {
  return (
    <section className="relative border-b border-[#E4E4E7] bg-white py-8" aria-label="Ferramentas integradas">
      <div className="mx-auto max-w-[1200px] px-6 text-center">
        <p className="mb-6 font-mono text-[10px] font-bold tracking-[0.2em] text-[#71717A] uppercase">
          CONECTADO COM AS MAIORES PLATAFORMAS DO MERCADO
        </p>
        <div className="relative">
          {/* Fading gradient masks for smooth transition edges */}
          <div className="absolute inset-y-0 left-0 z-10 w-20 bg-gradient-to-r from-white to-transparent pointer-events-none sm:w-32" />
          <div className="absolute inset-y-0 right-0 z-10 w-20 bg-gradient-to-l from-white to-transparent pointer-events-none sm:w-32" />

          <InfiniteSlider gap={80} duration={30}>
            {LOGOS.map((logo) => (
              <div
                key={logo.name}
                className="flex items-center gap-3 opacity-55 grayscale transition-all hover:opacity-100 hover:grayscale-0"
              >
                <Image
                  src={logo.url}
                  alt={logo.name}
                  width={24}
                  height={24}
                  className="h-6 w-auto"
                />
                <span className="text-xs font-semibold tracking-tight text-[#3F3F46]">{logo.name}</span>
              </div>
            ))}
          </InfiniteSlider>
        </div>
      </div>
    </section>
  );
}
