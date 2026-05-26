'use server';

import { createClient } from '@/lib/supabase/server';
import { getSession } from '@/lib/auth/session';

const TENANT_ID = 'STX-001';

// ─── Interfaces ──────────────────────────────────────────────────────────────

export interface BenangItem {
  id              : string;
  nama            : string;
  satuan          : string;
  satuan_beli     : string | null;
  faktor_konversi : number | null;
  stok_aktual     : number;
  harga_referensi : number;
}

export interface AmbilBenangInput {
  inventory_item_id : string;
  qty               : number;         // dalam satuan pakai (pcs)
  tanggal           : string;         // YYYY-MM-DD
  keterangan        : string | null;
}

export interface RiwayatAmbilBenang {
  id              : string;
  tanggal         : string;
  item_nama       : string;
  satuan          : string;
  satuan_beli     : string | null;
  faktor_konversi : number | null;
  qty             : number;
  harga_referensi : number;
  subtotal        : number;
  keterangan      : string | null;
  created_at      : string;
}

export interface OverheadBenangInfo {
  total_biaya_benang : number;
  total_pcs_jahit    : number;
  rate_per_pcs       : number;
  record_count       : number;
}

// ─── Functions ───────────────────────────────────────────────────────────────

/**
 * Ambil semua item benang dari inventory (nama mengandung "benang")
 */
export async function getBenangItems(): Promise<BenangItem[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('inventory_item')
    .select('id, nama, satuan, satuan_beli, faktor_konversi, stok_aktual, harga_referensi')
    .eq('tenant_id', TENANT_ID)
    .ilike('nama', '%benang%')
    .order('nama');

  if (error) { console.error('getBenangItems:', error.message); return []; }

  return (data ?? []).map((d: any) => ({
    id             : d.id,
    nama           : d.nama,
    satuan         : d.satuan,
    satuan_beli    : d.satuan_beli ?? null,
    faktor_konversi: d.faktor_konversi != null ? Number(d.faktor_konversi) : null,
    stok_aktual    : Number(d.stok_aktual ?? 0),
    harga_referensi: Number(d.harga_referensi ?? 0),
  }));
}

/**
 * Catat pengambilan benang + kurangi stok via RPC
 */
export async function catatAmbilBenang(input: AmbilBenangInput): Promise<string> {
  const supabase = await createClient();

  const session = await getSession();
  const userId = session?.userId ?? null;

  const { data, error } = await supabase.rpc('catat_ambil_benang', {
    p_inventory_item_id : input.inventory_item_id,
    p_qty               : input.qty,
    p_tanggal           : input.tanggal,
    p_keterangan        : input.keterangan ?? null,
    p_user_id           : userId,
    p_tenant_id         : TENANT_ID,
  });

  if (error) throw new Error(error.message);
  return data as string;
}

/**
 * Ambil riwayat pengambilan benang
 */
export async function getRiwayatAmbilBenang(
  limit  = 100,
  offset = 0
): Promise<RiwayatAmbilBenang[]> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc('get_riwayat_ambil_benang', {
    p_tenant_id: TENANT_ID,
    p_limit    : limit,
    p_offset   : offset,
  });

  if (error) { console.error('getRiwayatAmbilBenang:', error.message); return []; }

  return (data ?? []).map((r: any) => ({
    id             : r.id,
    tanggal        : r.tanggal,
    item_nama      : r.item_nama,
    satuan         : r.satuan,
    satuan_beli    : r.satuan_beli ?? null,
    faktor_konversi: r.faktor_konversi != null ? Number(r.faktor_konversi) : null,
    qty            : Number(r.qty),
    harga_referensi: Number(r.harga_referensi),
    subtotal       : Number(r.subtotal),
    keterangan     : r.keterangan ?? null,
    created_at     : r.created_at,
  }));
}

/**
 * Hitung overhead rate benang untuk periode tertentu
 */
export async function getOverheadBenang(
  tgl_mulai?  : string,
  tgl_selesai?: string
): Promise<OverheadBenangInfo> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc('get_overhead_benang', {
    p_tenant_id   : TENANT_ID,
    p_tgl_mulai   : tgl_mulai   ?? null,
    p_tgl_selesai : tgl_selesai ?? null,
  });

  if (error) { console.error('getOverheadBenang:', error.message); return { total_biaya_benang: 0, total_pcs_jahit: 0, rate_per_pcs: 0, record_count: 0 }; }

  const r = Array.isArray(data) ? data[0] : data;
  return {
    total_biaya_benang : Number(r?.total_biaya_benang ?? 0),
    total_pcs_jahit    : Number(r?.total_pcs_jahit    ?? 0),
    rate_per_pcs       : Number(r?.rate_per_pcs       ?? 0),
    record_count       : Number(r?.record_count       ?? 0),
  };
}

// ─── Benang Serah Terima ─────────────────────────────────────────────────────

export interface BenangSerahTerimaInput {
  karyawan_id        : string;
  inventory_item_id  : string;
  qty                : number;
  tanggal            : string;   // YYYY-MM-DD
  bundle_ids         : string[]; // array of bundle UUIDs
  keterangan?        : string | null;
}

/**
 * Catat serah terima benang ke penjahit + kurangi stok inventory (atomic via RPC)
 */
export async function submitBenangSerahTerima(
  items: BenangSerahTerimaInput[]
): Promise<void> {
  const supabase = await createClient();
  const session = await getSession();
  const userId = session?.userId ?? null;

  for (const item of items) {
    const { error } = await supabase.rpc('catat_benang_serah_terima', {
      p_karyawan_id       : item.karyawan_id,
      p_inventory_item_id : item.inventory_item_id,
      p_qty               : item.qty,
      p_tanggal           : item.tanggal,
      p_bundle_ids        : item.bundle_ids,
      p_keterangan        : item.keterangan ?? null,
      p_user_id           : userId,
      p_tenant_id         : TENANT_ID,
    });
    if (error) throw new Error(`Gagal catat benang: ${error.message}`);
  }
}

/**
 * Hapus catatan ambil benang + kembalikan stok inventory
 */
export async function hapusAmbilBenang(id: string): Promise<void> {
  const supabase = await createClient();

  // Ambil data dulu untuk kembalikan stok
  const { data: rec, error: fetchErr } = await supabase
    .from('ambil_benang')
    .select('inventory_item_id, qty')
    .eq('id', id)
    .eq('tenant_id', TENANT_ID)
    .single();

  if (fetchErr || !rec) throw new Error('Record tidak ditemukan');

  // Kembalikan stok (tambah balik qty)
  const { error: stockErr } = await supabase.rpc('update_stok_item', {
    p_item_id   : rec.inventory_item_id,
    p_delta     : Number(rec.qty),      // positif = tambah balik
    p_tenant_id : TENANT_ID,
  });

  // Kalau RPC tidak ada, pakai raw increment via sql
  if (stockErr) {
    await supabase
      .from('inventory_item')
      .select('stok_aktual')
      .eq('id', rec.inventory_item_id)
      .single()
      .then(async ({ data: item }) => {
        if (item) {
          await supabase
            .from('inventory_item')
            .update({ stok_aktual: Number(item.stok_aktual) + Number(rec.qty) })
            .eq('id', rec.inventory_item_id)
            .eq('tenant_id', TENANT_ID);
        }
      });
  }

  // Delete record
  const { error: delErr } = await supabase
    .from('ambil_benang')
    .delete()
    .eq('id', id)
    .eq('tenant_id', TENANT_ID);

  if (delErr) throw new Error(delErr.message);
}
