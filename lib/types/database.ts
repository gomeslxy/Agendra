export type LeadStatus = 'cold' | 'warm' | 'hot' | 'success';
export type LeadChannel = 'whatsapp' | 'instagram' | 'form';
export type MessageRole = 'user' | 'assistant' | 'note' | 'agent';
export type CompanyPlan = 'trial' | 'starter' | 'pro' | 'enterprise';
export type ChannelProvider = 'whatsapp' | 'instagram';
export type ChannelStatus = 'active' | 'error' | 'paused';

export interface Lead {
  id: string;
  company_id: string;
  name: string;
  phone: string;
  channel: LeadChannel;
  source: string | null;
  status: LeadStatus;
  summary: string | null;
  heat_score: number;
  conversation_tone: "cold" | "warm" | "hot";
  auto_respond: boolean;
  city: string | null;
  email: string | null;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  lead_id: string;
  company_id: string;
  role: MessageRole;
  content: string;
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
  created_at: string;
  updated_at: string;
}
