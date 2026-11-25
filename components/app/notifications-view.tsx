"use client";

import { useEffect, useState, useTransition } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, type TabItem } from "@/components/ui/tabs";
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
import type { Notification } from "@/lib/types/database";
import { NotificationsTimeline } from "./notifications/notifications-timeline";
import {
  NotificationPreferencesForm,
  type UserNotificationSettingsState,
} from "./notifications/notification-preferences-form";
import {
  CompanyQuietHoursForm,
  type CompanyQuietHoursState,
} from "./notifications/company-quiet-hours-form";

interface NotificationsViewProps {
  initialNotifications: Notification[];
  initialSettings: UserNotificationSettingsState;
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

type NotificationsTabId = "timeline" | "preferences" | "company_reminders";

export function NotificationsView({
  initialNotifications,
  initialSettings,
  company,
  isAdmin,
  userId,
  companyId,
}: NotificationsViewProps) {
  const [activeTab, setActiveTab] = useState<NotificationsTabId>("timeline");
  const [notifications, setNotifications] = useState<Notification[]>(initialNotifications);
  const [filter, setFilter] = useState<"all" | "unread" | "critical">("all");
  const [pending, startTransition] = useTransition();
  const [userSettings, setUserSettings] = useState<UserNotificationSettingsState>(initialSettings);
  const [companySettings, setCompanySettings] = useState<CompanyQuietHoursState>({
    reminders_quiet_hours_enabled: company.reminders_quiet_hours_enabled,
    reminders_quiet_hours_start: company.reminders_quiet_hours_start,
    reminders_quiet_hours_end: company.reminders_quiet_hours_end,
  });

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
          toast.info(`Nova notificação: ${(payload.new as Notification).title}`);
        },
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
          const updated = payload.new as Notification;
          setNotifications((prev) => prev.map((n) => (n.id === updated.id ? updated : n)));
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

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
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erro ao salvar preferências.");
      }
    });
  };

  const handleSaveCompanySettings = () => {
    startTransition(async () => {
      try {
        await saveCompanyReminderSettings(companyId, companySettings);
        toast.success("Configuração de lembretes salva com sucesso!");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erro ao salvar configurações da empresa.");
      }
    });
  };

  const filteredNotifications = notifications.filter((n) => {
    if (filter === "unread") return !n.read;
    if (filter === "critical") return n.priority === "critical" || n.priority === "high";
    return true;
  });

  const unreadCount = notifications.filter((n) => !n.read).length;

  const tabs: TabItem<NotificationsTabId>[] = [
    { id: "timeline", label: "Linha do Tempo", badge: unreadCount > 0 ? unreadCount : undefined },
    { id: "preferences", label: "Preferências Pessoais" },
    ...(isAdmin ? [{ id: "company_reminders" as const, label: "Lembretes (Clientes)" }] : []),
  ];

  return (
    <div className="flex flex-col lg:flex-row gap-8 items-start select-none">
      <div className="flex-1 w-full flex flex-col gap-6 min-w-0">
        <Tabs
          items={tabs}
          value={activeTab}
          onChange={setActiveTab}
          ariaLabel="Seções da Central de Notificações"
          className="self-start max-w-full"
        />

        <AnimatePresence mode="wait">
          {activeTab === "timeline" && (
            <motion.div
              key="timeline-panel"
              role="tabpanel"
              id="tabpanel-timeline"
              aria-labelledby="tab-timeline"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.15 }}
            >
              <NotificationsTimeline
                notifications={filteredNotifications}
                filter={filter}
                onFilterChange={setFilter}
                hasUnread={unreadCount > 0}
                pending={pending}
                onRead={handleRead}
                onMarkAllRead={handleMarkAllRead}
              />
            </motion.div>
          )}

          {activeTab === "preferences" && (
            <motion.div
              key="preferences-panel"
              role="tabpanel"
              id="tabpanel-preferences"
              aria-labelledby="tab-preferences"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.15 }}
            >
              <NotificationPreferencesForm
                settings={userSettings}
                onChange={setUserSettings}
                onSave={handleSaveUserSettings}
                pending={pending}
              />
            </motion.div>
          )}

          {activeTab === "company_reminders" && isAdmin && (
            <motion.div
              key="company-reminders-panel"
              role="tabpanel"
              id="tabpanel-company_reminders"
              aria-labelledby="tab-company_reminders"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.15 }}
            >
              <CompanyQuietHoursForm
                settings={companySettings}
                onChange={setCompanySettings}
                onSave={handleSaveCompanySettings}
                pending={pending}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="w-full lg:w-80 shrink-0 space-y-6">
        <Card className="border-[#E4E4E7] shadow-sm rounded-2xl bg-white">
          <CardHeader>
            <CardTitle className="text-sm font-bold text-[#09090B]">Resumo da Atividade</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between text-xs text-[#52525B]">
              <span>Não lidas</span>
              <span className="font-bold text-[#2563EB]">{unreadCount}</span>
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
