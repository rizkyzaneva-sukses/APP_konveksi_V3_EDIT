'use server';

import { createClient } from '@/lib/supabase/server';
import { getSession } from '@/lib/auth/session';
import bcrypt from 'bcryptjs';

/** 1. Set PIN approval owner (4 digit bcrypt hash) */
export async function setApprovalPin(pin: string): Promise<void> {
  if (!/^\d{4}$/.test(pin)) {
    throw new Error('PIN harus 4 digit angka');
  }

  const session = await getSession();
  if (!session) throw new Error('Unauthorized');

  const hash = await bcrypt.hash(pin, 10);
  const supabase = await createClient();

  const { error } = await supabase
    .from('user_profile')
    .update({ approval_pin: hash })
    .eq('id', session.userId);

  if (error) throw new Error(error.message);
}

/** 2. Cek apakah user sudah memiliki PIN */
export async function hasApprovalPin(): Promise<boolean> {
  const session = await getSession();
  if (!session) return false;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('user_profile')
    .select('approval_pin')
    .eq('id', session.userId)
    .single();

  if (error || !data) return false;

  return (data as any).approval_pin !== null && (data as any).approval_pin !== undefined;
}
