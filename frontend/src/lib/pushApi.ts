/**
 * Client API untuk modul Notifikasi Push.
 * Semua endpoint di /v1/notifications/*.
 */
import api, { type Envelope } from './api';

interface MetaInfo {
  page?: number;
  per_page?: number;
  total?: number;
}

export interface AppNotification {
  id: number;
  category: string;
  title: string;
  body?: string | null;
  url?: string | null;
  icon?: string | null;
  is_read: boolean;
  delivered_push: boolean;
  created_at: string;
  read_at?: string | null;
}

export interface SubscribePayload {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  user_agent?: string;
}

export interface BroadcastPayload {
  title: string;
  body: string;
  target: 'all' | 'role' | 'class';
  target_role?: 'super_admin' | 'admin' | 'hr' | 'employee' | null;
  target_class_id?: number | null;
  url?: string | null;
}

// ─── Setup ──────────────────────────────────────────────────────────────────

export async function fetchVapidPublicKey() {
  const r = await api.get<Envelope<{ key: string }>>('/notifications/vapid-public-key');
  return r.data.data?.key ?? '';
}

export async function subscribePush(payload: SubscribePayload) {
  const r = await api.post<Envelope<{ ok: boolean }>>('/notifications/subscribe', payload);
  return r.data;
}

export async function unsubscribePush(endpoint: string) {
  await api.delete('/notifications/subscribe', { data: { endpoint } });
}

// ─── History ────────────────────────────────────────────────────────────────

export async function fetchNotifications(opts?: {
  page?: number;
  per_page?: number;
  category?: string;
  only_unread?: boolean;
}) {
  const r = await api.get<Envelope<AppNotification[]> & { meta?: MetaInfo }>('/notifications', {
    params: opts,
  });
  return { items: r.data.data ?? [], meta: r.data.meta };
}

export async function fetchUnreadCount() {
  const r = await api.get<Envelope<{ unread: number }>>('/notifications/unread-count');
  return r.data.data?.unread ?? 0;
}

export async function markNotifRead(id: number) {
  await api.post(`/notifications/${id}/read`);
}

export async function markAllRead() {
  await api.post('/notifications/read-all');
}

export async function deleteNotif(id: number) {
  await api.delete(`/notifications/${id}`);
}

// ─── Broadcast (kepsek only) ────────────────────────────────────────────────

export async function broadcastNotif(payload: BroadcastPayload) {
  const r = await api.post<Envelope<{ recipients: number }>>(
    '/notifications/broadcast',
    payload
  );
  return r.data.data?.recipients ?? 0;
}

export async function sendTestNotif() {
  await api.post('/notifications/test');
}
