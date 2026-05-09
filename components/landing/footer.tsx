import Image from "next/image";
import Link from "next/link";

const COLS = [
  { h: "Produto",  links: ["Como funciona", "Integrações", "Preço", "Mudanças"] },
  { h: "Empresa",  links: ["Sobre", "Carreiras", "Contato", "Imprensa"] },
  { h: "Legal",    links: ["Termos", "Privacidade", "LGPD"] },
];

export function Footer() {
  return (
    <footer className="relative border-t border-white/[0.08] py-12 pb-9"
            style={{ color: "var(--color-fg-3)" }}>
      <div className="mx-auto max-w-[1200px] px-6">
        <div className="flex flex-wrap items-start justify-between gap-8">
          <div className="min-w-[260px] flex-1">
            <Image src="/assets/agendra-logo.svg" alt="Agendra - IA para agendamento automático de leads" width={112} height={28} />
            <p className="mt-3 max-w-xs text-sm"
               style={{ color: "var(--color-fg-2)" }}>
              Agendra é a inteligência artificial brasileira que responde, qualifica e agenda seus leads 24/7.
            </p>
          </div>

          <div className="flex flex-wrap items-start gap-12">
            {COLS.map((c) => (
              <div key={c.h} className="flex flex-col gap-2">
                <div className="text-xs font-medium tracking-wider"
                     style={{ color: "var(--color-fg-2)" }}>
                  {c.h.toUpperCase()}
                </div>
                {c.links.map((x) => (
                  <Link
                    key={x}
                    href="#"
                    className="text-sm transition-colors hover:text-white"
                    style={{ color: "var(--color-fg-3)" }}
                  >
                    {x}
                  </Link>
                ))}
              </div>
            ))}
          </div>
        </div>

        <div className="mt-9 flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.08] pt-4 text-sm"
             style={{ color: "var(--color-fg-3)" }}>
          <span>© 2026 Agendra · Feito no Brasil 🇧🇷</span>
          <span className="font-mono">v1.0 · Maio 2026</span>
        </div>
      </div>
    </footer>
  );
}
