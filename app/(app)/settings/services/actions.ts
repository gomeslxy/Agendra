"use server"

import { createClient } from "@/lib/supabase/server"
import { requireTenantContext } from "@/lib/tenant/context"
import { revalidatePath } from "next/cache"
import { logAuditAction } from "@/lib/security/audit"

export async function getServices(companyId: string) {
  await requireTenantContext({ targetCompanyId: companyId })
  const supabase = await createClient()

  const { data, error } = await supabase
    .from("services")
    .select("id, company_id, name, description, duration, price, active, is_paused, created_at, updated_at")
    .eq("company_id", companyId)
    .eq("active", true)
    .order("name")

  if (error) throw error
  return data
}

export async function createService(formData: FormData) {
  const { companyId: company_id } = await requireTenantContext({ requireAdmin: true })

  const supabase = await createClient()

  const name = (formData.get("name") as string)?.trim()
  if (!name || name.length > 200) throw new Error("Nome do serviço é obrigatório (máx 200 chars)")

  const description = ((formData.get("description") as string) || "").trim().slice(0, 1000) || null
  const duration = parseInt(formData.get("duration") as string, 10)
  if (isNaN(duration) || duration < 5 || duration > 480) throw new Error("Duração inválida (5–480 minutos)")
  const priceRaw = formData.get("price") ? parseFloat(formData.get("price") as string) : null
  const price = priceRaw !== null ? (isNaN(priceRaw) || priceRaw < 0 || priceRaw > 99999 ? null : priceRaw) : null

  const { error } = await supabase
    .from("services")
    .insert({
      company_id,
      name,
      description,
      duration,
      price,
    })

  if (error) throw error

  await logAuditAction({
    action: "service.create",
    companyId: company_id,
    payload: { name, duration, price }
  })

  revalidatePath("/settings")
}

export async function updateService(id: string, updates: Record<string, unknown>) {
  const { companyId } = await requireTenantContext({ requireAdmin: true })

  const supabase = await createClient()

  const { error } = await supabase
    .from("services")
    .update(updates)
    .eq("id", id)
    .eq("company_id", companyId) // Prevents IDOR: ensures ownership

  if (error) throw error

  await logAuditAction({
    action: "service.update",
    companyId,
    payload: { service_id: id, updates }
  })

  revalidatePath("/settings")
}

export async function deleteService(id: string) {
  const { companyId } = await requireTenantContext({ requireAdmin: true })

  const supabase = await createClient()

  // Soft delete with ownership guard
  const { error } = await supabase
    .from("services")
    .update({ active: false })
    .eq("id", id)
    .eq("company_id", companyId) // Prevents IDOR

  if (error) throw error

  await logAuditAction({
    action: "service.delete",
    companyId,
    payload: { service_id: id }
  })

  revalidatePath("/settings")
}

export async function toggleServiceStatus(id: string, isPaused: boolean) {
  const { companyId } = await requireTenantContext({ requireAdmin: true })

  const supabase = await createClient()

  const { error } = await supabase
    .from("services")
    .update({ is_paused: isPaused })
    .eq("id", id)
    .eq("company_id", companyId) // Prevents IDOR

  if (error) throw error

  await logAuditAction({
    action: "service.toggle",
    companyId,
    payload: { service_id: id, is_paused: isPaused }
  })

  revalidatePath("/settings")
}
