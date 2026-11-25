import type { LeadWithInboxMessages, InboxMessageItem } from "../reconcile";

export const TONE_CYCLE: Array<"cold" | "warm" | "hot"> = ["cold", "warm", "hot"];
export const TONE_LABEL: Record<string, string> = {
  cold: "Formal",
  warm: "Amigável",
  hot: "Persuasivo",
};

export const CONTROL_MODES: Array<"autonomous" | "shadow" | "manual"> = [
  "autonomous",
  "shadow",
  "manual",
];

export const CONTROL_LABEL: Record<string, string> = {
  autonomous: "Autônomo",
  shadow: "Copiloto (Shadow)",
  manual: "Manual",
};

export function initials(name: string) {
  return name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

export function relativeTime(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "agora";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d === 1) return "ontem";
  if (d < 7) return `${d}d`;
  return new Date(dateStr).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

export function lastMsg(lead: LeadWithInboxMessages): InboxMessageItem | undefined {
  const msgs = lead.messages;
  return msgs.length > 0 ? msgs[msgs.length - 1] : undefined;
}

export function activityLabel(lead: LeadWithInboxMessages): { dot: string; text: string } {
  const ts = lead.last_message_at ?? lastMsg(lead)?.created_at;
  if (!ts) return { dot: "bg-[#D4D4D8]", text: lead.channel };
  const diffMin = Math.floor((Date.now() - new Date(ts).getTime()) / 60000);
  if (diffMin < 5) return { dot: "bg-[#22C55E] animate-pulse", text: `Ativo agora · ${lead.channel}` };
  if (diffMin < 60) return { dot: "bg-[#F59E0B]", text: `Ativo há ${diffMin}m · ${lead.channel}` };
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return { dot: "bg-[#D4D4D8]", text: `Ativo há ${diffH}h · ${lead.channel}` };
  return { dot: "bg-[#D4D4D8]", text: lead.channel };
}

export function sortLeadsByRecency(arr: LeadWithInboxMessages[]): LeadWithInboxMessages[] {
  return arr.slice().sort((a, b) => {
    const aTs = a.last_message_at ?? lastMsg(a)?.created_at ?? a.updated_at;
    const bTs = b.last_message_at ?? lastMsg(b)?.created_at ?? b.updated_at;
    return new Date(bTs).getTime() - new Date(aTs).getTime();
  });
}
