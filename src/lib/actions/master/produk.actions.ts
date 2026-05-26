'use server';

import { createClient } from '@/lib/supabase/server';
import { getCurrentUserProfile, permissions } from '@/lib/auth/permissions';
import { ProdukSchema, type ProdukInput } from '@/lib/validations/master.schemas';

const TENANT_ID = 'STX-001';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

async function requireOwner() {
  const profile = await getCurrentUserProfile();
  if (!profile || !permissions.canEditMasterData(profile.role)) {
    throw new Error('Unauthorized: Hanya owner yang dapat mengelola produk.');
  }
  return profile;
}

async function requireOwnerOrKeuangan() {
  const profile = await getCurrentUserProfile();
  if (!profile || !permissions.canInputJurnal(profile.role)) {
    throw new Error('Unauthorized: Perlu owner atau admin keuangan.');
  }
  return profile;
}

/** Generate SKU internal: LYX-{3 huruf model}-{3 huruf warna}-{size} */
function generateSkuInternal(modelNama: string, warnaNama: string, sizeNama: string): string {
  const model = modelNama.replace(/\s+/g, '').substring(0, 3).toUpperCase();
  const warna = warnaNama.replace(/\s+/g, '').substring(0, 3).toUpperCase();
  const size = sizeNama.toUpperCase();
  return `LYX-${model}-${warna}-${size}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Referensi lookup
// ─────────────────────────────────────────────────────────────────────────────

export async function getKategoriProdukForProduk() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('kategori_produk')
    .select('id, nama')
    .eq('tenant_id', TENANT_ID)
    .order('nama');
  if (error) { console.error('getKategoriProdukForProduk:', error.message); return [] as { id: string; nama: string }[]; }
  return (data ?? []) as { id: string; nama: string }[];
}

export async function getModelProdukForProduk(kategoriId?: string) {
  const supabase = await createClient();

  // Hitung jumlah_produk per model dengan subquery RPC atau inline count
  let query = supabase
    .from('model_produk')
    .select('id, nama, kategori_id, produk(count)')
    .eq('tenant_id', TENANT_ID)
    .order('nama');

  if (kategoriId) query = query.eq('kategori_id', kategoriId);

  const { data, error } = await query;
  if (error) { console.error('getModelProdukForProduk:', error.message); return []; }

  return (data ?? []).map((m) => ({
    id: m.id,
    nama: m.nama,
    kategori_id: m.kategori_id,
    jumlah_produk: (m.produk as any)?.[0]?.count ?? 0,
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. PRODUK CRUD
// ─────────────────────────────────────────────────────────────────────────────

export async function getProduk(modelId?: string) {
  const supabase = await createClient();

  let query = supabase
    .from('produk')
    .select(`
      *,
      model_produk(id, nama, kategori_id, kategori_produk(nama)),
      size(id, nama, urutan),
      warna(id, nama, kode_hex),
      hpp_item(qty, harga_satuan)
    `)
    .eq('tenant_id', TENANT_ID)
    .order('created_at', { ascending: false });

  if (modelId) query = query.eq('model_id', modelId);

  const { data, error } = await query;
  if (error) { console.error('getProduk:', error.message); return []; }

  return (data ?? []).map((p) => {
    const hppItems = (p.hpp_item as { qty: number; harga_satuan: number }[]) ?? [];
    const total_hpp = hppItems.reduce((sum, item) => sum + item.qty * item.harga_satuan, 0);
    return { ...p, total_hpp };
  });
}

export async function createProduk(data: ProdukInput) {
  await requireOwner();
  const validated = ProdukSchema.parse(data);
  const supabase = await createClient();

  // Ambil nama model, size, warna untuk generate SKU
  const [modelRes, sizeRes, warnaRes] = await Promise.all([
    supabase.from('model_produk').select('nama').eq('id', validated.model_id).single(),
    supabase.from('size').select('nama').eq('id', validated.size_id).single(),
    supabase.from('warna').select('nama').eq('id', validated.warna_id).single(),
  ]);

  if (modelRes.error || sizeRes.error || warnaRes.error) {
    throw new Error('Gagal mengambil data referensi model/size/warna.');
  }

  const sku_internal = generateSkuInternal(modelRes.data.nama, warnaRes.data.nama, sizeRes.data.nama);

  // Cek duplikat SKU
  const { data: existing } = await supabase
    .from('produk')
    .select('id')
    .eq('sku_internal', sku_internal)
    .eq('tenant_id', TENANT_ID)
    .single();

  if (existing) throw new Error(`SKU ${sku_internal} sudah terdaftar. Kombinasi Model-Warna-Size ini sudah ada.`);

  const { error } = await supabase.from('produk').insert({
    ...validated,
    sku_internal,
    tenant_id: TENANT_ID,
  });

  if (error) throw new Error(error.message);
  return { success: true, sku_internal };
}

export async function updateProduk(id: string, data: Partial<ProdukInput>) {
  await requireOwner();
  const supabase = await createClient();
  const { error } = await supabase
    .from('produk')
    .update(data)
    .match({ id, tenant_id: TENANT_ID });
  if (error) throw new Error(error.message);
  return { success: true };
}

export async function toggleProdukAktif(id: string) {
  await requireOwner();
  const supabase = await createClient();

  // Ambil status aktif saat ini
  const { data: current, error: fetchError } = await supabase
    .from('produk')
    .select('aktif')
    .eq('id', id)
    .single();

  if (fetchError || !current) throw new Error('Produk tidak ditemukan.');

  const { error } = await supabase
    .from('produk')
    .update({ aktif: !current.aktif })
    .match({ id, tenant_id: TENANT_ID });

  if (error) throw new Error(error.message);
  return { success: true, aktif: !current.aktif };
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. HPP KOMPONEN (Master)
// ─────────────────────────────────────────────────────────────────────────────

export async function getHppKomponen(kategori?: string) {
  const supabase = await createClient();

  let query = supabase
    .from('hpp_komponen')
    .select('*, satuan(id, nama)')
    .eq('tenant_id', TENANT_ID)
    .eq('aktif', true)
    .order('kategori')
    .order('nama');

  if (kategori) query = query.eq('kategori', kategori);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data ?? [];
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. HPP ITEM (BOM per Produk)
// ─────────────────────────────────────────────────────────────────────────────

export async function getHppItems(produkId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('hpp_item')
    .select(`
      *,
      hpp_komponen(id, nama, kategori, satuan(nama))
    `)
    .eq('produk_id', produkId)
    .eq('tenant_id', TENANT_ID)
    .order('created_at');

  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function upsertHppItem(
  produkId: string,
  komponenId: string,
  qty: number,
  hargaSatuan: number,
) {
  await requireOwnerOrKeuangan();
  const supabase = await createClient();

  const { error } = await supabase.from('hpp_item').upsert(
    {
      produk_id: produkId,
      komponen_id: komponenId,
      qty,
      harga_satuan: hargaSatuan,
      tenant_id: TENANT_ID,
    },
    { onConflict: 'produk_id,komponen_id' },
  );

  if (error) throw new Error(error.message);
  return { success: true };
}

export async function deleteHppItem(id: string) {
  await requireOwnerOrKeuangan();
  const supabase = await createClient();
  const { error } = await supabase
    .from('hpp_item')
    .delete()
    .match({ id, tenant_id: TENANT_ID });
  if (error) throw new Error(error.message);
  return { success: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. COPY HPP KE SEMUA SIZE DALAM MODEL YANG SAMA
// ─────────────────────────────────────────────────────────────────────────────

export async function copyHppToAllSizes(sourceProdukId: string) {
  await requireOwner();
  const supabase = await createClient();

  // Ambil produk sumber beserta model_id
  const { data: sourceProduk, error: sourceErr } = await supabase
    .from('produk')
    .select('id, model_id, hpp_item(komponen_id, qty, harga_satuan)')
    .eq('id', sourceProdukId)
    .single();

  if (sourceErr || !sourceProduk) throw new Error('Produk sumber tidak ditemukan.');

  const sourceHppItems = (sourceProduk.hpp_item as { komponen_id: string; qty: number; harga_satuan: number }[]) ?? [];
  if (sourceHppItems.length === 0) throw new Error('Produk sumber tidak memiliki HPP untuk disalin.');

  // Ambil semua produk lain dalam model yang sama
  const { data: targetProduk, error: targetErr } = await supabase
    .from('produk')
    .select('id')
    .eq('model_id', sourceProduk.model_id)
    .eq('tenant_id', TENANT_ID)
    .neq('id', sourceProdukId);

  if (targetErr) throw new Error(targetErr.message);
  if (!targetProduk || targetProduk.length === 0) return { success: true, copied: 0 };

  let copiedCount = 0;

  for (const target of targetProduk) {
    // Ambil komponen yang sudah ada di produk target
    const { data: existingItems } = await supabase
      .from('hpp_item')
      .select('komponen_id')
      .eq('produk_id', target.id);

    const existingKomponenIds = new Set((existingItems ?? []).map((i) => i.komponen_id));

    // Siapkan insert: skip komponen yang sudah ada
    const itemsToInsert = sourceHppItems
      .filter((item) => !existingKomponenIds.has(item.komponen_id))
      .map((item) => ({
        produk_id: target.id,
        komponen_id: item.komponen_id,
        qty: item.qty,
        harga_satuan: item.harga_satuan,
        tenant_id: TENANT_ID,
      }));

    if (itemsToInsert.length > 0) {
      const { error: insertErr } = await supabase.from('hpp_item').insert(itemsToInsert);
      if (!insertErr) copiedCount++;
    }
  }

  return { success: true, copied: copiedCount };
}
