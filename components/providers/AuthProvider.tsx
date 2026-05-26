"use client";

/**
 * AuthProvider — contexto de autenticação client-side
 *
 * Expõe:
 *   useAuth()  → { user, profile, session, loading, signOut }
 *   useUser()  → User | null  (atalho)
 *
 * Escuta onAuthStateChange do Supabase para manter estado atualizado
 * sem polling. Compatível com SSR: o estado inicial vem do servidor
 * (layout Server Component) e o provider só hidrata no browser.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import type { Session, User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

// ── Types ──────────────────────────────────────────────────────────────────

export interface UserProfile {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  company_id: string | null;
  companies: {
    id: string;
    name: string;
    plan_type: string;
    subscription_status: string;
    created_at: string;
  } | null;
  memberships: { role: string; company_id: string }[] | null;
}

interface AuthContextValue {
  user: User | null;
  profile: UserProfile | null;
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
  /** Re-fetches company profile from DB — call after billing changes (e.g. post-Stripe checkout) */
  refreshProfile: () => Promise<void>;
}

// ── Context ────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextValue | null>(null);

// ── Provider ───────────────────────────────────────────────────────────────

interface AuthProviderProps {
  children: ReactNode;
  /** Passed from Server Component layout to avoid client-side fetch on first render */
  initialUser?: User | null;
  initialProfile?: UserProfile | null;
}

export function AuthProvider({
  children,
  initialUser = null,
  initialProfile = null,
}: AuthProviderProps) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [user, setUser] = useState<User | null>(initialUser);
  const [profile, setProfile] = useState<UserProfile | null>(initialProfile);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(!initialUser && !initialProfile);

  // Fetch profile from public.users
  const fetchProfile = useCallback(
    async (userId: string) => {
      const { data } = await supabase
        .from("users")
        .select("*, companies(id, name, plan_type, subscription_status, created_at), memberships(role, company_id)")
        .eq("id", userId)
        .single();
      setProfile(data ?? null);
    },
    [supabase],
  );

  useEffect(() => {
    // Skip getSession if server already hydrated initialProfile
    if (!initialProfile) {
      supabase.auth.getSession().then(({ data: { session } }: { data: { session: Session | null } }) => {
        setSession(session);
        if (session?.user) {
          setUser(session.user);
          fetchProfile(session.user.id);
        }
        setLoading(false);
      });
    }

    // Listen for auth state changes (login, logout, token refresh)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event: string, session: Session | null) => {
      setSession(session);
      setUser(session?.user ?? null);

      if (event === "SIGNED_IN") {
        if (session?.user) fetchProfile(session.user.id);
        setLoading(false);
        router.refresh();
      } else if (event === "SIGNED_OUT") {
        setProfile(null);
        setLoading(false);
        router.push("/");
      } else if (event === "TOKEN_REFRESHED") {
        // Silent token renewal — no re-render needed
        setLoading(false);
      } else if (event === "USER_UPDATED") {
        if (session?.user) fetchProfile(session.user.id);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, [supabase, router, fetchProfile, initialProfile]);

  // Realtime: re-fetch profile when companies table plan/status changes (handles cross-tab upgrades)
  useEffect(() => {
    const companyId = profile?.companies?.id;
    if (!companyId || !user) return;

    const channel = supabase
      .channel(`company-billing-${companyId}`)
      .on(
        'postgres_changes' as any,
        { event: 'UPDATE', schema: 'public', table: 'companies', filter: `id=eq.${companyId}` },
        (payload: any) => {
          const { plan_type, subscription_status } = payload.new ?? {};
          if (!plan_type && !subscription_status) return;
          setProfile((prev) =>
            prev?.companies
              ? { ...prev, companies: { ...prev.companies, plan_type: plan_type ?? prev.companies.plan_type, subscription_status: subscription_status ?? prev.companies.subscription_status } }
              : prev
          );
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [profile?.companies?.id, user, supabase]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    router.push("/");
  }, [supabase, router]);

  const refreshProfile = useCallback(async () => {
    if (user) await fetchProfile(user.id);
  }, [user, fetchProfile]);

  const value = useMemo(
    () => ({ user, profile, session, loading, signOut, refreshProfile }),
    [user, profile, session, loading, signOut, refreshProfile],
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

// ── Hooks ──────────────────────────────────────────────────────────────────

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used inside <AuthProvider>");
  }
  return ctx;
}

export function useUser(): User | null {
  return useAuth().user;
}
