import { cookies } from 'next/headers';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';

export const ACTIVE_COMPANY_COOKIE = 'agendra_active_company';

export type MembershipRole = 'owner' | 'admin' | 'member' | 'user';

export interface TenantMembership {
  company_id: string;
  role: MembershipRole;
  onboarding_completed?: boolean | null;
}

export interface TenantContext {
  userId: string;
  userEmail: string;
  companyId: string;
  role: MembershipRole;
  isAdmin: boolean;
  memberships: TenantMembership[];
}

export const SwitchCompanySchema = z.object({
  companyId: z.string().uuid(),
});

export class TenantContextError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'TenantContextError';
    this.status = status;
  }
}

export function isAdminRole(role: string | null | undefined): boolean {
  return role === 'owner' || role === 'admin';
}

/**
 * Deterministically picks the active membership from a list of memberships:
 * 1. Explicit `preferredCompanyId` (target param or cookie) if present in memberships.
 * 2. First membership whose company has completed onboarding (avoids phantom trial companies).
 * 3. Deterministic tie-breaker sorted by `company_id` ascending.
 */
export function resolveActiveMembership<T extends TenantMembership>(
  memberships: readonly T[] | null | undefined,
  preferredCompanyId?: string | null,
): T | null {
  if (!memberships || memberships.length === 0) return null;

  if (preferredCompanyId) {
    const preferred = memberships.find((m) => m.company_id === preferredCompanyId);
    if (preferred) return preferred;
  }

  const completed = memberships.filter((m) => m.onboarding_completed === true);
  if (completed.length > 0) {
    return [...completed].sort((a, b) => a.company_id.localeCompare(b.company_id))[0];
  }

  return [...memberships].sort((a, b) => a.company_id.localeCompare(b.company_id))[0];
}

interface RawMembershipRow {
  company_id: string;
  role: string;
  companies?:
    | { onboarding_completed?: boolean | null }
    | Array<{ onboarding_completed?: boolean | null }>
    | null;
}

function normalizeRole(raw: string): MembershipRole {
  if (raw === 'owner' || raw === 'admin' || raw === 'member' || raw === 'user') {
    return raw;
  }
  return 'member';
}

/**
 * Resolves and validates the authenticated user's active tenant context.
 * Uses RLS-bound `createClient()`, reads `agendra_active_company` cookie,
 * and enforces optional `targetCompanyId` membership and `requireAdmin` role checks.
 */
export async function requireTenantContext(opts?: {
  requireAdmin?: boolean;
  targetCompanyId?: string | null;
}): Promise<TenantContext> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();

  if (authErr || !user) {
    throw new TenantContextError('Não autenticado', 401);
  }

  const { data: rows, error: memErr } = await supabase
    .from('memberships')
    .select('company_id, role, companies(onboarding_completed)')
    .eq('user_id', user.id);

  if (memErr) {
    throw new TenantContextError('Falha ao resolver vínculo da empresa', 500);
  }

  const memberships: TenantMembership[] = ((rows ?? []) as RawMembershipRow[]).map((row) => {
    const companyRel = Array.isArray(row.companies) ? row.companies[0] : row.companies;
    return {
      company_id: row.company_id,
      role: normalizeRole(row.role),
      onboarding_completed: companyRel?.onboarding_completed ?? null,
    };
  });

  if (memberships.length === 0) {
    throw new TenantContextError('Nenhuma empresa vinculada ao usuário', 403);
  }

  if (opts?.targetCompanyId) {
    const targetMatch = memberships.find((m) => m.company_id === opts.targetCompanyId);
    if (!targetMatch) {
      throw new TenantContextError('Acesso negado para esta empresa', 403);
    }
    if (opts.requireAdmin && !isAdminRole(targetMatch.role)) {
      throw new TenantContextError('Apenas administradores podem realizar esta ação', 403);
    }
    return {
      userId: user.id,
      userEmail: user.email ?? '',
      companyId: targetMatch.company_id,
      role: targetMatch.role,
      isAdmin: isAdminRole(targetMatch.role),
      memberships,
    };
  }

  let cookieCompanyId: string | null = null;
  try {
    const cookieStore = await cookies();
    cookieCompanyId = cookieStore.get(ACTIVE_COMPANY_COOKIE)?.value ?? null;
  } catch {
    // Non-request context fallback
  }

  const active = resolveActiveMembership(memberships, cookieCompanyId);
  if (!active) {
    throw new TenantContextError('Nenhuma empresa ativa encontrada', 403);
  }

  if (opts?.requireAdmin && !isAdminRole(active.role)) {
    throw new TenantContextError('Apenas administradores podem realizar esta ação', 403);
  }

  return {
    userId: user.id,
    userEmail: user.email ?? '',
    companyId: active.company_id,
    role: active.role,
    isAdmin: isAdminRole(active.role),
    memberships,
  };
}

/**
 * Switches the active company cookie after verifying the user holds membership in `companyId`.
 */
export async function switchActiveCompany(companyId: string): Promise<TenantContext> {
  const parsed = SwitchCompanySchema.safeParse({ companyId });
  if (!parsed.success) {
    throw new TenantContextError('companyId inválido', 400);
  }

  const ctx = await requireTenantContext({ targetCompanyId: parsed.data.companyId });
  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_COMPANY_COOKIE, ctx.companyId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });

  return ctx;
}
