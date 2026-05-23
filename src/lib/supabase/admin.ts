// =============================================================================
// src/lib/supabase/admin.ts
// Compatibility layer — alias ke createClient karena tidak ada lagi
// perbedaan antara admin dan regular client (semua query langsung ke PostgreSQL).
// =============================================================================

import { createClient } from './server';

export const createAdminClient = () => {
  // Karena kita langsung query ke PostgreSQL, tidak ada perbedaan privilege.
  // Semua query berjalan dengan full access ke database.
  return createClient();
};
