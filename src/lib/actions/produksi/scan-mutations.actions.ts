'use server';

import { createClient } from '@/lib/supabase/server';
import { getSession } from '@/lib/auth/session';
import {
  ScanCuttingTerimaInputSchema,
  ScanSelesaiInputSchema,
  ScanTerimaGenericInputSchema,
  type ScanCuttingTerimaInput,
  type ScanSelesaiInput,
  type ScanTerimaGenericInput,
} from '@/lib/validations/scan.schemas';

const TENANT_ID = 'STX-001';

export interface StokWarning {
  item_nama: string;
  qty_kurang: number;
  sisa_stok: number;
}

export interface ScanCuttingTerimaResult {
  scan_log_id: string;
  stok_warnings: StokWarning[];
}

export interface ScanSelesaiResult {
  scan_log_id: string;
  gaji_entry_id: string | null;
  upah_nominal: number;
  is_qty_lebih: boolean;
  approval_request_id: string | null;
}

async function resolveUserId(): Promise<string> {
  const session = await getSession();
  if (!session) throw new Error('Unauthorized');
  return session.userId;
}

// 1. scanCuttingTerima
export async function scanCuttingTerima(
  input: ScanCuttingTerimaInput
): Promise<ScanCuttingTerimaResult> {
  const validated = ScanCuttingTerimaInputSchema.parse(input);
  const user_id   = await resolveUserId();
  const supabase  = await createClient();

  const p_pemakaian = validated.pemakaian.map(item => ({
    inventory_item_id: item.inventory_item_id,
    rate_per_pcs:      item.rate_per_pcs,
  }));

  const { data, error } = await supabase.rpc('scan_cutting_terima', {
    p_barcode:     validated.barcode,
    p_karyawan_id: validated.karyawan_id,
    p_qty:         validated.qty,
    p_pemakaian:   p_pemakaian,
    p_user_id:     user_id,
    p_tenant_id:   TENANT_ID,
  });

  if (error) throw new Error(error.message);

  const result = data as { scan_log_id: string; stok_warnings: StokWarning[] };
  return {
    scan_log_id:   result.scan_log_id,
    stok_warnings: result.stok_warnings ?? [],
  };
}

// 2. scanSelesai
export async function scanSelesai(
  input: ScanSelesaiInput
): Promise<ScanSelesaiResult> {
  const validated = ScanSelesaiInputSchema.parse(input);
  const user_id   = await resolveUserId();
  const supabase  = await createClient();

  const { data, error } = await supabase.rpc('scan_selesai', {
    p_barcode:       validated.barcode,
    p_tahap:         validated.tahap,
    p_karyawan_id:   validated.karyawan_id ?? null,
    p_qty:           validated.qty,
    p_catatan:       validated.catatan ?? null,
    p_alasan_qty_id: validated.alasan_qty_id ?? null,
    p_user_id:       user_id,
    p_tenant_id:     TENANT_ID,
  });

  if (error) throw new Error(error.message);

  const result = data as {
    scan_log_id:         string;
    gaji_entry_id:       string | null;
    upah_nominal:        number;
    is_qty_lebih:        boolean;
    approval_request_id: string | null;
  };

  return {
    scan_log_id:         result.scan_log_id,
    gaji_entry_id:       result.gaji_entry_id ?? null,
    upah_nominal:        result.upah_nominal ?? 0,
    is_qty_lebih:        result.is_qty_lebih ?? false,
    approval_request_id: result.approval_request_id ?? null,
  };
}

// 3. scanJahitTerima
export interface ScanJahitTerimaResult {
  scan_log_id: string;
  stok_warnings: StokWarning[];
}

export async function scanJahitTerima(input: {
  barcode: string;
  karyawan_id: string;
  qty: number;
}): Promise<ScanJahitTerimaResult> {
  const user_id  = await resolveUserId();
  const supabase = await createClient();

  const { data, error } = await supabase.rpc('scan_jahit_terima', {
    p_barcode:     input.barcode,
    p_karyawan_id: input.karyawan_id,
    p_qty:         input.qty,
    p_user_id:     user_id,
    p_tenant_id:   TENANT_ID,
  });

  if (error) throw new Error(error.message);

  const result = data as { scan_log_id: string; stok_warnings: StokWarning[] };
  return {
    scan_log_id:   result.scan_log_id,
    stok_warnings: result.stok_warnings ?? [],
  };
}

// 4. scanTerimaGeneric
export interface ScanTerimaGenericResult {
  scan_log_id: string;
}

export async function scanTerimaGeneric(
  input: ScanTerimaGenericInput
): Promise<ScanTerimaGenericResult> {
  const validated = ScanTerimaGenericInputSchema.parse(input);
  const user_id   = await resolveUserId();
  const supabase  = await createClient();

  const { data, error } = await supabase.rpc('scan_terima_generic', {
    p_barcode:     validated.barcode,
    p_tahap:       validated.tahap,
    p_karyawan_id: validated.karyawan_id,
    p_qty:         validated.qty,
    p_user_id:     user_id,
    p_tenant_id:   TENANT_ID,
  });

  if (error) throw new Error(error.message);
  const result = data as { scan_log_id: string };
  return { scan_log_id: result.scan_log_id };
}

// 5. scanLanjutTahap — 1 scan auto-tutup tahap sebelumnya + buka tahap baru
export interface ScanLanjutTahapResult {
  scan_log_id: string;
  gaji_entry_id: string | null;
  upah_nominal: number;
}

export async function scanLanjutTahap(input: {
  barcode: string;
  tahap_baru: string;
  karyawan_id: string;
  qty: number;
}): Promise<ScanLanjutTahapResult> {
  const user_id  = await resolveUserId();
  const supabase = await createClient();

  const { data, error } = await supabase.rpc('scan_lanjut_tahap', {
    p_barcode:     input.barcode,
    p_tahap_baru:  input.tahap_baru,
    p_qty:         input.qty,
    p_user_id:     user_id,
    p_karyawan_id: input.karyawan_id || null,
    p_tenant_id:   TENANT_ID,
  });

  if (error) throw new Error(error.message);

  const result = data as ScanLanjutTahapResult;
  return {
    scan_log_id:   result.scan_log_id,
    gaji_entry_id: result.gaji_entry_id ?? null,
    upah_nominal:  result.upah_nominal ?? 0,
  };
}
