/**
 * Client API untuk Surat Otomatis.
 */
import api, { type Envelope } from './api';

export type LetterType =
  | 'keterangan_aktif'
  | 'kelakuan_baik'
  | 'panggilan_ortu'
  | 'sehat_jasmani'
  | 'rekomendasi';

export interface LetterTypeInfo {
  value: LetterType;
  label: string;
  for: string;
}

export interface LetterIssue {
  id: number;
  letter_type: LetterType;
  student_id: number;
  student_name: string;
  serial_number: string;
  purpose?: string | null;
  file_url?: string | null;
  issued_by_name?: string | null;
  issued_at: string;
}

export async function fetchLetterTypes() {
  const r = await api.get<Envelope<LetterTypeInfo[]>>('/letters/types');
  return r.data.data ?? [];
}

export async function fetchLetters(opts?: {
  student_id?: number;
  letter_type?: LetterType;
}) {
  const r = await api.get<Envelope<LetterIssue[]>>('/letters', { params: opts });
  return r.data.data ?? [];
}

export async function issueLetter(payload: {
  letter_type: LetterType;
  student_id: number;
  purpose?: string;
  school_year?: string;
  meeting_date?: string;
}) {
  const r = await api.post<Envelope<LetterIssue>>('/letters/issue', payload);
  return r.data.data!;
}
