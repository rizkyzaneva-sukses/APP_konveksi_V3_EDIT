'use server';

import { createClient } from '@/lib/supabase/server';
import { getCurrentUserProfile, permissions } from '@/lib/auth/permissions';
import { KategoriTrxSchema, type KategoriTrxInput } from '@/lib/validations/master.schemas';

export async function getKategoriTrx(jenisFilter?: string) {
  const profile = await getCurrentUserProfile();
  if (!profile) throw new Error('Unauthorized');

  const supabase = await createClient();
  let query = supabase
    .from('kategori_trx')
    .select('*')
    .eq('tenant_id', 'STX-001')
    .order('nama', { ascending: true });

  if (jenisFilter && jenisFilter !== 'semua') {
    query = query.eq('jenis', jenisFilter);
  }

  const { data, error } = await query;
  if (error) { console.error('getKategoriTrx:', error.message); return []; }
  return data ?? [];
}

export async function createKategoriTrx(data: KategoriTrxInput) {
  const profile = await getCurrentUserProfile();
  
  if (!profile || !permissions.canEditMasterData(profile.role)) {
    throw new Error('Unauthorized: Hanya owner yang dapat mengelola master data');
  }

  const validated = KategoriTrxSchema.safeParse(data);
  if (!validated.success) {
    throw new Error('Validasi form gagal: data tidak lengkap atau jenis tidak sesuai');
  }

  const supabase = await createClient();
  const { data: newRow, error } = await supabase
    .from('kategori_trx')
    .insert({
      ...validated.data,
      tenant_id: 'STX-001',
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return { success: true, data: newRow };
}

export async function updateKategoriTrx(id: string, data: Partial<KategoriTrxInput>) {
  const profile = await getCurrentUserProfile();
  
  if (!profile || !permissions.canEditMasterData(profile.role)) {
    throw new Error('Unauthorized');
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from('kategori_trx')
    .update(data)
    .eq('id', id)
    .eq('tenant_id', 'STX-001');

  if (error) throw new Error(error.message);
  return { success: true };
}

export async function deleteKategoriTrx(id: string) {
  const profile = await getCurrentUserProfile();
  
  if (!profile || !permissions.canEditMasterData(profile.role)) {
    throw new Error('Unauthorized');
  }

  const supabase = await createClient();

  // Block delete jika sudah ada di jurnal_entry
  const { count, error: countError } = await supabase
    .from('jurnal_entry')
    .select('id', { count: 'exact', head: true })
    .eq('kategori_trx_id', id)
    .eq('tenant_id', 'STX-001');
    
  if (countError) throw new Error(countError.message);
  
  if (count && count > 0) {
    throw new Error('Penghapusan ditolak: Kategori sudah digunakan dalam catatan Transaksi Jurnal.');
  }

  const { error } = await supabase
    .from('kategori_trx')
    .delete()
    .eq('id', id)
    .eq('tenant_id', 'STX-001');

  if (error) throw new Error(error.message);
  return { success: true };
}
