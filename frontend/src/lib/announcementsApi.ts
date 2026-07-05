import api, { type Envelope } from './api';

export interface Announcement {
  id: number;
  title: string;
  body: string;
  audience: string;
  target_class_id?: number | null;
  target_class_name?: string | null;
  pinned: boolean;
  cover_url?: string | null;
  publish_at?: string | null;
  expire_at?: string | null;
  created_by: number;
  created_by_name?: string | null;
  is_read: boolean;
  created_at: string;
  updated_at?: string | null;
}

export interface AnnouncementInput {
  title: string;
  body: string;
  audience: string;
  target_class_id?: number | null;
  pinned?: boolean;
  cover_url?: string;
  publish_at?: string | null;
  expire_at?: string | null;
}

export async function fetchAnnouncements(params?: {
  only_unread?: boolean;
  pinned_first?: boolean;
  limit?: number;
}) {
  const r = await api.get<Envelope<Announcement[]>>('/announcements', { params });
  return r.data.data ?? [];
}

export async function fetchUnreadCount() {
  const r = await api.get<Envelope<{ count: number }>>('/announcements/unread-count');
  return r.data.data?.count ?? 0;
}

export async function markAnnouncementRead(id: number) {
  await api.post(`/announcements/${id}/read`, {});
}

export async function createAnnouncement(payload: AnnouncementInput) {
  const r = await api.post<Envelope<Announcement>>('/announcements', payload);
  return r.data.data!;
}

export async function updateAnnouncement(id: number, payload: AnnouncementInput) {
  const r = await api.put<Envelope<Announcement>>(`/announcements/${id}`, payload);
  return r.data.data!;
}

export async function deleteAnnouncement(id: number) {
  await api.delete(`/announcements/${id}`);
}
