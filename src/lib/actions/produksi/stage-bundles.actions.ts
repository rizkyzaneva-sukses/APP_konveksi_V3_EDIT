'use server';

import { createClient } from '@/lib/supabase/server';
import { getCurrentUserProfile } from '@/lib/auth/permissions';
import { TAHAP_ORDER as STAGE_ORDER, type TahapKey } from '@/modules/produksi/constants/tahap';

const TENANT_ID = 'STX-001';

export interface AntrianBundleItem {
  id: string;
  barcode: string;
  status_tahap: any;
  no_po: string;
  klien_nama: string;
  warna: string;
  size: string;
  qty_per_bundle: number;
  model_nama: string;
  status: 'menunggu' | 'sedang_proses';
}

export interface SelesaiBundleItem extends Omit<AntrianBundleItem, 'status'> {
  karyawan_id: string;
  karyawan_nama: string;
  waktu_selesai: string;
}

/**
 * Mengambil antrian bundle per tahap produksi.
 */
export async function getAntrianPerTahap(tahap: TahapKey, page: number, pageSize: number): Promise<{ data: AntrianBundleItem[], total: number }> {
  const profile = await getCurrentUserProfile();
  if (!profile) throw new Error('Unauthorized');

  const supabase = await createClient();
  const offset = (page - 1) * pageSize;

  const selectClause = `
    id, barcode, status_tahap,
    po:po_id(no_po, klien:klien_id(nama)),
    po_item:po_item_id(
      warna, size, qty_per_bundle,
      produk:produk_id(model:model_id(nama))
    )
  `;

  let query = supabase
    .from('bundle')
    .select(selectClause, { count: 'exact' })
    .eq('tenant_id', TENANT_ID);

  const stageIndex = STAGE_ORDER.indexOf(tahap);
  if (stageIndex === -1) throw new Error(`Tahap ${tahap} tidak valid`);

  if (tahap === 'cutting') {
    query = query.not('status_tahap', 'cs', JSON.stringify({ cutting: { status: 'selesai' } }));
  } else {
    query = query
      .contains('status_tahap', { cutting: { status: 'selesai' } })
      .not('status_tahap', 'cs', JSON.stringify({ [tahap]: { status: 'selesai' } }));
  }

  const { data, count, error } = await query
    .range(offset, offset + pageSize - 1)
    .order('created_at', { ascending: true });

  if (error) { console.error(`getAntrianForStage ${tahap}:`, error.message); return { data: [], total: 0 }; }

  let mappedData: AntrianBundleItem[] = (data as any[]).map(item => {
    const stageInfo = item.status_tahap?.[tahap];
    const status: 'menunggu' | 'sedang_proses' = (stageInfo?.status === 'terima') ? 'sedang_proses' : 'menunggu';

    return {
      id: item.id,
      barcode: item.barcode,
      status_tahap: item.status_tahap,
      no_po: item.po?.no_po ?? '-',
      klien_nama: item.po?.klien?.nama ?? '-',
      warna: item.po_item?.warna ?? '-',
      size: item.po_item?.size ?? '-',
      qty_per_bundle: item.po_item?.qty_per_bundle ?? 0,
      model_nama: item.po_item?.produk?.model?.nama ?? '-',
      status
    };
  });

  if (tahap !== 'cutting') {
    const prevStage = STAGE_ORDER[stageIndex - 1];
    mappedData = mappedData.filter(item => {
      const prevStatus = item.status_tahap?.[prevStage]?.status;
      return prevStatus === 'terima' || prevStatus === 'selesai';
    });
  }

  return { data: mappedData, total: count || 0 };
}

/**
 * Mengambil daftar bundle yang sudah selesai di tahap tertentu namun belum lanjut ke tahap berikutnya.
 */
export async function getSelesaiPerTahap(tahap: TahapKey, page: number, pageSize: number): Promise<{ data: SelesaiBundleItem[], total: number }> {
  const profile = await getCurrentUserProfile();
  if (!profile) throw new Error('Unauthorized');

  const supabase = await createClient();
  const offset = (page - 1) * pageSize;

  const selectClause = `
    id, barcode, status_tahap,
    po:po_id(no_po, klien:klien_id(nama)),
    po_item:po_item_id(
      warna, size, qty_per_bundle,
      produk:produk_id(model:model_id(nama))
    )
  `;

  let query = supabase
    .from('bundle')
    .select(selectClause, { count: 'exact' })
    .eq('tenant_id', TENANT_ID);

  const stageIndex = STAGE_ORDER.indexOf(tahap);
  if (stageIndex === -1) throw new Error(`Tahap ${tahap} tidak valid`);

  const nextStage = STAGE_ORDER[stageIndex + 1];

  query = query.contains('status_tahap', { [tahap]: { status: 'selesai' } });

  if (nextStage) {
    query = query
      .not('status_tahap', 'cs', JSON.stringify({ [nextStage]: { status: 'terima' } }))
      .not('status_tahap', 'cs', JSON.stringify({ [nextStage]: { status: 'selesai' } }));
  }

  const { data, count, error } = await query
    .range(offset, offset + pageSize - 1)
    .order('created_at', { ascending: false });

  if (error) { console.error(`getSelesaiPerTahap ${tahap}:`, error.message); return { data: [], total: 0 }; }

  // Ambil list karyawan_id untuk join manual (Supabase tidak support join via JSONB field secara langsung)
  const karyawanIds = Array.from(new Set((data as any[]).map(item => item.status_tahap?.[tahap]?.karyawan_id).filter(Boolean)));
  
  let karyawanMap: Record<string, string> = {};
  if (karyawanIds.length > 0) {
    const { data: kData } = await supabase.from('karyawan').select('id, nama').in('id', karyawanIds);
    kData?.forEach(k => karyawanMap[k.id] = k.nama);
  }

  const mappedData: SelesaiBundleItem[] = (data as any[]).map(item => {
    const stageInfo = item.status_tahap?.[tahap];
    
    return {
      id: item.id,
      barcode: item.barcode,
      status_tahap: item.status_tahap,
      no_po: item.po?.no_po ?? '-',
      klien_nama: item.po?.klien?.nama ?? '-',
      warna: item.po_item?.warna ?? '-',
      size: item.po_item?.size ?? '-',
      qty_per_bundle: item.po_item?.qty_per_bundle ?? 0,
      model_nama: item.po_item?.produk?.model?.nama ?? '-',
      karyawan_id: stageInfo?.karyawan_id ?? '-',
      karyawan_nama: karyawanMap[stageInfo?.karyawan_id] ?? '-',
      waktu_selesai: stageInfo?.waktu_selesai ?? '-'
    };
  });

  return { data: mappedData, total: count || 0 };
}
