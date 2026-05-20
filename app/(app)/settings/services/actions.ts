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

  const supabase = await createClient()

  const company_id = formData.get("company_id") as string
  const name = (formData.get("name") as string)?.trim()
  if (!name) throw new Error("Nome do serviço é obrigatório")

  const description = (formData.get("description") as string) || null
  const duration = parseInt(formData.get("duration") as string)
  const price = formData.get("price") ? parseFloat(formData.get("price") as string) : null

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
