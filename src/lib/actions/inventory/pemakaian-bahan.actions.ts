'use server';

import { createClient } from '@/lib/supabase/server';

const TENANT_ID = 'STX-001';

// ─── Interfaces ──────────────────────────────────────────────────────────────

export interface PemakaianBahanRow {
  id              : string;
  tanggal         : string;       // created_at formatted
  nama_bahan      : string;       // dari inventory_item.nama
  satuan          : string;       // dari inventory_item.satuan
  qty_pakai       : number;
  rate_per_pcs    : number | null; // yard/meter per pcs (consumption rate, bukan harga)
  harga_per_unit  : number;        // harga_referensi per unit dari inventory_item
  total_biaya     : number;        // qty_pakai × harga_per_unit
  no_po           : string;        // dari po.no_po
  warna           : string;        // dari po_item.warna
  size            : string;        // dari po_item.size
}

export interface PemakaianBahanSummary {
  rows          : PemakaianBahanRow[];
  total_qty     : number;   // SUM semua qty_pakai
  total_biaya   : number;   // SUM semua total_biaya
  jumlah_bahan  : number;   // COUNT DISTINCT inventory_item_id
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getStartDate(bulan: string, tahun: string): string {
  return `${tahun}-${bulan.padStart(2, '0')}-01`;
}

function getEndDate(bulan: string, tahun: string): string {
  const mm = bulan.padStart(2, '0');
  const lastDay = new Date(Number(tahun), Number(mm), 0).getDate();
  return `${tahun}-${mm}-${String(lastDay).padStart(2, '0')}`;
}

// ─── Main Function ───────────────────────────────────────────────────────────

export async function getPemakaianBahan(
  bulan_dari  : string,
  tahun_dari  : string,
  bulan_sampai: string,
  tahun_sampai: string,
): Promise<PemakaianBahanSummary> {
  const supabase = await createClient();

  const start = getStartDate(bulan_dari, tahun_dari);
  const end = getEndDate(bulan_sampai, tahun_sampai);

  // Fetch dari pemakaian_bahan — sertakan harga_referensi dari inventory_item
  // sebagai fallback harga ketika tidak ada inventory_batch
  const { data, error } = await supabase
    .from('pemakaian_bahan')
    .select(`
      id, qty_pakai, rate_per_pcs, harga_pakai, created_at, inventory_item_id,
      inventory_item:inventory_item_id(nama, satuan, harga_referensi),
      inventory_batch:inventory_batch_id(harga_satuan),
      po_item:po_item_id(warna, size, po:po_id(no_po))
    `)
    .eq('tenant_id', TENANT_ID)
    .gte('created_at', `${start}T00:00:00`)
    .lte('created_at', `${end}T23:59:59`)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('getPemakaianBahan:', error.message);
    return { rows: [], total_qty: 0, total_biaya: 0, jumlah_bahan: 0 };
  }

  // Hitung di JS
  let total_qty = 0;
  let total_biaya = 0;
  const itemIds = new Set<string>();

  const rows: PemakaianBahanRow[] = (data || []).map((row: any) => {
    const qty = Number(row.qty_pakai) || 0;

    // Tentukan harga per unit:
    // 1. Prioritas: harga_satuan dari inventory_batch (FIFO price aktual)
    // 2. Fallback: harga_referensi dari inventory_item (harga referensi manual)
    const inventoryItem  = row.inventory_item  || {};
    const inventoryBatch = row.inventory_batch || {};
    const harga_per_unit = Number(inventoryBatch.harga_satuan) > 0
      ? Number(inventoryBatch.harga_satuan)
      : Number(inventoryItem.harga_referensi) || 0;

    const total = qty * harga_per_unit;

    total_qty   += qty;
    total_biaya += total;
    if (row.inventory_item_id) {
      itemIds.add(row.inventory_item_id);
    }

    // Ekstraksi join data dengan aman
    const poItem = row.po_item || {};
    const po     = poItem.po  || {};

    return {
      id            : row.id,
      tanggal       : row.created_at,
      nama_bahan    : inventoryItem.nama  || 'Tidak diketahui',
      satuan        : inventoryItem.satuan || '-',
      qty_pakai     : qty,
      rate_per_pcs  : row.rate_per_pcs !== null ? Number(row.rate_per_pcs) : null,
      harga_per_unit,
      total_biaya   : total,
      no_po         : po.no_po      || '-',
      warna         : poItem.warna  || '-',
      size          : poItem.size   || '-',
    };
  });

  return {
    rows,
    total_qty,
    total_biaya,
    jumlah_bahan: itemIds.size,
  };
}
