import { getCachedUserProfile, resolveProfileCompanyId } from "@/lib/supabase/server";
import type { createAdminClient } from "@/lib/supabase/admin";

export type AdminSupabaseClient = ReturnType<typeof createAdminClient>;

export type DepStatus = "ok" | "error" | "missing_env";

export interface DepResult {
  name: string;
  status: DepStatus;
  latency_ms: number | null;
  detail?: string;
}

export interface CronJobStatus {
  jobid: number;
  jobname: string;
  schedule: string;
  active: boolean;
  last_run: string | null;
  last_status: string | null;
  last_message: string | null;
  duration_ms: number | null;
}

export function getErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err ?? "Erro desconhecido");
}

export async function insertAudit(
  adminClient: AdminSupabaseClient,
  targetCompanyId: string,
  userId: string,
  email: string | undefined,
  ip: string,
  ua: string,
  action: string,
  payload: object,
): Promise<void> {
  let auditCompanyId = targetCompanyId;
  try {
    const adminProfile = await getCachedUserProfile(userId);
    const adminCompanyId = await resolveProfileCompanyId(adminProfile);
    if (adminCompanyId) auditCompanyId = adminCompanyId;
  } catch {
    // fallback to targetCompanyId
  }
  await adminClient.from("audit_logs").insert({
    company_id: auditCompanyId,
    user_id: userId,
    actor_email: email ?? "admin@agendra.site",
    action,
    ip_address: ip,
    user_agent: ua,
    payload: { ...payload, target_company_id: targetCompanyId },
  });
}
