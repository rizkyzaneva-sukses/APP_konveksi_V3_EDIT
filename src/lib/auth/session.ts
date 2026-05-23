// =============================================================================
// src/lib/auth/session.ts
// Custom session management menggunakan JWT (jose) + httpOnly cookie.
// =============================================================================

import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';

const SESSION_COOKIE = 'session_token';
const SECRET = new TextEncoder().encode(process.env.JWT_SECRET || 'fallback-secret-change-me');

export interface SessionPayload {
  userId: string;
  email: string;
  role: string;
  nama: string;
  tenantId: string;
}

/**
 * Buat JWT token dan set sebagai httpOnly cookie.
 */
export async function createSession(payload: SessionPayload): Promise<void> {
  const token = await new SignJWT(payload as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(SECRET);

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7, // 7 hari
  });
}

/**
 * Ambil session dari cookie. Return null jika tidak ada atau expired.
 */
export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;

  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, SECRET);
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

/**
 * Hapus session cookie (logout).
 */
export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}
