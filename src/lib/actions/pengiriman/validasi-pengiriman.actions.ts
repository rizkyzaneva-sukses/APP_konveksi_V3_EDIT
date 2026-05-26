'use server';

import { createClient } from '@/lib/supabase/server';
import { getSession } from '@/lib/auth/session';
import { revalidatePath } from 'next/cache';
import bcrypt from 'bcryptjs';

const TENANT_ID = 'STX-001';
const REVALIDATE_PATH = '/app/pengiriman/validasi';

// ─── Helper ───────────────────────────────────────────────────────────────────

async function resolveUserId(): Promise<string> {
  const session = await getSession();
  if (!session) throw new Error('Unauthorized: User session not found.');
  return session.userId;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SuratJalanItemValidasi {
  surat_jalan_item_id: string;
  bundle_id: string;
  barcode: string;
  no_po: string;
  model_nama: string | null;
  warna: string;
  size: string;
  qty_kirim: number;
  qty_diterima: number | null;  // null = belum divalidasi
  harga_satuan: number;         // dari po_item.harga_satuan
}

export interface SuratJalanSiapValidasi {
  id: string;
  nomor_sj: string;
  tanggal: string;
  klien_nama: string;
  total_bundle: number;
  total_qty_kirim: number;
  status: string;
  items: SuratJalanItemValidasi[];
}

export interface ValidasiItemInput {
  surat_jalan_item_id: string;
  qty_diterima: number;
  alasan_reject_id?: string | null;  // diperlukan jika qty kurang
}

export interface ValidasiResult {
  status: string;
  has_kurang: boolean;
  has_lebih: boolean;
  approval_ids: string[];
}

// ─── 1. getSuratJalanSiapValidasi ─────────────────────────────────────────────

/**
 * Fetch semua SJ yang belum tervalidasi (status: dikirim / selisih_kurang / selisih_lebih).
 * Join ke surat_jalan_item → bundle → po_item untuk ambil harga_satuan.
 */
export async function getSuratJalanSiapValidasi(): Promise<SuratJalanSiapValidasi[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('surat_jalan')
    .select(`
      id,
      nomor_sj,
      tanggal,
      status,
      tanggal_validasi,
      klien:klien_id (nama),
      surat_jalan_item (
        id,
        qty_kirim,
        qty_diterima,
        bundle:bundle_id (
          id,
          barcode,
          po:po_id (no_po),
          po_item:po_item_id (
            hpp_estimasi,
            warna,
            size,
            produk:produk_id (
              model_produk:model_id (nama)
            )
          )
        )
      )
    `)
    .eq('tenant_id', TENANT_ID)
    .or('status.in.(dikirim,selisih_kurang,selisih_lebih),and(status.eq.final,tanggal_validasi.is.null)')
    .order('tanggal', { ascending: false });

  if (error) { console.error('getSuratJalanSiapValidasi:', error.message); return []; }

  return (data ?? []).map((sj: any) => {
    const items: SuratJalanItemValidasi[] = (sj.surat_jalan_item ?? []).map((it: any) => {
      const b = it.bundle;
      return {
        surat_jalan_item_id: it.id,
        bundle_id: b?.id ?? '',
        barcode: b?.barcode ?? '-',
        no_po: b?.po?.no_po ?? '-',
        model_nama: b?.po_item?.produk?.model_produk?.nama ?? null,
        warna: b?.po_item?.warna ?? '-',
        size: b?.po_item?.size ?? '-',
        qty_kirim: it.qty_kirim ?? 0,
        qty_diterima: it.qty_diterima ?? null,
        harga_satuan: b?.po_item?.hpp_estimasi ?? 0,
      };
    });

    const total_qty_kirim = items.reduce((s, it) => s + it.qty_kirim, 0);

    return {
      id: sj.id,
      nomor_sj: sj.nomor_sj,
      tanggal: sj.tanggal,
      status: sj.status,
      klien_nama: sj.klien?.nama ?? 'Unknown',
      total_bundle: items.length,
      total_qty_kirim,
      items,
    };
  });
}

// ─── 2. submitValidasiPengiriman ──────────────────────────────────────────────

/**
 * Submit hasil validasi (qty_diterima per item).
 * Memanggil RPC validasi_pengiriman di DB.
 * Return: { status, has_kurang, has_lebih, approval_ids }
 */
export async function submitValidasiPengiriman(
  surat_jalan_id: string,
  items: ValidasiItemInput[],
  catatan: string,
): Promise<ValidasiResult> {
  const userId = await resolveUserId();
  const supabase = await createClient();

  const { data, error } = await supabase.rpc('validasi_pengiriman', {
    p_surat_jalan_id: surat_jalan_id,
    p_items: items,
    p_catatan: catatan || null,
    p_user_id: userId,
    p_tenant_id: TENANT_ID,
  });

  if (error) throw new Error(`Gagal submit validasi: ${error.message}`);

  revalidatePath(REVALIDATE_PATH);
  revalidatePath('/app/pengiriman/riwayat');

  return data as ValidasiResult;
}

// ─── 3. approveQtyLebihPengiriman ─────────────────────────────────────────────

/**
 * Verifikasi PIN owner via bcrypt, kemudian panggil RPC approve_qty_lebih_pengiriman.
 * Pola identik dengan resolveQtyApproval di qty-approval.actions.ts.
 */
export async function approveQtyLebihPengiriman(
  approval_id: string,
  pin: string,
  action: 'approved' | 'rejected' = 'approved',
  catatan?: string,
): Promise<{ status: string }> {
  const userId = await resolveUserId();
  const supabase = await createClient();

  // 1. Fetch approval_pin dari user_profile
  const { data: profile, error: profileErr } = await supabase
    .from('user_profile')
    .select('approval_pin')
    .eq('id', userId)
    .maybeSingle();

  if (profileErr) throw new Error(profileErr.message);
  if (!profile?.approval_pin) {
    throw new Error('PIN belum diset. Setup PIN terlebih dahulu di Settings.');
  }

  // 2. Verifikasi PIN dengan bcrypt
  const isPinValid = await bcrypt.compare(pin, profile.approval_pin);
  if (!isPinValid) throw new Error('PIN tidak valid');

  // 3. Jalankan RPC approve_qty_lebih_pengiriman
  const { data, error } = await supabase.rpc('approve_qty_lebih_pengiriman', {
    p_approval_id: approval_id,
    p_catatan: action === 'approved' ? (catatan ?? '') : 'Ditolak',
    p_user_id: userId,
    p_tenant_id: TENANT_ID,
  });

  if (error) throw new Error(`Gagal approve: ${error.message}`);

  revalidatePath(REVALIDATE_PATH);

  return data as { status: string };
}
