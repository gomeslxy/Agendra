"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Bell, Plus, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface TopbarProps {
  cta?: { label: string };
}

export function Topbar({ cta }: TopbarProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [showNotifications, setShowNotifications] = useState(false);
  const bellRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPushed = useRef<string | null>(null);

  // Debounced search → push to /leads?q=...
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const trimmed = query.trim();
      const target = trimmed ? `/leads?q=${encodeURIComponent(trimmed)}` : "/leads";
      // Dedupe: skip when same target already pushed (avoids wasteful re-fetches)
      if (lastPushed.current === target) return;
      lastPushed.current = target;
      router.push(target);
    }, 500);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, router]);

  // Close notification panel on outside click
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) {
        setShowNotifications(false);
      }
    }
    if (showNotifications) document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [showNotifications]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
      className="flex items-center gap-4 border-b border-white/[0.08] bg-[rgba(11,18,34,0.55)] px-6 py-3.5 backdrop-blur-xl"
    >
      <div className="relative max-w-[420px] flex-1">
        <Search
          size={16}
          className="absolute left-3 top-1/2 -translate-y-1/2"
          style={{ color: "var(--color-fg-3)" }}
        />
        <input
          placeholder="Buscar leads, conversas, agendamentos…"
          className="input !rounded-xl !py-2 !pl-9 !pr-8 !text-[13px]"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {query && (
          <button
            onClick={() => setQuery("")}
            className="absolute right-3 top-1/2 -translate-y-1/2"
            style={{ color: "var(--color-fg-3)" }}
            aria-label="Limpar busca"
          >
            <X size={14} />
          </button>
        )}
      </div>

      <div className="ml-auto flex items-center gap-2">
        {/* IA status badge */}
        <div className="flex items-center gap-1.5 rounded-full border border-[#14B8A6]/30 bg-[#14B8A6]/10 px-2.5 py-1 text-xs font-semibold text-brand-teal-300">
          <span className="relative flex h-1.5 w-1.5">
            <motion.span
              className="absolute inline-flex h-full w-full rounded-full bg-brand-teal-400"
              animate={{ scale: [1, 2.2, 1], opacity: [0.8, 0, 0.8] }}
              transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
            />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-brand-teal-400" />
          </span>
          IA ativa
        </div>

        {/* Bell — notification panel stub */}
        <div ref={bellRef} className="relative">
          <Button
            variant="ghost"
            size="sm"
            aria-label="Notificações"
            onClick={() => setShowNotifications((v) => !v)}
          >
            <Bell size={18} />
          </Button>
          <AnimatePresence>
            {showNotifications && (
              <motion.div
                initial={{ opacity: 0, y: 6, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 6, scale: 0.97 }}
                transition={{ duration: 0.14 }}
                className="absolute right-0 top-full z-50 mt-1.5 w-72 rounded-2xl border border-white/[0.1] bg-[rgba(11,18,34,0.97)] p-4 shadow-2xl backdrop-blur-xl"
              >
                <p className="text-xs font-semibold">Notificações</p>
                <p className="mt-2 text-[12px]" style={{ color: "var(--color-fg-3)" }}>
                  Nenhuma notificação no momento.
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <Button variant="primary" size="sm" onClick={() => router.push("/leads")}>
          <Plus size={14} />
          {cta?.label || "Novo fluxo"}
        </Button>
      </div>
    </motion.div>
  );
}
