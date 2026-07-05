import api, { type Envelope } from './api';

export interface RaporPreview {
  student: {
    id: number;
    name: string;
    employee_id: string;
    class_name?: string | null;
  };
  semester: string;
  grades: Array<{
    code: string;
    subject: string;
    average: number;
    kkm: number;
    n: number;
  }>;
  attendance: {
    hadir: number;
    izin: number;
    sakit: number;
    alpa: number;
    total_hari: number;
  };
  discipline: {
    attitude_points: number;
    appreciation_points: number;
    kts_count: number;
  };
}

export async function fetchRaporPreview(
  studentId: number,
  semester = 'Ganjil',
  schoolYear = '2025/2026'
) {
  const r = await api.get<Envelope<RaporPreview>>(`/rapor/preview/${studentId}`, {
    params: { semester, school_year: schoolYear },
  });
  return r.data.data!;
}

export function raporDownloadUrl(
  studentId: number,
  semester = 'Ganjil',
  schoolYear = '2025/2026',
  catatan?: string
) {
  const base = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/v1';
  const params = new URLSearchParams({
    semester,
    school_year: schoolYear,
  });
  if (catatan) params.set('catatan', catatan);
  return `${base}/rapor/student/${studentId}?${params.toString()}`;
}

export async function downloadRapor(
  studentId: number,
  semester: string,
  schoolYear: string,
  catatan?: string
): Promise<Blob> {
  const r = await api.get(`/rapor/student/${studentId}`, {
    params: { semester, school_year: schoolYear, catatan },
    responseType: 'blob',
  });
  return r.data as Blob;
}
