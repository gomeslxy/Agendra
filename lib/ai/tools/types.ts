export interface ToolContext {
  companyId: string;
  leadId: string;
  traceId?: string;
  defaultTimezone?: string;
}

export interface BookingResult {
  event_id: string;
  gcal_event_id: string | null;
  start_time: string;
  end_time: string;
  title: string;
}
