import api, { type Envelope } from './api';

export interface UksVisit {
  id: number;
  student_id: number;
  student_name: string;
  student_class?: string | null;
  visit_date: string;
  arrival_time: string;
  departure_time?: string | null;
  complaint: string;
  diagnosis?: string | null;
  treatment?: string | null;
  medicines_json?: any[] | null;
  body_temp?: number | null;
  blood_pressure?: string | null;
  outcome: string;
  notify_parent: boolean;
  handled_by: number;
  handled_by_name?: string | null;
  notes?: string | null;
  created_at: string;
}

export interface VisitInput {
  student_id: number;
  visit_date: string;
  arrival_time: string;
  departure_time?: string | null;
  complaint: string;
  diagnosis?: string;
  treatment?: string;
  medicines_json?: Array<{ code?: string; name: string; qty: number }>;
  body_temp?: number;
  blood_pressure?: string;
  outcome?: string;
  notify_parent?: boolean;
  notes?: string;
}

export interface Medicine {
  id: number;
  code: string;
  name: string;
  category?: string | null;
  unit: string;
  stock: number;
  low_stock_threshold: number;
  expire_date?: string | null;
  is_low_stock: boolean;
  is_expiring_soon: boolean;
  notes?: string | null;
}

export interface MedicineInput {
  code: string;
  name: string;
  category?: string;
  unit: string;
  stock: number;
  low_stock_threshold: number;
  expire_date?: string;
  notes?: string;
}

export interface UksStats {
  visits_today: number;
  visits_this_week: number;
  visits_this_month: number;
  low_stock_count: number;
  expiring_soon_count: number;
  top_complaints: Array<{ complaint: string; count: number }>;
}

export async function fetchUksStats() {
  const r = await api.get<Envelope<UksStats>>('/uks/stats');
  return r.data.data!;
}

export async function fetchVisits(params?: {
  student_id?: number;
  from_date?: string;
  to_date?: string;
  limit?: number;
}) {
  const r = await api.get<Envelope<UksVisit[]>>('/uks/visits', { params });
  return r.data.data ?? [];
}

export async function createVisit(payload: VisitInput) {
  const r = await api.post<Envelope<UksVisit>>('/uks/visits', payload);
  return r.data.data!;
}

export async function deleteVisit(id: number) {
  await api.delete(`/uks/visits/${id}`);
}

export async function fetchMedicines(params?: { q?: string; low_stock_only?: boolean }) {
  const r = await api.get<Envelope<Medicine[]>>('/uks/medicines', { params });
  return r.data.data ?? [];
}

export async function createMedicine(payload: MedicineInput) {
  const r = await api.post<Envelope<Medicine>>('/uks/medicines', payload);
  return r.data.data!;
}

export async function updateMedicine(id: number, payload: MedicineInput) {
  const r = await api.put<Envelope<Medicine>>(`/uks/medicines/${id}`, payload);
  return r.data.data!;
}

export async function adjustMedicineStock(id: number, delta: number, reason?: string) {
  const r = await api.post<Envelope<Medicine>>(`/uks/medicines/${id}/adjust-stock`, {
    delta,
    reason,
  });
  return r.data.data!;
}

export async function deleteMedicine(id: number) {
  await api.delete(`/uks/medicines/${id}`);
}
