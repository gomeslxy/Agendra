import {
  IconInbox,
  IconAgenda,
  IconLeads,
  IconReports,
  IconPersona,
  IconFlows,
  IconChannels,
  IconTeam,
  IconSettings,
} from "@/components/icons";

export type NavItem =
  | {
      kind: "link";
      id: string;
      label: string;
      icon: React.ComponentType<{ size?: number; className?: string }>;
      href: string;
      badge?: { type: "hot" | "warm" | "cold" | "success"; count: number };
    }
  | { kind: "section"; label: string };

export const NAV: NavItem[] = [
  {
    kind: "link",
    id: "inbox",
    label: "Caixa de entrada",
    icon: IconInbox,
    href: "/inbox",
    badge: { type: "hot", count: 0 },
  },
  { kind: "link", id: "agenda",  label: "Agenda",      icon: IconAgenda,   href: "/agenda" },
  { kind: "link", id: "leads",   label: "Leads",       icon: IconLeads,    href: "/leads" },
  { kind: "link", id: "reports", label: "Relatórios",  icon: IconReports,  href: "/reports" },
  { kind: "section", label: "Sistema" },
  { kind: "link", id: "settings", label: "Configurações", icon: IconSettings, href: "/settings" },
];

export const HEAT_GRADIENT: Record<string, string> = {
  hot:     "linear-gradient(135deg,#F97316,#FB923C)",
  warm:    "linear-gradient(135deg,#F59E0B,#FB923C)",
  cold:    "linear-gradient(135deg,#3B82F6,#60A5FA)",
  success: "linear-gradient(135deg,#0F766E,#14B8A6)",
};

export const HEAT_LABEL: Record<string, string> = {
  hot: "Quente",
  warm: "Morno",
  cold: "Frio",
  success: "Convertido",
};
