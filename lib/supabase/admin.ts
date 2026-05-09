/**
 * Supabase Admin Client (service role)
 * ONLY for server-side code that needs to bypass RLS.
 *
 * ⚠️  NEVER import in client components.
 * ⚠️  NEVER expose SUPABASE_SERVICE_ROLE_KEY to the browser.
 */
import { createClient } from "@supabase/supabase-js";

export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars",
    );
  }

  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
