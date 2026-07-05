/**
 * Client API untuk Pengajuan Izin / Sakit.
 */
import api, { type Envelope } from './api';

export type LeaveKind = 'sakit' | 'izin' | 'lainnya';
export type LeaveStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

export interface LeaveRequest {
  id: number;
  student_id: number;
  student_name: string;
  student_nis: string;
  student_class?: string | null;
  kind: LeaveKind;
  start_date: string;
  end_date: string;
  days_count: number;
  reason: string;
  proof_file_url?: string | null;
  proof_file_name?: string | null;
  status: LeaveStatus;
  decided_by_name?: string | null;
  decided_at?: string | null;
  decision_note?: string | null;
  created_at: string;
}

interface MetaInfo {
  page?: number;
  per_page?: number;
  total?: number;
}

export async function fetchLeaveRequests(opts?: {
  status?: LeaveStatus;
  page?: number;
  per_page?: number;
}) {
  const r = await api.get<Envelope<LeaveRequest[]> & { meta?: MetaInfo }>(
    '/leave',
    { params: opts }
  );
  return { items: r.data.data ?? [], meta: r.data.meta };
}

export async function fetchPendingLeaveCount() {
  const r = await api.get<Envelope<{ count: number }>>('/leave/pending-count');
  return r.data.data?.count ?? 0;
}

export async function submitLeaveRequest(payload: {
  kind: LeaveKind;
  start_date: string; // YYYY-MM-DD
  end_date: string;
  reason: string;
  proof?: File | null;
}) {
  const fd = new FormData();
  fd.append('kind', payload.kind);
  fd.append('start_date', payload.start_date);
  fd.append('end_date', payload.end_date);
  fd.append('reason', payload.reason);
  if (payload.proof) fd.append('proof', payload.proof);
  const r = await api.post<Envelope<LeaveRequest>>('/leave', fd, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return r.data;
}

export async function decideLeave(
  id: number,
  decision: 'approve' | 'reject',
  note?: string
) {
  const r = await api.post<Envelope<LeaveRequest>>(`/leave/${id}/decide`, {
    decision,
    note,
  });
  return r.data;
}

export async function cancelLeave(id: number) {
  const r = await api.post<Envelope<LeaveRequest>>(`/leave/${id}/cancel`, {});
  return r.data;
}
