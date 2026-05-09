/**
 * Supabase Server Client
 * Use in Server Components, Server Actions, and Route Handlers.
 * Reads/writes session cookies via Next.js `cookies()`.
 *
 * ⚠️  Never import in "use client" files.
 */
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { cache } from "react";

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
        setAll(cookiesToSet: any[]) {
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

/** Convenience: return the authenticated user or null */
export async function getUser() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return null;
  return user;
}

/** Convenience: return the user's profile row from public.users */
export async function getUserProfile() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("users")
    .select("*, companies(id, name, plan), memberships(role, company_id)")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    console.error(
      "Erro ao buscar perfil do usuário no Supabase:",
      JSON.stringify(error, null, 2),
      "| Mensagem:", error.message
    );
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
    .select("*, companies(id, name, plan), memberships(role, company_id)")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    console.error("[getCachedUserProfile] error:", error.message);
  }
  return data ?? null;
});
