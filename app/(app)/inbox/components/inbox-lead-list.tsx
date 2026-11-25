"use client";

import { memo, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Instagram, MessageCircle, Search, Zap } from "lucide-react";
import { SafeClientOnly } from "@/components/ui/safe-client-only";
import { cn } from "@/lib/utils";
import type { LeadWithInboxMessages } from "../reconcile";
import { initials, lastMsg, relativeTime } from "./inbox-utils";

interface LeadListItemProps {
  lead: LeadWithInboxMessages;
  isActive: boolean;
  unreadCount: number;
  onSelect: (id: string) => void;
}

const LeadListItem = memo(function LeadListItem({
  lead: l,
  isActive,
  unreadCount,
  onSelect,
}: LeadListItemProps) {
  const last = lastMsg(l);
  const isDraft = Boolean((last?.metadata as Record<string, unknown> | null)?.is_draft);

  return (
    <motion.div
      layout="position"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
      onClick={() => onSelect(l.id)}
      className={cn(
        "group relative flex cursor-pointer items-center gap-4 border-b border-[#F4F4F5] px-5 py-3.5 transition-colors duration-150 select-none hover:bg-[#F4F4F5]",
        isActive && "bg-[#EFF6FF] border-b-[#DBEAFE] hover:bg-[#EFF6FF]",
      )}
    >
      {isActive && <div className="absolute inset-y-2 left-0 w-[2px] rounded-r-full bg-[#2563EB]" />}
      <div className="relative grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#F4F4F5] border border-[#E4E4E7] text-[10px] font-bold text-[#3F3F46]">
        {initials(l.name)}
        <div
          className={cn(
            "absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white transition-all",
            l.status === "hot"
              ? "bg-[#F97316]"
              : l.status === "warm"
                ? "bg-[#F59E0B]"
                : l.status === "success"
                  ? "bg-[#22C55E]"
                  : "bg-[#3B82F6]",
          )}
        />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-[#2563EB] border-2 border-white text-[8px] font-black text-white leading-none">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="truncate text-[13px] font-semibold text-[#09090B]">{l.name}</span>
            {l.channel === "whatsapp" && <MessageCircle size={11} className="text-[#14B8A6] shrink-0" />}
            {l.channel === "instagram" && <Instagram size={11} className="text-pink-400 shrink-0" />}
          </div>
          <SafeClientOnly fallback={<span className="font-mono text-[9px] font-medium text-[#71717A] whitespace-nowrap">—</span>}>
            <span className="font-mono text-[9px] font-medium text-[#71717A] whitespace-nowrap">
              {last ? relativeTime(last.created_at) : "—"}
            </span>
          </SafeClientOnly>
        </div>
        <div className="mt-0.5 flex items-center gap-1.5 min-w-0">
          {isDraft && (
            <span className="shrink-0 text-[8px] font-bold uppercase tracking-wide text-[#1D4ED8] bg-[#EFF6FF] border border-[#BFDBFE] rounded px-1 py-0.5">
              Rascunho
            </span>
          )}
          <span className="truncate text-[11px] text-[#71717A]">{last?.content ?? "Nenhuma mensagem"}</span>
        </div>
      </div>
    </motion.div>
  );
});

interface InboxLeadListProps {
  leads: LeadWithInboxMessages[];
  selectedId: string | null;
  unreadCounts: Map<string, number>;
  isConnected: boolean | null;
  showChatOnMobile: boolean;
  onSelect: (id: string) => void;
}

export function InboxLeadList({
  leads,
  selectedId,
  unreadCounts,
  isConnected,
  showChatOnMobile,
  onSelect,
}: InboxLeadListProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [channelFilter, setChannelFilter] = useState<string>("all");

  const normalizedSearch = useMemo(() => searchQuery.toLowerCase(), [searchQuery]);

  const filteredLeads = useMemo(() => {
    return leads.filter((l) => {
      const matchSearch =
        !normalizedSearch ||
        l.name.toLowerCase().includes(normalizedSearch) ||
        l.phone.includes(normalizedSearch);
      const matchStatus = statusFilter === "all" || l.status === statusFilter;
      const matchChannel = channelFilter === "all" || l.channel === channelFilter;
      return matchSearch && matchStatus && matchChannel;
    });
  }, [leads, normalizedSearch, statusFilter, channelFilter]);

  return (
    <section
      className={cn(
        "flex flex-col border-r border-[#E4E4E7] bg-white transition-all duration-300 lg:w-[320px] lg:shrink-0 min-h-0",
        showChatOnMobile ? "hidden lg:flex" : "flex w-full",
      )}
    >
      <div className="px-5 pb-3 pt-5 shrink-0">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-black tracking-tight text-[#09090B]">Inbox</h2>
          <div
            className={cn(
              "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold transition-all duration-500",
              isConnected === true
                ? "bg-[#F0FDFA] text-[#0F766E] border border-[#CCFBF1]"
                : isConnected === false
                  ? "bg-[#FFF1F2] text-[#DC2626] border border-[#FECACA]"
                  : "bg-[#F4F4F5] text-[#71717A] border border-[#E4E4E7]",
            )}
          >
            <span
              className={cn(
                "h-1.5 w-1.5 rounded-full",
                isConnected === true ? "bg-[#14B8A6] animate-pulse" : isConnected === false ? "bg-[#DC2626]" : "bg-[#D4D4D8]",
              )}
            />
            {isConnected === true ? "LIVE" : isConnected === false ? "OFFLINE" : "···"}
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-3 px-1">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#71717A]" size={14} />
            <input
              type="text"
              placeholder="Buscar por nome ou telefone..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-lg border border-[#E4E4E7] bg-[#F4F4F5] pl-9 pr-3 py-2 text-[13px] text-[#09090B] placeholder:text-[#A1A1AA] focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/10 transition-all"
            />
          </div>

          <div className="flex gap-3 overflow-x-auto pb-1 border-b border-[#E4E4E7] scrollbar-none select-none">
            {["all", "hot", "warm", "cold", "success"].map((status) => (
              <button
                key={status}
                type="button"
                onClick={() => setStatusFilter(status)}
                className={cn(
                  "relative pb-2 text-[10px] font-bold uppercase tracking-wider transition-colors whitespace-nowrap cursor-pointer",
                  statusFilter === status ? "text-[#2563EB]" : "text-[#71717A] hover:text-[#3F3F46]",
                )}
              >
                {status === "all"
                  ? "Todos"
                  : status === "hot"
                    ? "Quente"
                    : status === "warm"
                      ? "Morno"
                      : status === "cold"
                        ? "Frio"
                        : "Convertidos"}
                {statusFilter === status && (
                  <motion.div
                    layoutId="active-filter-status"
                    className="absolute bottom-0 inset-x-0 h-[1.5px] bg-[#2563EB]"
                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                  />
                )}
              </button>
            ))}
          </div>

          <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-none select-none">
            {["all", "whatsapp", "instagram"].map((chan) => (
              <button
                key={chan}
                type="button"
                onClick={() => setChannelFilter(chan)}
                className={cn(
                  "relative pb-1.5 text-[10px] font-bold uppercase tracking-wider transition-colors whitespace-nowrap flex items-center gap-1 cursor-pointer",
                  channelFilter === chan ? "text-[#09090B]" : "text-[#71717A] hover:text-[#3F3F46]",
                )}
              >
                {chan === "whatsapp" && <MessageCircle size={10} className="text-[#14B8A6] shrink-0" />}
                {chan === "instagram" && <Instagram size={10} className="text-pink-400 shrink-0" />}
                <span>{chan === "all" ? "Canais" : chan === "whatsapp" ? "WhatsApp" : "Instagram"}</span>
                {channelFilter === chan && (
                  <motion.div
                    layoutId="active-filter-channel"
                    className="absolute bottom-0 inset-x-0 h-[1px] bg-[#D4D4D8]"
                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                  />
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar">
        {filteredLeads.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 px-5 text-center gap-2">
            <div className="h-12 w-12 rounded-full bg-[#F4F4F5] flex items-center justify-center">
              <Zap size={20} className="text-[#D4D4D8]" />
            </div>
            <p className="text-xs font-medium text-[#A1A1AA]">Nenhum lead encontrado.</p>
          </div>
        ) : (
          <div className="flex flex-col">
            {filteredLeads.map((l) => (
              <LeadListItem
                key={l.id}
                lead={l}
                isActive={l.id === selectedId}
                unreadCount={unreadCounts.get(l.id) ?? 0}
                onSelect={onSelect}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
