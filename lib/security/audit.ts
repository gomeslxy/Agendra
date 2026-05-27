import { createAdminClient } from "@/lib/supabase/admin";
import { getUserProfile } from "@/lib/supabase/server";

export interface LogAuditOptions {
  action: string;
  companyId?: string;
  payload?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Logs an administrative audit action for SOC2/compliance auditing.
 * Always resolves actor dynamically using active session to prevent IDOR.
 */
export async function logAuditAction(options: LogAuditOptions) {
  try {
    const profile = await getUserProfile();
    const companyId = options.companyId || profile?.memberships?.[0]?.company_id;
    if (!companyId) {
      console.warn(`[AuditLog] Skipping audit log for action "${options.action}": No company_id resolved.`);
      return;
    }

    const admin = createAdminClient();
    const { error } = await admin.from("audit_logs").insert({
      company_id: companyId,
      user_id: profile?.id || null,
      actor_email: profile?.email || null,
      action: options.action,
      ip_address: options.ipAddress || null,
      user_agent: options.userAgent || null,
      payload: options.payload || {},
    });

    if (error) {
      console.error("[AuditLog] Supabase write error:", error.message);
    }
  } catch (err) {
    console.error("[AuditLog] Failed to log administrative audit action:", err);
  }
}
