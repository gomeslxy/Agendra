// app/onboarding/layout.tsx
import { redirect } from "next/navigation";
import { getUser, getCachedUserProfile, resolveProfileCompanyId } from "@/lib/supabase/server";
import { getOnboardingStatus } from "@/lib/onboarding/guards";

export default async function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getUser();
  if (!user) redirect("/login");

  const profile = await getCachedUserProfile(user.id);
  if (!profile) redirect("/login");

  const companyId = await resolveProfileCompanyId(profile);
  if (!companyId) redirect("/login");

  try {
    const status = await getOnboardingStatus(companyId);
    if (status === 'completed') redirect("/inbox");
  } catch {
    // If we can't determine status, allow access to onboarding
  }

  return (
    <div className="bg-aurora min-h-screen">
      {children}
    </div>
  );
}
