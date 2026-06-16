"use client";

import { useEffect, useState, useTransition } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Bell,
  Check,
  CheckCheck,
  Clock,
  Eye,
  Mail,
  Moon,
  Save,
  Settings,
  Trash2,
  AlertTriangle,
  Zap,
  Info,
  CreditCard,
  UserPlus,
  Users,
  Smartphone,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { createClient } from "@/lib/supabase/client";
import {
  markNotificationRead,
  markAllNotificationsRead,
} from "@/app/(app)/settings/invitations/actions";
import {
  saveUserNotificationSettings,
  saveCompanyReminderSettings,
} from "@/app/(app)/settings/actions";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { Notification } from "@/lib/types/database";

interface NotificationsViewProps {
  initialNotifications: Notification[];
  initialSettings: {
    email_enabled: boolean;
    in_app_enabled: boolean;
    whatsapp_enabled: boolean;
    enabled_types: string[];
    quiet_hours_enabled: boolean;
    quiet_hours_start: string;
    quiet_hours_end: string;
  };
  company: {
    id: string;
    name: string;
    reminders_quiet_hours_enabled: boolean;
    reminders_quiet_hours_start: string;
    reminders_quiet_hours_end: string;
  };
  isAdmin: boolean;
  userId: string;
  companyId: string;
}

const TYPE_LABELS: Record<string, string> = {
  invite: "Convites de Equipe",
  member_joined: "Membros Entraram",
  member_left: "Membros Saíram",
  channel_error: "Erros de Integração",
  payment_failed: "Falhas de Pagamento",
  lead_hot: "Leads Quentes",
  system: "Alertas de Sistema",
};

const PRIORITY_COLOR: Record<string, string> = {
  critical: "text-red-600 bg-red-50 border-red-100",
  high: "text-orange-600 bg-orange-50 border-orange-100",
  medium: "text-blue-600 bg-blue-50 border-blue-100",
  low: "text-gray-500 bg-gray-50 border-gray-100",
};

const TYPE_ICON: Record<string, React.ReactNode> = {
  invite: <UserPlus size={16} className="text-blue-500" />,
  member_joined: <Users size={16} className="text-teal-500" />,
  member_left: <Users size={16} className="text-gray-500" />,
  channel_error: <AlertTriangle size={16} className="text-red-500" />,
  payment_failed: <CreditCard size={16} className="text-red-500" />,
  lead_hot: <Zap size={16} className="text-orange-500" />,
  system: <Info size={16} className="text-gray-500" />,
};

export function NotificationsView({
  initialNotifications,
  initialSettings,
  company,
  isAdmin,
  userId,
  companyId,
}: NotificationsViewProps) {
  const [activeTab, setActiveTab] = useState<"timeline" | "preferences" | "company_reminders">("timeline");
  const [notifications, setNotifications] = useState<Notification[]>(initialNotifications);
  const [filter, setFilter] = useState<"all" | "unread" | "critical">("all");
  const [pending, startTransition] = useTransition();

  // User Settings local state
  const [userSettings, setUserSettings] = useState(initialSettings);
  
  // Company settings local state
  const [companySettings, setCompanySettings] = useState({
    reminders_quiet_hours_enabled: company.reminders_quiet_hours_enabled,
    reminders_quiet_hours_start: company.reminders_quiet_hours_start,
    reminders_quiet_hours_end: company.reminders_quiet_hours_end,
  });

  // Realtime notification subscriptions
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`notifications_page:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          setNotifications((prev) => [payload.new as Notification, ...prev]);
          toast.info(`Nova notificação: ${payload.new.title}`);
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          setNotifications((prev) =>
            prev.map((n) => (n.id === payload.new.id ? (payload.new as Notification) : n))
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  // Read handlers
  const handleRead = async (id: string) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    try {
      await markNotificationRead(id);
    } catch {
      toast.error("Falha ao atualizar status de leitura.");
    }
  };

  const handleMarkAllRead = () => {
    startTransition(async () => {
      try {
        await markAllNotificationsRead();
        setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
        toast.success("Todas as notificações marcadas como lidas.");
      } catch {
        toast.error("Erro ao marcar notificações.");
      }
    });
  };

  const handleSaveUserSettings = () => {
    startTransition(async () => {
      try {
        await saveUserNotificationSettings(companyId, userSettings);
        toast.success("Preferências salvas com sucesso!");
      } catch (err: any) {
        toast.error(err.message || "Erro ao salvar preferências.");
      }
    });
  };

  const handleSaveCompanySettings = () => {
    startTransition(async () => {
      try {
        await saveCompanyReminderSettings(companyId, companySettings);
        toast.success("Configuração de lembretes salva com sucesso!");
      } catch (err: any) {
        toast.error(err.message || "Erro ao salvar configurações da empresa.");
      }
    });
  };

  const toggleNotificationType = (type: string) => {
    setUserSettings((prev) => {
      const active = prev.enabled_types.includes(type);
      return {
        ...prev,
        enabled_types: active
          ? prev.enabled_types.filter((t) => t !== type)
          : [...prev.enabled_types, type],
      };
    });
  };

  // Filter logic
  const filteredNotifications = notifications.filter((n) => {
    if (filter === "unread") return !n.read;
    if (filter === "critical") return n.priority === "critical" || n.priority === "high";
    return true;
  });

  return (
    <div className="flex flex-col lg:flex-row gap-8 items-start select-none">
      {/* Navigation & Panels Left */}
      <div className="flex-1 w-full flex flex-col gap-6">
        {/* Navigation Tabs */}
        <div className="flex gap-2 p-1 bg-[#F4F4F5] rounded-xl border border-[#E4E4E7] self-start">
          <button
            onClick={() => setActiveTab("timeline")}
            className={cn(
              "px-4 py-2 text-xs font-bold transition rounded-lg",
              activeTab === "timeline"
                ? "bg-white text-[#09090B] border border-[#E4E4E7] shadow-sm"
                : "text-[#71717A] hover:text-[#09090B]"
            )}
          >
            Linha do Tempo
          </button>
          <button
            onClick={() => setActiveTab("preferences")}
            className={cn(
              "px-4 py-2 text-xs font-bold transition rounded-lg",
              activeTab === "preferences"
                ? "bg-white text-[#09090B] border border-[#E4E4E7] shadow-sm"
                : "text-[#71717A] hover:text-[#09090B]"
            )}
          >
            Preferências Pessoais
          </button>
          {isAdmin && (
            <button
              onClick={() => setActiveTab("company_reminders")}
              className={cn(
                "px-4 py-2 text-xs font-bold transition rounded-lg",
                activeTab === "company_reminders"
                  ? "bg-white text-[#09090B] border border-[#E4E4E7] shadow-sm"
                  : "text-[#71717A] hover:text-[#09090B]"
              )}
            >
              Lembretes (Clientes)
            </button>
          )}
        </div>

        {/* Tab contents */}
        <AnimatePresence mode="wait">
          {activeTab === "timeline" && (
            <motion.div
              key="timeline-panel"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.15 }}
              className="flex flex-col gap-4"
            >
              {/* Header actions */}
              <div className="flex items-center justify-between gap-4 flex-wrap bg-white p-4 rounded-2xl border border-[#E4E4E7] shadow-sm">
                {/* Filter controls */}
                <div className="flex gap-1">
                  {(["all", "unread", "critical"] as const).map((f) => (
                    <button
                      key={f}
                      onClick={() => setFilter(f)}
                      className={cn(
                        "px-3 py-1.5 text-xs font-semibold rounded-lg border transition",
                        filter === f
                          ? "bg-[#EFF6FF] border-[#BFDBFE] text-[#2563EB]"
                          : "border-transparent text-[#71717A] hover:bg-[#F4F4F5]"
                      )}
                    >
                      {f === "all" ? "Todas" : f === "unread" ? "Não lidas" : "Importantes"}
                    </button>
                  ))}
                </div>

                {/* Unread marker */}
                {notifications.some((n) => !n.read) && (
                  <Button
                    onClick={handleMarkAllRead}
                    disabled={pending}
                    variant="secondary"
                    size="sm"
                    className="h-8 border-[#E4E4E7] text-[#52525B] hover:text-[#09090B]"
                  >
                    <CheckCheck size={14} className="mr-1.5" />
                    Marcar lidas
                  </Button>
                )}
              </div>

              {/* Timeline feed */}
              {filteredNotifications.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-3 py-16 text-center bg-white rounded-3xl border border-[#E4E4E7] shadow-sm">
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#FAFAFA] border border-[#E4E4E7]">
                    <Bell size={24} className="text-[#A1A1AA]" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-[#09090B]">Nenhum alerta encontrado</p>
                    <p className="text-xs text-[#71717A]">Você está atualizado ou com filtros aplicados.</p>
                  </div>
                </div>
              ) : (
                <div className="relative border-l border-[#E4E4E7] ml-6 pl-6 space-y-4">
                  {filteredNotifications.map((n) => (
                    <div key={n.id} className="relative">
                      {/* Anchor Dot */}
                      <span className="absolute -left-[31px] top-3.5 flex h-4 w-4 items-center justify-center rounded-full bg-[#FAFAFA] border border-[#E4E4E7]">
                        <span className={cn("h-1.5 w-1.5 rounded-full", n.read ? "bg-[#A1A1AA]" : "bg-[#2563EB]")} />
                      </span>

                      {/* Card Content */}
                      <div
                        onClick={() => handleRead(n.id)}
                        className={cn(
                          "group rounded-2xl border p-4 bg-white transition-all hover:shadow-md cursor-pointer",
                          n.read ? "border-[#E4E4E7] opacity-80" : "border-[#BFDBFE] ring-1 ring-[#EFF6FF] shadow-sm",
                          n.action_url && "hover:border-[#2563EB]"
                        )}
                      >
                        <div className="flex items-start gap-4">
                          <div className="h-8 w-8 flex items-center justify-center rounded-lg bg-[#F4F4F5] shrink-0 border border-[#E4E4E7]">
                            {TYPE_ICON[n.type] || <Bell size={16} />}
                          </div>

                          <div className="min-w-0 flex-1 space-y-1">
                            <div className="flex items-center justify-between gap-2">
                              <h3 className={cn("text-sm font-bold", n.read ? "text-[#3F3F46]" : "text-[#09090B]")}>
                                {n.title}
                              </h3>
                              <span className="text-[10px] text-[#A1A1AA]">
                                {new Date(n.created_at).toLocaleDateString("pt-BR", {
                                  day: "2-digit",
                                  month: "2-digit",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </span>
                            </div>
                            <p className="text-xs text-[#52525B] leading-relaxed">{n.body}</p>
                            
                            {/* Metadata / Action link */}
                            <div className="pt-2 flex items-center justify-between flex-wrap gap-2 text-[10px] text-[#71717A]">
                              <div className="flex items-center gap-1.5">
                                <span className={cn("px-1.5 py-0.5 rounded border font-semibold uppercase tracking-wider", PRIORITY_COLOR[n.priority])}>
                                  {n.priority}
                                </span>
                                {n.delivery_status === "pending" && (
                                  <span className="flex items-center text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-100 font-semibold gap-0.5">
                                    <Clock size={10} />
                                    Pendente (Silencioso)
                                  </span>
                                )}
                                {n.delivery_status === "failed" && (
                                  <span className="flex items-center text-red-600 bg-red-50 px-1.5 py-0.5 rounded border border-red-100 font-semibold gap-0.5" title={n.error_log ?? ""}>
                                    <AlertTriangle size={10} />
                                    Falha no envio
                                  </span>
                                )}
                              </div>
                              {n.action_url && (
                                <a
                                  href={n.action_url}
                                  className="inline-flex items-center gap-1 text-[#2563EB] font-bold hover:underline"
                                >
                                  Ver no painel <ExternalLink size={10} />
                                </a>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {activeTab === "preferences" && (
            <motion.div
              key="preferences-panel"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.15 }}
              className="space-y-6"
            >
              {/* Preferences Controls */}
              <Card className="border-[#E4E4E7] shadow-sm rounded-2xl bg-white">
                <CardHeader>
                  <CardTitle className="text-base font-bold text-[#09090B]">Canais de Envio</CardTitle>
                  <CardDescription className="text-xs text-[#71717A]">
                    Escolha por onde deseja ser alertado sobre eventos da plataforma.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between gap-4 p-3 rounded-xl border border-[#E4E4E7] hover:bg-[#FAFAFA] transition">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-lg bg-blue-50 flex items-center justify-center border border-blue-100 text-blue-600">
                        <Eye size={16} />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-[#09090B]">Notificações In-App (Sino)</p>
                        <p className="text-[10px] text-[#71717A]">Visualização em tempo real no menu superior.</p>
                      </div>
                    </div>
                    <Switch
                      checked={userSettings.in_app_enabled}
                      onChange={(v: boolean) => setUserSettings((prev) => ({ ...prev, in_app_enabled: v }))}
                    />
                  </div>

                  <div className="flex items-center justify-between gap-4 p-3 rounded-xl border border-[#E4E4E7] hover:bg-[#FAFAFA] transition">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-lg bg-teal-50 flex items-center justify-center border border-teal-100 text-teal-600">
                        <Mail size={16} />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-[#09090B]">Notificações por E-mail</p>
                        <p className="text-[10px] text-[#71717A]">Envio automático de resumos dos eventos mais importantes.</p>
                      </div>
                    </div>
                    <Switch
                      checked={userSettings.email_enabled}
                      onChange={(v: boolean) => setUserSettings((prev) => ({ ...prev, email_enabled: v }))}
                    />
                  </div>

                  <div className="flex items-center justify-between gap-4 p-3 rounded-xl border border-[#E4E4E7] hover:bg-[#FAFAFA] transition">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-lg bg-orange-50 flex items-center justify-center border border-orange-100 text-orange-600">
                        <Smartphone size={16} />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-[#09090B]">Notificações por WhatsApp</p>
                        <p className="text-[10px] text-[#71717A]">Receber alertas direto no celular (exige número configurado).</p>
                      </div>
                    </div>
                    <Switch
                      checked={userSettings.whatsapp_enabled}
                      onChange={(v: boolean) => setUserSettings((prev) => ({ ...prev, whatsapp_enabled: v }))}
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Event Types */}
              <Card className="border-[#E4E4E7] shadow-sm rounded-2xl bg-white">
                <CardHeader>
                  <CardTitle className="text-base font-bold text-[#09090B]">Filtro de Eventos</CardTitle>
                  <CardDescription className="text-xs text-[#71717A]">
                    Selecione quais alertas do sistema você gostaria de receber.
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {Object.entries(TYPE_LABELS).map(([type, label]) => {
                    const active = userSettings.enabled_types.includes(type);
                    return (
                      <div
                        key={type}
                        onClick={() => toggleNotificationType(type)}
                        className={cn(
                          "flex items-center justify-between gap-3 p-3 rounded-xl border transition cursor-pointer select-none",
                          active ? "border-[#BFDBFE] bg-[#EFF6FF]/20" : "border-[#E4E4E7] hover:bg-[#FAFAFA]"
                        )}
                      >
                        <div className="flex items-center gap-2">
                          <div className="h-6 w-6 rounded flex items-center justify-center bg-[#F4F4F5] border border-[#E4E4E7]">
                            {TYPE_ICON[type] || <Info size={12} />}
                          </div>
                          <span className="text-xs font-semibold text-[#3F3F46]">{label}</span>
                        </div>
                        <Switch checked={active} onChange={() => toggleNotificationType(type)} />
                      </div>
                    );
                  })}
                </CardContent>
              </Card>

              {/* Silent hours settings */}
              <Card className="border-[#E4E4E7] shadow-sm rounded-2xl bg-white">
                <CardHeader>
                  <CardTitle className="text-base font-bold text-[#09090B] flex items-center gap-1.5">
                    <Moon size={18} className="text-indigo-500" />
                    Horário Silencioso Pessoal
                  </CardTitle>
                  <CardDescription className="text-xs text-[#71717A]">
                    Suspenda notificações não-críticas durante o período selecionado.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between gap-4 p-1">
                    <div>
                      <p className="text-xs font-bold text-[#09090B]">Ativar período de silêncio</p>
                      <p className="text-[10px] text-[#71717A]">Retém e-mails e alertas não urgentes durante a noite/folga.</p>
                    </div>
                    <Switch
                      checked={userSettings.quiet_hours_enabled}
                      onChange={(v: boolean) => setUserSettings((prev) => ({ ...prev, quiet_hours_enabled: v }))}
                    />
                  </div>

                  {userSettings.quiet_hours_enabled && (
                    <div className="flex items-center gap-3 flex-wrap">
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-bold text-[#71717A] uppercase tracking-wider">Silenciar das</label>
                        <input
                          type="time"
                          value={userSettings.quiet_hours_start}
                          onChange={(e) => setUserSettings((prev) => ({ ...prev, quiet_hours_start: e.target.value }))}
                          className="h-10 rounded-xl border border-[#E4E4E7] bg-[#FAFAFA] px-3 text-xs text-[#09090B] focus:border-[#2563EB] outline-none"
                        />
                      </div>
                      <span className="text-[#A1A1AA] pt-4">–</span>
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-bold text-[#71717A] uppercase tracking-wider">Até as</label>
                        <input
                          type="time"
                          value={userSettings.quiet_hours_end}
                          onChange={(e) => setUserSettings((prev) => ({ ...prev, quiet_hours_end: e.target.value }))}
                          className="h-10 rounded-xl border border-[#E4E4E7] bg-[#FAFAFA] px-3 text-xs text-[#09090B] focus:border-[#2563EB] outline-none"
                        />
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Save changes */}
              <div className="flex justify-end">
                <Button onClick={handleSaveUserSettings} disabled={pending} className="bg-[#2563EB] hover:bg-[#1D4ED8]">
                  <Save size={14} className="mr-1.5" />
                  Salvar Preferências
                </Button>
              </div>
            </motion.div>
          )}

          {activeTab === "company_reminders" && isAdmin && (
            <motion.div
              key="company-reminders-panel"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.15 }}
              className="space-y-6"
            >
              {/* Outbound quiet hours settings */}
              <Card className="border-[#E4E4E7] shadow-sm rounded-2xl bg-white">
                <CardHeader>
                  <CardTitle className="text-base font-bold text-[#09090B] flex items-center gap-1.5">
                    <Clock size={18} className="text-orange-500" />
                    Horário Silencioso para Clientes (Lembretes)
                  </CardTitle>
                  <CardDescription className="text-xs text-[#71717A]">
                    Evite disparos indesejados de WhatsApp para seus leads e clientes fora do horário comercial.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between gap-4 p-1">
                    <div>
                      <p className="text-xs font-bold text-[#09090B]">Ativar horário de silêncio para lembretes</p>
                      <p className="text-[10px] text-[#71717A]">
                        Lembretes agendados para este período serão automaticamente postergados para a manhã seguinte.
                      </p>
                    </div>
                    <Switch
                      checked={companySettings.reminders_quiet_hours_enabled}
                      onChange={(v: boolean) => setCompanySettings((prev) => ({ ...prev, reminders_quiet_hours_enabled: v }))}
                    />
                  </div>

                  {companySettings.reminders_quiet_hours_enabled && (
                    <div className="flex items-center gap-3 flex-wrap">
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-bold text-[#71717A] uppercase tracking-wider">Silenciar das</label>
                        <input
                          type="time"
                          value={companySettings.reminders_quiet_hours_start}
                          onChange={(e) => setCompanySettings((prev) => ({ ...prev, reminders_quiet_hours_start: e.target.value }))}
                          className="h-10 rounded-xl border border-[#E4E4E7] bg-[#FAFAFA] px-3 text-xs text-[#09090B] focus:border-[#2563EB] outline-none"
                        />
                      </div>
                      <span className="text-[#A1A1AA] pt-4">–</span>
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-bold text-[#71717A] uppercase tracking-wider">Até as</label>
                        <input
                          type="time"
                          value={companySettings.reminders_quiet_hours_end}
                          onChange={(e) => setCompanySettings((prev) => ({ ...prev, reminders_quiet_hours_end: e.target.value }))}
                          className="h-10 rounded-xl border border-[#E4E4E7] bg-[#FAFAFA] px-3 text-xs text-[#09090B] focus:border-[#2563EB] outline-none"
                        />
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Save changes */}
              <div className="flex justify-end">
                <Button onClick={handleSaveCompanySettings} disabled={pending} className="bg-[#2563EB] hover:bg-[#1D4ED8]">
                  <Save size={14} className="mr-1.5" />
                  Salvar Configuração de Lembretes
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Info Widget / Right Column */}
      <div className="w-full lg:w-80 shrink-0 space-y-6">
        <Card className="border-[#E4E4E7] shadow-sm rounded-2xl bg-white">
          <CardHeader>
            <CardTitle className="text-sm font-bold text-[#09090B]">Resumo da Atividade</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between text-xs text-[#52525B]">
              <span>Não lidas</span>
              <span className="font-bold text-[#2563EB]">{notifications.filter((n) => !n.read).length}</span>
            </div>
            <div className="h-px bg-[#E4E4E7]" />
            <div className="flex items-center justify-between text-xs text-[#52525B]">
              <span>Total no feed</span>
              <span className="font-bold text-[#09090B]">{notifications.length}</span>
            </div>
            <div className="h-px bg-[#E4E4E7]" />
            <div className="text-[11px] text-[#71717A] leading-relaxed">
              O feed de alertas exibe até as últimas 50 notificações. Use as configurações ao lado para definir o canal ideal para cada equipe.
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
