'use server';

import { createClient } from '@/lib/supabase/server';
import { getCurrentUserProfile, permissions } from '@/lib/auth/permissions';
import {
  KategoriProdukSchema,
  ModelProdukSchema,
  SizeSchema,
  WarnaSchema,
  type KategoriProdukInput,
  type ModelProdukInput,
  type SizeInput,
  type WarnaInput,
} from '@/lib/validations/master.schemas';

// Helper authorize
async function requireOwner() {
  const profile = await getCurrentUserProfile();
  if (!profile || !permissions.canEditMasterData(profile.role)) {
    throw new Error('Unauthorized: Hanya owner yang dapat mengelola master data');
  }
  return profile;
}

// ============================================================================
// KATEGORI PRODUK
// ============================================================================
export async function getKategoriProduk() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('kategori_produk')
    .select('*')
    .eq('tenant_id', 'STX-001')
    .order('nama', { ascending: true });
  if (error) { console.error('getKategoriProduk:', error.message); return []; }
  return data ?? [];
}

export async function createKategoriProduk(data: KategoriProdukInput) {
  await requireOwner();
  const validated = KategoriProdukSchema.parse(data);
  const supabase = await createClient();
  const { error } = await supabase.from('kategori_produk').insert({ ...validated, tenant_id: 'STX-001' });
  if (error) throw new Error(error.message);
  return { success: true };
}

export async function updateKategoriProduk(id: string, data: Partial<KategoriProdukInput>) {
  await requireOwner();
  const supabase = await createClient();
  const { error } = await supabase.from('kategori_produk').update(data).match({ id, tenant_id: 'STX-001' });
  if (error) throw new Error(error.message);
  return { success: true };
}

export async function deleteKategoriProduk(id: string) {
  await requireOwner();
  const supabase = await createClient();
  const { error } = await supabase.from('kategori_produk').delete().match({ id, tenant_id: 'STX-001' });
  if (error) {
    if (error.code === '23503') throw new Error('Tertolak: Kategori ini sedang digunakan oleh Master Model.');
    throw new Error(error.message);
  }
  return { success: true };
}

// ============================================================================
// MODEL PRODUK
// ============================================================================
export async function getModelProduk(kategoriId?: string) {
  const supabase = await createClient();
  let query = supabase
    .from('model_produk')
    .select('*, kategori_produk(nama)')
    .eq('tenant_id', 'STX-001')
    .order('nama', { ascending: true });
  
  if (kategoriId) {
    query = query.eq('kategori_id', kategoriId);
  }
  
  const { data, error } = await query;
  if (error) { console.error('getModelProduk:', error.message); return []; }
  return data ?? [];
}

export async function createModelProduk(data: ModelProdukInput) {
  await requireOwner();
  const validated = ModelProdukSchema.parse(data);
  const supabase = await createClient();
  const { error } = await supabase.from('model_produk').insert({ ...validated, tenant_id: 'STX-001' });
  if (error) throw new Error(error.message);
  return { success: true };
}

export async function updateModelProduk(id: string, data: Partial<ModelProdukInput>) {
  await requireOwner();
  const supabase = await createClient();
  const { error } = await supabase.from('model_produk').update(data).match({ id, tenant_id: 'STX-001' });
  if (error) throw new Error(error.message);
  return { success: true };
}

export async function deleteModelProduk(id: string) {
  await requireOwner();
  const supabase = await createClient();
  const { error } = await supabase.from('model_produk').delete().match({ id, tenant_id: 'STX-001' });
  if (error) {
    if (error.code === '23503') throw new Error('Tertolak: Model ini sudah dipakai di tabel Produk.');
    throw new Error(error.message);
  }
  return { success: true };
}

export async function getModelById(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('model_produk')
    .select('*, kategori_produk(nama)')
    .eq('id', id)
    .eq('tenant_id', 'STX-001')
    .single();

  if (error) { console.error('getModelById:', error.message); return null; }
  return data;
}

// ============================================================================
// SIZE
// ============================================================================
export async function getSize() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('size')
    .select('*')
    .eq('tenant_id', 'STX-001')
    .order('urutan', { ascending: true });
  if (error) { console.error('getSize:', error.message); return []; }
  return data ?? [];
}

export async function createSize(data: SizeInput) {
  await requireOwner();
  const validated = SizeSchema.parse(data);
  const supabase = await createClient();
  const { error } = await supabase.from('size').insert({ ...validated, tenant_id: 'STX-001' });
  if (error) throw new Error(error.message);
  return { success: true };
}

export async function updateSize(id: string, data: Partial<SizeInput>) {
  await requireOwner();
  const supabase = await createClient();
  const { error } = await supabase.from('size').update(data).match({ id, tenant_id: 'STX-001' });
  if (error) throw new Error(error.message);
  return { success: true };
}

export async function deleteSize(id: string) {
  await requireOwner();
  const supabase = await createClient();
  const { error } = await supabase.from('size').delete().match({ id, tenant_id: 'STX-001' });
  if (error) {
    if (error.code === '23503') throw new Error('Tertolak: Size ini sudah dipakai di tabel Produk.');
    throw new Error(error.message);
  }
  return { success: true };
}

// ============================================================================
// WARNA
// ============================================================================
export async function getWarna() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('warna')
    .select('*')
    .eq('tenant_id', 'STX-001')
    .order('nama', { ascending: true });
  if (error) { console.error('getWarna:', error.message); return []; }
  return data ?? [];
}

export async function createWarna(data: WarnaInput) {
  await requireOwner();
  const validated = WarnaSchema.parse(data);
  const supabase = await createClient();
  const { error } = await supabase.from('warna').insert({ ...validated, tenant_id: 'STX-001' });
  if (error) throw new Error(error.message);
  return { success: true };
}

export async function updateWarna(id: string, data: Partial<WarnaInput>) {
  await requireOwner();
  const supabase = await createClient();
  const { error } = await supabase.from('warna').update(data).match({ id, tenant_id: 'STX-001' });
  if (error) throw new Error(error.message);
  return { success: true };
}

export async function deleteWarna(id: string) {
  await requireOwner();
  const supabase = await createClient();
  const { error } = await supabase.from('warna').delete().match({ id, tenant_id: 'STX-001' });
  if (error) {
    if (error.code === '23503') throw new Error('Tertolak: Warna ini sudah dipakai di tabel Produk.');
    throw new Error(error.message);
  }
  return { success: true };
}

export async function getModelList() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('model_produk')
    .select('id, nama, kategori_produk:kategori_id(nama)')
    .eq('tenant_id', 'STX-001')
    .order('nama');
  if (error) { console.error('getModelList:', error.message); return []; }
  return data ?? [];
}
