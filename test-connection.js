const postgres = require('postgres');

const DB_URL = 'postgres://konveksifz:100jtperhari%40%40@elyasr-pribadi_konveksi-fz-dbb:5432/konveksi-fz-dbb?sslmode=disable';

const sql = postgres(DB_URL, { max: 1 });

sql`SELECT 1 as ok`
  .then(r => {
    console.log('✅ Koneksi ke Railway DB BERHASIL:', r);
    return sql.end();
  })
  .catch(e => {
    console.error('❌ Koneksi GAGAL:', e.message);
    return sql.end();
  });
