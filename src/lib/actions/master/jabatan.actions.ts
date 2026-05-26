'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { JabatanSchema, type JabatanInput } from '@/lib/validations/master.schemas';

// ─────────────────────────────────────────────
// GET
// ─────────────────────────────────────────────
export async function getJabatan() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('jabatan')
    .select('*')
    .order('nama', { ascending: true });

  if (error) { console.error('getJabatan:', error.message); return []; }
  return data ?? [];
}

export async function getJabatanAktif() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('jabatan')
    .select('id, nama, tahap_produksi, gaji_default')
    .eq('aktif', true)
    .order('nama', { ascending: true });

  if (error) { console.error('getJabatanAktif:', error.message); return []; }
  return data ?? [];
}

// ─────────────────────────────────────────────
// CREATE
// ─────────────────────────────────────────────
export async function createJabatan(values: JabatanInput) {
  const parsed = JabatanSchema.safeParse(values);
  if (!parsed.success) throw new Error(parsed.error.issues[0].message);

  const supabase = await createClient();
  const { error } = await supabase.from('jabatan').insert({
    nama:            parsed.data.nama,
    deskripsi:       parsed.data.deskripsi ?? null,
    tahap_produksi:  parsed.data.tahap_produksi,
    gaji_default:    parsed.data.gaji_default,
    aktif:           parsed.data.aktif,
  });

  if (error) throw new Error(error.message);
  revalidatePath('/app/master/jabatan');
}

// ─────────────────────────────────────────────
// UPDATE
// ─────────────────────────────────────────────
export async function updateJabatan(id: string, values: JabatanInput) {
  const parsed = JabatanSchema.safeParse(values);
  if (!parsed.success) throw new Error(parsed.error.issues[0].message);

  const supabase = await createClient();
  const { error } = await supabase
    .from('jabatan')
    .update({
      nama:           parsed.data.nama,
      deskripsi:      parsed.data.deskripsi ?? null,
      tahap_produksi: parsed.data.tahap_produksi,
      gaji_default:   parsed.data.gaji_default,
      aktif:          parsed.data.aktif,
    })
    .eq('id', id);

  if (error) throw new Error(error.message);
  revalidatePath('/app/master/jabatan');
}

// ─────────────────────────────────────────────
// DELETE (soft delete via aktif = false)
// ─────────────────────────────────────────────
export async function deleteJabatan(id: string) {
  const supabase = await createClient();

  // Cek apakah jabatan masih dipakai oleh karyawan aktif
  const { count, error: checkError } = await supabase
    .from('karyawan')
    .select('id', { count: 'exact', head: true })
    .eq('jabatan', id)
    .eq('aktif', true);

  if (checkError) throw new Error(checkError.message);
  if (count && count > 0) {
    throw new Error(`Jabatan masih dipakai oleh ${count} karyawan aktif. Nonaktifkan karyawan terlebih dahulu.`);
  }

  const { error } = await supabase
    .from('jabatan')
    .update({ aktif: false })
    .eq('id', id);

  if (error) throw new Error(error.message);
  revalidatePath('/app/master/jabatan');
}
