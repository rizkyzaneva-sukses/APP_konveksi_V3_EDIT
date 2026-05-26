'use server';

import { createClient } from '@/lib/supabase/server';
import { getCurrentUserProfile } from '@/lib/auth/permissions';

const TENANT_ID = 'STX-001';

export interface ModelAksesori {
  id: string;
  model_id: string;
  inventory_item_id: string;
  inventory_item_nama: string;
  satuan: string;
  qty_per_pcs: number;
  tahap_pakai: string;
  warna_id: string | null;
  warna_nama: string | null;
}

export interface AddModelAksesoriInput {
  model_id: string;
  inventory_item_id: string;
  qty_per_pcs: number;
  tahap_pakai: string;
  warna_id?: string | null;
}

/** 1. Ambil kebutuhan aksesori per model */
export async function getModelAksesori(model_id: string): Promise<ModelAksesori[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('model_aksesori')
    .select(`
      id,
      model_id,
      inventory_item_id,
      qty_per_pcs,
      tahap_pakai,
      warna_id,
      inventory_item:inventory_item_id (nama, satuan)
    `)
    .eq('model_id', model_id)
    .eq('tenant_id', TENANT_ID)
    .order('tahap_pakai');

  if (error) { console.error('getModelAksesori:', error.message); return []; }

  return (data ?? []).map((item: any) => ({
    id: item.id,
    model_id: item.model_id,
    inventory_item_id: item.inventory_item_id,
    inventory_item_nama: item.inventory_item?.nama ?? '',
    satuan: item.inventory_item?.satuan ?? '',
    qty_per_pcs: Number(item.qty_per_pcs),
    tahap_pakai: item.tahap_pakai,
    warna_id: item.warna_id ?? null,
    warna_nama: null,
  }));
}

/** 2. Tambah kebutuhan aksesori ke model */
export async function addModelAksesori(input: AddModelAksesoriInput): Promise<void> {
  const profile = await getCurrentUserProfile();
  if (!profile) throw new Error('Unauthorized');

  const supabase = await createClient();

  const { error } = await supabase
    .from('model_aksesori')
    .insert({
      model_id: input.model_id,
      inventory_item_id: input.inventory_item_id,
      qty_per_pcs: input.qty_per_pcs,
      tahap_pakai: input.tahap_pakai,
      warna_id: input.warna_id ?? null,
      tenant_id: TENANT_ID,
      created_by: profile.id,
    });

  if (error) throw new Error(error.message);
}

/** 3. Hapus kebutuhan aksesori */
export async function deleteModelAksesori(id: string): Promise<void> {
  const supabase = await createClient();

  const { error } = await supabase
    .from('model_aksesori')
    .delete()
    .eq('id', id)
    .eq('tenant_id', TENANT_ID);

  if (error) throw new Error(error.message);
}

/**
 * Ambil aksesori untuk bundle tertentu berdasarkan po_item_id + tahap
 * Dipakai di Modal Serah Terima untuk tampilkan aksesori yang harus diserahkan
 */
export async function getAksesoriForBundle(
  po_item_id: string,
  tahap: string
): Promise<ModelAksesori[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('model_aksesori')
    .select(`
      id,
      model_id,
      inventory_item_id,
      qty_per_pcs,
      tahap_pakai,
      inventory_item:inventory_item_id (nama, satuan)
    `)
    .eq('tahap_pakai', tahap)
    .eq('tenant_id', TENANT_ID);

  if (error) throw new Error(error.message);
  if (!data || data.length === 0) return [];

  const { data: poItemData, error: poItemError } = await supabase
    .from('po_item')
    .select('produk:produk_id(model_id)')
    .eq('id', po_item_id)
    .single();

  if (poItemError || !poItemData) return [];

  const modelId = (poItemData.produk as any)?.model_id;
  if (!modelId) return [];

  return data
    .filter((item: any) => item.model_id === modelId)
    .map((item: any) => ({
      id: item.id,
      model_id: item.model_id,
      inventory_item_id: item.inventory_item_id,
      inventory_item_nama: item.inventory_item?.nama ?? '',
      satuan: item.inventory_item?.satuan ?? '',
      qty_per_pcs: Number(item.qty_per_pcs),
      tahap_pakai: item.tahap_pakai,
      warna_id: null,
      warna_nama: null,
    }));
}

/**
 * Fetch semua aksesori untuk banyak po_item_id sekaligus — hanya 2 query total.
 * Dipakai di Cetak Kartu Kerja agar tidak N×7 round-trips.
 * Return: map po_item_id → ModelAksesori[]
 */
export async function getAksesoriForKartuKerja(
  po_item_ids: string[]
): Promise<Record<string, ModelAksesori[]>> {
  if (!po_item_ids.length) return {};
  const supabase = await createClient();

  // Query 1: ambil model_id untuk semua po_item sekaligus
  const { data: poItems, error: poItemError } = await supabase
    .from('po_item')
    .select('id, produk:produk_id(model_id)')
    .in('id', po_item_ids);

  if (poItemError || !poItems?.length) return {};

  // Build map po_item_id → model_id
  const poItemModelMap: Record<string, string> = {};
  const modelIds: string[] = [];
  for (const pi of poItems as any[]) {
    const modelId = pi.produk?.model_id;
    if (modelId) {
      poItemModelMap[pi.id] = modelId;
      if (!modelIds.includes(modelId)) modelIds.push(modelId);
    }
  }

  if (!modelIds.length) return {};

  // Query 2: ambil semua aksesori untuk semua model sekaligus
  const { data: aksesoriData, error: aksError } = await supabase
    .from('model_aksesori')
    .select(`
      id, model_id, inventory_item_id, qty_per_pcs, tahap_pakai,
      inventory_item:inventory_item_id (nama, satuan)
    `)
    .in('model_id', modelIds)
    .eq('tenant_id', TENANT_ID);

  if (aksError) throw new Error(aksError.message);

  // Build result: po_item_id → ModelAksesori[]
  const result: Record<string, ModelAksesori[]> = {};
  for (const [poItemId, modelId] of Object.entries(poItemModelMap)) {
    result[poItemId] = ((aksesoriData ?? []) as any[])
      .filter(a => a.model_id === modelId)
      .map(a => ({
        id:                   a.id,
        model_id:             a.model_id,
        inventory_item_id:    a.inventory_item_id,
        inventory_item_nama:  a.inventory_item?.nama ?? '',
        satuan:               a.inventory_item?.satuan ?? '',
        qty_per_pcs:          Number(a.qty_per_pcs),
        tahap_pakai:          a.tahap_pakai,
        warna_id:             null,
        warna_nama:           null,
      }));
  }

  return result;
}

// ─── WARNA AKSESORI ────────────────────────────────────────────

export interface WarnaAksesori {
  id: string;
  warna_id: string;
  warna_nama: string;
  inventory_item_id: string;
  inventory_item_nama: string;
  satuan: string;
  qty_per_pcs: number;
  tahap_pakai: string;
}

export interface AddWarnaAksesoriInput {
  warna_id: string;
  inventory_item_id: string;
  qty_per_pcs: number;
  tahap_pakai: string;
}

/** Ambil semua warna_aksesori (opsional filter per warna) */
export async function getWarnaAksesori(warna_id?: string): Promise<WarnaAksesori[]> {
  const supabase = await createClient();

  let query = supabase
    .from('warna_aksesori')
    .select(`
      id,
      warna_id,
      inventory_item_id,
      qty_per_pcs,
      tahap_pakai,
      warna!warna_id(nama),
      inventory_item:inventory_item_id (nama, satuan)
    `)
    .eq('tenant_id', TENANT_ID)
    .order('warna_id')
    .order('tahap_pakai');

  if (warna_id) {
    query = query.eq('warna_id', warna_id);
  }

  const { data, error } = await query;
  if (error) { console.error('getWarnaAksesori:', error.message); return []; }

  return (data ?? []).map((item: any) => ({
    id: item.id,
    warna_id: item.warna_id,
    warna_nama: item.warna?.nama ?? '',
    inventory_item_id: item.inventory_item_id,
    inventory_item_nama: item.inventory_item?.nama ?? '',
    satuan: item.inventory_item?.satuan ?? '',
    qty_per_pcs: Number(item.qty_per_pcs),
    tahap_pakai: item.tahap_pakai,
  }));
}

/** Tambah warna_aksesori */
export async function addWarnaAksesori(input: AddWarnaAksesoriInput): Promise<void> {
  const profile = await getCurrentUserProfile();
  if (!profile) throw new Error('Unauthorized');

  const supabase = await createClient();

  const { error } = await supabase
    .from('warna_aksesori')
    .insert({
      ...input,
      tenant_id: TENANT_ID,
      created_by: profile.id,
    });

  if (error) throw new Error(error.message);
}

/** Hapus warna_aksesori */
export async function deleteWarnaAksesori(id: string): Promise<void> {
  const supabase = await createClient();

  const { error } = await supabase
    .from('warna_aksesori')
    .delete()
    .eq('id', id)
    .eq('tenant_id', TENANT_ID);

  if (error) throw new Error(error.message);
}
