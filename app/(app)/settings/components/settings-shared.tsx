"use client";

import Link from "next/link";
import { Zap } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PanelSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <div className="h-48 animate-pulse rounded-2xl bg-[#F4F4F5]" />
      <div className="h-32 animate-pulse rounded-2xl bg-[#F4F4F5]" />
    </div>
  );
}

export function ReadOnlyBanner() {
  return (
    <div className="rounded-xl border border-[#FDE68A] bg-[#FFFBEB] p-3.5 text-xs text-[#92400E] shadow-sm">
      ⚠️ <strong>Apenas Leitura:</strong> Você não possui permissões administrativas. As configurações estão em modo de visualização.
    </div>
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-4 flex flex-col gap-1.5">
      <span
        className="font-mono text-[10px] uppercase tracking-widest"
        style={{ color: "var(--color-fg-3)" }}
      >
        {label}
      </span>
      {children}
    </div>
  );
}

export function FeatureGate({
  planType,
  requiredPlan,
  title,
  desc,
  children,
}: {
  planType: string | null | undefined;
  requiredPlan: "pro" | "business";
  title: string;
  desc: string;
  children: React.ReactNode;
}) {
  const PLAN_WEIGHTS: Record<string, number> = { trial: 0, starter: 1, pro: 2, business: 3 };
  const currentWeight = PLAN_WEIGHTS[planType ?? "trial"] ?? 0;
  const requiredWeight = PLAN_WEIGHTS[requiredPlan];

  if (currentWeight >= requiredWeight) {
    return <>{children}</>;
  }

  return (
    <div className="relative overflow-hidden rounded-2xl border border-[#E4E4E7]">
      <div className="opacity-30 blur-[6px] pointer-events-none select-none">{children}</div>
      <div className="absolute inset-0 z-10 flex flex-col items-center justify-center p-6 text-center bg-black/40 bg-gradient-to-t from-[rgb(11,18,34)] to-transparent">
        <div className="border border-[#E4E4E7] bg-white p-6 sm:p-8 rounded-xl max-w-md w-full relative overflow-hidden shadow-2xl">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-brand-blue-500/20 text-[#2563EB] mb-4 ring-1 ring-brand-blue-500/30">
            <Zap size={24} className="animate-pulse" />
          </div>
          <h3 className="text-xl font-bold text-[#09090B] mb-2">{title}</h3>
          <p className="text-sm text-[#3F3F46] mb-6 leading-relaxed">
            {desc} Recurso exclusivo para o plano {requiredPlan === "pro" ? "Pro ou superior" : "Business"}.
          </p>
          <Link href="/settings?tab=billing" className="block w-full">
            <Button variant="blue" className="w-full font-bold shadow-lg shadow-brand-blue-500/20">
              Fazer Upgrade Agora
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}

export function getPlaceholdersByBusinessType(businessType?: string): {
  multipleServices: string;
  singleService: string;
  price: string;
} {
  const bt = (businessType || "").toLowerCase();

  if (
    bt.includes("clínica") ||
    bt.includes("saúde") ||
    bt.includes("estética") ||
    bt.includes("médic") ||
    bt.includes("dentis") ||
    bt.includes("fisiot")
  ) {
    return {
      multipleServices: "Ex.: consulta médica, drenagem linfática, avaliação inicial",
      singleService: "Ex: Consulta Inicial",
      price: "Ex: 150,00",
    };
  }

  if (bt.includes("advoc") || bt.includes("juríd") || bt.includes("direit") || bt.includes("legal")) {
    return {
      multipleServices: "Ex.: consulta jurídica, análise de contrato, parecer técnico",
      singleService: "Ex: Parecer Técnico",
      price: "Ex: 250,00",
    };
  }

  if (bt.includes("consult") || bt.includes("mentor") || bt.includes("coach") || bt.includes("ti") || bt.includes("desenvol")) {
    return {
      multipleServices: "Ex.: mentoria individual, diagnóstico de TI, setup inicial",
      singleService: "Ex: Sessão Estratégica",
      price: "Ex: 350,00",
    };
  }

  if (bt.includes("imobil") || bt.includes("corret") || bt.includes("imóv")) {
    return {
      multipleServices: "Ex.: visita técnica, avaliação de imóvel, vistoria de entrega",
      singleService: "Ex: Visita ao Imóvel",
      price: "Ex: 0,00",
    };
  }

  if (bt.includes("educa") || bt.includes("aula") || bt.includes("curso") || bt.includes("escola") || bt.includes("treina")) {
    return {
      multipleServices: "Ex.: aula particular, teste de nivelamento, matrícula anual",
      singleService: "Ex: Aula Experimental",
      price: "Ex: 80,00",
    };
  }

  if (bt.includes("salão") || bt.includes("beleza") || bt.includes("cabel") || bt.includes("corte") || bt.includes("barba") || bt.includes("manicur") || bt.includes("barbearia")) {
    return {
      multipleServices: "Ex.: corte, coloração, manicure, barba",
      singleService: "Ex: Corte de Cabelo",
      price: "Ex: 50,00",
    };
  }

  return {
    multipleServices: "Ex.: atendimento, consulta, mentoria",
    singleService: "Ex: Atendimento Geral",
    price: "Ex: 100,00",
  };
}
