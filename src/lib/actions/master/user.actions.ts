'use server';

import { db } from '@/db';
import { userProfile } from '@/db/schema';
import { eq, and, desc } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import { getCurrentUserProfile, permissions, type UserRole } from '@/lib/auth/permissions';
import { revalidatePath } from 'next/cache';

const TENANT_ID = 'STX-001';

async function requireOwner() {
  const profile = await getCurrentUserProfile();
  if (!profile || !permissions.canEditMasterData(profile.role)) {
    throw new Error('Unauthorized: Hanya owner yang dapat mengelola user.');
  }
  return profile;
}

export async function getUsers() {
  await requireOwner();

  const users = await db
    .select()
    .from(userProfile)
    .where(eq(userProfile.tenantId, TENANT_ID))
    .orderBy(desc(userProfile.createdAt));

  return users.map(u => ({
    id: u.id,
    nama: u.nama,
    email: u.email,
    role: u.role,
    aktif: u.aktif,
    tenant_id: u.tenantId,
    created_at: u.createdAt?.toISOString() ?? '',
  }));
}

export async function updateUserRole(userId: string, newRole: UserRole) {
  const currentUser = await requireOwner();

  if (currentUser.id === userId) {
    throw new Error('Tidak dapat mengubah role diri sendiri.');
  }

  // Ambil data user lama untuk audit log
  const oldProfile = await db.query.userProfile.findFirst({
    where: eq(userProfile.id, userId),
  });

  await db
    .update(userProfile)
    .set({ role: newRole })
    .where(and(eq(userProfile.id, userId), eq(userProfile.tenantId, TENANT_ID)));

  // Catat Audit Log
  const { auditLog } = await import('@/db/schema');
  await db.insert(auditLog).values({
    userId: currentUser.id,
    modul: 'user-management',
    aksi: 'Update Role',
    target: userId,
    metadata: {
      user_target: oldProfile?.nama || userId,
      old_role: oldProfile?.role,
      new_role: newRole,
    },
    tenantId: TENANT_ID,
  });

  revalidatePath('/app/master/users');
  return { success: true };
}

export async function toggleUserAktif(userId: string) {
  const currentUser = await requireOwner();

  if (currentUser.id === userId) {
    throw new Error('Tidak dapat menonaktifkan diri sendiri.');
  }

  // Ambil status saat ini
  const profile = await db.query.userProfile.findFirst({
    where: eq(userProfile.id, userId),
  });

  if (!profile) throw new Error('User tidak ditemukan.');

  const newStatus = !profile.aktif;

  await db
    .update(userProfile)
    .set({ aktif: newStatus })
    .where(and(eq(userProfile.id, userId), eq(userProfile.tenantId, TENANT_ID)));

  // Catat Audit Log
  const { auditLog } = await import('@/db/schema');
  await db.insert(auditLog).values({
    userId: currentUser.id,
    modul: 'user-management',
    aksi: newStatus ? 'Aktifkan User' : 'Nonaktifkan User',
    target: userId,
    metadata: {
      user_target: profile.nama,
      status: newStatus ? 'aktif' : 'nonaktif',
    },
    tenantId: TENANT_ID,
  });

  revalidatePath('/app/master/users');
  return { success: true };
}

export async function createUser(input: {
  email: string;
  password: string;
  nama: string;
  role: UserRole;
}): Promise<{ success: boolean; error?: string }> {
  try {
    await requireOwner();
  } catch {
    return { success: false, error: 'Unauthorized: Hanya owner yang dapat mengelola user.' };
  }

  // Cek apakah email sudah ada
  const existing = await db.query.userProfile.findFirst({
    where: eq(userProfile.email, input.email.toLowerCase().trim()),
  });

  if (existing) {
    return { success: false, error: 'Email sudah terdaftar.' };
  }

  // Hash password
  const passwordHash = await bcrypt.hash(input.password, 12);

  // Insert user
  await db.insert(userProfile).values({
    email: input.email.toLowerCase().trim(),
    passwordHash,
    nama: input.nama,
    role: input.role,
    tenantId: TENANT_ID,
  });

  revalidatePath('/app/master/users');
  return { success: true };
}

export async function deleteUser(userId: string) {
  const currentUser = await requireOwner();

  if (currentUser.id === userId) {
    throw new Error('Tidak dapat menghapus diri sendiri.');
  }

  await db.delete(userProfile).where(eq(userProfile.id, userId));

  revalidatePath('/app/master/users');
  return { success: true };
}
