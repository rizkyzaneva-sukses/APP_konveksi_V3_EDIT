'use server';

import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { getCurrentUserProfile } from '@/lib/auth/permissions';
import { revalidatePath } from 'next/cache';

const TENANT_ID = 'STX-001';

export interface PathPermission {
  path: string;
  can_view: boolean;
}

export interface RolePermissionMap {
  [role: string]: PathPermission[];
}

/** Ambil semua permission untuk semua role — dipakai di UI matrix */
export async function getAllRolePermissions(): Promise<RolePermissionMap> {
  const admin = await createAdminClient();
  const { data, error } = await admin
    .from('role_permissions')
    .select('role, path, can_view')
    .eq('tenant_id', TENANT_ID)
    .order('role')
    .order('path');

  if (error) throw new Error(error.message);

  const map: RolePermissionMap = {};
  (data ?? []).forEach((row: any) => {
    if (!map[row.role]) map[row.role] = [];
    map[row.role].push({ path: row.path, can_view: row.can_view });
  });
  return map;
}

/** Ambil path yang boleh dilihat untuk 1 role — dipakai di DashboardLayout */
export async function getAllowedPathsForRole(role: string): Promise<string[]> {
  const admin = await createAdminClient();
  const { data, error } = await admin
    .from('role_permissions')
    .select('path')
    .eq('role', role)
    .eq('can_view', true)
    .eq('tenant_id', TENANT_ID);

  if (error) return [];
  return (data ?? []).map((r: any) => r.path);
}

/** Simpan perubahan permission (bulk upsert) */
export async function saveRolePermissions(
  role: string,
  permissions: PathPermission[]
): Promise<void> {
  const profile = await getCurrentUserProfile();
  if (!profile || profile.role !== 'owner') {
    throw new Error('Unauthorized: Hanya owner yang dapat mengubah permission.');
  }
  if (role === 'owner') {
    throw new Error('Permission role owner tidak dapat diubah.');
  }

  const admin = await createAdminClient();

  const rows = permissions.map(p => ({
    role,
    path: p.path,
    can_view: p.can_view,
    tenant_id: TENANT_ID,
    updated_at: new Date().toISOString(),
  }));

  const { error } = await admin
    .from('role_permissions')
    .upsert(rows, { onConflict: 'role,path,tenant_id' });

  if (error) throw new Error(error.message);

  revalidatePath('/app/master/users');
}
