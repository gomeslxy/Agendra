/**
 * Period-aware conversion funnel.
 *
 * Built from per-day buckets so it stays aligned with the period-scoped KPI cards
 * (no more 90d-vs-period divergence). Gates are cumulative supersets, guaranteeing a
 * monotonic non-increasing funnel:
 *   Captados ⊇ Interagiram ⊇ Qualificados ⊇ Agendaram ⊇ Convertidos
 *
 * Identities held by construction (see page.tsx gate computation):
 *   Captados    === Σ leads            (== KPI "Novos Leads")
 *   Convertidos === Σ converted        (== KPI "Convertidos")
 */
export interface FunnelDay {
  leads: number;
  hot: number;
  warm: number;
  converted: number;
  fInteragiu: number;
  fAgendou: number;
}

export interface FunnelStage {
  label: string;
  value: number;
  color: string;
}

export function computeFunnel(series: FunnelDay[]): FunnelStage[] {
  const captados = series.reduce((s, d) => s + d.leads, 0);
  const interagiram = series.reduce((s, d) => s + d.fInteragiu, 0);
  const qualificados = series.reduce((s, d) => s + d.hot + d.warm + d.converted, 0);
  const agendaram = series.reduce((s, d) => s + d.fAgendou, 0);
  const convertidos = series.reduce((s, d) => s + d.converted, 0);

  return [
    { label: "Captados", value: captados, color: "#3B82F6" },
    { label: "Interagiram", value: interagiram, color: "#8B5CF6" },
    { label: "Qualificados", value: qualificados, color: "#14B8A6" },
    { label: "Agendaram", value: agendaram, color: "#F59E0B" },
    { label: "Convertidos", value: convertidos, color: "#10B981" },
  ];
}
