import api, { type Envelope } from './api';

export interface Schedule {
  id: number;
  org_id: number;
  name: string;
  check_in_start: string;   // "HH:MM"
  check_in_end: string;
  check_out_start: string;
  grace_period: number;
  work_days: string | null;
  is_active: boolean;
}

export interface SchedulePayload {
  name: string;
  check_in_start: string;
  check_in_end: string;
  check_out_start: string;
  grace_period: number;
  work_days: string;
}

export const WORK_DAYS_LABELS: Record<string, string> = {
  '1': 'Sen',
  '2': 'Sel',
  '3': 'Rab',
  '4': 'Kam',
  '5': 'Jum',
  '6': 'Sab',
  '7': 'Min',
};

export function formatWorkDays(work_days: string | null): string {
  if (!work_days) return '-';
  return work_days
    .split(',')
    .map((d) => WORK_DAYS_LABELS[d.trim()] ?? d)
    .join(', ');
}

export async function fetchSchedules(): Promise<Schedule[]> {
  const res = await api.get<Envelope<Schedule[]>>('/schedule/');
  return res.data.data ?? [];
}

export async function fetchActiveSchedule(): Promise<Schedule | null> {
  const res = await api.get<Envelope<Schedule | null>>('/schedule/active');
  return res.data.data ?? null;
}

export async function createSchedule(payload: SchedulePayload): Promise<Schedule> {
  const res = await api.post<Envelope<Schedule>>('/schedule/', payload);
  return res.data.data!;
}

export async function updateSchedule(id: number, payload: SchedulePayload): Promise<Schedule> {
  const res = await api.put<Envelope<Schedule>>(`/schedule/${id}`, payload);
  return res.data.data!;
}

export async function activateSchedule(id: number): Promise<Schedule> {
  const res = await api.post<Envelope<Schedule>>(`/schedule/${id}/activate`);
  return res.data.data!;
}

export async function deleteSchedule(id: number): Promise<void> {
  await api.delete(`/schedule/${id}`);
}
