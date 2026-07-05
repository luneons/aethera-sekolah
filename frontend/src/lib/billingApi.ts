/**
 * Client API untuk Billing / SPP.
 */
import api, { type Envelope } from './api';

export interface BillCategory {
  id: number;
  code: string;
  name: string;
  default_amount: number;
  recurring: 'none' | 'monthly' | 'yearly';
  description?: string | null;
  is_active: boolean;
}

export interface Bill {
  id: number;
  student_id: number;
  student_name: string;
  student_class?: string | null;
  category_id: number;
  category_name: string;
  period: string;
  amount: number;
  paid_amount: number;
  remaining: number;
  due_date?: string | null;
  status: 'unpaid' | 'paid' | 'waived';
  notes?: string | null;
  created_at: string;
}

export interface Payment {
  id: number;
  bill_id: number;
  amount: number;
  method: 'cash' | 'transfer' | 'qris' | 'midtrans' | 'manual';
  payment_ref?: string | null;
  notes?: string | null;
  paid_at: string;
}

export interface BillingStats {
  total_bills: number;
  total_amount: number;
  total_paid: number;
  outstanding: number;
  paid_bills: number;
  unpaid_bills: number;
  overdue_bills: number;
  collection_rate: number;
}

interface MetaInfo { page?: number; per_page?: number; total?: number }

// ─── Categories ──────────────────────────────────────────────────────────

export async function fetchBillCategories() {
  const r = await api.get<Envelope<BillCategory[]>>('/billing/categories');
  return r.data.data ?? [];
}

export async function createBillCategory(payload: {
  code: string; name: string; default_amount: number;
  recurring: 'none' | 'monthly' | 'yearly'; description?: string;
}) {
  const r = await api.post<Envelope<BillCategory>>('/billing/categories', payload);
  return r.data.data!;
}

export async function deleteBillCategory(id: number) {
  await api.delete(`/billing/categories/${id}`);
}

// ─── Bills ───────────────────────────────────────────────────────────────

export async function fetchBills(params?: {
  student_id?: number;
  school_class_id?: number;
  status?: 'unpaid' | 'paid' | 'waived';
  period?: string;
  page?: number;
  per_page?: number;
}) {
  const r = await api.get<Envelope<Bill[]> & { meta?: MetaInfo }>('/billing', {
    params,
  });
  return { items: r.data.data ?? [], meta: r.data.meta };
}

export async function bulkGenerateBills(payload: {
  category_id: number;
  period: string;
  amount?: number;
  due_date?: string;
  target_class_ids?: number[];
  notes?: string;
}) {
  const r = await api.post<Envelope<{ created: number; skipped: number; students_count: number }>>(
    '/billing/bulk-generate',
    payload
  );
  return r.data;
}

export async function waiveBill(billId: number) {
  await api.delete(`/billing/${billId}`);
}

export async function fetchBillPayments(billId: number) {
  const r = await api.get<Envelope<Payment[]>>(`/billing/${billId}/payments`);
  return r.data.data ?? [];
}

export async function createPayment(payload: {
  bill_id: number;
  amount: number;
  method: 'cash' | 'transfer' | 'qris' | 'manual';
  payment_ref?: string;
  notes?: string;
}) {
  const r = await api.post<Envelope<Payment>>('/billing/payments', payload);
  return r.data.data!;
}

export async function voidPayment(paymentId: number) {
  await api.delete(`/billing/payments/${paymentId}`);
}

export async function fetchBillingStats(period?: string) {
  const r = await api.get<Envelope<BillingStats>>('/billing/stats', {
    params: period ? { period } : undefined,
  });
  return r.data.data!;
}

// ─── Midtrans Online Payment ───────────────────────────────────────────────

export interface MidtransConfig {
  enabled: boolean;
  client_key: string;
  is_production: boolean;
}

export interface PayOnlineResult {
  token: string;
  redirect_url?: string | null;
  client_key: string;
  is_production: boolean;
  order_id: string;
}

export interface PaymentStatus {
  bill_id: number;
  status: 'unpaid' | 'paid' | 'waived';
  midtrans_status?: string | null;
  paid_amount: number;
  remaining: number;
}

export async function fetchMidtransConfig() {
  const r = await api.get<Envelope<MidtransConfig>>('/billing/midtrans/config');
  return r.data.data!;
}

export async function payBillOnline(billId: number) {
  const r = await api.post<Envelope<PayOnlineResult>>('/billing/pay-online', {
    bill_id: billId,
  });
  return r.data.data!;
}

export async function checkPaymentStatus(billId: number) {
  const r = await api.get<Envelope<PaymentStatus>>(`/billing/${billId}/payment-status`);
  return r.data.data!;
}
