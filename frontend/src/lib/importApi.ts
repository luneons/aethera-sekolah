/**
 * Client API untuk Bulk Import siswa.
 */
import api, { type Envelope } from './api';

export interface PreviewRow {
  row_num: number;
  full_name?: string | null;
  employee_id?: string | null;
  email?: string | null;
  phone?: string | null;
  parent_phone?: string | null;
  parent_name?: string | null;
  school_class_name?: string | null;
  password?: string | null;
  valid: boolean;
  error?: string | null;
  will_create_class: boolean;
  is_update: boolean;
}

export interface PreviewOut {
  detected_columns: Record<string, number>;
  total_rows: number;
  valid_rows: number;
  invalid_rows: number;
  new_classes: string[];
  will_create: number;
  will_update: number;
  rows: PreviewRow[];
}

export interface CommitOut {
  created: number;
  updated: number;
  classes_created: number;
  skipped: number;
  errors: string[];
}

export async function previewImportStudents(file: File) {
  const fd = new FormData();
  fd.append('file', file);
  const r = await api.post<Envelope<PreviewOut>>('/import/students/preview', fd, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return r.data.data!;
}

export async function commitImportStudents(
  file: File,
  options?: { auto_create_class?: boolean; update_existing?: boolean }
) {
  const fd = new FormData();
  fd.append('file', file);
  const r = await api.post<Envelope<CommitOut>>('/import/students/commit', fd, {
    headers: { 'Content-Type': 'multipart/form-data' },
    params: options,
  });
  return r.data;
}

export function downloadImportTemplate() {
  const link = document.createElement('a');
  link.href = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/v1')
    + '/import/students/template';
  link.target = '_blank';
  link.click();
}
