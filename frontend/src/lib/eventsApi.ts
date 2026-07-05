import api, { type Envelope } from './api';

export interface SchoolEvent {
  id: number;
  title: string;
  description?: string | null;
  start_at: string;
  end_at?: string | null;
  location?: string | null;
  category: string;
  audience: string;
  target_class_id?: number | null;
  target_class_name?: string | null;
  requires_rsvp: boolean;
  cover_url?: string | null;
  created_by: number;
  created_by_name?: string | null;
  rsvp_yes: number;
  rsvp_no: number;
  rsvp_maybe: number;
  self_rsvp?: string | null;
  created_at: string;
}

export interface EventInput {
  title: string;
  description?: string;
  start_at: string;
  end_at?: string | null;
  location?: string;
  category: string;
  audience: string;
  target_class_id?: number | null;
  requires_rsvp?: boolean;
  cover_url?: string;
}

export async function fetchEvents(params?: {
  from_date?: string;
  to_date?: string;
  category?: string;
  upcoming_only?: boolean;
}) {
  const r = await api.get<Envelope<SchoolEvent[]>>('/events', { params });
  return r.data.data ?? [];
}

export async function createEvent(payload: EventInput) {
  const r = await api.post<Envelope<SchoolEvent>>('/events', payload);
  return r.data.data!;
}

export async function updateEvent(id: number, payload: EventInput) {
  const r = await api.put<Envelope<SchoolEvent>>(`/events/${id}`, payload);
  return r.data.data!;
}

export async function deleteEvent(id: number) {
  await api.delete(`/events/${id}`);
}

export async function rsvpEvent(
  id: number,
  payload: { response: 'yes' | 'no' | 'maybe'; note?: string }
) {
  const r = await api.post<Envelope<SchoolEvent>>(`/events/${id}/rsvp`, payload);
  return r.data.data!;
}

export async function fetchRsvps(id: number) {
  const r = await api.get<
    Envelope<
      Array<{
        user_id: number;
        name: string;
        role?: string | null;
        response: string;
        note?: string | null;
        created_at: string;
      }>
    >
  >(`/events/${id}/rsvps`);
  return r.data.data ?? [];
}

export function calendarIcsUrl() {
  const base =
    process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/v1';
  return `${base}/events/calendar.ics`;
}
