'use server';

import { createClient } from '@/lib/supabase/server';

const TENANT_ID = 'STX-001';

export interface InventoryItem {
  id: string;
  nama: string;
  satuan: string;
  stokAktual: number;
}

export async function getInventoryItems(): Promise<InventoryItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('inventory_item')
    .select('id, nama, satuan, stok_aktual')
    .eq('tenant_id', TENANT_ID)
    .order('nama');

  if (error) { console.error('getInventoryItems:', error.message); return []; }

  return (data || []).map(item => ({
    id: item.id,
    nama: item.nama,
    satuan: item.satuan,
    stokAktual: Number(item.stok_aktual || 0),
  }));
}

export interface HargaReferensiItem {
  id              : string;
  nama            : string;
  satuan          : string;
  stok_aktual     : number;
  harga_referensi : number;
  satuan_beli     : string | null;
  faktor_konversi : number | null;
}

export async function getHargaReferensiItems(): Promise<HargaReferensiItem[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('inventory_item')
    .select('id, nama, satuan, stok_aktual, harga_referensi, satuan_beli, faktor_konversi')
    .eq('tenant_id', TENANT_ID)
    .order('nama');

  if (error) { console.error('getHargaReferensiItems:', error.message); return []; }

  return (data ?? []).map((d: any) => ({
    id             : d.id,
    nama           : d.nama,
    satuan         : d.satuan,
    stok_aktual    : Number(d.stok_aktual ?? 0),
    harga_referensi: Number(d.harga_referensi ?? 0),
    satuan_beli    : d.satuan_beli ?? null,
    faktor_konversi: d.faktor_konversi != null ? Number(d.faktor_konversi) : null,
  }));
}

export async function updateHargaReferensi(item_id: string, harga: number): Promise<void> {
  const supabase = await createClient();

  // Saat edit harga manual (via pensil), konversi satuan di-clear agar tidak inkonsisten.
  // Jika user ingin pertahankan konversi, gunakan modal konversi (⚙).
  const { error } = await supabase
    .from('inventory_item')
    .update({
      harga_referensi : harga,
      satuan_beli     : null,
      faktor_konversi : null,
    })
    .eq('id', item_id)
    .eq('tenant_id', TENANT_ID);

  if (error) throw new Error(error.message);
}

export async function updateKonversiSatuan(
  item_id         : string,
  satuan_beli     : string | null,
  faktor_konversi : number | null,
  harga_referensi : number,
): Promise<void> {
  const supabase = await createClient();

  const { error } = await supabase
    .from('inventory_item')
    .update({
      satuan_beli     : satuan_beli ?? null,
      faktor_konversi : faktor_konversi ?? null,
      harga_referensi,
    })
    .eq('id', item_id)
    .eq('tenant_id', TENANT_ID);

  if (error) throw new Error(error.message);
}
