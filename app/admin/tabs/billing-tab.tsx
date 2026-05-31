// app/admin/tabs/billing-tab.tsx
"use client";

import { DollarSign, AlertTriangle, TrendingUp, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { extendTenantMessageLimit } from "../actions";
import { PLAN_LIMITS } from "@/lib/billing/plans";
import type { Company, SummaryData } from "../types";

interface Props {
  companies: Company[];
  summary: SummaryData;
}

export function BillingTab({ companies, summary }: Props) {
  const router = useRouter();

  // Only Stripe-backed active subscriptions count as recognized revenue (M1).
  const payingCompanies = companies.filter((c) => c.mrr_real);
  const mrrByPlan = ["starter", "pro", "business"].map((plan) => {
    const cos = payingCompanies.filter((c) => c.plan_type === plan);
    return {
      plan,
      count: cos.length,
      mrr: cos.reduce((s, c) => s + c.mrr, 0),
    };
  });

  async function handleExtend(company: Company) {
    const res = await extendTenantMessageLimit(company.id, 500);
    if (res.success) { toast.success(`+500 leads adicionados para ${company.name}`); router.refresh(); }
    else toast.error(res.error || "Erro ao estender limite");
  }

  // Compute lead usage per company (leads_active vs plan limit + extra_leads)
  const companiesWithUsage = companies.map((c) => {
    const limit = PLAN_LIMITS[c.plan_type as keyof typeof PLAN_LIMITS]?.maxLeads ?? 50;
    const effective = limit + c.extra_leads;
    const pct = effective > 0 ? Math.min(100, Math.round((c.leads_active / effective) * 100)) : 0;
    const atLimit = pct >= 90;
    return { ...c, limit, effective, pct, atLimit };
  }).sort((a, b) => b.pct - a.pct);

  const atLimitCount = companiesWithUsage.filter((c) => c.atLimit).length;

  return (
    <div className="flex flex-col gap-6">
      {/* MRR breakdown */}
      <div className="border border-[#E4E4E7] bg-white rounded-2xl p-6 shadow-sm">
        <div className="flex items-center gap-2 mb-5">
          <DollarSign size={15} className="text-[#16A34A]" />
          <h2 className="text-sm font-semibold text-[#09090B]">MRR Breakdown</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
          <div className="border border-[#BBF7D0] bg-[#F0FDF4] rounded-2xl p-5">
            <div className="text-xs font-semibold uppercase tracking-wider text-[#71717A] mb-2">MRR Total</div>
            <div className="text-3xl font-bold font-mono text-[#09090B]">
              R${summary.estimatedMRR.toLocaleString("pt-BR")}
            </div>
            <div className="text-[10px] text-[#71717A] mt-1">{payingCompanies.length} clientes pagantes</div>
          </div>
          {mrrByPlan.map(({ plan, count, mrr }) => (
            <div key={plan} className="border border-[#E4E4E7] bg-[#F4F4F5] rounded-2xl p-5">
              <div className="text-[10px] font-mono font-bold uppercase text-[#71717A] mb-2">{plan}</div>
              <div className="text-2xl font-bold font-mono text-[#09090B]">R${mrr.toLocaleString("pt-BR")}</div>
              <div className="text-[10px] text-[#71717A] mt-1">{count} empresa{count !== 1 ? "s" : ""}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Usage vs limits */}
      <div className="border border-[#E4E4E7] bg-white rounded-2xl shadow-sm overflow-hidden">
        <div className={`px-5 py-4 border-b flex items-center gap-2 ${atLimitCount > 0 ? "border-[#FECACA] bg-[#FFF1F2]" : "border-[#E4E4E7] bg-[#F4F4F5]"}`}>
          <TrendingUp size={15} className={atLimitCount > 0 ? "text-[#DC2626]" : "text-[#71717A]"} />
          <h2 className="text-sm font-semibold text-[#09090B]">Uso de Leads por Empresa</h2>
          {atLimitCount > 0 && (
            <span className="ml-auto flex items-center gap-1 text-xs text-[#DC2626] font-semibold">
              <AlertTriangle size={12} />
              {atLimitCount} empresa{atLimitCount > 1 ? "s" : ""} no limite
            </span>
          )}
        </div>
        <div className="p-4 flex flex-col gap-2.5">
          {companiesWithUsage.map((c) => (
            <div key={c.id} className={`flex items-center gap-3 rounded-xl px-4 py-2.5 border text-xs ${c.atLimit ? "border-[#FECACA] bg-[#FFF1F2]" : "border-[#E4E4E7] bg-white"}`}>
              <div className="w-36 truncate font-semibold text-[#09090B]">{c.name}</div>
              <span className="text-[10px] font-mono uppercase text-[#71717A] w-14">{c.plan_type}</span>
              <div className="flex-1">
                <div className="flex justify-between text-[10px] text-[#71717A] mb-0.5">
                  <span>{c.leads_active} / {c.effective} leads</span>
                  <span className={`font-bold ${c.atLimit ? "text-[#DC2626]" : "text-[#3F3F46]"}`}>{c.pct}%</span>
                </div>
                <div className="h-1.5 bg-[#F4F4F5] rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${c.pct >= 90 ? "bg-[#DC2626]" : c.pct >= 70 ? "bg-[#FBBF24]" : "bg-[#14B8A6]"}`}
                    style={{ width: `${c.pct}%` }}
                  />
                </div>
              </div>
              {c.extra_leads > 0 && (
                <span className="text-[9px] font-mono text-[#2563EB] bg-[#EFF6FF] border border-[#BFDBFE] px-1.5 py-0.5 rounded-full">
                  +{c.extra_leads} extra
                </span>
              )}
              {c.atLimit && (
                <Button
                  size="sm"
                  variant="secondary"
                  className="text-[10px] px-2 py-1 gap-0.5 border-[#FECACA] hover:bg-white"
                  onClick={() => handleExtend(c)}
                >
                  <Plus size={10} /> +500
                </Button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
