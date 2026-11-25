"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, ChevronLeft, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SafeClientOnly } from "@/components/ui/safe-client-only";
import { HEAT_GRADIENT } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { LeadWithInboxMessages } from "../reconcile";
import {
  activityLabel,
  CONTROL_LABEL,
  CONTROL_MODES,
  initials,
  TONE_CYCLE,
  TONE_LABEL,
} from "./inbox-utils";

export function ToneDropdown({
  selected,
  tonePending,
  onToneChange,
  compact = false,
}: {
  selected: LeadWithInboxMessages;
  tonePending: boolean;
  onToneChange: (tone: "cold" | "warm" | "hot") => void;
  compact?: boolean;
}) {
  const [toneOpen, setToneOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setToneOpen((v) => !v);
        }}
        disabled={tonePending}
        className={cn(
          "flex items-center justify-between gap-1.5 rounded-lg border border-[#E4E4E7] bg-white px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wide transition-all hover:bg-[#F4F4F5] disabled:opacity-50 cursor-pointer",
          toneOpen && "bg-[#F4F4F5]",
          compact ? "h-7 px-2" : "w-full",
        )}
      >
        <div className="flex items-center gap-1.5">
          <span
            className={cn(
              "h-1.5 w-1.5 rounded-full",
              selected.conversation_tone === "hot"
                ? "bg-[#F97316]"
                : selected.conversation_tone === "warm"
                  ? "bg-[#F59E0B]"
                  : "bg-[#3B82F6]",
            )}
          />
          <span
            className={cn(
              "text-[9px] sm:text-[10px]",
              selected.conversation_tone === "hot"
                ? "text-[#EA580C]"
                : selected.conversation_tone === "warm"
                  ? "text-[#854D0E]"
                  : "text-[#1D4ED8]",
            )}
          >
            {TONE_LABEL[selected.conversation_tone ?? "warm"]}
          </span>
        </div>
        <ChevronDown size={11} className={cn("text-[#A1A1AA] transition-transform duration-200", toneOpen && "rotate-180")} />
      </button>
      <AnimatePresence>
        {toneOpen && (
          <>
            <div className="fixed inset-0 z-[100]" onClick={() => setToneOpen(false)} />
            <motion.div
              initial={{ opacity: 0, y: -4, scale: 0.97 }}
              animate={{ opacity: 1, y: 4, scale: 1 }}
              exit={{ opacity: 0, y: -4, scale: 0.97 }}
              className={cn(
                "absolute z-[101] overflow-hidden rounded-xl border border-[#E4E4E7] bg-white p-1 shadow-[0_8px_24px_rgba(0,0,0,0.10)]",
                compact ? "right-0 top-full mt-1 w-36" : "left-0 top-full w-full",
              )}
            >
              {TONE_CYCLE.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => {
                    onToneChange(t);
                    setToneOpen(false);
                  }}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wide transition-colors cursor-pointer",
                    selected.conversation_tone === t
                      ? "bg-[#EFF6FF] text-[#1D4ED8]"
                      : "text-[#71717A] hover:bg-[#F4F4F5] hover:text-[#3F3F46]",
                  )}
                >
                  <span
                    className={cn(
                      "h-1.5 w-1.5 rounded-full",
                      t === "hot" ? "bg-[#F97316]" : t === "warm" ? "bg-[#F59E0B]" : "bg-[#3B82F6]",
                    )}
                  />
                  {TONE_LABEL[t]}
                </button>
              ))}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

export function ControlModeDropdown({
  selected,
  controlPending,
  onControlModeChange,
  compact = false,
}: {
  selected: LeadWithInboxMessages;
  controlPending: boolean;
  onControlModeChange: (mode: "autonomous" | "shadow" | "manual") => void;
  compact?: boolean;
}) {
  const [controlOpen, setControlOpen] = useState(false);
  const currentMode = selected.control_mode ?? (selected.is_paused ? "manual" : "autonomous");

  return (
    <div className="relative">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setControlOpen((v) => !v);
        }}
        disabled={controlPending}
        className={cn(
          "flex items-center justify-between gap-1.5 rounded-lg border border-[#E4E4E7] bg-white px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wide transition-all hover:bg-[#F4F4F5] disabled:opacity-50 cursor-pointer",
          controlOpen && "bg-[#F4F4F5]",
          compact ? "h-7 px-2" : "w-full",
        )}
      >
        <div className="flex items-center gap-1.5">
          <span
            className={cn(
              "h-1.5 w-1.5 rounded-full",
              currentMode === "autonomous" ? "bg-[#22C55E]" : currentMode === "shadow" ? "bg-[#3B82F6]" : "bg-[#D4D4D8]",
            )}
          />
          <span
            className={cn(
              "text-[9px] sm:text-[10px]",
              currentMode === "autonomous" ? "text-[#166534]" : currentMode === "shadow" ? "text-[#1D4ED8]" : "text-[#71717A]",
            )}
          >
            {CONTROL_LABEL[currentMode]}
          </span>
        </div>
        <ChevronDown size={11} className={cn("text-[#A1A1AA] transition-transform duration-200", controlOpen && "rotate-180")} />
      </button>
      <AnimatePresence>
        {controlOpen && (
          <>
            <div className="fixed inset-0 z-[100]" onClick={() => setControlOpen(false)} />
            <motion.div
              initial={{ opacity: 0, y: -4, scale: 0.97 }}
              animate={{ opacity: 1, y: 4, scale: 1 }}
              exit={{ opacity: 0, y: -4, scale: 0.97 }}
              className={cn(
                "absolute z-[101] overflow-hidden rounded-xl border border-[#E4E4E7] bg-white p-1 shadow-[0_8px_24px_rgba(0,0,0,0.10)]",
                compact ? "right-0 top-full mt-1 w-48" : "left-0 top-full w-full",
              )}
            >
              {CONTROL_MODES.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => {
                    onControlModeChange(m);
                    setControlOpen(false);
                  }}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-[10px] font-bold uppercase tracking-wide transition-colors text-left cursor-pointer",
                    currentMode === m ? "bg-[#EFF6FF] text-[#1D4ED8]" : "text-[#71717A] hover:bg-[#F4F4F5] hover:text-[#3F3F46]",
                  )}
                >
                  <span
                    className={cn(
                      "h-1.5 w-1.5 rounded-full shrink-0",
                      m === "autonomous" ? "bg-[#22C55E]" : m === "shadow" ? "bg-[#3B82F6]" : "bg-[#D4D4D8]",
                    )}
                  />
                  <div className="flex flex-col">
                    <span>{CONTROL_LABEL[m]}</span>
                    <span className="text-[8px] font-medium text-[#71717A] tracking-normal normal-case">
                      {m === "autonomous"
                        ? "IA responde automaticamente"
                        : m === "shadow"
                          ? "Gera rascunhos para aprovar"
                          : "IA desativada para este lead"}
                    </span>
                  </div>
                </button>
              ))}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

interface InboxChatHeaderProps {
  selected: LeadWithInboxMessages;
  mounted: boolean;
  tonePending: boolean;
  controlPending: boolean;
  onBackMobile: () => void;
  onToneChange: (tone: "cold" | "warm" | "hot") => void;
  onControlModeChange: (mode: "autonomous" | "shadow" | "manual") => void;
}

export function InboxChatHeader({
  selected,
  mounted,
  tonePending,
  controlPending,
  onBackMobile,
  onToneChange,
  onControlModeChange,
}: InboxChatHeaderProps) {
  const currentMode = selected.control_mode ?? (selected.is_paused ? "manual" : "autonomous");
  const isAutonomous = mounted && currentMode === "autonomous";

  return (
    <div className="flex items-center justify-between border-b border-[#E4E4E7] bg-white px-4 py-3 sm:px-6 z-10 shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
      <div className="flex items-center gap-3 overflow-hidden">
        <Button
          variant="ghost"
          size="sm"
          className="h-9 w-9 rounded-full lg:hidden shrink-0 p-0"
          onClick={onBackMobile}
          aria-label="Voltar para lista de conversas"
        >
          <ChevronLeft size={20} />
        </Button>
        <div
          className="relative grid h-10 w-10 shrink-0 place-items-center rounded-full text-xs font-black text-white shadow-sm"
          style={{ background: HEAT_GRADIENT[selected.status] ?? HEAT_GRADIENT.cold }}
        >
          {initials(selected.name)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 min-w-0">
            <span className="truncate text-sm font-bold text-[#09090B]">{selected.name}</span>
            <AnimatePresence mode="wait">
              {isAutonomous ? (
                <motion.span
                  key="autonomous"
                  initial={{ opacity: 0, scale: 0.85 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.85 }}
                  className="shrink-0 inline-flex items-center gap-1 rounded-full bg-[#F0FDF4] border border-[#86EFAC] px-2 py-0.5"
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-[#22C55E] animate-pulse" />
                  <span className="text-[9px] font-black uppercase tracking-wider text-[#166534]">IA Autônoma</span>
                </motion.span>
              ) : currentMode === "shadow" ? (
                <motion.span
                  key="shadow"
                  initial={{ opacity: 0, scale: 0.85 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.85 }}
                  className="shrink-0 inline-flex items-center gap-1 rounded-full bg-[#EFF6FF] border border-[#BFDBFE] px-2 py-0.5"
                >
                  <Sparkles size={8} className="text-[#2563EB]" />
                  <span className="text-[9px] font-black uppercase tracking-wider text-[#1D4ED8]">Copiloto</span>
                </motion.span>
              ) : (
                <motion.span
                  key="manual"
                  initial={{ opacity: 0, scale: 0.85 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.85 }}
                  className="shrink-0 inline-flex items-center gap-1 rounded-full bg-[#F4F4F5] border border-[#E4E4E7] px-2 py-0.5"
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-[#D4D4D8]" />
                  <span className="text-[9px] font-black uppercase tracking-wider text-[#71717A]">Manual</span>
                </motion.span>
              )}
            </AnimatePresence>
          </div>
          <SafeClientOnly
            fallback={
              <div className="flex items-center gap-1.5 truncate text-[10px] font-bold uppercase tracking-wider text-[#A1A1AA]">
                <span className="h-1.5 w-1.5 rounded-full shrink-0 bg-[#D4D4D8]" />
                {selected.channel}
              </div>
            }
          >
            {(() => {
              const act = activityLabel(selected);
              return (
                <div className="flex items-center gap-1.5 truncate text-[10px] font-bold uppercase tracking-wider text-[#A1A1AA]">
                  <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", act.dot)} />
                  {act.text}
                </div>
              );
            })()}
          </SafeClientOnly>
        </div>
      </div>

      <div className="flex items-center gap-3 shrink-0">
        {currentMode === "autonomous" && (
          <div className="hidden sm:flex flex-col items-end gap-0.5" suppressHydrationWarning>
            <div className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-[#22C55E] animate-pulse" />
              <span className="text-[11px] font-bold text-[#166534]">IA Autônoma</span>
            </div>
            <span className="text-[9px] text-[#A1A1AA] font-medium">respondendo automaticamente</span>
          </div>
        )}
        {currentMode === "shadow" && (
          <div className="hidden sm:flex flex-col items-end gap-0.5">
            <div className="flex items-center gap-1.5">
              <Sparkles size={10} className="text-[#2563EB]" />
              <span className="text-[11px] font-bold text-[#1D4ED8]">Copiloto</span>
            </div>
            <span className="text-[9px] text-[#A1A1AA] font-medium">aprovando rascunhos</span>
          </div>
        )}

        <div className="xl:hidden flex items-center gap-2">
          <ControlModeDropdown
            compact
            selected={selected}
            controlPending={controlPending}
            onControlModeChange={onControlModeChange}
          />
          <div className="hidden sm:block">
            <ToneDropdown
              compact
              selected={selected}
              tonePending={tonePending}
              onToneChange={onToneChange}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
