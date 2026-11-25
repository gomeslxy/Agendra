/**
 * Supabase Server Client
 * Use in Server Components, Server Actions, and Route Handlers.
 * Reads/writes session cookies via Next.js `cookies()`.
 *
 * ⚠️  Never import in "use client" files.
 */
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { cache } from "react";
import { logError } from "@/lib/logging";

const ACTIVE_COMPANY_COOKIE = "agendra_active_company";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // `setAll` called from a Server Component (read-only context).
            // Session refresh is handled by middleware — safe to ignore here.
          }
        },
      },
    },
  );
}

/**
 * Per-request memoized auth check.
 * React cache() deduplicates calls within a single server render pass —
 * layout + page both call this but Supabase auth is only hit once.
 */
export const getUser = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return null;
  return user;
});

/** Convenience: return the user's profile row from public.users */
export async function getUserProfile() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("users")
    .select("*, companies(id, name, plan_type, subscription_status, onboarding_completed), memberships(role, company_id)")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    logError("[getUserProfile] error:", error.message);
  }

  return data ?? null;
}

/**
 * Per-request memoized profile fetch.
 * React cache() deduplicates calls within a single server render pass —
 * layout + page both call this but Supabase is only hit once.
 * Unlike unstable_cache, it does not cross request boundaries, which
 * makes it safe to use with cookies().
 */
export const getCachedUserProfile = cache(async (userId: string) => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("users")
    .select("*, companies(id, name, plan_type, subscription_status, onboarding_completed), memberships(role, company_id)")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    logError("[getCachedUserProfile] error:", error.message);
  }
  return data ?? null;
});

type MembershipShape = { company_id: string; role: string };
type ProfileWithMemberships = {
  company_id?: string | null;
  memberships?: MembershipShape[] | null;
} | null;

/**
 * Deterministically resolves the active membership from profile memberships.
 * Priority: explicit `targetCompanyId` -> `profile.company_id` (primary non-ghost tenant) -> sorted company_id.
 */
export function getActiveMembership(
  profile: ProfileWithMemberships,
  targetCompanyId?: string | null,
): MembershipShape | null {
  const list = profile?.memberships;
  if (!list?.length) return null;

  if (targetCompanyId) {
    const match = list.find((m) => m.company_id === targetCompanyId);
    if (match) return match;
  }

  if (profile?.company_id) {
    const primaryMatch = list.find((m) => m.company_id === profile.company_id);
    if (primaryMatch) return primaryMatch;
  }

  return [...list].sort((a, b) => a.company_id.localeCompare(b.company_id))[0];
}

/**
 * Safely resolves the active companyId from user profile memberships.
 */
export function getActiveCompanyId(
  profile: ProfileWithMemberships,
  targetCompanyId?: string | null,
): string | null {
  return getActiveMembership(profile, targetCompanyId)?.company_id ?? null;
}

/**
 * Cookie-aware helper for Server Components / Server Actions that already fetched `profile`.
 */
export async function resolveProfileCompanyId(
  profile: ProfileWithMemberships,
  targetCompanyId?: string | null,
): Promise<string | null> {
  if (targetCompanyId) {
    return getActiveCompanyId(profile, targetCompanyId);
  }
  try {
    const cookieStore = await cookies();
    const cookieCompanyId = cookieStore.get(ACTIVE_COMPANY_COOKIE)?.value ?? null;
    if (cookieCompanyId) {
      const match = profile?.memberships?.find((m) => m.company_id === cookieCompanyId);
      if (match) return match.company_id;
    }
  } catch {
    // Non-request context fallback
  }
  return getActiveCompanyId(profile);
}

/**
 * Cookie-aware helper returning both `companyId` and `role` from an already-fetched `profile`.
 */
export async function resolveProfileMembership(
  profile: ProfileWithMemberships,
  targetCompanyId?: string | null,
): Promise<MembershipShape | null> {
  if (targetCompanyId) {
    return getActiveMembership(profile, targetCompanyId);
  }
  try {
    const cookieStore = await cookies();
    const cookieCompanyId = cookieStore.get(ACTIVE_COMPANY_COOKIE)?.value ?? null;
    if (cookieCompanyId) {
      const match = profile?.memberships?.find((m) => m.company_id === cookieCompanyId);
      if (match) return match;
    }
  } catch {
    // Non-request context fallback
  }
  return getActiveMembership(profile);
}

