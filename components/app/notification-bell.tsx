"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Bell, Check, X, CheckCheck, AlertTriangle, CreditCard, Users, UserPlus, Zap, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import {
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  acceptInvitation,
  declineInvitation,
} from "@/app/(app)/settings/invitations/actions";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { Notification } from "@/lib/types/database";

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "agora mesmo";
  if (mins < 60) return `há ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `há ${hours}h`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "ontem";
  return `há ${days} dias`;
}

const PRIORITY_DOT: Record<string, string> = {
  critical: "bg-red-500",
  high: "bg-orange-400",
  medium: "bg-brand-blue-400",
  low: "bg-white/30",
};

const PRIORITY_BG: Record<string, string> = {
  critical: "bg-red-500/10 border-red-500/20",
  high: "bg-orange-500/8 border-orange-500/15",
  medium: "bg-white/[0.04] border-white/[0.08]",
  low: "bg-white/[0.02] border-white/[0.05]",
};

const TYPE_ICON: Record<string, React.ReactNode> = {
  invite: <UserPlus size={14} className="text-brand-blue-400" />,
  member_joined: <Users size={14} className="text-brand-teal-400" />,
  member_left: <Users size={14} className="text-white/40" />,
  channel_error: <AlertTriangle size={14} className="text-red-400" />,
  payment_failed: <CreditCard size={14} className="text-red-400" />,
  lead_hot: <Zap size={14} className="text-orange-400" />,
  system: <Info size={14} className="text-white/50" />,
};

interface NotificationCardProps {
  notification: Notification;
  onRead: (id: string) => void;
  onDismiss: (id: string) => void;
}

function NotificationCard({ notification, onRead, onDismiss }: NotificationCardProps) {
  const [accepting, startAccept] = useTransition();
  const [declining, startDecline] = useTransition();

  const invitationId = notification.metadata?.invitation_id as string | undefined;
  const isInvite = notification.type === "invite" && invitationId;

  function handleAccept() {
    if (!invitationId) return;
    startAccept(async () => {
      try {
        await acceptInvitation(invitationId);
        toast.success("Convite aceito! Bem-vindo ao time.");
        onDismiss(notification.id);
      } catch (err: any) {
        toast.error(err.message);
      }
    });
  }

  function handleDecline() {
    if (!invitationId) return;
    startDecline(async () => {
      try {
        await declineInvitation(invitationId);
        toast.info("Convite recusado.");
        onDismiss(notification.id);
      } catch (err: any) {
        toast.error(err.message);
      }
    });
  }

  function handleClick() {
    if (!notification.read) onRead(notification.id);
    if (notification.action_url && !isInvite) {
      window.location.href = notification.action_url;
    }
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0, marginBottom: 0 }}
      transition={{ duration: 0.18 }}
      className={cn(
        "rounded-xl border p-3 transition-colors",
        PRIORITY_BG[notification.priority],
        !notification.read && "ring-1 ring-brand-blue-500/20",
        !isInvite && notification.action_url && "cursor-pointer hover:bg-white/[0.06]"
      )}
      onClick={!isInvite ? handleClick : undefined}
    >
      <div className="flex items-start gap-2.5">
        <div className="relative mt-0.5 flex-shrink-0">
          <span className={cn("absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full", PRIORITY_DOT[notification.priority] || "bg-white/30")} />
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/[0.06]">
            {TYPE_ICON[notification.type] || <Bell size={14} className="text-white/40" />}
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-1">
            <p className={cn("text-[13px] font-semibold leading-tight", notification.read ? "text-white/70" : "text-white")}>
              {notification.title}
            </p>
            <span className="flex-shrink-0 text-[10px] text-white/40">{timeAgo(notification.created_at)}</span>
          </div>
          <p className={cn("mt-1 text-[12px] leading-relaxed", notification.read ? "text-white/50" : "text-white/80")}>
            {notification.body}
          </p>

          {isInvite && (
            <div className="mt-2.5 flex gap-2">
              <button
                onClick={handleAccept}
                disabled={accepting || declining}
                className="flex items-center gap-1 rounded-lg bg-brand-teal-500/20 px-3 py-1.5 text-[11px] font-semibold text-brand-teal-300 transition-colors hover:bg-brand-teal-500/30 disabled:opacity-50"
              >
                {accepting ? (
                  <span className="h-3 w-3 animate-spin rounded-full border border-brand-teal-400 border-t-transparent" />
                ) : (
                  <Check size={11} />
                )}
                Aceitar
              </button>
              <button
                onClick={handleDecline}
                disabled={accepting || declining}
                className="flex items-center gap-1 rounded-lg bg-white/[0.06] px-3 py-1.5 text-[11px] font-semibold text-white/50 transition-colors hover:bg-white/[0.10] hover:text-white/70 disabled:opacity-50"
              >
                {declining ? (
                  <span className="h-3 w-3 animate-spin rounded-full border border-white/30 border-t-transparent" />
                ) : (
                  <X size={11} />
                )}
                Recusar
              </button>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

interface NotificationBellProps {
  userId: string;
}

export function NotificationBell({ userId }: NotificationBellProps) {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [markingAll, startMarkAll] = useTransition();
  const panelRef = useRef<HTMLDivElement>(null);

  const unreadCount = notifications.filter((n) => !n.read).length;
  const displayCount = unreadCount > 9 ? "9+" : unreadCount > 0 ? String(unreadCount) : null;

  useEffect(() => {
    getNotifications().then((data) => {
      setNotifications(data as Notification[]);
      setLoaded(true);
    });
  }, []);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`notifications:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          setNotifications((prev) => [payload.new as Notification, ...prev].slice(0, 20));
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
            prev.map((n) => (n.id === (payload.new as Notification).id ? { ...n, ...(payload.new as any) } : n))
          );
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [userId]);

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  function handleRead(id: string) {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    markNotificationRead(id).catch(() => {});
  }

  function handleDismiss(id: string) {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }

  function handleMarkAll() {
    startMarkAll(async () => {
      await markAllNotificationsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    });
  }

  return (
    <div ref={panelRef} className="relative">
      <button
        aria-label="Notificações"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "relative flex h-9 w-9 items-center justify-center rounded-full transition-all duration-200 outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-500",
          open 
            ? "bg-white/15 text-white shadow-inner" 
            : "text-white/70 hover:bg-white/10 hover:text-white"
        )}
      >
        <Bell size={18} className={cn("transition-transform", open && "scale-105")} />
        <AnimatePresence>
          {displayCount && (
            <motion.span
              key="badge"
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.5, opacity: 0 }}
              transition={{ type: "spring", stiffness: 500, damping: 25 }}
              className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full border border-[rgba(11,18,34,0.9)] bg-red-500 px-1 text-[9px] font-bold text-white shadow-sm"
            >
              {displayCount}
            </motion.span>
          )}
        </AnimatePresence>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            key="notif-panel"
            initial={{ opacity: 0, y: 12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.96 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="absolute right-0 sm:-right-4 top-full z-[100] mt-3 w-[340px] origin-top-right overflow-hidden rounded-2xl border border-white/10 bg-[#0B1222] shadow-2xl shadow-black/60 backdrop-blur-3xl ring-1 ring-white/5"
          >
            <div className="flex items-center justify-between border-b border-white/10 bg-white/[0.03] px-4 py-3">
              <div className="flex items-center gap-2">
                <span className="text-[14px] font-semibold text-white tracking-tight">Notificações</span>
                {unreadCount > 0 && (
                  <span className="rounded-full bg-brand-blue-500/20 px-2 py-0.5 text-[10px] font-bold text-brand-blue-400">
                    {unreadCount} nova{unreadCount !== 1 ? "s" : ""}
                  </span>
                )}
              </div>
              {unreadCount > 0 && (
                <button
                  onClick={handleMarkAll}
                  disabled={markingAll}
                  className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium text-white/50 transition-colors hover:bg-white/5 hover:text-white/90 disabled:opacity-50"
                >
                  <CheckCheck size={14} />
                  Marcar lidas
                </button>
              )}
            </div>

            <div className="max-h-[420px] overflow-y-auto overscroll-contain">
              {!loaded ? (
                <div className="space-y-2 p-3">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-[72px] animate-pulse rounded-xl bg-white/5" />
                  ))}
                </div>
              ) : notifications.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/5">
                    <Bell size={24} className="text-white/20" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-[13px] font-medium text-white/60">Tudo limpo por aqui</p>
                    <p className="text-[11px] text-white/30">Nenhuma notificação no momento</p>
                  </div>
                </div>
              ) : (
                <AnimatePresence initial={false}>
                  <div className="space-y-1.5 p-3">
                    {notifications.map((n) => (
                      <NotificationCard
                        key={n.id}
                        notification={n}
                        onRead={handleRead}
                        onDismiss={handleDismiss}
                      />
                    ))}
                  </div>
                </AnimatePresence>
              )}
            </div>

            {notifications.length > 0 && (
              <div className="border-t border-white/5 bg-white/[0.01] px-4 py-2.5">
                <p className="text-center text-[11px] font-medium text-white/30">
                  Mostrando as últimas {notifications.length} notificações
                </p>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
