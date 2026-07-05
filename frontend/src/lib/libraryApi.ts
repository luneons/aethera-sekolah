import api, { type Envelope } from './api';

export interface LibraryBook {
  id: number;
  code: string;
  isbn?: string | null;
  title: string;
  author?: string | null;
  publisher?: string | null;
  year?: number | null;
  category?: string | null;
  cover_url?: string | null;
  description?: string | null;
  total_copies: number;
  available_copies: number;
  is_active: boolean;
}

export interface BookInput {
  code: string;
  isbn?: string;
  title: string;
  author?: string;
  publisher?: string;
  year?: number;
  category?: string;
  cover_url?: string;
  description?: string;
  total_copies: number;
  is_active?: boolean;
}

export interface LibraryLoan {
  id: number;
  book_id: number;
  book_title: string;
  book_code: string;
  student_id: number;
  student_name: string;
  student_class?: string | null;
  loan_date: string;
  due_date: string;
  return_date?: string | null;
  days_overdue: number;
  status: string;
  fine_amount: number;
  notes?: string | null;
}

export interface LibraryStats {
  total_books: number;
  total_copies: number;
  available_copies: number;
  active_loans: number;
  overdue: number;
  top_readers: Array<{ student_id: number; name: string; loan_count: number }>;
}

export async function fetchBooks(params?: {
  q?: string;
  category?: string;
  available_only?: boolean;
}) {
  const r = await api.get<Envelope<LibraryBook[]>>('/library/books', { params });
  return r.data.data ?? [];
}

export async function fetchCategories() {
  const r = await api.get<Envelope<string[]>>('/library/books/categories');
  return r.data.data ?? [];
}

export async function createBook(payload: BookInput) {
  const r = await api.post<Envelope<LibraryBook>>('/library/books', payload);
  return r.data.data!;
}

export async function updateBook(id: number, payload: BookInput) {
  const r = await api.put<Envelope<LibraryBook>>(`/library/books/${id}`, payload);
  return r.data.data!;
}

export async function deleteBook(id: number) {
  await api.delete(`/library/books/${id}`);
}

export async function createLoan(payload: {
  book_id: number;
  student_id: number;
  loan_date?: string;
  due_date?: string;
  notes?: string;
}) {
  const r = await api.post<Envelope<LibraryLoan>>('/library/loans', payload);
  return r.data.data!;
}

export async function returnLoan(
  id: number,
  payload: { return_date?: string; book_lost?: boolean; notes?: string }
) {
  const r = await api.patch<Envelope<LibraryLoan>>(
    `/library/loans/${id}/return`,
    payload
  );
  return r.data.data!;
}

export async function fetchLoans(params?: {
  status?: string;
  student_id?: number;
  overdue_only?: boolean;
}) {
  const r = await api.get<Envelope<LibraryLoan[]>>('/library/loans', { params });
  return r.data.data ?? [];
}

export async function fetchLibraryStats() {
  const r = await api.get<Envelope<LibraryStats>>('/library/stats');
  return r.data.data!;
}
