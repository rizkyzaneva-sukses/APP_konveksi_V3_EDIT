'use server';

import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import { db } from '@/db';
import { userProfile } from '@/db/schema';
import { createSession, destroySession } from './session';

// ---------------------------------------------------------------------------
// Login
// ---------------------------------------------------------------------------
export async function loginAction(formData: { email: string; password: string }): Promise<{ error?: string }> {
  const { email, password } = formData;

  const user = await db.query.userProfile.findFirst({
    where: eq(userProfile.email, email.toLowerCase().trim()),
  });

  if (!user) {
    return { error: 'Email atau password salah.' };
  }

  if (!user.aktif) {
    return { error: 'Akun Anda telah dinonaktifkan.' };
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    return { error: 'Email atau password salah.' };
  }

  await createSession({
    userId: user.id,
    email: user.email,
    role: user.role,
    nama: user.nama,
    tenantId: user.tenantId,
  });

  return {};
}

// ---------------------------------------------------------------------------
// Logout
// ---------------------------------------------------------------------------
export async function signOutAction(): Promise<void> {
  await destroySession();
  redirect('/login');
}
