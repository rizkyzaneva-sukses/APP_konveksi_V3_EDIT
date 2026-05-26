'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

const TENANT_ID = 'STX-001';

export interface OverheadPeriod {
  id: string;
  label: string;
  tanggal_mulai: string;
  tanggal_akhir: string;
  is_active: boolean;
}

export interface OverheadRateInfo {
  period: OverheadPeriod | null;
  total_overhead: number;
  total_qty_shipped: number;
  overhead_rate: number;
}

export async function getActivePeriod(): Promise<OverheadPeriod | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('overhead_period')
    .select('id, label, tanggal_mulai, tanggal_akhir, is_active')
    .eq('tenant_id', TENANT_ID)
    .eq('is_active', true)
    .single();

  if (error) {
    console.error('getActivePeriod:', error.message);
    return null;
  }
  return data as OverheadPeriod;
}

export async function getOverheadRateInfo(): Promise<OverheadRateInfo> {
  const period = await getActivePeriod();

  if (!period) {
    return {
      period: null,
      total_overhead: 0,
      total_qty_shipped: 0,
      overhead_rate: 0,
    };
  }

  const supabase = await createClient();

  // Total Overhead (buku_kas: tipe='keluar' + komponen_id IS NOT NULL)
  const { data: overheadData, error: ohError } = await supabase
    .from('buku_kas')
    .select('nominal')
    .eq('tenant_id', TENANT_ID)
    .eq('tipe', 'keluar')
    .not('komponen_id', 'is', null)
    .gte('tanggal', period.tanggal_mulai)
    .lte('tanggal', period.tanggal_akhir);

  if (ohError) { console.error('getOverheadRateInfo overhead:', ohError.message); }
  const total_overhead = (overheadData ?? []).reduce(
    (sum: number, j: any) => sum + Number(j.nominal),
    0
  );

  // Total Qty Shipped
  const { data: sjData, error: sjError } = await supabase
    .from('surat_jalan')
    .select('id, tanggal, surat_jalan_item(qty_kirim)')
    .eq('tenant_id', TENANT_ID)
    .gte('tanggal', period.tanggal_mulai)
    .lte('tanggal', period.tanggal_akhir);

  if (sjError) { console.error('getOverheadRateInfo sj:', sjError.message); }

  const total_qty_shipped = (sjData ?? []).reduce((sum: number, sj: any) => {
    const sjItemsSum = (sj.surat_jalan_item ?? []).reduce(
      (itemSum: number, sji: any) => itemSum + Number(sji.qty_kirim),
      0
    );
    return sum + sjItemsSum;
  }, 0);

  const overhead_rate = total_qty_shipped > 0 ? total_overhead / total_qty_shipped : 0;

  return {
    period,
    total_overhead,
    total_qty_shipped,
    overhead_rate,
  };
}

export async function getQtyShippedPerPO(
  tanggal_mulai: string,
  tanggal_akhir: string
): Promise<Record<string, number>> {
  const supabase = await createClient();

  const { data: sjData, error: sjError } = await supabase
    .from('surat_jalan')
    .select(`
      id, tanggal,
      surat_jalan_item (
        qty_kirim,
        bundle ( po_id )
      )
    `)
    .eq('tenant_id', TENANT_ID)
    .gte('tanggal', tanggal_mulai)
    .lte('tanggal', tanggal_akhir);

  if (sjError) throw new Error(sjError.message);

  const resultMap: Record<string, number> = {};

  (sjData ?? []).forEach((sj: any) => {
    (sj.surat_jalan_item ?? []).forEach((sji: any) => {
      const po_id = sji.bundle?.po_id;
      if (po_id) {
        resultMap[po_id] = (resultMap[po_id] || 0) + Number(sji.qty_kirim);
      }
    });
  });

  return resultMap;
}

export async function getOverheadPerPO(
  po_id: string,
  tanggal_mulai: string,
  tanggal_akhir: string
): Promise<number> {
  const rateInfo = await getOverheadRateInfo();
  const qtyMap   = await getQtyShippedPerPO(tanggal_mulai, tanggal_akhir);
  return rateInfo.overhead_rate * (qtyMap[po_id] ?? 0);
}

export async function upsertOverheadPeriod(input: {
  label: string;
  tanggal_mulai: string;
  tanggal_akhir: string;
}): Promise<void> {
  const supabase = await createClient();

  // Deactivate existing
  const { error: deactivateError } = await supabase
    .from('overhead_period')
    .update({ is_active: false })
    .eq('tenant_id', TENANT_ID)
    .eq('is_active', true);

  if (deactivateError) throw new Error(deactivateError.message);

  // Insert new active period
  const { error: insertError } = await supabase
    .from('overhead_period')
    .insert({
      tenant_id: TENANT_ID,
      label: input.label,
      tanggal_mulai: input.tanggal_mulai,
      tanggal_akhir: input.tanggal_akhir,
      is_active: true,
    });

  if (insertError) throw new Error(insertError.message);

  revalidatePath('/app/keuangan/laporan-po');
  revalidatePath('/app/keuangan/overhead-setting');
}
