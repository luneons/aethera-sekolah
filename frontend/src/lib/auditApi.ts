import api, { type Envelope } from './api';

export interface AuditEntry {
  id: number;
  user_id?: number | null;
  user_name?: string | null;
  action: string;
  target_type?: string | null;
  target_id?: number | null;
  ip_address?: string | null;
  user_agent?: string | null;
  created_at: string;
}

export interface AuditStats {
  total_events_30d: number;
  by_action: Array<{ action: string; count: number }>;
  failed_logins_24h: number;
  suspicious_users: Array<{
    user_id: number;
    user_name: string;
    failed_count: number;
  }>;
}

export async function fetchAuditLogs(params?: {
  user_id?: number;
  action?: string;
  from_date?: string;
  to_date?: string;
  limit?: number;
}) {
  const r = await api.get<Envelope<AuditEntry[]>>('/audit-log', { params });
  return r.data.data ?? [];
}

export async function fetchAuditStats() {
  const r = await api.get<Envelope<AuditStats>>('/audit-log/stats');
  return r.data.data!;
}
