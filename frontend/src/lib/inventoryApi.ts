import api, { type Envelope } from './api';

export interface InventoryItem {
  id: number;
  asset_code: string;
  name: string;
  category?: string | null;
  location?: string | null;
  purchase_date?: string | null;
  purchase_price?: number | null;
  quantity: number;
  condition: 'baik' | 'rusak_ringan' | 'rusak_berat' | 'hilang' | 'dijual';
  description?: string | null;
  photo_url?: string | null;
  responsible_user_id?: number | null;
  responsible_name?: string | null;
  last_audit_at?: string | null;
  created_at: string;
}

export interface ItemInput {
  asset_code: string;
  name: string;
  category?: string;
  location?: string;
  purchase_date?: string;
  purchase_price?: number;
  quantity: number;
  condition: string;
  description?: string;
  photo_url?: string;
  responsible_user_id?: number | null;
}

export interface InventoryStats {
  total_items: number;
  total_quantity: number;
  total_value: number;
  by_condition: Record<string, number>;
  by_category: Array<{ category: string; count: number }>;
}

export async function fetchInventory(params?: {
  q?: string;
  category?: string;
  condition?: string;
  location?: string;
}) {
  const r = await api.get<Envelope<InventoryItem[]>>('/inventory', { params });
  return r.data.data ?? [];
}

export async function fetchInventoryStats() {
  const r = await api.get<Envelope<InventoryStats>>('/inventory/stats');
  return r.data.data!;
}

export async function createItem(payload: ItemInput) {
  const r = await api.post<Envelope<InventoryItem>>('/inventory', payload);
  return r.data.data!;
}

export async function updateItem(id: number, payload: ItemInput) {
  const r = await api.put<Envelope<InventoryItem>>(`/inventory/${id}`, payload);
  return r.data.data!;
}

export async function updateCondition(id: number, condition: string, note?: string) {
  const r = await api.patch<Envelope<InventoryItem>>(`/inventory/${id}/condition`, {
    condition,
    note,
  });
  return r.data.data!;
}

export async function auditItem(id: number) {
  const r = await api.post<Envelope<InventoryItem>>(`/inventory/${id}/audit`, {});
  return r.data.data!;
}

export async function fetchItemLogs(id: number) {
  const r = await api.get<
    Envelope<Array<{
      id: number;
      action: string;
      note: string;
      actor_name: string;
      created_at: string;
    }>>
  >(`/inventory/${id}/logs`);
  return r.data.data ?? [];
}

export async function deleteItem(id: number) {
  await api.delete(`/inventory/${id}`);
}
