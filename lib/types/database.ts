export type LeadStatus = 'cold' | 'warm' | 'hot' | 'success';
export type LeadChannel = 'whatsapp' | 'instagram' | 'telegram' | 'messenger' | 'webchat' | 'email' | 'discord' | 'form';
export type MessageRole = 'user' | 'assistant' | 'note' | 'agent';
export type CompanyPlan = 'trial' | 'starter' | 'pro' | 'business' | 'enterprise';
export type ChannelProvider = 'whatsapp' | 'instagram' | 'telegram' | 'messenger' | 'webchat' | 'email' | 'discord';
export type ChannelStatus = 'active' | 'error' | 'paused';

export interface Lead {
  id: string;
  company_id: string;
  name: string;
  phone: string;
  channel: LeadChannel;
  channel_id?: string | null; // Novo campo de vínculo
  source: string | null;
  status: LeadStatus;
  summary: string | null;
  heat_score: number;
  conversation_tone: "cold" | "warm" | "hot";

  city: string | null;
  email: string | null;
  is_paused: boolean;
  is_processing: boolean;
  processing_started_at?: string | null;
  last_message_id: string | null;
  control_mode?: 'autonomous' | 'shadow' | 'manual';
  last_sentiment?: number | null;
  last_sentiment_at?: string | null;
  human_takeover_at?: string | null;
  human_takeover_until?: string | null;
  human_takeover_by?: string | null;
  followup_count: number;
  last_message_at?: string | null;
  followup_in_progress?: boolean;
  last_followup_at?: string | null;
  created_at: string;
  updated_at: string;
  lead_memory?: LeadMemory | null; // optional: added in schema_v6
}

export interface Message {
  id: string;
  lead_id: string;
  company_id: string;
  role: MessageRole;
  content: string;
  metadata?: any;
  channel_id?: string | null; // Novo campo de vínculo
  created_at: string;
}

export type EventSource = 'agendra' | 'gcal';
export type GCalSyncStatus = 'synced' | 'pending' | 'error';

export interface Event {
  id: string;
  lead_id: string | null;
  company_id: string;
  title: string;
  start_time: string;
  end_time: string;
  duration_minutes?: number;
  gcal_event_id: string | null;
  source: EventSource;
  gcal_sync_status: GCalSyncStatus | null;
  created_at: string;
  updated_at: string;
}

export interface LeadWithLastMessage extends Lead {
  last_message?: Pick<Message, 'content' | 'created_at' | 'role'>;
}

export interface Channel {
  id: string;
  company_id: string;
  provider: ChannelProvider;
  /** Meta phone_number_id (WhatsApp) ou account_id (Instagram) */
  provider_id: string;
  /** Access token for this channel (store encrypted in production) */
  access_token: string | null;
  status: ChannelStatus;
  meta: Record<string, unknown>;
  display_name: string | null;
  last_seen_at: string | null;
  last_error: string | null;
  token_expires_at: string | null;
  token_refreshed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PlanChannelConfig {
  id: string;
  company_id: string;
  channel_provider: ChannelProvider;
  enabled: boolean;
  config: Record<string, any>;
  created_at: string;
  updated_at: string;
}


// ── AI Engine v3 Types ──────────────────────────────────────────────────────

export type LeadMemoryEventType =
  | 'first_contact'
  | 'showed_interest'
  | 'objection_raised'
  | 'slot_shown'
  | 'slot_declined'
  | 'booked'
  | 'no_show'
  | 'reactivated'
  | 'disqualified';

export interface LeadMemoryEvent {
  date: string; // ISO 8601
  event: LeadMemoryEventType;
  note?: string;
}

export interface ScoreHistoryEntry {
  date: string;
  score: number;
  reason: string;
}

export interface LeadMemory {
  timeline: LeadMemoryEvent[];
  objections_raised: string[];
  services_mentioned: string[];
  score_history: ScoreHistoryEntry[];
  last_intent_signal: string;
  qualification_answers: Record<string, string>;
}

export interface ServiceEntry {
  name: string;
  description: string;
  price_range?: string;
  duration_minutes?: number;
  ideal_profile?: string;
  common_objections?: string[];
  call_to_action: string;
}

export interface GuidedConfig {
  never_do: string[];
  main_trigger: string;
  top_objection: string;
}

export interface BusinessKnowledge {
  services: ServiceEntry[];
  qualification_questions: string[];
  key_differentials: string[];
  out_of_scope: string[];
  persona_mode: 'guided' | 'advanced';
  guided_config?: GuidedConfig;
}

export type FlowJobType = 'followup' | 'confirmation' | 'reactivation';
export type FlowJobStatus = 'pending' | 'running' | 'done' | 'failed' | 'skipped';

export interface FlowJob {
  id: string;
  company_id: string;
  lead_id: string;
  flow_type: FlowJobType;
  status: FlowJobStatus;
  scheduled_at: string;
  executed_at: string | null;
  result: { sent: boolean; message: string; error?: string } | null;
  created_at: string;
}

export interface AILog {
  id: string;
  company_id: string;
  lead_id: string;
  message_id: string | null;
  flow_type: FlowJobType | null;
  tools_called: Array<{ name: string; args_summary: string; result_summary: string }>;
  heat_score_before: number;
  heat_score_after: number;
  score_validated_to: number;
  score_delta: number;
  latency_ms: number;
  model: string;
  tokens_input: number | null;
  tokens_output: number | null;
  cost: number | null;
  retries: number;
  error: string | null;
  created_at: string;
  trace_id?: string | null;
  rag_status?: 'ok' | 'empty' | 'failed' | 'timeout' | null;
  provider?: 'cerebras' | 'groq' | 'sambanova' | 'gemini' | null;
  provider_chain_used?: string[] | null;
  chain_kind?: 'conv' | 'tools' | 'bg' | null;
  metadata?: {
    t_debounce?: number | null;
    t_rag?: number | null;
    t_ai?: number | null;
    t_send?: number | null;
    debounce_batch_size?: number | null;
    via_sql_fallback?: boolean;
    [key: string]: any;
  } | null;
}

export interface AITrace {
  id: string;
  company_id: string;
  lead_id: string | null;
  trace_type: 'tool_call' | 'completion' | 'error' | 'system';
  request_data: any;
  response_data: any;
  duration_ms: number | null;
  tokens_used: number | null;
  created_at: string;
}

// Extend Lead with optional new fields (added via migrations)
export interface LeadWithMemory extends Lead {
  lead_memory?: LeadMemory | null;
}

// ── Notifications ─────────────────────────────────────────────────────────────

export type NotificationType =
  | 'invite'
  | 'member_joined'
  | 'member_left'
  | 'channel_error'
  | 'payment_failed'
  | 'lead_hot'
  | 'system';

export type NotificationPriority = 'low' | 'medium' | 'high' | 'critical';

export interface Notification {
  id: string;
  company_id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  body: string;
  action_url: string | null;
  metadata: Record<string, unknown>;
  priority: NotificationPriority;
  read: boolean;
  delivery_status: 'pending' | 'sending' | 'delivered' | 'failed';
  delivered_at: string | null;
  read_at: string | null;
  click_at: string | null;
  error_log: string | null;
  idempotency_key: string | null;
  created_at: string;
}

// ── Invitations ───────────────────────────────────────────────────────────────

export type InvitationStatus = 'pending' | 'accepted' | 'declined' | 'expired' | 'cancelled';
export type InvitationRole = 'admin' | 'member';

export interface Invitation {
  id: string;
  company_id: string;
  invited_email: string;
  invited_by: string;
  role: InvitationRole;
  status: InvitationStatus;
  expires_at: string;
  notification_id: string | null;
  accepted_at: string | null;
  created_at: string;
}
