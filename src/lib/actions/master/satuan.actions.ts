'use server';

import { createClient } from '@/lib/supabase/server';
import { getCurrentUserProfile, permissions } from '@/lib/auth/permissions';
import { SatuanSchema, type SatuanInput } from '@/lib/validations/master.schemas';

async function requireOwner() {
  const profile = await getCurrentUserProfile();
  if (!profile || !permissions.canEditMasterData(profile.role)) {
    throw new Error('Unauthorized');
  }
}

export async function getSatuan() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('satuan')
    .select('*')
    .eq('tenant_id', 'STX-001')
    .order('nama', { ascending: true });
  if (error) { console.error('getSatuan:', error.message); return []; }
  return data ?? [];
}

export async function createSatuan(data: SatuanInput) {
  await requireOwner();
  const validated = SatuanSchema.parse(data);
  const supabase = await createClient();
  const { error } = await supabase.from('satuan').insert({ ...validated, tenant_id: 'STX-001' });
  if (error) throw new Error(error.message);
  return { success: true };
}

export async function updateSatuan(id: string, data: Partial<SatuanInput>) {
  await requireOwner();
  const supabase = await createClient();
  const { error } = await supabase.from('satuan').update(data).match({ id, tenant_id: 'STX-001' });
  if (error) throw new Error(error.message);
  return { success: true };
}

export async function deleteSatuan(id: string) {
  await requireOwner();
  const supabase = await createClient();
  const { error } = await supabase.from('satuan').delete().match({ id, tenant_id: 'STX-001' });
  if (error) {
    if (error.code === '23503') throw new Error('Tertolak: Satuan ini sudah terpakai oleh master HPP.');
    throw new Error(error.message);
  }
  return { success: true };
}
