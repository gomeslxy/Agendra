"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Calendar, ExternalLink, Instagram, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ChannelRow, SettingsCompany } from "../types";

export function WhatsAppChannelCard({
  channel,
  onDisconnect,
  isReadOnly = false,
}: {
  channel: ChannelRow;
  onDisconnect: (id: string) => Promise<unknown>;
  isReadOnly?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function handleTest() {
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/whatsapp/test", { method: "POST" });
        const data = await res.json();
        if (data.ok) {
          toast.success(`Conexão ativa! Número: ${data.displayPhone}`);
        } else {
          setError(data.error);
          toast.error("Falha na conexão.");
        }
      } catch {
        toast.error("Erro ao testar conexão.");
      }
    });
  }

  function handleDisconnect() {
    if (
      !confirm(
        "Tem certeza que deseja desconectar este canal? Todas as mensagens enviadas para este número deixarão de ser processadas pela IA.",
      )
    ) {
      return;
    }

    startTransition(async () => {
      try {
        await onDisconnect(channel.id);
        toast.success("Canal desconectado com sucesso");
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erro ao desconectar");
      }
    });
  }

  const isError = channel.status === "error";

  return (
    <motion.div layout className="overflow-hidden rounded-xl border border-[#E4E4E7] bg-[#F4F4F5]">
      <div className="flex items-center gap-3 p-4">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-teal-500/10 text-teal-600">
          <MessageCircle size={20} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-semibold">WhatsApp Connection</div>
          <div className="mt-0.5 font-mono text-[11px] font-medium flex items-center gap-1.5">
            {isError ? (
              <span className="flex items-center gap-1.5 text-red-500">
                <span className="flex h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
                Erro de Autenticação
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-[#0D9488]">
                <span className="flex h-1.5 w-1.5 rounded-full bg-brand-teal-500 animate-pulse" />
                Ativo
              </span>
            )}
          </div>
          <div className="mt-0.5 font-mono text-[10px] text-[#71717A] truncate">ID: {channel.provider_id}</div>
        </div>
        <Button variant="secondary" size="sm" onClick={() => setExpanded(!expanded)}>
          {expanded ? "Fechar" : "Detalhes"}
        </Button>
      </div>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="border-t border-[#E4E4E7] bg-[#FAFAFA] p-4 flex flex-col gap-3"
          >
            {(error || channel.last_error) && (
              <div className="rounded-lg bg-red-50 border border-red-200 p-3">
                <p className="text-[10px] uppercase tracking-wider text-red-600 font-bold mb-1">Último Erro</p>
                <p className="text-[11px] text-red-700 font-mono break-all">{error || channel.last_error}</p>
              </div>
            )}

            <div className="rounded-lg bg-white border border-[#E4E4E7] p-3 text-[11px] text-[#71717A] leading-relaxed">
              Este canal está associado ao número do WhatsApp Cloud API cadastrado. A IA da Agendra monitora e responde às mensagens que chegam.
            </div>

            <div className="flex gap-2">
              <Button variant="blue" size="sm" className="flex-1 font-bold" onClick={handleTest} disabled={pending || isReadOnly}>
                {pending ? "Testando..." : "Testar Conexão"}
              </Button>
              {!isReadOnly && (
                <Button
                  variant="secondary"
                  size="sm"
                  className="flex-1 text-red-500 hover:bg-red-50 border-red-200 font-bold"
                  onClick={handleDisconnect}
                  disabled={pending}
                >
                  Desconectar
                </Button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export function InstagramChannelCard({
  channel,
  onDisconnect,
  isReadOnly = false,
}: {
  channel: ChannelRow;
  onDisconnect: (id: string) => Promise<unknown>;
  isReadOnly?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function handleDisconnect() {
    if (!confirm("Tem certeza que deseja desconectar o Instagram? Suas DMs deixarão de ser respondidas pela IA.")) {
      return;
    }

    startTransition(async () => {
      try {
        await onDisconnect(channel.id);
        toast.success("Instagram desconectado com sucesso");
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erro ao desconectar");
      }
    });
  }

  const isError = channel.status === "error";

  return (
    <motion.div layout className="overflow-hidden rounded-xl border border-[#E4E4E7] bg-[#F4F4F5]">
      <div className="flex items-center gap-3 p-4">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-pink-500/10 text-pink-500">
          <Instagram size={20} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-semibold">Instagram Direct DMs</div>
          <div className="mt-0.5 font-mono text-[11px] font-medium flex items-center gap-1.5">
            {isError ? (
              <span className="flex items-center gap-1.5 text-red-500">
                <span className="flex h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
                Erro na conexão
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-[#DB2777]">
                <span className="flex h-1.5 w-1.5 rounded-full bg-pink-500 animate-pulse" />
                Ativo
              </span>
            )}
          </div>
          <div className="mt-0.5 font-mono text-[10px] text-[#71717A] truncate">IG Account ID: {channel.provider_id}</div>
        </div>
        <Button variant="secondary" size="sm" onClick={() => setExpanded(!expanded)}>
          {expanded ? "Fechar" : "Gerenciar"}
        </Button>
      </div>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="border-t border-[#E4E4E7] bg-[#FAFAFA] p-4 flex flex-col gap-3"
          >
            {channel.last_error && (
              <div className="rounded-lg bg-red-50 border border-red-200 p-3">
                <p className="text-[10px] uppercase tracking-wider text-red-600 font-bold mb-1">Erro</p>
                <p className="text-[11px] text-red-700 font-mono break-all">{channel.last_error}</p>
              </div>
            )}

            <div className="rounded-lg bg-white border border-[#E4E4E7] p-3 text-[11px] text-[#71717A] leading-relaxed">
              O Instagram Direct está conectado e monitorando DMs recebidas. O atendimento automático está ativo de acordo com a aba Automação.
            </div>

            {!isReadOnly && (
              <Button
                variant="secondary"
                size="sm"
                className="w-full text-red-500 hover:bg-red-50 border-red-200 font-bold"
                onClick={handleDisconnect}
                disabled={pending}
              >
                Desconectar Instagram
              </Button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export function GoogleCalendarCard({
  company,
  connected,
  isReadOnly = false,
}: {
  company: SettingsCompany | null;
  connected: boolean;
  isReadOnly?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <motion.div layout className="overflow-hidden rounded-xl border border-[#E4E4E7] bg-[#F4F4F5]">
      <div className="flex items-center gap-3 p-4">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-blue-50 text-[#2563EB]">
          <Calendar size={20} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-semibold">Google Calendar</div>
          <div className="mt-0.5 font-mono text-[11px] font-medium flex items-center gap-1.5">
            {connected ? (
              <span className="flex items-center gap-1.5 text-[#1D4ED8] font-semibold">
                <span className="flex h-1.5 w-1.5 rounded-full bg-[#2563EB] animate-pulse" />
                Conectado
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-[#71717A]">
                <span className="flex h-1.5 w-1.5 rounded-full bg-[#A1A1AA]" />
                Não conectado
              </span>
            )}
          </div>
        </div>

        {connected ? (
          <Button variant="secondary" size="sm" onClick={() => setExpanded(!expanded)}>
            {expanded ? "Fechar" : "Gerenciar"}
          </Button>
        ) : !isReadOnly ? (
          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              window.location.href = "/api/auth/google";
            }}
          >
            Conectar
          </Button>
        ) : (
          <Badge variant="cold" className="text-[10px] px-2 py-0.5 border border-[#E4E4E7] bg-[#FAFAFA] text-[#71717A]">
            Apenas Leitura
          </Badge>
        )}
      </div>

      <AnimatePresence>
        {connected && expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="border-t border-[#E4E4E7] bg-[#FAFAFA] p-4 flex flex-col gap-3"
          >
            <div className="flex items-center gap-2 rounded-lg border border-[#E4E4E7] bg-white px-3 py-2">
              <Calendar size={13} className="text-[#2563EB]" />
              <span className="font-mono text-[12px] text-[#3F3F46]">{company?.google_calendar_email}</span>
            </div>
            {!isReadOnly && (
              <Button
                variant="secondary"
                size="sm"
                className="w-full gap-1.5 font-bold"
                onClick={() => {
                  window.location.href = "/api/auth/google";
                }}
              >
                <ExternalLink size={12} />
                Reconectar / Atualizar Agenda
              </Button>
            )}
            <p className="text-[11px] text-[#71717A] leading-relaxed">
              Para revogar permanentemente o acesso à sua conta Google, remova a permissão da Agendra em{" "}
              <a
                href="https://myaccount.google.com/permissions"
                target="_blank"
                rel="noopener noreferrer"
                className="underline text-[#09090B]"
              >
                myaccount.google.com/permissions
              </a>
              .
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
