import { NextResponse, type NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

const SESSION_COOKIE = 'session_token';
const SECRET = new TextEncoder().encode(process.env.JWT_SECRET || 'fallback-secret-change-me');

// ---------------------------------------------------------------------------
// Proxy (Middleware) utama — proteksi route /app/*
// Next.js 16 menggunakan proxy.ts sebagai pengganti middleware.ts
// ---------------------------------------------------------------------------
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get(SESSION_COOKIE)?.value;

  let user: { userId: string; role: string } | null = null;

  if (token) {
    try {
      const { payload } = await jwtVerify(token, SECRET);
      user = { userId: payload.userId as string, role: payload.role as string };
    } catch {
      // Token invalid/expired — treat as unauthenticated
    }
  }

  // Route proteksi: semua yang diawali /app wajib punya session
  const isProtected = pathname.startsWith('/app');

  if (isProtected && !user) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Redirect user yang sudah login dari /login ke /app/dashboard
  if (pathname === '/login' && user) {
    return NextResponse.redirect(new URL('/app/dashboard', request.url));
  }

  return NextResponse.next();
}

// ---------------------------------------------------------------------------
// Matcher — jalankan proxy di semua route kecuali static assets
// ---------------------------------------------------------------------------
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
