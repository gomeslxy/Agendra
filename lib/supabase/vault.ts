// lib/supabase/vault.ts
// Wrapper utilities for Supabase Vault RPC calls

export async function setChannelAccessToken(channelId: string, token: string) {
  const admin = createAdminClient();
  const { error } = await admin.rpc('channel_set_access_token', {
    p_channel_id: channelId,
    p_token: token,
  });
  if (error) {
    // Propagate error to caller for fallback handling
    throw error;
  }
}

// Helper to create admin client – re-export to avoid circular imports
import { createAdminClient } from '@/lib/supabase/admin';
