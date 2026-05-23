// =============================================================================
// src/lib/supabase/client.ts
// DEPRECATED — Browser client tidak lagi dibutuhkan.
// Auth sekarang dilakukan via Server Actions.
// File ini dipertahankan untuk backward compatibility jika ada import.
// =============================================================================

export function createClient() {
  console.warn('[DEPRECATED] createClient dari supabase/client tidak lagi digunakan. Gunakan Server Actions.');
  return null;
}
