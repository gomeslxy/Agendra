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
  let hotCount = 0;

  if (companyId) {
    const supabase = await createClient();
    const { count } = await supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .eq("status", "hot");
    hotCount = count ?? 0;
  }

  return (
    <AuthProvider initialUser={user} initialProfile={profile}>
      <AppShell hotCount={hotCount}>{children}</AppShell>
    </AuthProvider>
  );
}
