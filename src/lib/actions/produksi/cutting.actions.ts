'use server';

import { createClient } from '@/lib/supabase/server';
import { getSession } from '@/lib/auth/session';
import { revalidatePath } from 'next/cache';

const TENANT_ID = 'STX-001';

// ─── TYPES ───────────────────────────────────────────────────────────────────

export interface POCuttingItem {
  po_id: string;
  no_po: string;
  klien_nama: string;
  model_nama: string | null;
  total_bundle: number;
  total_qty: number;
  status: 'menunggu' | 'progress' | 'selesai';
  start_time: string | null;
}

export interface StokWarning {
  item_nama: string;
  qty_kurang: number;
  sisa_stok: number;
}

export interface SelesaiCuttingResult {
  success: boolean;
  total_qty: number;
  partial_count: number;
  stok_warnings: StokWarning[];
  error?: string;
}

// ─ Input type untuk mulaiCuttingBatch
export interface MulaiBundleInput {
  bundle_id: string;
}

// ─ Input type untuk selesaiCuttingBatch
export interface BundleQtyInput {
  bundle_id: string;
  qty_aktual: number;
}

export interface PemakaianInput {
  inventory_item_id: string;
  rate_per_pcs: number;
  total_qty_artikel: number;
}

// ─ Type untuk getPendingCuttingBundles
export interface PendingBundle {
  id: string;
  barcode: string;
  no_po: string;
  klien_nama: string;
  warna: string;
  size: string;
  qty_order: number;
  qty_aktual: number;
  tenant_id: string;
}

// ─── HELPER ──────────────────────────────────────────────────────────────────

async function resolveUserId(): Promise<string> {
  const session = await getSession();
  if (!session) throw new Error('Unauthorized');
  return session.userId;
}

// ─── FUNGSI 1: getPOCuttingList ───────────────────────────────────────────────

export async function getPOCuttingList(): Promise<POCuttingItem[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('bundle')
    .select(`
      id,
      status_tahap,
      po_item_id,
      po:po_id (
        id,
        no_po,
        klien:klien_id ( nama )
      ),
      po_item:po_item_id (
        qty_per_bundle,
        produk:produk_id (
          model_produk:model_id ( nama )
        )
      )
    `)
    .eq('tenant_id', TENANT_ID)
    .order('created_at', { ascending: true });

  if (error) throw new Error(`Gagal fetch bundle: ${error.message}`);

  // Group by po_id
  const poMap = new Map<string, {
    po_id: string;
    no_po: string;
    klien_nama: string;
    model_nama: string | null;
    bundles: { status_tahap: any; qty_per_bundle: number }[];
  }>();

  for (const raw of (data ?? []) as any[]) {
    const po = Array.isArray(raw.po) ? raw.po[0] : raw.po;
    const po_item = Array.isArray(raw.po_item) ? raw.po_item[0] : raw.po_item;
    const klien = Array.isArray(po?.klien) ? po.klien[0] : po?.klien;
    const produk = Array.isArray(po_item?.produk) ? po_item.produk[0] : po_item?.produk;
    const model_produk = Array.isArray(produk?.model_produk) ? produk.model_produk[0] : produk?.model_produk;

    const po_id: string = po?.id ?? '';
    if (!po_id) continue;

    if (!poMap.has(po_id)) {
      poMap.set(po_id, {
        po_id,
        no_po: po?.no_po ?? '-',
        klien_nama: klien?.nama ?? '-',
        model_nama: model_produk?.nama ?? null,
        bundles: [],
      });
    }

    poMap.get(po_id)!.bundles.push({
      status_tahap: raw.status_tahap,
      qty_per_bundle: po_item?.qty_per_bundle ?? 0,
    });
  }

  const result: POCuttingItem[] = [];

  for (const group of poMap.values()) {
    const { bundles } = group;

    // Tentukan status cutting PO — partial masuk hitungan progress
    const cuttingStatuses = bundles.map(b => {
      const cutting = b.status_tahap?.cutting as { status?: string } | undefined;
      return cutting?.status ?? null;
    });

    const allNull     = cuttingStatuses.every(s => s === null);
    const allSelesai  = cuttingStatuses.every(s => s === 'selesai');
    const anyProgress = cuttingStatuses.some(s =>
      s === 'progress' || s === 'terima' || s === 'partial'
    );

    const status: 'menunggu' | 'progress' | 'selesai' =
      allSelesai  ? 'selesai' :
      anyProgress ? 'progress' :
      allNull     ? 'menunggu' :
      'progress'; // ada yang selesai sebagian → masih progress

    // Lewati PO yang sudah selesai
    if (status === 'selesai') continue;

    const startBundle = bundles.find(b => b.status_tahap?.cutting?.start_time);
    const start_time = startBundle?.status_tahap?.cutting?.start_time ?? null;

    const total_bundle = bundles.length;
    const total_qty = bundles.reduce((s, b) => s + (b.qty_per_bundle ?? 0), 0);

    result.push({
      po_id:      group.po_id,
      no_po:      group.no_po,
      klien_nama: group.klien_nama,
      model_nama: group.model_nama,
      total_bundle,
      total_qty,
      status,
      start_time,
    });
  }

  // Urutkan: menunggu → progress → by no_po
  result.sort((a, b) => {
    const order = { menunggu: 0, progress: 1, selesai: 2 };
    const diff = order[a.status] - order[b.status];
    if (diff !== 0) return diff;
    return a.no_po.localeCompare(b.no_po);
  });

  return result;
}

// ─── FUNGSI 2: mulaiCuttingBatch ─────────────────────────────────────────────

export async function mulaiCuttingBatch(
  bundle_ids: string[]
): Promise<{ success: boolean; jumlah_bundle: number; error?: string }> {
  try {
    const user_id = await resolveUserId();
    const supabase = await createClient();

    const { data, error } = await supabase.rpc('mulai_cutting_batch', {
      p_bundle_ids: bundle_ids,
      p_user_id:    user_id,
      p_tenant_id:  TENANT_ID,
    });

    if (error) return { success: false, jumlah_bundle: 0, error: error.message };

    const result = data as { jumlah_bundle?: number } | null;
    const jumlah_bundle = result?.jumlah_bundle ?? 0;

    revalidatePath('/app/produksi/antrian-cutting');
    return { success: true, jumlah_bundle };
  } catch (e: any) {
    return { success: false, jumlah_bundle: 0, error: e.message ?? 'Terjadi kesalahan' };
  }
}

// ─── FUNGSI 3: selesaiCuttingBatch ───────────────────────────────────────────

export async function selesaiCuttingBatch(
  bundle_qty: BundleQtyInput[],
  pemakaian: PemakaianInput[]
): Promise<SelesaiCuttingResult> {
  try {
    const user_id = await resolveUserId();
    const supabase = await createClient();

    const { data, error } = await supabase.rpc('selesai_cutting_batch', {
      p_bundle_qty: bundle_qty,
      p_pemakaian:  pemakaian,
      p_user_id:    user_id,
      p_tenant_id:  TENANT_ID,
    });

    if (error) return { success: false, total_qty: 0, partial_count: 0, stok_warnings: [], error: error.message };

    const result = data as {
      success?: boolean;
      total_qty?: number;
      partial_count?: number;
      stok_warnings?: StokWarning[];
    } | null;

    revalidatePath('/app/produksi/antrian-cutting');
    return {
      success:       result?.success ?? true,
      total_qty:     result?.total_qty ?? 0,
      partial_count: result?.partial_count ?? 0,
      stok_warnings: result?.stok_warnings ?? [],
    };
  } catch (e: any) {
    return { success: false, total_qty: 0, partial_count: 0, stok_warnings: [], error: e.message ?? 'Terjadi kesalahan' };
  }
}

// ─── FUNGSI 4: closeBundleCutting ────────────────────────────────────────────

export async function closeBundleCutting(
  bundle_id: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const user_id = await resolveUserId();
    const supabase = await createClient();

    const { error } = await supabase.rpc('close_bundle_cutting', {
      p_bundle_id:  bundle_id,
      p_user_id:    user_id,
      p_tenant_id:  TENANT_ID,
    });

    if (error) return { success: false, error: error.message };

    revalidatePath('/app/produksi/antrian-cutting');
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message ?? 'Terjadi kesalahan' };
  }
}

// ─── FUNGSI 5: getPendingCuttingBundles ──────────────────────────────────────

export async function getPendingCuttingBundles(): Promise<PendingBundle[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('bundle')
    .select(`
      id,
      barcode,
      tenant_id,
      status_tahap,
      po:po_id (
        no_po,
        klien:klien_id ( nama )
      ),
      po_item:po_item_id (
        warna,
        size,
        qty_per_bundle
      )
    `)
    .eq('tenant_id', TENANT_ID)
    .order('created_at', { ascending: true });

  if (error) throw new Error(`Gagal fetch pending cutting: ${error.message}`);

  const result: PendingBundle[] = [];

  for (const raw of (data ?? []) as any[]) {
    const cuttingStatus = raw.status_tahap?.cutting?.status;
    if (cuttingStatus !== 'partial') continue;

    const po = Array.isArray(raw.po) ? raw.po[0] : raw.po;
    const klien = Array.isArray(po?.klien) ? po.klien[0] : po?.klien;
    const poItem = Array.isArray(raw.po_item) ? raw.po_item[0] : raw.po_item;

    result.push({
      id:          raw.id,
      barcode:     raw.barcode,
      tenant_id:   raw.tenant_id,
      no_po:       po?.no_po ?? '-',
      klien_nama:  klien?.nama ?? '-',
      warna:       poItem?.warna ?? '-',
      size:        poItem?.size ?? '-',
      qty_order:   poItem?.qty_per_bundle ?? 0,
      qty_aktual:  raw.status_tahap?.cutting?.qty_aktual ?? 0,
    });
  }

  return result;
}

// ─── FUNGSI 6: getInventoryItemsForCutting ───────────────────────────────────
// Mengembalikan semua item inventory sebagai pilihan input manual pemakaian bahan cutting

export interface InventoryItemOption {
  id: string;
  nama: string;
  satuan: string;
  stok_aktual: number;
}

export async function getInventoryItemsForCutting(): Promise<InventoryItemOption[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('inventory_item')
    .select('id, nama, satuan, stok_aktual')
    .eq('tenant_id', TENANT_ID)
    .order('nama', { ascending: true });

  if (error) throw new Error(`Gagal fetch inventory: ${error.message}`);

  return (data ?? []).map((item: any) => ({
    id:          item.id,
    nama:        item.nama,
    satuan:      item.satuan,
    stok_aktual: Number(item.stok_aktual ?? 0),
  }));
}

// ─── FUNGSI 7: getBundlesForPO ───────────────────────────────────────────────

export interface BundleDetailItem {
  id: string;
  barcode: string;
  warna: string;
  size: string;
  qty_per_bundle: number;
  cutting_status: string | null;
  qty_aktual: number | null;
}

export async function getBundlesForPO(po_id: string): Promise<BundleDetailItem[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('bundle')
    .select(`
      id,
      barcode,
      status_tahap,
      po_item:po_item_id (
        warna,
        size,
        qty_per_bundle
      )
    `)
    .eq('po_id', po_id)
    .eq('tenant_id', TENANT_ID);

  if (error) throw new Error(`Gagal fetch bundle detail: ${error.message}`);

  const result: BundleDetailItem[] = (data ?? []).map((b: any) => {
    const poItem = Array.isArray(b.po_item) ? b.po_item[0] : b.po_item;
    const cuttingStatus = b.status_tahap?.cutting?.status ?? null;
    const qtyAktual = b.status_tahap?.cutting?.qty_aktual ?? null;

    return {
      id:             b.id,
      barcode:        b.barcode,
      warna:          poItem?.warna ?? '-',
      size:           poItem?.size ?? '-',
      qty_per_bundle: poItem?.qty_per_bundle ?? 0,
      cutting_status: cuttingStatus,
      qty_aktual:     qtyAktual !== null ? Number(qtyAktual) : null,
    };
  });

  // Urutkan: warna ASC, size ASC
  result.sort((a, b) => {
    if (a.warna !== b.warna) return a.warna.localeCompare(b.warna);
    return a.size.localeCompare(b.size);
  });

  return result;
}

// ─── FUNGSI 8: getBundlesByIds ────────────────────────────────────────────────

export interface BundleForModal {
  id: string;
  barcode: string;
  warna: string;
  size: string;
  qty_per_bundle: number;
}

export async function getBundlesByIds(bundle_ids: string[]): Promise<BundleForModal[]> {
  if (!bundle_ids.length) return [];
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('bundle')
    .select(`
      id, barcode,
      po_item:po_item_id ( warna, size, qty_per_bundle )
    `)
    .in('id', bundle_ids)
    .eq('tenant_id', TENANT_ID);

  if (error) throw new Error(`Gagal fetch bundle: ${error.message}`);

  return (data ?? []).map((b: any) => {
    const pi = Array.isArray(b.po_item) ? b.po_item[0] : b.po_item;
    return {
      id:             b.id,
      barcode:        b.barcode,
      warna:          pi?.warna ?? '-',
      size:           pi?.size ?? '-',
      qty_per_bundle: pi?.qty_per_bundle ?? 0,
    };
  });
}
