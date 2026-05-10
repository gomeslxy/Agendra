"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Glass } from "@/components/ui/glass";
import { trackEvent } from "@/lib/analytics";
import { RefreshCcw, Home, LayoutDashboard, ChevronRight, Bug } from "lucide-react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [showDebug, setShowDebug] = useState(false);
  const [isHome, setIsHome] = useState(false);

  useEffect(() => {
    setIsHome(window.location.pathname === "/");
    
    // Rastreia o erro no GA4
    trackEvent("critical_error", {
      category: "runtime",
      message: error.message,
      digest: error.digest,
      location: window.location.pathname,
    });
    
    // Log para console
    console.error("[Agendra Critical Error]", error);
  }, [error]);

  return (
    <div className="relative min-h-screen grid place-items-center bg-[#050505] px-6 overflow-hidden">
      {/* Background Aurora Effect */}
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 -left-1/4 w-[100vw] h-[100vh] bg-brand-blue-500/10 blur-[120px] rounded-full animate-pulse" />
        <div className="absolute bottom-1/4 -right-1/4 w-[80vw] h-[80vh] bg-red-500/10 blur-[100px] rounded-full" />
      </div>

      <motion.div 
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-lg relative z-10"
      >
        <Glass className="p-8 sm:p-12 border-red-500/20 bg-red-500/[0.02] overflow-hidden">
          {/* Top error badge */}
          <div className="mb-10 flex flex-col items-center gap-6">
            <div className="relative">
              <motion.div 
                animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0.6, 0.3] }}
                transition={{ duration: 4, repeat: Infinity }}
                className="absolute inset-0 bg-red-500 blur-3xl rounded-full" 
              />
              <div className="relative rounded-3xl bg-black border border-red-500/30 p-5 shadow-2xl">
                <Bug size={40} className="text-red-500" />
              </div>
            </div>
            
            <div className="text-center space-y-3">
              <h1 className="text-3xl font-black tracking-tighter text-white uppercase italic">
                Opa! Algo quebrou.
              </h1>
              <p className="text-[15px] text-white/60 leading-relaxed max-w-sm mx-auto font-medium">
                Tivemos um problema técnico inesperado. Nossa IA já registrou o log e nossa equipe foi alertada.
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <Button
              variant="blue"
              className="h-14 w-full justify-center text-sm font-black uppercase tracking-widest shadow-glow-blue"
              onClick={() => reset()}
            >
              <RefreshCcw size={18} />
              Tentar Novamente
            </Button>
            
            <Link href={isHome ? "/inbox" : "/"} className="w-full">
              <Button
                variant="secondary"
                className="h-12 w-full justify-center bg-white/5 border-white/10 hover:bg-white/10 text-white/80 font-bold uppercase tracking-wider text-xs"
              >
                {isHome ? <LayoutDashboard size={18} /> : <Home size={18} />}
                {isHome ? "Ir para Inbox" : "Voltar ao Início"}
              </Button>
            </Link>

            <div className="mt-6 flex flex-col items-center">
              <button 
                onClick={() => setShowDebug(!showDebug)}
                className="text-[10px] font-black uppercase tracking-[0.2em] text-white/20 hover:text-white/40 transition-colors flex items-center gap-2 group"
              >
                <ChevronRight size={12} className={cn("transition-transform duration-300", showDebug && "rotate-90")} />
                Ver Detalhes do Erro
              </button>

              <AnimatePresence>
                {showDebug && (
                  <motion.div
                    initial={{ opacity: 0, height: 0, y: -10 }}
                    animate={{ opacity: 1, height: "auto", y: 0 }}
                    exit={{ opacity: 0, height: 0, y: -10 }}
                    className="w-full mt-4"
                  >
                    <div className="rounded-2xl bg-black/60 border border-white/5 p-5 font-mono shadow-inner">
                      <div className="flex items-center gap-2 mb-3">
                        <div className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
                        <span className="text-[9px] uppercase text-white/40 tracking-[0.2em] font-bold">Stack Trace / Debug Info</span>
                      </div>
                      <pre className="max-h-48 overflow-auto text-[11px] text-red-400/80 custom-scrollbar leading-relaxed">
                        {error.message}
                        {"\n\n"}
                        {error.digest && `Digest: ${error.digest}\n\n`}
                        {error.stack}
                      </pre>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </Glass>
        
        <p className="mt-8 text-center text-[9px] font-bold text-white/10 uppercase tracking-[0.4em]">
          Agendra AI Core · System Integrity Status: Compromised
        </p>
      </motion.div>
    </div>
  );
}
