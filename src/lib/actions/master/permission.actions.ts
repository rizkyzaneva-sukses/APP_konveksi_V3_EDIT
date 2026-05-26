'use server';

import { getCurrentUserProfile, canAccessPage } from '@/lib/auth/permissions';
import { revalidatePath } from 'next/cache';

const ALL_APP_PATHS = [
  '/app/dashboard',
  '/app/produksi/input-po',
  '/app/produksi/po/import',
  '/app/produksi/antrian-cutting',
  '/app/produksi/scan/cutting',
  '/app/produksi/scan/jahit',
  '/app/produksi/scan/lubang-kancing',
  '/app/produksi/scan/buang-benang',
  '/app/produksi/scan/qc',
  '/app/produksi/scan/steam',
  '/app/produksi/scan/packing',
  '/app/produksi/monitoring',
  '/app/produksi/approval-qty',
  '/app/produksi/reject',
  '/app/pengiriman/buat-surat-jalan',
  '/app/pengiriman/riwayat',
  '/app/pengiriman/validasi',
  '/app/penggajian/rekap-gaji',
  '/app/penggajian/kasbon',
  '/app/penggajian/slip-gaji',
  '/app/master/detail',
  '/app/master/produk',
  '/app/master/model',
  '/app/master/karyawan',
  '/app/master/jabatan',
  '/app/master/klien',
  '/app/master/satuan',
  '/app/master/reject',
  '/app/master/kategori-trx',
  '/app/master/komponen-hpp',
  '/app/master/aksesori-warna',
  '/app/master/users',
  '/app/inventory/overview',
  '/app/inventory/transaksi-keluar',
  '/app/inventory/alert-order',
  '/app/inventory/pemakaian-bahan',
  '/app/inventory/ambil-benang',
  '/app/inventory/harga-referensi',
  '/app/keuangan/ringkasan',
  '/app/keuangan/jurnal-produksi',
  '/app/keuangan/buku-kas',
  '/app/keuangan/invoice',
  '/app/keuangan/laporan-lr',
  '/app/keuangan/laporan-po',
  '/app/keuangan/overhead-setting',
  '/app/keuangan/laporan-bulan',
  '/app/keuangan/laporan-gaji',
  '/app/keuangan/laporan-reject',
  '/app/settings',
];

export interface PathPermission {
  path: string;
  can_view: boolean;
}

export interface RolePermissionMap {
  [role: string]: PathPermission[];
}

/** Ambil semua permission untuk semua role (computed dari canAccessPage matrix) */
export async function getAllRolePermissions(): Promise<RolePermissionMap> {
  const roles = ['admin_produksi', 'admin_keuangan', 'supervisor', 'mandor'];
  const map: RolePermissionMap = {};
  for (const role of roles) {
    map[role] = ALL_APP_PATHS.map(path => ({
      path,
      can_view: canAccessPage(role as any, path.replace('/app/', '').split('/')[0]),
    }));
  }
  return map;
}

/** Ambil path yang boleh dilihat untuk 1 role */
export async function getAllowedPathsForRole(role: string): Promise<string[]> {
  // Use canAccessPage matrix as source of truth
  return ALL_APP_PATHS.filter(path => {
    const segment = path.replace('/app/', '').split('/')[0];
    return canAccessPage(role as any, segment);
  });
}

/** Simpan perubahan permission — no-op karena permissions dikelola via code */
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
  // Permissions managed in code via canAccessPage — nothing to persist
  revalidatePath('/app/master/users');
}
