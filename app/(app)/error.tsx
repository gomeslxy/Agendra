"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, Inbox, RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { logError } from "@/lib/logging";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    logError("[AppError]", { message: error.message, digest: error.digest });
  }, [error]);

  return (
    <div className="flex h-full min-h-[60vh] items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border border-[#E4E4E7] bg-white p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#FEF2F2] text-[#DC2626] border border-[#FECACA]">
          <AlertTriangle size={22} />
        </div>
        <h2 className="text-lg font-bold tracking-tight text-[#09090B]">
          Erro ao carregar esta página
        </h2>
        <p className="mt-2 text-sm text-[#71717A] leading-relaxed">
          Ocorreu uma falha temporária ao processar os dados. Você pode tentar novamente ou voltar ao Inbox.
        </p>
        {error.digest && (
          <p className="mt-3 font-mono text-[11px] text-[#A1A1AA]">
            Código: {error.digest}
          </p>
        )}
        <div className="mt-6 flex flex-col gap-2.5 sm:flex-row">
          <Button onClick={() => reset()} variant="primary" className="flex-1 justify-center">
            <RefreshCcw size={15} />
            Tentar novamente
          </Button>
          <Link href="/inbox" className="flex-1">
            <Button variant="secondary" className="w-full justify-center">
              <Inbox size={15} />
              Ir para Inbox
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
