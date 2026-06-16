import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getUser, getCachedUserProfile, createClient } from "@/lib/supabase/server";
import { getUserNotificationSettings } from "@/app/(app)/settings/actions";
import { NotificationsView } from "@/components/app/notifications-view";
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: "Central de Notificações",
  description: "Gerencie suas notificações do sistema, configure horário silencioso e preferências.",
  robots: { index: false, follow: false }
};

export default async function NotificationsPage() {
  const user = await getUser();
  if (!user) redirect("/login");

  const profile = await getCachedUserProfile(user.id);
  const companyId = profile?.memberships?.[0]?.company_id;
  if (!companyId) redirect("/login");

  const supabase = await createClient();

  // Load initial notifications (last 50 for the timeline)
  const { data: notifications, error } = await supabase
    .from("notifications")
    .select("id, company_id, user_id, type, title, body, action_url, metadata, priority, read, delivery_status, delivered_at, read_at, click_at, error_log, idempotency_key, created_at")
    .eq("user_id", user.id)
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    console.error("[NotificationsPage] error fetching:", error.message);
  }

  // Load user notification preferences
  const settings = await getUserNotificationSettings(companyId).catch(() => ({
    email_enabled: true,
    in_app_enabled: true,
    whatsapp_enabled: false,
    enabled_types: ['invite', 'member_joined', 'member_left', 'channel_error', 'payment_failed', 'lead_hot', 'system'],
    quiet_hours_enabled: false,
    quiet_hours_start: '22:00',
    quiet_hours_end: '08:00',
  }));

  // Fetch company info for reminders quiet hours configuration
  const { data: company } = await supabase
    .from("companies")
    .select("id, name, reminders_quiet_hours_enabled, reminders_quiet_hours_start, reminders_quiet_hours_end")
    .eq("id", companyId)
    .single();

  const userRole = profile?.memberships?.[0]?.role ?? "member";
  const isAdmin = userRole === "owner" || userRole === "admin";

  return (
    <div className="h-full overflow-y-auto px-4 pt-7 pb-[calc(72px+env(safe-area-inset-bottom,12px))] lg:px-8 lg:py-7 bg-[#FAFAFA]">
      <header className="mb-6 flex flex-col gap-1">
        <h1 className="text-[28px] font-bold tracking-[-0.02em] text-[#09090B]">Central de Notificações</h1>
        <p className="text-sm text-[#71717A]">
          Acompanhe os alertas do sistema, configure canais de entrega e estabeleça horários silenciosos.
        </p>
      </header>

      <Suspense fallback={<NotificationsSkeleton />}>
        <NotificationsView
          initialNotifications={notifications || []}
          initialSettings={settings}
          company={company || {
            id: companyId,
            name: "Empresa",
            reminders_quiet_hours_enabled: false,
            reminders_quiet_hours_start: "22:00",
            reminders_quiet_hours_end: "08:00",
          }}
          isAdmin={isAdmin}
          userId={user.id}
          companyId={companyId}
        />
      </Suspense>
    </div>
  );
}

function NotificationsSkeleton() {
  return (
    <div className="flex flex-col lg:flex-row gap-8 items-start animate-pulse">
      <div className="flex-1 w-full space-y-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-24 rounded-2xl bg-[#FFFFFF] border border-[#E4E4E7]" />
        ))}
      </div>
      <div className="w-full lg:w-80 h-96 rounded-2xl bg-[#FFFFFF] border border-[#E4E4E7]" />
    </div>
  );
}
