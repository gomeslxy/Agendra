export type LeadStatus = 'cold' | 'warm' | 'hot' | 'success';
export type LeadChannel = 'whatsapp' | 'instagram' | 'form';
export type MessageRole = 'user' | 'assistant' | 'note';
export type CompanyPlan = 'trial' | 'starter' | 'pro' | 'enterprise';

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

export interface Event {
  id: string;
  lead_id: string;
  company_id: string;
  title: string;
  start_time: string;
  end_time: string;
  gcal_event_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface LeadWithLastMessage extends Lead {
  last_message?: Pick<Message, 'content' | 'created_at' | 'role'>;
}
