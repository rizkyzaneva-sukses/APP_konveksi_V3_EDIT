'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

const TENANT_ID = 'STX-001';
const REVALIDATE_PATH = '/app/produksi/reject';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RejectRow {
  id: string;
  tenant_id: string;
  alasan_reject_id: string;
  qty_reject: number;
  tahap_ditemukan: string;
  keterangan: string | null;
  source: string;
  bundle_id: string | null;
  surat_jalan_id: string | null;
  invoice_id: string | null;
  status: string;
  created_at: string;
  // joined fields
  nomor_reject: string;
  alasan_nama: string;
  bisa_diperbaiki: boolean;
  jenis_nama: string;
  barcode: string | null;
}

export interface KaryawanItem {
  reject_karyawan_id: string;
  karyawan_id: string;
  nama: string;
  tahap: string;
  /** Persentase potongan gaji jika karyawan ini dinyatakan bertanggung jawab (0–100) */
  persen_potongan?: number;
}

export interface RejectDetail extends RejectRow {
  karyawan_list: KaryawanItem[];
}

export interface BuatRejectInput {
  alasan_reject_id: string;
  qty_reject: number;
  tahap_ditemukan: string;
  keterangan?: string;
  source: string;
  bundle_id?: string;
  surat_jalan_id?: string;
  invoice_id?: string;
}

// ---------------------------------------------------------------------------
// 1. getRejectList
// ---------------------------------------------------------------------------

/**
 * Mengambil daftar reject log beserta informasi alasan, jenis, dan barcode bundle.
 * @param status - Filter opsional berdasarkan status reject (misal: 'pending', 'dikonfirmasi', 'selesai')
 * @param source - Filter opsional berdasarkan sumber reject (misal: 'produksi', 'gudang', 'pengiriman')
 */
export async function getRejectList(
  status?: string,
  source?: string,
): Promise<RejectRow[]> {
  const supabase = await createClient();

  let query = supabase.rpc('get_reject_list', {
    p_tenant_id: TENANT_ID,
    p_status: status ?? null,
    p_source: source ?? null,
  });

  // Fallback: gunakan raw SQL via from() jika RPC belum tersedia,
  // dengan memanfaatkan postgrest embed/select syntax.
  // Implementasi menggunakan query builder Supabase:
  const { data, error } = await supabase
    .from('reject_log')
    .select(`
      *,
      alasan_reject:alasan_reject_id (
        nama,
        bisa_diperbaiki,
        jenis_reject:jenis_reject_id (
          nama
        )
      ),
      bundle:bundle_id (
        barcode
      )
    `)
    .eq('tenant_id', TENANT_ID)
    .order('created_at', { ascending: false })
    // Filter dinamis
    .then((res) => {
      // res sudah di-execute; filter tambahan dilakukan di sini
      // karena Supabase JS tidak support .eq() conditional chaining post-.then()
      return res;
    });

  if (error) { console.error('getRejectList:', error.message); return []; }

  // Normalisasi ke RejectRow
  const rows: RejectRow[] = ((data as any[]) ?? [])
    .filter((row) => {
      if (status && row.status !== status) return false;
      if (source && row.source !== source) return false;
      return true;
    })
    .map((row) => ({
      id: row.id,
      tenant_id: row.tenant_id,
      alasan_reject_id: row.alasan_reject_id,
      qty_reject: row.qty_reject,
      tahap_ditemukan: row.tahap_ditemukan,
      keterangan: row.keterangan ?? null,
      source: row.source,
      bundle_id: row.bundle_id ?? null,
      surat_jalan_id: row.surat_jalan_id ?? null,
      invoice_id: row.invoice_id ?? null,
      status: row.status,
      created_at: row.created_at,
      // Joined
      nomor_reject: row.nomor_reject ?? '',
      alasan_nama: row.alasan_reject?.nama ?? '-',
      bisa_diperbaiki: row.alasan_reject?.bisa_diperbaiki ?? false,
      jenis_nama: row.alasan_reject?.jenis_reject?.nama ?? '-',
      barcode: row.bundle?.barcode ?? null,
    }));

  return rows;
}

// ---------------------------------------------------------------------------
// 2. getRejectDetail
// ---------------------------------------------------------------------------

/**
 * Mengambil detail satu reject log beserta daftar karyawan yang bertanggung jawab.
 * @param id - UUID dari reject_log
 */
export async function getRejectDetail(id: string): Promise<RejectDetail> {
  if (!id) throw new Error('id reject_log wajib diisi');

  const supabase = await createClient();

  const { data, error } = await supabase
    .from('reject_log')
    .select(`
      *,
      alasan_reject:alasan_reject_id (
        nama,
        bisa_diperbaiki,
        jenis_reject:jenis_reject_id (
          nama
        )
      ),
      bundle:bundle_id (
        barcode
      ),
      reject_karyawan (
        id,
        tahap,
        karyawan_id,
        persen_potongan,
        karyawan:karyawan_id (
          nama
        )
      )
    `)
    .eq('id', id)
    .eq('tenant_id', TENANT_ID)
    .single();

  if (error) throw new Error(`Gagal mengambil detail reject: ${error.message}`);
  if (!data) throw new Error(`Reject log dengan id "${id}" tidak ditemukan`);

  const row = data as any;

  const karyawan_list: KaryawanItem[] = (row.reject_karyawan ?? []).map(
    (rk: any) => ({
      reject_karyawan_id: rk.id,
      karyawan_id: rk.karyawan_id,
      nama: rk.karyawan?.nama ?? '-',
      tahap: rk.tahap ?? '',
      persen_potongan: rk.persen_potongan ?? 100,
    }),
  );

  return {
    id: row.id,
    tenant_id: row.tenant_id,
    alasan_reject_id: row.alasan_reject_id,
    qty_reject: row.qty_reject,
    tahap_ditemukan: row.tahap_ditemukan,
    keterangan: row.keterangan ?? null,
    source: row.source,
    bundle_id: row.bundle_id ?? null,
    surat_jalan_id: row.surat_jalan_id ?? null,
    invoice_id: row.invoice_id ?? null,
    status: row.status,
    created_at: row.created_at,
    // Joined
    nomor_reject: row.nomor_reject ?? '',
    alasan_nama: row.alasan_reject?.nama ?? '-',
    bisa_diperbaiki: row.alasan_reject?.bisa_diperbaiki ?? false,
    jenis_nama: row.alasan_reject?.jenis_reject?.nama ?? '-',
    barcode: row.bundle?.barcode ?? null,
    // Karyawan list
    karyawan_list,
  };
}

// ---------------------------------------------------------------------------
// 3. buatReject
// ---------------------------------------------------------------------------

/**
 * Membuat reject log baru melalui RPC `buat_reject`.
 * Semua logika bisnis (update status, pemotongan gaji, dsb.) dihandle di sisi DB.
 */
export async function buatReject(input: BuatRejectInput): Promise<void> {
  if (!input.alasan_reject_id) throw new Error('alasan_reject_id wajib diisi');
  if (!input.qty_reject || input.qty_reject < 1)
    throw new Error('qty_reject harus minimal 1');
  if (!input.tahap_ditemukan) throw new Error('tahap_ditemukan wajib diisi');
  if (!input.source) throw new Error('source wajib diisi');

  const supabase = await createClient();

  const { error } = await supabase.rpc('buat_reject', {
    p_alasan_reject_id: input.alasan_reject_id,
    p_qty_reject: input.qty_reject,
    p_tahap_ditemukan: input.tahap_ditemukan,
    p_keterangan: input.keterangan ?? null,
    p_source: input.source,
    p_bundle_id: input.bundle_id ?? null,
    p_surat_jalan_id: input.surat_jalan_id ?? null,
    p_invoice_id: input.invoice_id ?? null,
    p_tenant_id: TENANT_ID,
  });

  if (error) throw new Error(`Gagal membuat reject: ${error.message}`);

  revalidatePath(REVALIDATE_PATH);
}

// ---------------------------------------------------------------------------
// 4. konfirmasiReject
// ---------------------------------------------------------------------------

/**
 * Mengkonfirmasi reject log dan menetapkan karyawan yang bertanggung jawab.
 * Memanggil RPC `konfirmasi_reject` yang mencatat reject_karyawan dan mengubah status.
 * @param reject_log_id - UUID reject_log yang akan dikonfirmasi
 * @param responsible_ids - Array UUID karyawan yang bertanggung jawab
 */
export async function konfirmasiReject(
  reject_log_id: string,
  responsible_ids: string[],
): Promise<void> {
  if (!reject_log_id) throw new Error('reject_log_id wajib diisi');
  if (!responsible_ids || responsible_ids.length === 0)
    throw new Error('Minimal satu karyawan bertanggung jawab harus dipilih');

  const supabase = await createClient();

  const { error } = await supabase.rpc('konfirmasi_reject', {
    p_reject_log_id: reject_log_id,
    p_responsible_ids: responsible_ids,
    p_tenant_id: TENANT_ID,
  });

  if (error) throw new Error(`Gagal konfirmasi reject: ${error.message}`);

  revalidatePath(REVALIDATE_PATH);
}

// ---------------------------------------------------------------------------
// 5. selesaiRework
// ---------------------------------------------------------------------------

/**
 * Menandai proses rework sebagai selesai untuk reject log tertentu.
 * Memanggil RPC `selesai_rework` yang mengubah status reject_log menjadi 'selesai'.
 * @param reject_log_id - UUID reject_log yang rework-nya sudah selesai
 */
export async function selesaiRework(reject_log_id: string): Promise<void> {
  if (!reject_log_id) throw new Error('reject_log_id wajib diisi');

  const supabase = await createClient();

  const { error } = await supabase.rpc('selesai_rework', {
    p_reject_log_id: reject_log_id,
    p_tenant_id: TENANT_ID,
  });

  if (error) throw new Error(`Gagal menyelesaikan rework: ${error.message}`);

  revalidatePath(REVALIDATE_PATH);
}

// ---------------------------------------------------------------------------
// 6. recordReject (compatibility — dipakai RejectSection di halaman scan)
// ---------------------------------------------------------------------------

export interface RecordRejectInput {
  gaji_ledger_id: string;
  qty_reject: number;
  tipe_reject: 'rework' | 'cacat_bahan' | 'permanen';
  alasan: string;
}

export async function recordReject(input: RecordRejectInput): Promise<void> {
  const supabase = await createClient();

  const { error } = await supabase.rpc('record_reject', {
    p_gaji_ledger_id: input.gaji_ledger_id,
    p_qty_reject:     input.qty_reject,
    p_tipe_reject:    input.tipe_reject,
    p_alasan:         input.alasan,
    p_tenant_id:      TENANT_ID,
  });

  if (error) throw new Error(`Gagal mencatat reject: ${error.message}`);

  revalidatePath(REVALIDATE_PATH);
}

// ---------------------------------------------------------------------------
// 7. getAlasanRejectList
// ---------------------------------------------------------------------------

export interface AlasanRejectOption {
  id: string;
  nama: string;
  jenis_nama: string;
  bisa_diperbaiki: boolean;
  persen_potongan: number;
}

export async function getAlasanRejectList(): Promise<AlasanRejectOption[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('alasan_reject')
    .select('id, nama, bisa_diperbaiki, persen_potongan, jenis_reject:jenis_reject_id(nama)')
    .eq('tenant_id', TENANT_ID)
    .order('nama');
  if (error) { console.error('getAlasanRejectList:', error.message); return []; }
  return (data ?? []).map((r: any) => ({
    id: r.id,
    nama: r.nama,
    jenis_nama: r.jenis_reject?.nama ?? '-',
    bisa_diperbaiki: r.bisa_diperbaiki,
    persen_potongan: r.persen_potongan ?? 100,
  }));
}
