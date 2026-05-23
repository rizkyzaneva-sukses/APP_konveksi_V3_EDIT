// =============================================================================
// src/lib/supabase/middleware.ts
// DEPRECATED — Middleware sekarang menggunakan src/middleware.ts langsung.
// File ini dipertahankan untuk backward compatibility.
// =============================================================================

import { NextResponse, type NextRequest } from 'next/server';

export async function updateSession(request: NextRequest) {
  return {
    supabase: null,
    supabaseResponse: NextResponse.next({ request }),
    user: null,
  };
}
