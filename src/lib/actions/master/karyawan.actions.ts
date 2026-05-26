'use server';

import { createClient } from '@/lib/supabase/server';
import { getCurrentUserProfile, permissions } from '@/lib/auth/permissions';
import { KaryawanSchema, type KaryawanInput } from '@/lib/validations/master.schemas';

/**
 * Mengambil daftar karyawan (aktif dan inaktif) dari tenant_id = 'STX-001'.
 * Diurutkan berdasarkan nama (A-Z).
 */
export async function getKaryawan() {
  const profile = await getCurrentUserProfile();
  if (!profile) throw new Error('Unauthorized');

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('karyawan')
    .select('*')
    .eq('tenant_id', 'STX-001')
    .order('nama', { ascending: true });

  if (error) { console.error('getKaryawan:', error.message); return []; }
  return data ?? [];
}

/**
 * Menambahkan data karyawan baru. (Hanya owner).
 */
export async function createKaryawan(data: KaryawanInput) {
  const profile = await getCurrentUserProfile();
  
  // Validasi role di level server sebelum eksekusi
  if (!profile || !permissions.canEditMasterData(profile.role)) {
    throw new Error('Unauthorized: Hanya owner yang dapat menambah master data.');
  }

  // Validasi shape object via Zod schema
  const validated = KaryawanSchema.safeParse(data);
  if (!validated.success) {
    throw new Error('Validasi form gagal: data tidak lengkap atau tidak sesuai format.');
  }

  const supabase = await createClient();
  const { data: newRow, error } = await supabase
    .from('karyawan')
    .insert({
      ...validated.data,
      tenant_id: 'STX-001',
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return { success: true, data: newRow };
}

/**
 * Mengubah data karyawan. (Hanya owner).
 */
export async function updateKaryawan(id: string, data: Partial<KaryawanInput>) {
  const profile = await getCurrentUserProfile();
  
  if (!profile || !permissions.canEditMasterData(profile.role)) {
    throw new Error('Unauthorized: Hanya owner yang dapat mengubah master data.');
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from('karyawan')
    .update(data)
    .eq('id', id)
    .eq('tenant_id', 'STX-001');

  if (error) throw new Error(error.message);
  return { success: true };
}

/**
 * Melakukan soft delete terhadap karyawan (set aktif=false). (Hanya owner).
 */
export async function deleteKaryawan(id: string) {
  const profile = await getCurrentUserProfile();
  
  if (!profile || !permissions.canEditMasterData(profile.role)) {
    throw new Error('Unauthorized: Hanya owner yang dapat menghapus master data.');
  }

  const supabase = await createClient();
  
  // Soft delete: aktif = false
  const { error } = await supabase
    .from('karyawan')
    .update({ aktif: false })
    .eq('id', id)
    .eq('tenant_id', 'STX-001');

  if (error) throw new Error(error.message);
  return { success: true };
}
