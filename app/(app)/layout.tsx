/**
 * App Layout — Server Component
 *
 * Verifica sessão server-side antes de renderizar qualquer coisa.
 * Se não há sessão, o middleware já redirecionou. Esta é uma
 * verificação de segurança adicional (defense in depth).
 *
 * Passa o perfil do usuário para o AuthProvider (client component)
 * para evitar fetch extra no browser no primeiro render.
 */
import { redirect } from "next/navigation";
import { createClient, getUser, getCachedUserProfile } from "@/lib/supabase/server";
import { AuthProvider } from "@/components/providers/AuthProvider";
import { AppShell } from "@/components/app/app-shell";
import { getOnboardingStatus } from "@/lib/onboarding/guards";
import { MotionProvider } from "@/components/motion/motion-provider";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getUser();
  if (!user) redirect("/login");

  const profile = await getCachedUserProfile(user.id);
  if (!profile) redirect("/login");

  const companyId = profile.memberships?.[0]?.company_id ?? null;

  if (!companyId) redirect('/onboarding');

  try {
    const onboardingStatus = await getOnboardingStatus(companyId);
    if (onboardingStatus !== 'completed') {
      redirect('/onboarding');
    }
  } catch {
    redirect('/onboarding');
  }

  let hotCount = 0;
  let unhealthyChannelsCount = 0;

  if (companyId) {
    const supabase = await createClient();

    const [{ count: hc }, { count: uc }] = await Promise.all([
      supabase
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId)
        .eq("status", "hot"),
      supabase
        .from("channels")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId)
        .eq("status", "error"),
    ]);
    hotCount = hc ?? 0;
    unhealthyChannelsCount = uc ?? 0;
  }

  return (
    <AuthProvider initialUser={user} initialProfile={profile}>
      <MotionProvider>
        <AppShell 
          hotCount={hotCount} 
          unhealthyChannelsCount={unhealthyChannelsCount}
        >
          {children}
        </AppShell>
      </MotionProvider>
    </AuthProvider>
  );
}
