/**
 * Supabase Browser Client
 * Use in "use client" components and client-side hooks.
 * Safe to call multiple times — SSR package deduplicates.
 */
import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
