"use server";

import { z } from "zod";
import { getUser, getCachedUserProfile, resolveProfileCompanyId } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logError } from "@/lib/logging";
import {
  getRequestMeta,
  isAllowedAdminEmail,
  hasValidAdminCookie,
  checkAdminPassword,
  setAdminCookie,
  clearAdminCookie,
} from "@/lib/admin/auth";
import { getErrorMessage } from "./_shared";

const PasswordSchema = z.string().min(1, "Senha obrigatória").max(256);

export async function validateAdminSessionOrThrow(): Promise<void> {
  const user = await getUser();
  if (!user) throw new Error("Acesso negado: não autenticado");

  if (!isAllowedAdminEmail(user.email)) {
    throw new Error("Acesso negado: privilégios insuficientes");
  }

  if (!(await hasValidAdminCookie())) {
    throw new Error("Acesso negado: sessão administrativa inválida ou expirada");
  }
}

export async function verifyAdminPassword(
  password: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const parsed = PasswordSchema.safeParse(password);
    if (!parsed.success) {
      return { success: false, error: "Senha inválida" };
    }

    const user = await getUser();
    if (!user) return { success: false, error: "Usuário não está logado no Supabase" };

    if (!isAllowedAdminEmail(user.email)) {
      return { success: false, error: "Privilégios insuficientes" };
    }

    const { ip, ua } = await getRequestMeta();
    const adminClient = createAdminClient();

    const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const { count: recentFailures, error: rlErr } = await adminClient
      .from("admin_login_attempts")
      .select("id", { count: "exact", head: true })
      .eq("ip_address", ip)
      .eq("success", false)
      .gte("attempted_at", fifteenMinAgo);

    if (rlErr) {
      return {
        success: false,
        error: "Falha ao verificar limite de tentativas. Tente novamente.",
      };
    }
    if ((recentFailures ?? 99) >= 5) {
      return {
        success: false,
        error: "IP bloqueado por excesso de tentativas. Aguarde 15 minutos.",
      };
    }

    const profile = await getCachedUserProfile(user.id);
    const companyId = await resolveProfileCompanyId(profile);

    const isCorrect = checkAdminPassword(parsed.data);
    const { error: attemptErr } = await adminClient.from("admin_login_attempts").insert({
      ip_address: ip,
      success: isCorrect,
    });
    if (attemptErr) {
      logError("[admin-auth] failed to record login attempt:", attemptErr.message);
    }

    if (!isCorrect) {
      if (companyId) {
        await adminClient.from("audit_logs").insert({
          company_id: companyId,
          user_id: user.id,
          actor_email: user.email,
          action: "admin_login_failed",
          ip_address: ip,
          user_agent: ua,
          payload: { detail: "Senha secundária incorreta" },
        });
      }
      return { success: false, error: "Chave de segurança admin incorreta" };
    }

    await setAdminCookie();

    if (companyId) {
      await adminClient.from("audit_logs").insert({
        company_id: companyId,
        user_id: user.id,
        actor_email: user.email,
        action: "admin_login_success",
        ip_address: ip,
        user_agent: ua,
        payload: { detail: "Login administrativo com sucesso" },
      });
    }

    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: getErrorMessage(err) || "Erro interno de autenticação" };
  }
}

export async function logoutAdmin(): Promise<void> {
  await clearAdminCookie();
}
