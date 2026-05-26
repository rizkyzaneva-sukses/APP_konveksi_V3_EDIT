'use server';

import { createClient } from '@/lib/supabase/server';
import { getCurrentUserProfile, permissions } from '@/lib/auth/permissions';
import { 
  JenisRejectSchema, type JenisRejectInput,
  AlasanRejectSchema, type AlasanRejectInput 
} from '@/lib/validations/master.schemas';

async function requireOwner() {
  const profile = await getCurrentUserProfile();
  if (!profile || !permissions.canEditMasterData(profile.role)) {
    throw new Error('Unauthorized');
  }
}

// ============================================================================
// JENIS REJECT
// ============================================================================
export async function getJenisReject() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('jenis_reject')
    .select('*')
    .eq('tenant_id', 'STX-001')
    .order('nama', { ascending: true });
  if (error) { console.error('getJenisReject:', error.message); return []; }
  return data ?? [];
}

export async function createJenisReject(data: JenisRejectInput) {
  await requireOwner();
  const validated = JenisRejectSchema.parse(data);
  const supabase = await createClient();
  const { error } = await supabase.from('jenis_reject').insert({ ...validated, tenant_id: 'STX-001' });
  if (error) throw new Error(error.message);
  return { success: true };
}

export async function updateJenisReject(id: string, data: Partial<JenisRejectInput>) {
  await requireOwner();
  const supabase = await createClient();
  const { error } = await supabase.from('jenis_reject').update(data).match({ id, tenant_id: 'STX-001' });
  if (error) throw new Error(error.message);
  return { success: true };
}

export async function deleteJenisReject(id: string) {
  await requireOwner();
  const supabase = await createClient();
  const { error } = await supabase.from('jenis_reject').delete().match({ id, tenant_id: 'STX-001' });
  if (error) {
    if (error.code === '23503') throw new Error('Tertolak: Jenis reject ini ada di Alasan Reject.');
    throw new Error(error.message);
  }
  return { success: true };
}

// ============================================================================
// ALASAN REJECT
// ============================================================================
export async function getAlasanReject() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('alasan_reject')
    .select('*, jenis_reject(nama)')
    .eq('tenant_id', 'STX-001')
    .order('nama', { ascending: true });
  if (error) { console.error('getAlasanReject:', error.message); return []; }
  return data ?? [];
}

export async function createAlasanReject(data: AlasanRejectInput) {
  await requireOwner();
  const validated = AlasanRejectSchema.parse(data);
  const supabase = await createClient();
  const { error } = await supabase.from('alasan_reject').insert({ ...validated, tenant_id: 'STX-001' });
  if (error) throw new Error(error.message);
  return { success: true };
}

export async function updateAlasanReject(id: string, data: Partial<AlasanRejectInput>) {
  await requireOwner();
  const supabase = await createClient();
  const { error } = await supabase.from('alasan_reject').update(data).match({ id, tenant_id: 'STX-001' });
  if (error) throw new Error(error.message);
  return { success: true };
}

export async function deleteAlasanReject(id: string) {
  await requireOwner();
  const supabase = await createClient();
  // Di V3, delete alasan_reject berpotensi tidak diizinkan jika sudah dipakai di fitur Q/C reject handling,
  // tapi policy soft vs hard delete tergantung konvensi; jika 23503, blokir.
  const { error } = await supabase.from('alasan_reject').delete().match({ id, tenant_id: 'STX-001' });
  if (error) {
    if (error.code === '23503') throw new Error('Tertolak: Alasan reject sudah dipakai dalam request/catatan QC.');
    throw new Error(error.message);
  }
  return { success: true };
}
