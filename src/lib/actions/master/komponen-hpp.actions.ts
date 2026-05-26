'use server';

import { createClient } from '@/lib/supabase/server';
import { getCurrentUserProfile, permissions } from '@/lib/auth/permissions';
import { KomponenHppSchema, type KomponenHppInput } from '@/lib/validations/master.schemas';

const TENANT_ID = 'STX-001';

async function requireOwner() {
  const profile = await getCurrentUserProfile();
  if (!profile || !permissions.canEditMasterData(profile.role)) {
    throw new Error('Unauthorized: Akses ditolak.');
  }
}

export async function getKomponenHpp(kategori?: string) {
  const supabase = await createClient();
  let query = supabase
    .from('hpp_komponen')
    .select(`
      *,
      satuan ( nama )
    `)
    .eq('tenant_id', TENANT_ID)
    .order('kategori')
    .order('nama');

  if (kategori) {
    query = query.eq('kategori', kategori);
  }

  const { data, error } = await query;
  if (error) { console.error('getKomponenHpp:', error.message); return []; }
  return data ?? [];
}

export async function createKomponenHpp(data: KomponenHppInput) {
  await requireOwner();
  const validated = KomponenHppSchema.parse(data);
  const supabase = await createClient();
  
  const { error } = await supabase.from('hpp_komponen').insert({
    ...validated,
    tenant_id: TENANT_ID,
  });

  if (error) throw new Error(error.message);
  return { success: true };
}

export async function updateKomponenHpp(id: string, data: Partial<KomponenHppInput>) {
  await requireOwner();
  const supabase = await createClient();
  
  const { error } = await supabase
    .from('hpp_komponen')
    .update(data)
    .match({ id, tenant_id: TENANT_ID });

  if (error) throw new Error(error.message);
  return { success: true };
}

export async function deleteKomponenHpp(id: string) {
  await requireOwner();
  const supabase = await createClient();

  // Cek apakah dipakai di hpp_item
  const { data: usage, error: usageErr } = await supabase
    .from('hpp_item')
    .select('id')
    .eq('komponen_id', id);

  if (usageErr) throw new Error(usageErr.message);

  if (usage && usage.length > 0) {
    throw new Error(`Tertolak: Komponen sudah dipakai di ${usage.length} produk HPP, tidak bisa dihapus.`);
  }

  const { error } = await supabase
    .from('hpp_komponen')
    .delete()
    .match({ id, tenant_id: TENANT_ID });

  if (error) throw new Error(error.message);
  return { success: true };
}
