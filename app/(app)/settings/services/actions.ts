"use server"

import { createClient } from "@/lib/supabase/server"
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
  const supabase = await createClient()
  
  const company_id = formData.get("company_id") as string
  const name = formData.get("name") as string
  const description = formData.get("description") as string
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
  revalidatePath("/settings/services")
}

export async function updateService(id: string, updates: any) {
  const supabase = await createClient()
  
  const { error } = await supabase
    .from("services")
    .update(updates)
    .eq("id", id)

  if (error) throw error
  revalidatePath("/settings/services")
}

export async function deleteService(id: string) {
  const supabase = await createClient()
  
  // We prefer soft delete/deactivate for data integrity
  const { error } = await supabase
    .from("services")
    .update({ active: false })
    .eq("id", id)

  if (error) throw error
  revalidatePath("/settings/services")
}
