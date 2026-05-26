'use server';

import { createClient } from '@/lib/supabase/server';
import { getCurrentUserProfile } from '@/lib/auth/permissions';

const TENANT_ID = 'STX-001';

export type ComputedPoStatus = 'draft' | 'belum_diproses' | 'sedang_diproses' | 'selesai' | 'dibatalkan';

export interface PoWithComputedStatus {
  id: string;
  no_po: string;
  klien_id: string;
  status: string;
  tanggal_order: string;
  tanggal_target: string;
  catatan: string | null;
  tenant_id: string;
  created_at: string;
  klien: { nama: string } | null;
  total_scan: number;
  total_qty: number;
  total_bundle: number;
  jumlah_artikel: number;
  computedStatus: ComputedPoStatus;
}

interface RawPoListItem {
  id: string;
  no_po: string;
  klien_id: string;
  status: string;
  tanggal_order: string;
  tanggal_target: string;
  catatan: string | null;
  tenant_id: string;
  created_at: string;
  klien: { nama: string } | null;
  bundle: { scan_log: { id: string }[] }[];
  po_item: { qty_order: number }[];
}

// 1. getPoList()
export async function getPoList(): Promise<PoWithComputedStatus[]> {
  const profile = await getCurrentUserProfile();
  if (!profile) throw new Error('Unauthorized');

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('po')
    .select(`
      *,
      klien:klien_id(nama),
      bundle(
        scan_log(id)
      ),
      po_item(qty_order)
    `)
    .eq('tenant_id', TENANT_ID)
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);

  return (data as unknown as RawPoListItem[]).map((po) => {
    let total_scan = 0;
    if (po.bundle && Array.isArray(po.bundle)) {
      po.bundle.forEach((b) => {
        if (b.scan_log && Array.isArray(b.scan_log)) {
          total_scan += b.scan_log.length;
        }
      });
    }

    let computedStatus: ComputedPoStatus = 'draft';
    if (po.status === 'draft') computedStatus = 'draft';
    else if (po.status === 'selesai') computedStatus = 'selesai';
    else if (po.status === 'dibatalkan') computedStatus = 'dibatalkan';
    else if (po.status === 'aktif' && total_scan === 0) computedStatus = 'belum_diproses';
    else if (po.status === 'aktif' && total_scan > 0) computedStatus = 'sedang_diproses';

    const jumlah_artikel = po.po_item?.length ?? 0;
    const total_qty = (po.po_item ?? []).reduce((sum, item) => sum + (item.qty_order || 0), 0);
    const total_bundle = po.bundle?.length ?? 0;

    return {
      id: po.id,
      no_po: po.no_po,
      klien_id: po.klien_id,
      status: po.status,
      tanggal_order: po.tanggal_order,
      tanggal_target: po.tanggal_target,
      catatan: po.catatan,
      tenant_id: po.tenant_id,
      created_at: po.created_at,
      klien: po.klien,
      total_scan,
      total_qty,
      total_bundle,
      jumlah_artikel,
      computedStatus,
    };
  });
}

// 2. getNextPoNumber()
export async function getNextPoNumber(): Promise<string> {
  const profile = await getCurrentUserProfile();
  if (!profile) throw new Error('Unauthorized');

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('po')
    .select('no_po')
    .eq('tenant_id', TENANT_ID)
    .order('no_po', { ascending: false })
    .limit(1);

  if (error) throw new Error(error.message);
  if (!data || data.length === 0) return 'PO-0001';

  const lastStr = data[0].no_po.replace('PO-', '');
  const lastNo = parseInt(lastStr, 10);
  if (isNaN(lastNo)) return 'PO-0001';

  return `PO-${String(lastNo + 1).padStart(4, '0')}`;
}

// 3. getKlienList()
export async function getKlienList(): Promise<{ id: string; nama: string }[]> {
  const profile = await getCurrentUserProfile();
  if (!profile) throw new Error('Unauthorized');

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('klien')
    .select('id, nama')
    .eq('tenant_id', TENANT_ID)
    .order('nama');

  if (error) throw new Error(error.message);
  return data || [];
}

// 4. getModelList()
export async function getModelList(): Promise<{ id: string; nama: string }[]> {
  const profile = await getCurrentUserProfile();
  if (!profile) throw new Error('Unauthorized');

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('model_produk')
    .select('id, nama')
    .eq('tenant_id', TENANT_ID)
    .order('nama');

  if (error) return [];
  return data || [];
}

// 5. getWarnaByModel()
export async function getWarnaByModel(modelId: string): Promise<{ id: string; nama: string; kode_hex: string | null }[]> {
  const profile = await getCurrentUserProfile();
  if (!profile) throw new Error('Unauthorized');

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('produk')
    .select('warna:warna_id(id, nama, kode_hex)')
    .eq('model_id', modelId)
    .eq('tenant_id', TENANT_ID)
    .eq('aktif', true);

  if (error) return [];

  interface WarnaItem { id: string; nama: string; kode_hex: string | null }
  const warnaMap = new Map<string, WarnaItem>();
  (data as unknown as { warna: WarnaItem | null }[]).forEach((row) => {
    if (row.warna && !warnaMap.has(row.warna.id)) {
      warnaMap.set(row.warna.id, row.warna);
    }
  });

  return Array.from(warnaMap.values()).sort((a, b) => a.nama.localeCompare(b.nama));
}

// 6. getSizeByModel()
export async function getSizeByModel(modelId: string): Promise<{ id: string; nama: string; urutan: number }[]> {
  const profile = await getCurrentUserProfile();
  if (!profile) throw new Error('Unauthorized');

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('produk')
    .select('size:size_id(id, nama, urutan)')
    .eq('model_id', modelId)
    .eq('tenant_id', TENANT_ID)
    .eq('aktif', true);

  if (error) return [];

  interface SizeItem { id: string; nama: string; urutan: number }
  const sizeMap = new Map<string, SizeItem>();
  (data as unknown as { size: SizeItem | null }[]).forEach((row) => {
    if (row.size && !sizeMap.has(row.size.id)) {
      sizeMap.set(row.size.id, row.size);
    }
  });

  return Array.from(sizeMap.values()).sort((a, b) => a.urutan - b.urutan || a.nama.localeCompare(b.nama));
}

// 7. getProdukId()
export async function getProdukId(modelId: string, warnaId: string, sizeId: string): Promise<string | null> {
  const profile = await getCurrentUserProfile();
  if (!profile) throw new Error('Unauthorized');

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('produk')
    .select('id')
    .eq('model_id', modelId)
    .eq('warna_id', warnaId)
    .eq('size_id', sizeId)
    .eq('tenant_id', TENANT_ID)
    .eq('aktif', true)
    .limit(1)
    .maybeSingle();

  if (error) return null;
  return data ? data.id : null;
}

interface RawPoDetail {
  id: string;
  no_po: string;
  tanggal_order: string;
  tanggal_target: string | null;
  status: string;
  catatan: string | null;
  klien_id: string;
  klien: { nama: string };
  po_item: {
    id: string;
    warna: string;
    size: string;
    qty_order: number;
    qty_per_bundle: number;
    produk: { model_produk: { nama: string } } | null;
    bundle: { no_urut: number }[];
  }[];
}

export type PoDetail = Omit<RawPoDetail, 'po_item'> & {
  po_item: (RawPoDetail['po_item'][number] & {
    model_nama: string;
    range: string | null;
  })[];
};

// 10. getPoDetail()
export async function getPoDetail(noPoNumber: string): Promise<PoDetail | null> {
  const profile = await getCurrentUserProfile();
  if (!profile) throw new Error('Unauthorized');

  const supabase = await createClient();
  const { data: po, error: poErr } = await supabase
    .from('po')
    .select(`
      *,
      klien:klien_id(nama),
      po_item(
        id, warna, size, qty_order, qty_per_bundle,
        produk:produk_id(model_produk:model_id(nama)),
        bundle(no_urut)
      )
    `)
    .eq('no_po', noPoNumber)
    .eq('tenant_id', TENANT_ID)
    .single();

  if (poErr || !po) throw new Error(poErr?.message || 'PO tidak ditemukan');

  const rawPo = po as unknown as RawPoDetail;

  const mappedItems = (rawPo.po_item || []).map((item) => {
    const bundles = item.bundle || [];
    let range = null;
    if (bundles.length > 0) {
      const uruts = bundles.map((b) => b.no_urut);
      if (uruts.length > 0) {
        const min = Math.min(...uruts);
        const max = Math.max(...uruts);
        range = `${String(min).padStart(3, '0')} - ${String(max).padStart(3, '0')}`;
      }
    }
    return {
      ...item,
      model_nama: item.produk?.model_produk?.nama || '-',
      range,
    };
  });

  return {
    ...po,
     po_item: mappedItems,
  };
}

/**
 * Menghapus PO jika statusnya masih 'aktif' atau 'draft' dan belum ada scan log sama sekali.
 */
export async function deletePoById(id: string): Promise<{ success: boolean; message: string }> {
  const profile = await getCurrentUserProfile();
  if (!profile) throw new Error('Unauthorized');
  
  if (profile.role !== 'owner' && profile.role !== 'admin_produksi') {
    return { success: false, message: 'Anda tidak memiliki izin untuk menghapus PO' };
  }

  const supabase = await createClient();

  // 1. Cek status dan scan_log via join
  const { data: po, error: fetchErr } = await supabase
    .from('po')
    .select(`
      status,
      bundle(id, scan_log(id))
    `)
    .eq('id', id)
    .single();

  if (fetchErr || !po) throw new Error('PO tidak ditemukan');

  // Hanya izinkan jika status aktif/draft dan 0 scan log
  if (po.status !== 'aktif' && po.status !== 'draft') {
    return { success: false, message: `Status PO ${po.status}, tidak bisa dihapus.` };
  }

  let totalLogs = 0;
  (po.bundle || []).forEach((b: any) => {
    totalLogs += (b.scan_log?.length || 0);
  });

  if (totalLogs > 0) {
    return { success: false, message: 'PO sudah memiliki aktivitas produksi (scan), tidak bisa dihapus.' };
  }

  // 2. Lakukan Deletions (Cascading manual untuk bundle jika perlu)
  // Step: Hapus bundle dulu karena tidak ada ON DELETE CASCADE di skema migrasi 002
  const bundleIds = (po.bundle || []).map((b: any) => b.id);
  if (bundleIds.length > 0) {
    await supabase.from('bundle').delete().in('id', bundleIds);
  }

  // po_item akan terhapus otomatis via CASCADE dari po
  const { error: delErr } = await supabase.from('po').delete().eq('id', id);
  if (delErr) throw new Error(`Gagal menghapus PO: ${delErr.message}`);

  return { success: true, message: 'PO berhasil dihapus' };
}
