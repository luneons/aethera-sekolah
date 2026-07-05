/**
 * Client API untuk modul Chat.
 * Semua endpoint di /v1/chat/*.
 */
import api, { type Envelope } from './api';

export interface ChatRoom {
  id: number;
  other_user_id: number;
  other_user_name: string;
  other_user_role: string;
  other_user_photo?: string | null;
  last_message?: string | null;
  last_message_at?: string | null;
  unread_count: number;
  is_muted: boolean;
}

export interface ChatMessage {
  id: number;
  room_id: number;
  sender_id: number;
  sender_name: string;
  sender_role: string;
  sender_photo?: string | null;
  body: string;
  is_flagged: boolean;
  is_deleted: boolean;
  created_at: string;
}

export interface ChatContact {
  id: number;
  full_name: string;
  role: string;
  role_label: string;
  photo_url?: string | null;
  email?: string | null;
}

export interface MutedUser {
  user_id: number;
  user_name: string;
  reason?: string | null;
  muted_at: string;
  expires_at?: string | null;
}

export interface MonitorRoom {
  room_id: number;
  participant_a?: { id: number; name: string; role: string } | null;
  participant_b?: { id: number; name: string; role: string } | null;
  last_message?: string | null;
  last_message_at?: string | null;
}

// ─── Endpoints ──────────────────────────────────────────────────────────────

export async function fetchChatRooms() {
  const r = await api.get<Envelope<ChatRoom[]>>('/chat/rooms');
  return r.data.data ?? [];
}

export async function fetchRoomMessages(roomId: number, page = 1) {
  const r = await api.get<Envelope<ChatMessage[]>>(`/chat/rooms/${roomId}`, {
    params: { page, per_page: 30 },
  });
  return r.data.data ?? [];
}

export async function fetchContacts() {
  const r = await api.get<Envelope<ChatContact[]>>('/chat/contacts');
  return r.data.data ?? [];
}

export async function sendMessage(recipientId: number, body: string) {
  const r = await api.post<Envelope<ChatMessage>>('/chat/send', {
    recipient_id: recipientId,
    body,
  });
  return r.data;
}

export async function flagMessage(messageId: number, reason: string) {
  const r = await api.post<Envelope<{ ok: boolean }>>(`/chat/messages/${messageId}/flag`, {
    reason,
  });
  return r.data;
}

export async function deleteMessage(messageId: number) {
  await api.delete(`/chat/messages/${messageId}`);
}

export async function fetchFlaggedMessages() {
  const r = await api.get<Envelope<ChatMessage[]>>('/chat/flagged');
  return r.data.data ?? [];
}

export async function muteUser(
  userId: number,
  reason?: string,
  durationHours?: number
) {
  const r = await api.post<Envelope<{ ok: boolean }>>('/chat/mute', {
    user_id: userId,
    reason,
    duration_hours: durationHours,
  });
  return r.data;
}

export async function unmuteUser(userId: number) {
  await api.delete(`/chat/mute/${userId}`);
}

export async function fetchMutedUsers() {
  const r = await api.get<Envelope<MutedUser[]>>('/chat/muted');
  return r.data.data ?? [];
}

export async function fetchMonitor(page = 1) {
  const r = await api.get<Envelope<MonitorRoom[]>>('/chat/monitor', {
    params: { page, per_page: 20 },
  });
  return r.data.data ?? [];
}


// ─── Archive & Purge ────────────────────────────────────────────────────────

export async function archiveRoom(roomId: number) {
  const r = await api.post<Envelope<{ ok: boolean }>>(`/chat/rooms/${roomId}/archive`);
  return r.data;
}

export async function unarchiveRoom(roomId: number) {
  await api.delete(`/chat/rooms/${roomId}/archive`);
}

export async function fetchArchivedRooms() {
  const r = await api.get<Envelope<ChatRoom[]>>('/chat/archived');
  return r.data.data ?? [];
}

export interface PurgeResult {
  messages_to_delete: number;
  rooms_to_cleanup: number;
  oldest_message_date?: string | null;
  newest_message_date?: string | null;
  executed: boolean;
  message: string;
}

export async function purgeChatMessages(
  olderThanDays: number,
  confirmPassword: string,
  dryRun: boolean
) {
  const r = await api.post<Envelope<PurgeResult>>('/chat/purge', {
    older_than_days: olderThanDays,
    confirm_password: confirmPassword,
    dry_run: dryRun,
  });
  return r.data;
}


/**
 * Hapus permanen 1 room beserta semua pesan dan metadata-nya.
 * Hanya kepala sekolah yang boleh.
 */
export async function deleteRoom(roomId: number) {
  const r = await api.delete<Envelope<{ ok: boolean; messages_deleted: number }>>(
    `/chat/rooms/${roomId}`
  );
  return r.data.data;
}
