import api, { type Envelope } from './api';

export type AttendanceMode = 'face' | 'qr' | 'mixed' | 'manual';

export interface AttendanceModeSetting {
  mode: AttendanceMode;
  qr_default_enabled: boolean;
  qr_rotation_days: number;
}

export interface StudentQrItem {
  user_id: number;
  full_name: string;
  employee_id: string;
  school_class_id: number | null;
  school_class_name: string | null;
  qr_enabled: boolean;
  has_qr_token: boolean;
}

export const MODE_LABELS: Record<AttendanceMode, { title: string; desc: string }> = {
  face: {
    title: 'Pengenalan Wajah',
    desc: 'Hanya scan wajah (ArcFace AI). Paling aman, butuh kamera.',
  },
  qr: {
    title: 'QR Code',
    desc: 'Scan kartu QR siswa. Tidak butuh AI, cepat, bisa banyak orang antri.',
  },
  mixed: {
    title: 'Wajah + QR',
    desc: 'Siswa boleh pilih scan wajah atau QR. Fleksibel.',
  },
  manual: {
    title: 'Manual / CSV',
    desc: 'Hanya admin yang input absensi (form atau upload CSV). Tidak ada self-scan.',
  },
};

export async function fetchMode(): Promise<AttendanceModeSetting> {
  const r = await api.get<Envelope<AttendanceModeSetting>>('/attendance-mode/');
  return r.data.data!;
}

export async function updateMode(payload: AttendanceModeSetting): Promise<AttendanceModeSetting> {
  const r = await api.put<Envelope<AttendanceModeSetting>>('/attendance-mode/', payload);
  return r.data.data!;
}

export async function fetchStudentsQr(params: {
  class_id?: number;
  search?: string;
  role?: 'employee' | 'admin' | 'hr' | 'super_admin';
} = {}): Promise<StudentQrItem[]> {
  const r = await api.get<Envelope<StudentQrItem[]>>('/attendance-mode/students', { params });
  return r.data.data ?? [];
}

export async function bulkToggleQr(user_ids: number[], enabled: boolean): Promise<number> {
  const r = await api.post<Envelope<{ updated: number }>>('/attendance-mode/qr/bulk', {
    user_ids,
    enabled,
  });
  return r.data.data?.updated ?? 0;
}

export async function regenerateQr(user_id: number): Promise<string> {
  const r = await api.post<Envelope<{ qr_token: string }>>(
    `/attendance-mode/qr/regenerate/${user_id}`
  );
  return r.data.data?.qr_token ?? '';
}

export async function regenerateAllQr(class_id?: number, role?: string): Promise<number> {
  const params: Record<string, unknown> = {};
  if (class_id) params.class_id = class_id;
  if (role) params.role = role;
  const r = await api.post<Envelope<{ regenerated: number }>>(
    '/attendance-mode/qr/regenerate-all',
    null,
    { params }
  );
  return r.data.data?.regenerated ?? 0;
}

export function qrPngUrl(user_id: number, accessToken: string): string {
  // Pakai axios baseURL via api.defaults
  const base = api.defaults.baseURL ?? '';
  return `${base}/attendance-mode/qr/${user_id}/png`;
}

export function qrPrintClassUrl(class_id: number): string {
  const base = api.defaults.baseURL ?? '';
  return `${base}/attendance-mode/qr/print/class/${class_id}`;
}

// QR check-in/out
export async function checkinQr(qr_token: string) {
  const r = await api.post<Envelope<any>>('/attendance/checkin-qr', { qr_token });
  return r.data;
}

export async function checkoutQr(qr_token: string) {
  const r = await api.post<Envelope<any>>('/attendance/checkout-qr', { qr_token });
  return r.data;
}

// CSV import
export interface CsvPreviewRow {
  row_num: number;
  nis: string | null;
  tanggal: string | null;
  status: string | null;
  jam_masuk: string | null;
  jam_pulang: string | null;
  catatan: string | null;
  matched_name: string | null;
  valid: boolean;
  error: string | null;
  will_overwrite: boolean;
}

export interface CsvPreviewOut {
  total_rows: number;
  valid_rows: number;
  invalid_rows: number;
  will_create: number;
  will_overwrite: number;
  rows: CsvPreviewRow[];
}

export async function csvPreview(file: File): Promise<CsvPreviewOut> {
  const fd = new FormData();
  fd.append('file', file);
  const r = await api.post<Envelope<CsvPreviewOut>>('/attendance/import-csv/preview', fd, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return r.data.data!;
}

export async function csvCommit(
  file: File,
  overwrite = true
): Promise<{ created: number; updated: number; skipped: number; errors: string[] }> {
  const fd = new FormData();
  fd.append('file', file);
  const r = await api.post<
    Envelope<{ created: number; updated: number; skipped: number; errors: string[] }>
  >('/attendance/import-csv/commit', fd, {
    params: { overwrite },
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return r.data.data!;
}

export function csvTemplateUrl(): string {
  const base = api.defaults.baseURL ?? '';
  return `${base}/attendance/import-csv/template`;
}
