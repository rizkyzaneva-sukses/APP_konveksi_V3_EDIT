import { getSession } from '@/lib/auth/session';

// ---------------------------------------------------------------------------
// Tipe
// ---------------------------------------------------------------------------

export type UserRole =
  | 'owner'
  | 'admin_produksi'
  | 'admin_keuangan'
  | 'supervisor'
  | 'mandor';

export interface UserProfile {
  id: string;
  nama: string;
  role: UserRole;
  aktif: boolean;
  tenant_id: string;
}

// ---------------------------------------------------------------------------
// getCurrentUserProfile
// Ambil user dari session JWT cookie.
// Return null jika tidak ada session.
// ---------------------------------------------------------------------------

export async function getCurrentUserProfile(): Promise<UserProfile | null> {
  const session = await getSession();
  if (!session) return null;

  return {
    id: session.userId,
    nama: session.nama,
    role: session.role as UserRole,
    aktif: true,
    tenant_id: session.tenantId,
  };
}

// ---------------------------------------------------------------------------
// canAccessPage
// Sesuai matrix akses halaman BR-10 bagian 2.1.
// `page` adalah segment path, contoh: 'master-data', 'produksi/scan-station'
// ---------------------------------------------------------------------------

export function canAccessPage(role: UserRole, page: string): boolean {
  const matrix: Record<string, UserRole[]> = {
    'dashboard':              ['owner', 'admin_produksi', 'admin_keuangan', 'supervisor'],
    'produksi':               ['owner', 'admin_produksi', 'supervisor'],
    'pengiriman':             ['owner', 'admin_produksi', 'admin_keuangan', 'supervisor'],
    'penggajian':             ['owner', 'supervisor'],
    'master-data':            ['owner'],
    'inventory':              ['owner', 'admin_produksi', 'admin_keuangan'],
    'keuangan':               ['owner', 'admin_keuangan', 'supervisor'],
    'settings':               ['owner'],
    'produksi/input-po':      ['owner', 'admin_produksi'],
    'produksi/scan-station':  ['owner', 'admin_produksi', 'mandor'],
    'produksi/monitoring':    ['owner', 'admin_produksi', 'supervisor'],
    'produksi/koreksi':       ['owner', 'admin_produksi'],
    'produksi/approval-qty':  ['owner'],
    'produksi/surat-jalan':   ['owner', 'admin_produksi'],
    'pengiriman/riwayat':     ['owner', 'admin_produksi', 'admin_keuangan', 'supervisor'],
    'penggajian/rekap':       ['owner', 'supervisor'],
    'penggajian/kasbon':      ['owner', 'supervisor'],
    'penggajian/slip':        ['owner', 'supervisor'],
    'keuangan/jurnal-produksi':   ['owner', 'admin_keuangan'],
    'keuangan/buku-kas':          ['owner', 'admin_keuangan'],
    'keuangan/invoice':           ['owner', 'admin_keuangan', 'supervisor'],
    'keuangan/laporan-lr':        ['owner', 'admin_keuangan'],
    'laporan/per-po':         ['owner', 'admin_keuangan', 'supervisor'],
    'laporan/bulanan':        ['owner', 'admin_keuangan', 'supervisor'],
    'laporan/gaji':           ['owner', 'admin_keuangan', 'supervisor'],
    'laporan/reject':         ['owner', 'admin_produksi', 'admin_keuangan', 'supervisor'],
    'audit-log':              ['owner'],
    'user-management':        ['owner'],
  };

  const allowedRoles = matrix[page];

  // Jika page tidak terdaftar di matrix, tolak akses
  if (!allowedRoles) return false;

  return allowedRoles.includes(role);
}

// ---------------------------------------------------------------------------
// permissions
// Checker per aksi spesifik — sesuai BR-10 bagian 2.2.
// Dipanggil di Server Actions sebelum eksekusi aksi sensitif.
// ---------------------------------------------------------------------------

export const permissions = {
  /** Hanya owner yang boleh edit master data */
  canEditMasterData: (role: UserRole): boolean =>
    role === 'owner',

  /** Hanya owner yang boleh approve koreksi QTY surplus */
  canApproveKoreksi: (role: UserRole): boolean =>
    role === 'owner',

  /** Owner, admin keuangan, supervisor boleh lihat margin & HPP realisasi */
  canViewMarginHPP: (role: UserRole): boolean =>
    (['owner', 'admin_keuangan', 'supervisor'] as UserRole[]).includes(role),

  /** Owner dan supervisor boleh kelola kasbon */
  canManageKasbon: (role: UserRole): boolean =>
    (['owner', 'supervisor'] as UserRole[]).includes(role),

  /** Owner dan admin keuangan boleh input jurnal keuangan */
  canInputJurnal: (role: UserRole): boolean =>
    (['owner', 'admin_keuangan'] as UserRole[]).includes(role),

  /** Owner dan admin produksi boleh finalisasi surat jalan */
  canFinalizeSuratJalan: (role: UserRole): boolean =>
    (['owner', 'admin_produksi'] as UserRole[]).includes(role),

  /** Hanya owner yang boleh manage user & assign role */
  canManageUser: (role: UserRole): boolean =>
    role === 'owner',

  /** Owner, admin produksi, dan mandor boleh akses scan station */
  canScanStation: (role: UserRole): boolean =>
    (['owner', 'admin_produksi', 'mandor'] as UserRole[]).includes(role),
} as const;
