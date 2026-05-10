"use server";

import { createClient, getUserProfile } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { isValidUuid } from "@/lib/utils";
import { createGoogleCalendarEvent, deleteGCalEvent } from "@/lib/calendar/google";

export async function createEvent(formData: FormData) {
  const profile = await getUserProfile();
  if (!profile) throw new Error("Unauthorized");

  const companyId = profile.memberships?.[0]?.company_id;
  if (!companyId || !isValidUuid(companyId)) throw new Error("No company");

  const leadId = (formData.get("lead_id") as string | null)?.trim() || null;
  const title = (formData.get("title") as string | null)?.trim() ?? "";
  const startTime = (formData.get("start_time") as string | null)?.trim() ?? "";
  const endTime = (formData.get("end_time") as string | null)?.trim() ?? "";

  if (!title || title.length > 300) throw new Error("Título inválido");
  if (leadId && !isValidUuid(leadId)) throw new Error("lead_id inválido");

  const start = new Date(startTime);
  const end = new Date(endTime);

  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    throw new Error("Data/hora inválida");
  }
  if (end <= start) throw new Error("end_time deve ser posterior a start_time");

  const supabase = await createClient();

  // Insert into DB first — always succeeds regardless of GCal state
  const { data: event, error } = await supabase
    .from("events")
    .insert({
      company_id: companyId,
      lead_id: leadId,
      title,
      start_time: start.toISOString(),
      end_time: end.toISOString(),
      source: "agendra",
    })
    .select("id")
    .single();

  if (error || !event) throw new Error(error?.message ?? "Falha ao criar evento");

  // Push to Google Calendar if company has it connected
  const { data: company } = await supabase
    .from("companies")
    .select("google_refresh_token, google_calendar_id")
    .eq("id", companyId)
    .single();

  if (company?.google_refresh_token) {
    try {
      const gcalEventId = await createGoogleCalendarEvent(
        company.google_refresh_token,
        company.google_calendar_id ?? "primary",
        {
          title,
          start: start.toISOString(),
          end: end.toISOString(),
          description: "Agendado via Agendra",
        },
      );

      await supabase
        .from("events")
        .update({ gcal_event_id: gcalEventId, gcal_sync_status: "synced" })
        .eq("id", event.id);
    } catch (err) {
      console.error("[createEvent] GCal push failed:", err);
      await supabase
        .from("events")
        .update({ gcal_sync_status: "error" })
        .eq("id", event.id);
    }
  }

  revalidatePath("/agenda");
}

export async function deleteEvent(eventId: string) {
  if (!isValidUuid(eventId)) throw new Error("eventId inválido");

  const profile = await getUserProfile();
  if (!profile) throw new Error("Unauthorized");

  const companyId = profile.memberships?.[0]?.company_id;
  if (!companyId || !isValidUuid(companyId)) throw new Error("No company");

  const supabase = await createClient();

  // Fetch event before delete to get gcal_event_id and source
  const { data: eventData } = await supabase
    .from("events")
    .select("gcal_event_id, source")
    .eq("id", eventId)
    .eq("company_id", companyId)
    .single();

  // Propagate deletion to GCal only for Agendra-origin events with a gcal_event_id
  if (eventData?.gcal_event_id && eventData.source === "agendra") {
    const { data: company } = await supabase
      .from("companies")
      .select("google_refresh_token, google_calendar_id")
      .eq("id", companyId)
      .single();

    if (company?.google_refresh_token) {
      try {
        await deleteGCalEvent(
          company.google_refresh_token,
          company.google_calendar_id ?? "primary",
          eventData.gcal_event_id,
        );
      } catch (err) {
        // Silent — don't block local deletion if GCal fails
        console.error("[deleteEvent] GCal delete failed:", err);
      }
    }
  }

  const { error } = await supabase
    .from("events")
    .delete()
    .eq("id", eventId)
    .eq("company_id", companyId);

  if (error) throw new Error(error.message);

  revalidatePath("/agenda");
}
