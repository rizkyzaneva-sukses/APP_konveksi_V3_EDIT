'use server';

import { createClient } from '@/lib/supabase/server';
import { getCurrentUserProfile, permissions } from '@/lib/auth/permissions';
import { KlienSchema, type KlienInput } from '@/lib/validations/master.schemas';

/**
 * Mengambil daftar klien dari tenant_id = 'STX-001'.
 * Diurutkan berdasarkan nama (A-Z).
 */
export async function getKlien() {
  const profile = await getCurrentUserProfile();
  if (!profile) throw new Error('Unauthorized');

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('klien')
    .select('*')
    .eq('tenant_id', 'STX-001')
    .order('nama', { ascending: true });

  if (error) { console.error('getKlien:', error.message); return []; }
  return data ?? [];
}

/**
 * Menambahkan data klien baru. (Hanya owner).
 */
export async function createKlien(data: KlienInput) {
  const profile = await getCurrentUserProfile();
  
  if (!profile || !permissions.canEditMasterData(profile.role)) {
    throw new Error('Unauthorized: Hanya owner yang dapat menambah master data.');
  }

  const validated = KlienSchema.safeParse(data);
  if (!validated.success) {
    throw new Error('Validasi form gagal: data tidak lengkap atau tidak sesuai format.');
  }

  const supabase = await createClient();
  const { data: newRow, error } = await supabase
    .from('klien')
    .insert({
      ...validated.data,
      created_by: profile.id,
      tenant_id: 'STX-001',
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return { success: true, data: newRow };
}

/**
 * Mengubah data klien. (Hanya owner).
 */
export async function updateKlien(id: string, data: Partial<KlienInput>) {
  const profile = await getCurrentUserProfile();
  
  if (!profile || !permissions.canEditMasterData(profile.role)) {
    throw new Error('Unauthorized: Hanya owner yang dapat mengubah master data.');
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from('klien')
    .update(data)
    .eq('id', id)
    .eq('tenant_id', 'STX-001');

  if (error) throw new Error(error.message);
  return { success: true };
}

/**
 * Melakukan hard delete terhadap klien. (Hanya owner).
 */
export async function deleteKlien(id: string) {
  const profile = await getCurrentUserProfile();
  
  if (!profile || !permissions.canEditMasterData(profile.role)) {
    throw new Error('Unauthorized: Hanya owner yang dapat menghapus master data.');
  }

  const supabase = await createClient();
  
  const { error } = await supabase
    .from('klien')
    .delete()
    .eq('id', id)
    .eq('tenant_id', 'STX-001');

  if (error) throw new Error(error.message);
  return { success: true };
}
