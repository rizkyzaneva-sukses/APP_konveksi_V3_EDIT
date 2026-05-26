'use server';

import { createClient } from '@/lib/supabase/server';
import { getSession } from '@/lib/auth/session';
import bcrypt from 'bcryptjs';

const TENANT_ID = 'STX-001';

async function resolveUserId(): Promise<string> {
  const session = await getSession();
  if (!session) throw new Error('Unauthorized: User session not found.');
  return session.userId;
}

export interface AlasanQty {
  id: string;
  label: string;
  urutan: number;
}

export interface QtyApprovalRequest {
  id: string;
  bundle_id: string;
  tahap: string;
  qty_diajukan: number;
  qty_default: number;
  status: string;
  catatan_owner: string | null;
  created_at: string;
  barcode: string;
  no_po: string;
  klien_nama: string;
}

/** 1. Ambil daftar alasan QTY kurang yang aktif */
export async function getAlasanQty(): Promise<AlasanQty[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('alasan_qty')
    .select('id, label, urutan')
    .eq('aktif', true)
    .eq('tenant_id', TENANT_ID)
    .order('urutan');

  if (error) { console.error('getAlasanQty:', error.message); return []; }
  return (data ?? []) as AlasanQty[];
}

/** 2. Ambil antrian approval yang masih pending */
export async function getPendingApprovals(): Promise<QtyApprovalRequest[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('qty_approval_request')
    .select(`
      id,
      bundle_id,
      tahap,
      qty_diajukan,
      qty_default,
      status,
      catatan_owner,
      created_at,
      bundle:bundle_id (
        barcode,
        po:po_id (
          no_po,
          klien:klien_id (nama)
        )
      )
    `)
    .eq('tenant_id', TENANT_ID)
    .eq('status', 'pending')
    .order('created_at', { ascending: true });

  if (error) { console.error('getPendingApprovals:', error.message); return []; }

  return (data ?? []).map((req: any) => ({
    id: req.id,
    bundle_id: req.bundle_id,
    tahap: req.tahap,
    qty_diajukan: req.qty_diajukan,
    qty_default: req.qty_default,
    status: req.status,
    catatan_owner: req.catatan_owner,
    created_at: req.created_at,
    barcode: req.bundle?.barcode ?? '',
    no_po: req.bundle?.po?.no_po ?? '',
    klien_nama: req.bundle?.po?.klien?.nama ?? '',
  }));
}

/** 3. Resolve approval (approve/reject) dengan verifikasi PIN */
export async function resolveQtyApproval(
  approval_id: string,
  action: 'approved' | 'rejected',
  catatan: string,
  pin: string
): Promise<{ status: string; qty_final: number }> {
  const userId = await resolveUserId();
  const supabase = await createClient();

  // 1. Fetch user_profile's approval_pin
  const { data: profile, error: profileErr } = await supabase
    .from('user_profile')
    .select('approval_pin')
    .eq('id', userId)
    .maybeSingle();

  if (profileErr) throw new Error(profileErr.message);

  if (!profile?.approval_pin) {
    throw new Error('PIN belum diset. Setup PIN terlebih dahulu di Settings.');
  }

  // 2. Verifikasi PIN dengan bcrypt
  const isPinValid = await bcrypt.compare(pin, profile.approval_pin);
  if (!isPinValid) {
    throw new Error('PIN tidak valid');
  }

  // 3. Jalankan RPC resolve_qty_approval
  const { data, error } = await supabase.rpc('resolve_qty_approval', {
    p_approval_id: approval_id,
    p_action:      action,
    p_catatan:     catatan,
    p_user_id:     userId,
    p_tenant_id:   TENANT_ID
  });

  if (error) throw new Error(error.message);

  return data as { status: string; qty_final: number };
}
