import api, { type Envelope } from './api';

export interface CounselingSlot {
  id: number;
  counselor_id: number;
  counselor_name?: string | null;
  slot_date: string;
  start_time: string;
  end_time: string;
  is_blocked: boolean;
  is_booked: boolean;
  note?: string | null;
}

export interface CounselingSlotInput {
  slot_date: string;
  start_time: string;
  end_time: string;
  is_blocked?: boolean;
  note?: string;
}

export interface BulkSlotInput {
  days?: number;
  start_hour?: number;
  end_hour?: number;
  duration_minutes?: number;
  skip_weekends?: boolean;
}

export interface CounselingBooking {
  id: number;
  student_id: number;
  student_name: string;
  student_class?: string | null;
  counselor_id: number;
  counselor_name?: string | null;
  slot_id?: number | null;
  booking_date: string;
  start_time: string;
  end_time: string;
  topic: string;
  is_anonymous: boolean;
  status: string;
  student_note?: string | null;
  counselor_note?: string | null;
  created_at: string;
}

export interface BookingInput {
  counselor_id?: number | null;
  slot_id?: number | null;
  booking_date: string;
  start_time: string;
  end_time: string;
  topic: string;
  is_anonymous?: boolean;
  student_note?: string;
}

export async function fetchSlots(params?: {
  counselor_id?: number;
  from_date?: string;
  to_date?: string;
  available_only?: boolean;
}) {
  const r = await api.get<Envelope<CounselingSlot[]>>('/counseling/slots', { params });
  return r.data.data ?? [];
}

export async function createSlot(payload: CounselingSlotInput) {
  const r = await api.post<Envelope<CounselingSlot>>('/counseling/slots', payload);
  return r.data.data!;
}

export async function bulkGenerateSlots(payload: BulkSlotInput) {
  const r = await api.post<Envelope<{ created: number; skipped: number }>>(
    '/counseling/slots/bulk',
    payload
  );
  return r.data.data!;
}

export async function deleteSlot(id: number) {
  await api.delete(`/counseling/slots/${id}`);
}

export async function createBooking(payload: BookingInput) {
  const r = await api.post<Envelope<CounselingBooking>>('/counseling/bookings', payload);
  return r.data.data!;
}

export async function fetchBookings(params?: {
  status?: string;
  upcoming_only?: boolean;
}) {
  const r = await api.get<Envelope<CounselingBooking[]>>('/counseling/bookings', { params });
  return r.data.data ?? [];
}

export async function decideBooking(
  id: number,
  payload: { status: string; counselor_note?: string }
) {
  const r = await api.patch<Envelope<CounselingBooking>>(
    `/counseling/bookings/${id}`,
    payload
  );
  return r.data.data!;
}

export async function fetchCounselingStats() {
  const r = await api.get<
    Envelope<{ pending: number; today: number; this_week: number; completed_total: number }>
  >('/counseling/stats');
  return r.data.data!;
}
