'use server';

import { createClient } from '@/lib/supabase/server';
import { getSession } from '@/lib/auth/session';
import { getCurrentUserProfile } from '@/lib/auth/permissions';

const TENANT_ID = 'STX-001';

async function resolveUserId() {
  const session = await getSession();
  if (!session) throw new Error('User tidak terautentikasi');
  return session.userId;
}

// --- INTERFACES ---

export interface InventoryOverviewItem {
  id             : string;
  nama           : string;
  satuan         : string;
  stok_aktual    : number;
  stok_minimum   : number;
  status         : 'normal' | 'low' | 'minus';
  batch_count    : number;
  warna_id       : string | null;
  warna_nama     : string | null;
  satuan_beli    : string | null;
  faktor_konversi: number | null;
}

export interface InventoryBatch {
  id: string;
  qty_awal: number;
  qty_sisa: number;
  harga_satuan: number;
  tanggal_masuk: string;
  no_faktur: string | null;
}

export interface TransaksiKeluar {
  id: string;
  tipe: 'bahan' | 'aksesori';
  inventory_item_id: string;
  inventory_item_nama: string;
  satuan: string;
  qty_pakai: number;
  bundle_barcode: string;
  no_po: string;
  tahap: string;
  created_at: string;
}

export interface StokMasukInput {
  inventory_item_id: string;
  qty: number;
  harga_satuan: number;
  tanggal_masuk: string;  // format: YYYY-MM-DD
  no_faktur?: string;
  keterangan?: string;
  kategori_trx_id: string;
}

export interface TambahItemInput {
  nama: string;
  satuan: string;
  stok_minimum: number;
  warna_id?: string | null;
}

// --- FUNCTIONS ---

/**
 * 1. Mendapatkan ringkasan stok seluruh item inventory
 */
export async function getInventoryOverview(): Promise<InventoryOverviewItem[]> {
  const supabase = await createClient();

  // A. Fetch items (tanpa embedded join warna — pakai lookup manual agar tidak bergantung schema cache)
  const { data: items, error: itemError } = await supabase
    .from('inventory_item')
    .select('id, nama, satuan, stok_aktual, stok_minimum, warna_id, satuan_beli, faktor_konversi')
    .eq('tenant_id', TENANT_ID)
    .order('nama');

  if (itemError) { console.error('getInventoryOverview items:', itemError.message); return []; }

  // B. Fetch batch counts (hanya yang masih ada sisa)
  const { data: batches, error: batchError } = await supabase
    .from('inventory_batch')
    .select('inventory_item_id')
    .eq('tenant_id', TENANT_ID)
    .gt('qty_sisa', 0);

  if (batchError) console.error('getInventoryOverview batches:', batchError.message);

  // C. Fetch warna lookup (tanpa join — query langsung ke tabel warna)
  const warnaIds = [...new Set((items ?? []).map(i => i.warna_id).filter(Boolean))] as string[];
  let warnaMap: Record<string, string> = {};
  if (warnaIds.length > 0) {
    const { data: warnaRows } = await supabase
      .from('warna')
      .select('id, nama')
      .in('id', warnaIds);
    (warnaRows ?? []).forEach((w: any) => { warnaMap[w.id] = w.nama; });
  }

  const batchCountMap: Record<string, number> = {};
  batches?.forEach(b => {
    batchCountMap[b.inventory_item_id] = (batchCountMap[b.inventory_item_id] || 0) + 1;
  });

  // D. Map to final structure
  return (items || []).map(item => {
    const stokNum = Number(item.stok_aktual ?? 0);
    const minNum  = Number(item.stok_minimum ?? 0);
    const status: 'minus' | 'low' | 'normal' =
      stokNum < 0 ? 'minus' : stokNum <= minNum ? 'low' : 'normal';
    return {
      id:           item.id,
      nama:         item.nama,
      satuan:       item.satuan,
      stok_aktual:  stokNum,
      stok_minimum: minNum,
      warna_id:      item.warna_id ?? null,
      warna_nama:    item.warna_id ? (warnaMap[item.warna_id] ?? null) : null,
      status,
      batch_count:   batchCountMap[item.id] ?? 0,
      satuan_beli:   item.satuan_beli    ?? null,
      faktor_konversi: item.faktor_konversi != null ? Number(item.faktor_konversi) : null,
    };
  });
}

/**
 * 2. Mendapatkan daftar batch untuk satu item spesifik
 */
export async function getInventoryBatches(item_id: string): Promise<InventoryBatch[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('inventory_batch')
    .select('id, qty_awal, qty_sisa, harga_satuan, tanggal_masuk, jurnal_entry:jurnal_entry_id(no_faktur)')
    .eq('inventory_item_id', item_id)
    .eq('tenant_id', TENANT_ID)
    .order('tanggal_masuk', { ascending: false });

  if (error) throw new Error(error.message);

  return (data || []).map((b: any) => ({
    id: b.id,
    qty_awal: b.qty_awal,
    qty_sisa: b.qty_sisa,
    harga_satuan: b.harga_satuan,
    tanggal_masuk: b.tanggal_masuk,
    no_faktur: b.jurnal_entry?.no_faktur ?? null
  }));
}

/**
 * 3. Mendapatkan riwayat transaksi keluar (pemakaian)
 */
export async function getTransaksiKeluar(page: number, pageSize: number, item_id?: string): Promise<{ data: TransaksiKeluar[], total: number }> {
  const supabase = await createClient();

  // BAGIAN A - pemakaian_bahan
  let queryBahan = supabase
    .from('pemakaian_bahan')
    .select('id, qty_pakai, created_at, inventory_item:inventory_item_id(nama, satuan), bundle:bundle_id(barcode, po:po_id(no_po))', { count: 'exact' })
    .eq('tenant_id', TENANT_ID);
  
  if (item_id) queryBahan = queryBahan.eq('inventory_item_id', item_id);
  const { data: dataBahan, count: countBahan } = await queryBahan.order('created_at', { ascending: false });

  // BAGIAN B - pemakaian_aksesori
  let queryAksesori = supabase
    .from('pemakaian_aksesori')
    .select('id, qty_pakai, tahap, created_at, inventory_item:inventory_item_id(nama, satuan), bundle:bundle_id(barcode, po:po_id(no_po))', { count: 'exact' })
    .eq('tenant_id', TENANT_ID);

  if (item_id) queryAksesori = queryAksesori.eq('inventory_item_id', item_id);
  const { data: dataAksesori, count: countAksesori } = await queryAksesori.order('created_at', { ascending: false });

  // Merge dan Transform
  const resultBahan: TransaksiKeluar[] = (dataBahan || []).map((b: any) => ({
    id: b.id,
    tipe: 'bahan',
    inventory_item_id: item_id || '',
    inventory_item_nama: b.inventory_item?.nama || '',
    satuan: b.inventory_item?.satuan || '',
    qty_pakai: b.qty_pakai,
    bundle_barcode: b.bundle?.barcode || '',
    no_po: b.bundle?.po?.no_po || '',
    tahap: 'Cutting', // Pemakaian bahan selalu di cutting
    created_at: b.created_at
  }));

  const resultAksesori: TransaksiKeluar[] = (dataAksesori || []).map((a: any) => ({
    id: a.id,
    tipe: 'aksesori',
    inventory_item_id: item_id || '',
    inventory_item_nama: a.inventory_item?.nama || '',
    satuan: a.inventory_item?.satuan || '',
    qty_pakai: a.qty_pakai,
    bundle_barcode: a.bundle?.barcode || '',
    no_po: a.bundle?.po?.no_po || '',
    tahap: a.tahap || '',
    created_at: a.created_at
  }));

  const allData = [...resultBahan, ...resultAksesori].sort((a, b) => 
    new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  const start = (page - 1) * pageSize;
  const slicedData = allData.slice(start, start + pageSize);

  return {
    data: slicedData,
    total: (countBahan || 0) + (countAksesori || 0)
  };
}

/**
 * 4. Mendapatkan item yang perlu perhatian (stok rendah atau minus)
 */
export async function getAlertItems(): Promise<InventoryOverviewItem[]> {
  const allItems = await getInventoryOverview();
  return allItems
    .filter(item => item.status !== 'normal')
    .sort((a, b) => {
      if (a.status === 'minus' && b.status !== 'minus') return -1;
      if (a.status !== 'minus' && b.status === 'minus') return 1;
      return 0;
    });
}

/**
 * 5. Menambah stok masuk via RPC stok_masuk
 */
export async function addStokMasuk(input: StokMasukInput): Promise<{ batch_id: string; stok_baru: number }> {
  const supabase = await createClient();
  const userId = await resolveUserId();

  const { data, error } = await supabase.rpc('stok_masuk', {
    p_inventory_item_id: input.inventory_item_id,
    p_qty:               input.qty,
    p_harga_satuan:      input.harga_satuan,
    p_tanggal_masuk:     input.tanggal_masuk,
    p_no_faktur:         input.no_faktur ?? null,
    p_kategori_trx_id:   input.kategori_trx_id,
    p_keterangan:        input.keterangan ?? null,
    p_user_id:           userId,
    p_tenant_id:         TENANT_ID
  });

  if (error) throw new Error(error.message);
  return { batch_id: data.batch_id, stok_baru: data.stok_baru };
}

/**
 * 6. Membuat item inventory baru via RPC tambah_inventory_item
 */
export async function tambahInventoryItem(input: TambahItemInput): Promise<string> {
  const supabase = await createClient();
  const userId = await resolveUserId();

  const { data, error } = await supabase.rpc('tambah_inventory_item', {
    p_nama:         input.nama,
    p_satuan:       input.satuan,
    p_stok_minimum: input.stok_minimum,
    p_warna_id:     input.warna_id ?? null,
    p_user_id:      userId,
    p_tenant_id:    TENANT_ID
  });

  if (error) throw new Error(error.message);
  return data.id;
}

/**
 * 7. Mendapatkan kategori transaksi untuk pembelian bahan (pembelian_bahan)
 */
export async function getKategoriTrxBahan(): Promise<{ id: string; nama: string }[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('kategori_trx')
    .select('id, nama')
    .eq('jenis', 'pembelian_bahan')
    .eq('tenant_id', TENANT_ID)
    .eq('aktif', true)
    .order('nama');

  if (error) { console.error('getKategoriTrxBahan:', error.message); return []; }
  return data ?? [];
}

/**
 * 8. Update stok minimum suatu item
 */
export async function updateStokMinimum(item_id: string, stok_minimum: number): Promise<void> {
  const supabase = await createClient();

  const { error } = await supabase
    .from('inventory_item')
    .update({ stok_minimum })
    .eq('id', item_id)
    .eq('tenant_id', TENANT_ID);

  if (error) throw new Error(error.message);
}

/**
 * 9. Update informasi dasar item inventory
 */
export interface UpdateItemInput {
  nama: string;
  satuan: string;
  stok_minimum: number;
  warna_id?: string | null;
}

export async function updateInventoryItem(item_id: string, input: UpdateItemInput): Promise<void> {
  const supabase = await createClient();

  const { error } = await supabase
    .from('inventory_item')
    .update({
      nama: input.nama,
      satuan: input.satuan,
      stok_minimum: input.stok_minimum,
      warna_id: input.warna_id ?? null,
    })
    .eq('id', item_id)
    .eq('tenant_id', TENANT_ID);

  if (error) throw new Error(error.message);
}
