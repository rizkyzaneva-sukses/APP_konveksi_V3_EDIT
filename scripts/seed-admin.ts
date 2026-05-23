// =============================================================================
// scripts/seed-admin.ts
// Jalankan sekali setelah deploy untuk membuat user owner pertama.
// Usage: npx tsx scripts/seed-admin.ts
// =============================================================================

import postgres from 'postgres';
import bcrypt from 'bcryptjs';

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('ERROR: DATABASE_URL environment variable is required');
  process.exit(1);
}

const sql = postgres(DATABASE_URL);

async function seed() {
  const email = process.env.ADMIN_EMAIL || 'admin@stitchlyx.com';
  const password = process.env.ADMIN_PASSWORD || 'admin123456';
  const nama = process.env.ADMIN_NAMA || 'Owner';

  console.log(`Creating admin user: ${email}`);

  const passwordHash = await bcrypt.hash(password, 12);

  // Check if user already exists
  const existing = await sql`SELECT id FROM user_profile WHERE email = ${email}`;
  
  if (existing.length > 0) {
    console.log('Admin user already exists. Skipping.');
    await sql.end();
    return;
  }

  await sql`
    INSERT INTO user_profile (email, password_hash, nama, role, aktif, tenant_id)
    VALUES (${email}, ${passwordHash}, ${nama}, 'owner', true, 'STX-001')
  `;

  console.log('Admin user created successfully!');
  console.log(`  Email: ${email}`);
  console.log(`  Password: ${password}`);
  console.log('  Role: owner');
  console.log('');
  console.log('PENTING: Segera ganti password setelah login pertama!');

  await sql.end();
}

seed().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});
