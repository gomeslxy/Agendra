"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Glass } from "@/components/ui/glass";
import { trackEvent } from "@/lib/analytics";
import { RefreshCcw, Home } from "lucide-react";
import Link from "next/link";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Rastreia o erro no GA4
    trackEvent("critical_error", {
      category: "runtime",
      message: error.message,
      digest: error.digest,
      location: window.location.pathname,
    });
    
    // Log para console
    console.error("[Runtime Error]", error);
  }, [error]);

  return (
    <div className="grid min-h-screen place-items-center bg-bg-1 px-6">
      <div className="w-full max-w-md">
        <Glass className="p-10 text-center">
          <div className="mb-6 flex justify-center text-[#F43F5E]">
            <div className="rounded-full bg-[#F43F5E]/10 p-4 ring-1 ring-[#F43F5E]/20">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            </div>
          </div>
          
          <h1 className="text-2xl font-bold tracking-tight text-white">
            Algo deu errado
          </h1>
          <p className="mt-3 text-sm leading-relaxed" style={{ color: "var(--color-fg-2)" }}>
            Desculpe o transtorno. O erro foi registrado e nossa equipe será notificada automaticamente.
          </p>

          <div className="mt-8 flex flex-col gap-3">
            <Button
              variant="primary"
              className="w-full justify-center"
              onClick={() => reset()}
            >
              <RefreshCcw size={16} />
              Tentar novamente
            </Button>
            
            <Link href="/" className="w-full">
              <Button
                variant="secondary"
                className="w-full justify-center"
              >
                <Home size={16} />
                Voltar ao Início
              </Button>
            </Link>
          </div>
          
          {process.env.NODE_ENV === "development" && (
            <div className="mt-8 text-left">
              <p className="font-mono text-[10px] uppercase text-fg-3">Debug Info:</p>
              <pre className="mt-2 max-h-32 overflow-auto rounded-lg bg-black/40 p-3 font-mono text-[11px] text-red-400">
                {error.message}
              </pre>
            </div>
          )}
        </Glass>
      </div>
    </div>
  );
}
