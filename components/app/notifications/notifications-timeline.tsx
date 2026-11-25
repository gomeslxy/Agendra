"use client";

import { Bell, CheckCheck, Clock, AlertTriangle, ExternalLink, Zap, Info, CreditCard, UserPlus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Notification } from "@/lib/types/database";

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

interface NotificationsTimelineProps {
  notifications: Notification[];
  filter: "all" | "unread" | "critical";
  onFilterChange: (filter: "all" | "unread" | "critical") => void;
  hasUnread: boolean;
  pending: boolean;
  onRead: (id: string) => void;
  onMarkAllRead: () => void;
}

export function NotificationsTimeline({
  notifications,
  filter,
  onFilterChange,
  hasUnread,
  pending,
  onRead,
  onMarkAllRead,
}: NotificationsTimelineProps) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4 flex-wrap bg-white p-4 rounded-2xl border border-[#E4E4E7] shadow-sm">
        <div className="flex gap-1">
          {(["all", "unread", "critical"] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => onFilterChange(f)}
              className={cn(
                "px-3 py-1.5 text-xs font-semibold rounded-lg border transition",
                filter === f
                  ? "bg-[#EFF6FF] border-[#BFDBFE] text-[#2563EB]"
                  : "border-transparent text-[#71717A] hover:bg-[#F4F4F5]",
              )}
            >
              {f === "all" ? "Todas" : f === "unread" ? "Não lidas" : "Importantes"}
            </button>
          ))}
        </div>

        {hasUnread && (
          <Button
            onClick={onMarkAllRead}
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

      {notifications.length === 0 ? (
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
          {notifications.map((n) => (
            <div key={n.id} className="relative">
              <span className="absolute -left-[31px] top-3.5 flex h-4 w-4 items-center justify-center rounded-full bg-[#FAFAFA] border border-[#E4E4E7]">
                <span className={cn("h-1.5 w-1.5 rounded-full", n.read ? "bg-[#A1A1AA]" : "bg-[#2563EB]")} />
              </span>

              <div
                onClick={() => onRead(n.id)}
                className={cn(
                  "group rounded-2xl border p-4 bg-white transition-all hover:shadow-md cursor-pointer",
                  n.read ? "border-[#E4E4E7] opacity-80" : "border-[#BFDBFE] ring-1 ring-[#EFF6FF] shadow-sm",
                  n.action_url && "hover:border-[#2563EB]",
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

                    <div className="pt-2 flex items-center justify-between flex-wrap gap-2 text-[10px] text-[#71717A]">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={cn(
                            "px-1.5 py-0.5 rounded border font-semibold uppercase tracking-wider",
                            PRIORITY_COLOR[n.priority],
                          )}
                        >
                          {n.priority}
                        </span>
                        {n.delivery_status === "pending" && (
                          <span className="flex items-center text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-100 font-semibold gap-0.5">
                            <Clock size={10} />
                            Pendente (Silencioso)
                          </span>
                        )}
                        {n.delivery_status === "failed" && (
                          <span
                            className="flex items-center text-red-600 bg-red-50 px-1.5 py-0.5 rounded border border-red-100 font-semibold gap-0.5"
                            title={n.error_log ?? ""}
                          >
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
    </div>
  );
}
