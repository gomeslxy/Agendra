"use server"

import { createClient } from "@/lib/supabase/server"
import { getUserProfile } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"

export async function getServices(companyId: string) {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from("services")
    .select("*")
    .eq("company_id", companyId)
    .eq("active", true)
    .order("name")

  if (error) throw error
  return data
}

export async function createService(formData: FormData) {
  const profile = await getUserProfile()
  if (!profile) throw new Error("Unauthorized")

  // company_id comes from the authenticated session, never from client input
  const company_id = profile.memberships?.[0]?.company_id
  if (!company_id) throw new Error("No company")

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
  revalidatePath("/settings")
}

export async function updateService(id: string, updates: Record<string, unknown>) {
  const profile = await getUserProfile()
  if (!profile) throw new Error("Unauthorized")

  const companyId = profile.memberships?.[0]?.company_id
  if (!companyId) throw new Error("No company")

  const supabase = await createClient()

  const { error } = await supabase
    .from("services")
    .update(updates)
    .eq("id", id)
    .eq("company_id", companyId) // Prevents IDOR: ensures ownership

  if (error) throw error
  revalidatePath("/settings")
}

export async function deleteService(id: string) {
  const profile = await getUserProfile()
  if (!profile) throw new Error("Unauthorized")

  if (profile.memberships?.[0]?.role !== "admin") {
    throw new Error("Apenas administradores podem realizar esta ação")
  }

  const companyId = profile.memberships?.[0]?.company_id
  if (!companyId) throw new Error("No company")

  const supabase = await createClient()

  // Soft delete with ownership guard
  const { error } = await supabase
    .from("services")
    .update({ active: false })
    .eq("id", id)
    .eq("company_id", companyId) // Prevents IDOR

  if (error) throw error
  revalidatePath("/settings")
}

export async function toggleServiceStatus(id: string, isPaused: boolean) {
  const profile = await getUserProfile()
  if (!profile) throw new Error("Unauthorized")

  if (profile.memberships?.[0]?.role !== "admin") {
    throw new Error("Apenas administradores podem pausar/retomar serviços")
  }

  const companyId = profile.memberships?.[0]?.company_id
  if (!companyId) throw new Error("No company")

  const supabase = await createClient()

  const { error } = await supabase
    .from("services")
    .update({ is_paused: isPaused })
    .eq("id", id)
    .eq("company_id", companyId) // Prevents IDOR

  if (error) throw error
  revalidatePath("/settings")
}
