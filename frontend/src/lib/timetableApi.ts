import api, { type Envelope } from './api';

export interface TimetableSlot {
  id: number;
  school_class_id: number;
  school_class_name?: string | null;
  day_of_week: number;
  day_name: string;
  period_index: number;
  start_time: string;
  end_time: string;
  subject_id?: number | null;
  subject_code?: string | null;
  subject_name?: string | null;
  teacher_id?: number | null;
  teacher_name?: string | null;
  room?: string | null;
  notes?: string | null;
  has_conflict: boolean;
  conflict_with?: string | null;
}

export interface TimetableSlotInput {
  school_class_id: number;
  day_of_week: number;
  period_index: number;
  start_time: string;
  end_time: string;
  subject_id?: number | null;
  teacher_id?: number | null;
  room?: string | null;
  notes?: string | null;
}

export interface TimetableGrid {
  class_id: number;
  class_name: string;
  days: Array<{ index: number; name: string }>;
  max_period: number;
  grid: Record<string, Record<string, TimetableSlot>>;
}

export async function fetchSlots(params?: {
  school_class_id?: number;
  teacher_id?: number;
}) {
  const r = await api.get<Envelope<TimetableSlot[]>>('/timetable', { params });
  return r.data.data ?? [];
}

export async function fetchGrid(school_class_id: number) {
  const r = await api.get<Envelope<TimetableGrid>>('/timetable/grid', {
    params: { school_class_id },
  });
  return r.data.data!;
}

export async function createSlot(payload: TimetableSlotInput) {
  const r = await api.post<Envelope<TimetableSlot>>('/timetable/slots', payload);
  return r.data.data!;
}

export async function deleteSlot(slot_id: number) {
  await api.delete(`/timetable/slots/${slot_id}`);
}
