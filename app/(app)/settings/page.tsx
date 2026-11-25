import { Suspense } from "react";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getUser, getCachedUserProfile, resolveProfileMembership } from "@/lib/supabase/server";
import { SettingsShell } from "./settings-shell";
import { PanelSkeleton } from "./components/settings-shared";
import { SettingsTabLoader } from "./tabs/tab-data-loaders";
import { SETTINGS_TAB_IDS, type SettingsTabId } from "./types";

export const metadata: Metadata = {
  title: "Settings",
  description: "Configure your account, manage memberships, and view usage statistics.",
  robots: { index: false, follow: false },
};

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const user = await getUser();
  if (!user) redirect("/login");

  const profile = await getCachedUserProfile(user.id);
  const activeMembership = await resolveProfileMembership(profile);
  const companyId = activeMembership?.company_id;
  if (!companyId) redirect("/login");

  const rawTab = (await searchParams).tab;
  const activeTab: SettingsTabId =
    rawTab && SETTINGS_TAB_IDS.includes(rawTab as SettingsTabId)
      ? (rawTab as SettingsTabId)
      : "account";

  const userRole = activeMembership?.role ?? "member";

  return (
    <SettingsShell activeTab={activeTab}>
      <Suspense key={activeTab} fallback={<PanelSkeleton />}>
        <SettingsTabLoader tab={activeTab} companyId={companyId} userRole={userRole} />
      </Suspense>
    </SettingsShell>
  );
}
