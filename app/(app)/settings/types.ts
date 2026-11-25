import type { PlanType } from "@/lib/billing/plans";

export type SettingsTabId =
  | "account"
  | "rules"
  | "services"
  | "brain"
  | "channels"
  | "automation"
  | "logs"
  | "billing";

export const SETTINGS_TAB_IDS: SettingsTabId[] = [
  "account",
  "rules",
  "services",
  "brain",
  "channels",
  "automation",
  "logs",
  "billing",
];

export interface MemberUser {
  id: string;
  full_name?: string | null;
  email?: string | null;
}

export interface Member {
  id: string;
  role: string;
  company_id: string;
  users?: MemberUser | MemberUser[] | null;
}

export interface PersonaConfig {
  business_type?: string;
  services?: string[];
  escalation_threshold?: number;
  auto_escalate?: boolean;
  slot_duration_minutes?: number;
  timezone?: string;
  working_hours?: Record<string, [string, string]>;
  extra_instructions?: string;
  name?: string;
  greeting?: string;
  tts_enabled?: boolean;
  reminder_advance_hours?: number;
  followup_delay_hours?: number;
  followup_max_retries?: number;
  reactivation_days?: number;
  reactivation_hook?: string;
}

export interface SettingsCompany {
  id: string;
  name: string;
  ai_name?: string | null;
  ai_tone?: string | null;
  ai_greeting?: string | null;
  ai_forbidden?: string | null;
  persona_config?: PersonaConfig | null;
  plan_type?: PlanType | null;
  subscription_status?: string | null;
  stripe_customer_id?: string | null;
  cancel_at_period_end?: boolean | null;
  current_period_end?: string | null;
  google_calendar_email?: string | null;
  google_calendar_id?: string | null;
}

export interface ChannelRow {
  id: string;
  provider: string;
  provider_id: string;
  status: string;
  last_error?: string | null;
}

export interface SettingsService {
  id: string;
  name: string;
  description?: string | null;
  duration: number;
  price?: number | null;
  active: boolean;
  is_paused?: boolean | null;
}

export interface AiDecisionLog {
  id: string;
  lead_id: string;
  intent_detected: string | null;
  sentiment_score: number | null;
  urgency_detected: boolean | null;
  objection_handled: string | null;
  rationale: string | null;
  created_at: string;
  leads: { name: string }[] | null;
}

export interface AutomationEvent {
  id: string;
  type: string;
  detail: string | null;
  lead_id: string | null;
  created_at: string;
}

export interface WebhookSubscription {
  id: string;
  url: string;
  event_types: string[];
  secret?: string;
  label?: string | null;
  is_active: boolean;
  created_at: string;
  last_fired_at?: string | null;
  last_error?: string | null;
}

export interface AutomationStats {
  remindersToday: number;
  followupsWeek: number;
}

export interface PendingInvitation {
  id: string;
  invited_email: string;
  role: string;
  status: string;
  expires_at: string;
  created_at: string;
  invited_by: string;
}

export interface PromptVersion {
  id: string;
  version: number;
  ai_name: string;
  ai_tone: string;
  system_instructions: string;
  ai_forbidden: string | null;
  created_at: string;
  created_by?: string | null;
}

export interface AuditLogRow {
  id: string;
  actor_email: string | null;
  action: string;
  ip_address: string | null;
  user_agent: string | null;
  payload: unknown;
  created_at: string;
}
