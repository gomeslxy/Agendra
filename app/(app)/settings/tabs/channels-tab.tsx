"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Calendar, Facebook, Globe, Instagram, MessageCircle, Slack, Zap } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { completeWhatsAppOnboarding, disconnectChannel, saveWhatsAppChannel } from "../actions";
import { GoogleCalendarCard, InstagramChannelCard, WhatsAppChannelCard } from "../components/channel-cards";
import { ReadOnlyBanner } from "../components/settings-shared";
import type { ChannelRow, SettingsCompany } from "../types";

interface MetaWindow extends Window {
  fbAsyncInit?: () => void;
  FB?: {
    init: (cfg: Record<string, unknown>) => void;
    login: (cb: (response: { authResponse?: { accessToken?: string } }) => void, opts: Record<string, unknown>) => void;
  };
}

function NewWhatsAppChannelConnector() {
  const [expanded, setExpanded] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function handleConnect(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setError(null);
    startTransition(async () => {
      try {
        await saveWhatsAppChannel(formData);
        setExpanded(false);
        toast.success("Canal conectado com sucesso!");
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erro ao conectar canal");
      }
    });
  }

  function handleMetaLogin() {
    const fbWin = window as MetaWindow;
    if (!fbWin.FB) {
      toast.error("SDK da Meta não carregado. Verifique sua conexão.");
      return;
    }

    fbWin.FB.login(
      (response) => {
        const accessToken = response.authResponse?.accessToken;
        if (accessToken) {
          toast.promise(
            completeWhatsAppOnboarding(accessToken).then((res) => {
              if (!res.success) throw new Error(res.error);
              return res;
            }),
            {
              loading: "Configurando canal...",
              success: (res) => `Sucesso! Número ${res.phone} conectado.`,
              error: (err) => `Erro: ${err instanceof Error ? err.message : "Falha"}`,
            },
          );
        } else {
          toast.error("Conexão cancelada pelo usuário.");
        }
      },
      {
        scope: "whatsapp_business_management,whatsapp_business_messaging",
        extras: { feature: "whatsapp_embedded_signup" },
      },
    );
  }

  return (
    <motion.div layout className="overflow-hidden rounded-xl border border-[#E4E4E7] bg-[#F4F4F5]">
      <div className="flex items-center justify-between gap-4 p-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-white text-[#71717A] flex items-center justify-center border border-[#E4E4E7]">
            <MessageCircle size={20} />
          </div>
          <div>
            <div className="text-[13px] font-semibold text-[#09090B]">Conectar Novo WhatsApp</div>
            <div className="text-[10px] text-[#71717A] mt-0.5">Adicione uma linha do WhatsApp Business</div>
          </div>
        </div>
        <Button variant="secondary" size="sm" onClick={() => setExpanded(!expanded)}>
          {expanded ? "Cancelar" : "Conectar"}
        </Button>
      </div>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="border-t border-[#E4E4E7] bg-[#FAFAFA] p-4 flex flex-col gap-4"
          >
            <div className="flex flex-col gap-3">
              <p className="text-[11px] font-bold text-[#3F3F46]">Conexão Automática via Facebook (Recomendado)</p>
              <button
                type="button"
                onClick={handleMetaLogin}
                className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#1877F2] hover:bg-[#166fe5] text-white text-[13px] font-semibold transition-all shadow-sm"
              >
                <Facebook size={16} fill="currentColor" />
                Conectar com Meta
              </button>
              <p className="text-[10px] text-[#71717A] text-center">
                Método oficial e homologado. Configuração em 1 minuto.
              </p>
            </div>

            <div className="relative flex items-center py-1">
              <div className="flex-grow border-t border-[#E4E4E7]" />
              <span className="shrink mx-3 text-[9px] uppercase tracking-widest text-[#A1A1AA] font-bold">Ou manual</span>
              <div className="flex-grow border-t border-[#E4E4E7]" />
            </div>

            <form onSubmit={handleConnect} className="flex flex-col gap-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] uppercase tracking-wider text-[#71717A] font-bold">Phone Number ID</label>
                  <Input name="phone_number_id" placeholder="Ex: 1092837465..." className="h-9 text-xs" required />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] uppercase tracking-wider text-[#71717A] font-bold">Nome do Canal</label>
                  <Input name="name" placeholder="Ex: WhatsApp Vendas" className="h-9 text-xs" />
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[10px] uppercase tracking-wider text-[#71717A] font-bold">Access Token (Permanente)</label>
                <Input name="access_token" type="password" placeholder="EAAW..." className="h-9 text-xs" required />
              </div>

              {error && <p className="text-[10px] text-red-500 font-medium">{error}</p>}

              <Button type="submit" variant="blue" size="sm" className="w-full font-bold" disabled={pending}>
                {pending ? "Conectando..." : "Salvar Canal WhatsApp"}
              </Button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export function ChannelsTab({
  company,
  channels,
  usage,
  isReadOnly = false,
}: {
  company: SettingsCompany | null;
  channels: ChannelRow[];
  usage: { limits?: { allowedChannels?: string[]; maxChannels?: number } } | null;
  isReadOnly?: boolean;
}) {
  // Carrega o SDK da Meta sob demanda apenas quando a aba Canais é aberta
  useEffect(() => {
    const fbWin = window as MetaWindow;
    fbWin.fbAsyncInit = function () {
      fbWin.FB?.init({
        appId: process.env.NEXT_PUBLIC_META_APP_ID,
        cookie: true,
        xfbml: true,
        version: "v19.0",
      });
    };
    if (!document.getElementById("fb-sdk-script")) {
      const s = document.createElement("script");
      s.id = "fb-sdk-script";
      s.src = "https://connect.facebook.net/pt_BR/sdk.js";
      s.async = true;
      s.defer = true;
      document.body.appendChild(s);
    }
  }, []);

  const gcalConnected = !!company?.google_calendar_email;
  const waChannels = channels.filter((c) => c.provider === "whatsapp");
  const igChannels = channels.filter((c) => c.provider === "instagram");

  const planType = company?.plan_type ?? "trial";
  const allowedProviders = usage?.limits?.allowedChannels || ["whatsapp"];
  const isInstagramAllowed = allowedProviders.includes("instagram");
  const maxChannels = usage?.limits?.maxChannels ?? 1;
  const totalActiveChannels = channels.filter((c) => c.status === "active").length;
  const canAddMore = totalActiveChannels < maxChannels;

  return (
    <div className="flex flex-col gap-6">
      {isReadOnly && <ReadOnlyBanner />}
      <div className="border border-[#E4E4E7] bg-white p-4 rounded-xl flex flex-col sm:flex-row items-center justify-between gap-4">
        <div>
          <h3 className="text-sm font-bold text-[#09090B] flex items-center gap-1.5">
            <Zap size={15} className="text-[#2563EB]" />
            Canais da Empresa ({totalActiveChannels}/{maxChannels})
          </h3>
          <p className="text-[11px] text-[#71717A] mt-1">
            Seu plano {planType.toUpperCase()} permite até {maxChannels} conexões simultâneas de canais autorizados.
          </p>
        </div>
        <Badge variant="cold" className="text-[10px] px-2.5 py-1">
          {planType.toUpperCase()}
        </Badge>
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2.5">
          <h4 className="text-[10px] uppercase font-bold tracking-wider text-[#71717A] flex items-center gap-1.5 pl-1">
            <MessageCircle size={12} className="text-[#0D9488]" />
            WhatsApp Business Cloud API
          </h4>

          {waChannels.map((ch) => (
            <WhatsAppChannelCard key={ch.id} channel={ch} onDisconnect={disconnectChannel} isReadOnly={isReadOnly} />
          ))}

          {canAddMore && !isReadOnly ? (
            <NewWhatsAppChannelConnector />
          ) : (
            waChannels.length === 0 &&
            !isReadOnly && (
              <div className="p-4 rounded-xl border border-[#E4E4E7] bg-[#FAFAFA] text-center text-xs text-[#71717A] italic">
                Limite de canais atingido. Faça upgrade para conectar mais números.
              </div>
            )
          )}
        </div>

        <div className="flex flex-col gap-2.5">
          <h4 className="text-[10px] uppercase font-bold tracking-wider text-[#71717A] flex items-center gap-1.5 pl-1">
            <Instagram size={12} className="text-pink-400" />
            Instagram Direct
          </h4>

          {isInstagramAllowed ? (
            <>
              {igChannels.map((ch) => (
                <InstagramChannelCard key={ch.id} channel={ch} onDisconnect={disconnectChannel} isReadOnly={isReadOnly} />
              ))}

              {igChannels.length === 0 && canAddMore && !isReadOnly && (
                <div className="p-4 rounded-xl border border-[#E4E4E7] bg-[#F4F4F5] flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-pink-500/10 text-pink-500 flex items-center justify-center">
                      <Instagram size={20} />
                    </div>
                    <div>
                      <div className="text-[13px] font-semibold">Conectar conta Instagram</div>
                      <div className="text-[10px] text-[#71717A] mt-0.5">Atenda DMs e Stories automaticamente com IA</div>
                    </div>
                  </div>
                  <Button
                    variant="blue"
                    size="sm"
                    className="font-bold bg-pink-600 hover:bg-pink-500"
                    onClick={() => {
                      window.location.href = "/api/auth/instagram";
                    }}
                  >
                    Conectar
                  </Button>
                </div>
              )}
            </>
          ) : (
            <div className="relative overflow-hidden rounded-xl border border-[#E4E4E7] bg-white">
              <div className="p-4 flex items-center justify-between gap-4 blur-[2px] opacity-40 pointer-events-none select-none">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-pink-500/10 text-pink-400 flex items-center justify-center">
                    <Instagram size={20} />
                  </div>
                  <div>
                    <div className="text-[13px] font-semibold">Instagram DMs &amp; Stories</div>
                    <div className="text-[10px] text-[#71717A] mt-0.5">Responda a DMs e reações com IA</div>
                  </div>
                </div>
                <Button variant="secondary" size="sm">Conectar</Button>
              </div>
              <div className="absolute inset-0 bg-black/40 flex flex-col items-center justify-center text-center p-4">
                <div className="border border-[#FCE7F3] bg-white px-4 py-3 rounded-xl text-[#DB2777] text-xs font-semibold flex items-center gap-2 shadow-lg">
                  <Zap size={14} className="animate-pulse" />
                  Conexão Instagram DMs é exclusiva do Plano PRO
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2.5">
          <h4 className="text-[10px] uppercase font-bold tracking-wider text-[#71717A] flex items-center gap-1.5 pl-1">
            <Calendar size={12} className="text-[#2563EB]" />
            Google Calendar (Agenda)
          </h4>
          <GoogleCalendarCard company={company} connected={gcalConnected} isReadOnly={isReadOnly} />
        </div>

        <div className="flex flex-col gap-2.5">
          <h4 className="text-[10px] uppercase font-bold tracking-wider text-[#A1A1AA] flex items-center gap-1.5 pl-1">
            <Globe size={12} className="text-[#A1A1AA]" />
            Canais de Mensageria (Em Breve)
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              { icon: Slack, label: "Telegram Bots" },
              { icon: Facebook, label: "Messenger" },
              { icon: Globe, label: "Web Chat Widget" },
            ].map((item) => (
              <div key={item.label} className="p-3.5 rounded-xl border border-[#E4E4E7] bg-white flex items-center gap-3 opacity-50">
                <item.icon size={18} className="text-[#71717A]" />
                <div>
                  <div className="text-xs font-semibold">{item.label}</div>
                  <div className="text-[9px] text-[#71717A] mt-0.5">Em breve</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
