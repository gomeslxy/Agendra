export type LeadStatus = "hot" | "warm" | "cold" | "success";
export type EventSource = "agendra" | "gcal";
export type GCalSyncStatus = "synced" | "pending" | "error" | null;
export type EventStatus = "pending" | "confirmed" | "cancelled" | "rescheduled" | null;

export interface EventLead {
  name: string;
  status: LeadStatus;
  phone: string;
}

export interface AgendaEvent {
  id: string;
  title: string;
  start_time: string;
  end_time: string;
  lead_id: string | null;
  leads: EventLead | null;
  source: EventSource;
  gcal_sync_status: GCalSyncStatus;
  gcal_event_id: string | null;
  status: EventStatus;
}

export interface LeadOption {
  id: string;
  name: string;
  status: LeadStatus;
  phone: string;
}

export const MONTHS = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

export const DOW = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

export const HEAT_COLOR: Record<LeadStatus, string> = {
  hot: "#F97316",
  warm: "#F59E0B",
  cold: "#60A5FA",
  success: "#14B8A6",
};

export const HEAT_LABEL: Record<LeadStatus, string> = {
  hot: "Quente",
  warm: "Morno",
  cold: "Frio",
  success: "Convertido",
};

export const GCAL_INDIGO = "#6366F1";

export function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export function toDatetimeLocal(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function formatRelative(iso: string) {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return "agora";
  if (mins < 60) return `há ${mins}min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `há ${hrs}h`;
  return `há ${Math.floor(hrs / 24)}d`;
}
