// app/admin/types.ts — shared admin types

export interface Company {
  id: string;
  name: string;
  plan_type: string;
  subscription_status: string;
  onboarding_status: string;
  ai_paused: boolean;
  channel_status: string; // 'active'|'paused'|'error'|'none'
  created_at: string;
  mrr: number;
  msgs_7d: number;
  leads_active: number;
  last_activity: string | null;
  extra_leads: number;
  rag_override?: boolean;
  model_override?: string;
}

export interface User {
  id: string;
  email: string;
  full_name: string;
  created_at: string;
  company_id: string;
  company_name: string;
}

export interface UnhealthyChannel {
  id: string;
  provider: string;
  display_name: string;
  last_error: string;
  company_id: string;
  company_name: string;
}

export interface ProviderStat {
  provider: string;
  requests_24h: number;
  requests_7d: number;
  successes_7d: number;
  avg_latency_ms: number;
  p50_ms: number;
  p90_ms: number;
  p99_ms: number;
  total_cost_7d: number;
}

export interface RecentAiError {
  id: string;
  provider: string;
  error: string;
  created_at: string;
  company_name: string;
}

export interface AuditLog {
  id: string;
  actor_email: string;
  action: string;
  ip_address: string;
  user_agent: string;
  payload: Record<string, unknown>;
  created_at: string;
}

export interface StaleLead {
  id: string;
  company_id: string;
  company_name: string;
  name: string;
  phone: string;
  locked_since: string;
}

export interface StaleMessage {
  id: string;
  company_id: string;
  company_name: string;
  stuck_since: string;
  lead_id: string | null;
}

export interface TokenConsumer {
  company_id: string;
  company_name: string;
  tokens_7d: number;
}

export interface IntentItem {
  intent: string;
  count: number;
}

export interface SummaryData {
  totalCompanies: number;
  totalUsers: number;
  totalLeads: number;
  totalMessages: number;
  newCompanies7d: number;
  estimatedMRR: number;
  churnRiskCount: number;
  growthWoW: number;
  trialConversionRate: number;
}

export type Tab = "executive" | "tenants" | "system_health" | "ai_engine" | "billing" | "security_logs";
