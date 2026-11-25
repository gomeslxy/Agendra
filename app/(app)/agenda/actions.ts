"use server";

import { revalidatePath } from "next/cache";
import { createClient, getUserProfile, resolveProfileCompanyId } from "@/lib/supabase/server";
import { isValidUuid } from "@/lib/utils";
import {
  createGoogleCalendarEvent,
  deleteGCalEvent,
  invalidateGCalFreeBusyCache,
  updateGCalEvent,
} from "@/lib/calendar/google";
import { getCompanyGCalRefreshToken } from "@/lib/calendar/gcal-token";
import { requireOnboarding } from "@/lib/onboarding/guards";
import { escapePostgrestLike } from "@/lib/security/csv";
import { logError } from "@/lib/logging";
import { computeReminderAt, hasTimeConflict } from "./booking-helpers";

async function requireAgendaCompanyId(): Promise<string> {
  const profile = await getUserProfile();
  if (!profile) throw new Error("Unauthorized");
  const companyId = await resolveProfileCompanyId(profile);
  if (!companyId || !isValidUuid(companyId)) throw new Error("No company");
  return companyId;
}

async function getCompanyAgendaSettings(
  supabase: Awaited<ReturnType<typeof createClient>>,
  companyId: string,
) {
  const { data: company } = await supabase
    .from("companies")
    .select("google_refresh_token, google_refresh_token_secret_id, google_calendar_id, persona_config")
    .eq("id", companyId)
    .single();

  const persona = (company?.persona_config as { buffer_minutes?: number; reminder_advance_hours?: number } | null) ?? {};
  const refreshToken =
    company?.google_refresh_token ??
    (company?.google_refresh_token_secret_id ? await getCompanyGCalRefreshToken(companyId) : null);

  return {
    calendarId: company?.google_calendar_id ?? "primary",
    refreshToken,
    bufferMinutes: persona.buffer_minutes ?? 0,
    reminderAdvanceHours: persona.reminder_advance_hours ?? 2,
  };
}

async function ensureNoSlotOverlap(
  supabase: Awaited<ReturnType<typeof createClient>>,
  companyId: string,
  start: Date,
  end: Date,
  bufferMinutes: number,
  excludeEventId?: string,
) {
  const windowStart = new Date(start.getTime() - (bufferMinutes + 60) * 60_000).toISOString();
  const windowEnd = new Date(end.getTime() + (bufferMinutes + 60) * 60_000).toISOString();

  const { data: candidates } = await supabase
    .from("events")
    .select("id, start_time, end_time, status")
    .eq("company_id", companyId)
    .neq("status", "cancelled")
    .lt("start_time", windowEnd)
    .gt("end_time", windowStart);

  if (hasTimeConflict(candidates ?? [], start, end, bufferMinutes, excludeEventId)) {
    throw new Error("Este horário conflita com outro agendamento existente.");
  }
}

export async function createEvent(formData: FormData) {
  const companyId = await requireAgendaCompanyId();
  await requireOnboarding(companyId);

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
  const cfg = await getCompanyAgendaSettings(supabase, companyId);

  await ensureNoSlotOverlap(supabase, companyId, start, end, cfg.bufferMinutes);

  const { data: event, error } = await supabase
    .from("events")
    .insert({
      company_id: companyId,
      lead_id: leadId,
      title,
      start_time: start.toISOString(),
      end_time: end.toISOString(),
      source: "agendra",
      status: "confirmed",
    })
    .select("id")
    .single();

  if (error || !event) throw new Error(error?.message ?? "Falha ao criar evento");

  if (leadId) {
    const remindAt = computeReminderAt(start, cfg.reminderAdvanceHours);
    if (remindAt) {
      await supabase
        .from("reminders")
        .insert({
          event_id: event.id,
          company_id: companyId,
          lead_id: leadId,
          remind_at: remindAt,
          status: "pending",
        })
        .then(() => {}, (err) => logError("[createEvent] Reminder insert failed:", err));
    }
  }

  if (cfg.refreshToken) {
    try {
      const gcalEventId = await createGoogleCalendarEvent(cfg.refreshToken, cfg.calendarId, {
        title,
        start: start.toISOString(),
        end: end.toISOString(),
        description: "Agendado via Agendra",
      });

      await supabase
        .from("events")
        .update({ gcal_event_id: gcalEventId, gcal_sync_status: "synced" })
        .eq("id", event.id);
    } catch (err) {
      logError("[createEvent] GCal push failed:", err);
      await supabase.from("events").update({ gcal_sync_status: "error" }).eq("id", event.id);
    }
  }

  await invalidateGCalFreeBusyCache(companyId);
  revalidatePath("/agenda");
}

export async function deleteEvent(eventId: string) {
  if (!isValidUuid(eventId)) throw new Error("eventId inválido");

  const companyId = await requireAgendaCompanyId();
  const supabase = await createClient();

  const { data: eventData } = await supabase
    .from("events")
    .select("gcal_event_id, source")
    .eq("id", eventId)
    .eq("company_id", companyId)
    .single();

  if (eventData?.gcal_event_id && eventData.source === "agendra") {
    const cfg = await getCompanyAgendaSettings(supabase, companyId);
    if (cfg.refreshToken) {
      try {
        await deleteGCalEvent(cfg.refreshToken, cfg.calendarId, eventData.gcal_event_id);
      } catch (err) {
        logError("[deleteEvent] GCal delete failed:", err);
      }
    }
  }

  await supabase
    .from("reminders")
    .delete()
    .eq("event_id", eventId)
    .eq("company_id", companyId)
    .eq("status", "pending");

  const { error } = await supabase.from("events").delete().eq("id", eventId).eq("company_id", companyId);
  if (error) throw new Error(error.message);

  await invalidateGCalFreeBusyCache(companyId);
  revalidatePath("/agenda");
}

export async function updateEvent(eventId: string, formData: FormData) {
  if (!isValidUuid(eventId)) throw new Error("eventId inválido");

  const companyId = await requireAgendaCompanyId();
  await requireOnboarding(companyId);

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
  const cfg = await getCompanyAgendaSettings(supabase, companyId);

  await ensureNoSlotOverlap(supabase, companyId, start, end, cfg.bufferMinutes, eventId);

  const { data: event, error } = await supabase
    .from("events")
    .update({
      lead_id: leadId,
      title,
      start_time: start.toISOString(),
      end_time: end.toISOString(),
    })
    .eq("id", eventId)
    .eq("company_id", companyId)
    .select("gcal_event_id, source")
    .single();

  if (error || !event) throw new Error(error?.message ?? "Falha ao atualizar evento");

  await supabase
    .from("reminders")
    .delete()
    .eq("event_id", eventId)
    .eq("company_id", companyId)
    .eq("status", "pending");

  if (leadId) {
    const remindAt = computeReminderAt(start, cfg.reminderAdvanceHours);
    if (remindAt) {
      await supabase
        .from("reminders")
        .insert({
          event_id: eventId,
          company_id: companyId,
          lead_id: leadId,
          remind_at: remindAt,
          status: "pending",
        })
        .then(() => {}, (err) => logError("[updateEvent] Reminder insert failed:", err));
    }
  }

  if (event.gcal_event_id && event.source === "agendra" && cfg.refreshToken) {
    try {
      await updateGCalEvent(cfg.refreshToken, cfg.calendarId, event.gcal_event_id, {
        title,
        start: start.toISOString(),
        end: end.toISOString(),
        description: "Atualizado via Agendra",
      });

      await supabase.from("events").update({ gcal_sync_status: "synced" }).eq("id", eventId);
    } catch (err) {
      logError("[updateEvent] GCal update failed:", err);
      await supabase.from("events").update({ gcal_sync_status: "error" }).eq("id", eventId);
    }
  }

  await invalidateGCalFreeBusyCache(companyId);
  revalidatePath("/agenda");
}

export async function searchLeads(query: string) {
  const companyId = await requireAgendaCompanyId();

  const supabase = await createClient();
  const safeQuery = escapePostgrestLike(query);

  let q = supabase
    .from("leads")
    .select("id, name, status, phone")
    .eq("company_id", companyId)
    .order("name", { ascending: true })
    .limit(50);

  if (safeQuery) {
    q = q.or(`name.ilike.%${safeQuery}%,phone.like.%${safeQuery}%`);
  }

  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data as Array<{
    id: string;
    name: string;
    status: "hot" | "warm" | "cold" | "success";
    phone: string;
  }>;
}
