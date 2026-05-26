const postgres = require('postgres');

async function resetDb() {
  const sql = postgres('postgresql://postgres:100Jtperhari@localhost:5432/postgres');
  
  try {
    console.log('Dropping database stitchlyx...');
    await sql`DROP DATABASE IF EXISTS stitchlyx WITH (FORCE)`;
    console.log('Database dropped.');

    console.log('Creating database stitchlyx...');
    await sql`CREATE DATABASE stitchlyx`;
    console.log('Database created.');

  } catch (e) {
    console.error('Error:', e);
  } finally {
    await sql.end();
  }

  // Create role in the new DB
  const dbSql = postgres('postgresql://postgres:100Jtperhari@localhost:5432/stitchlyx');
  try {
    await dbSql`CREATE ROLE authenticated`;
    console.log('Role authenticated created.');
  } catch (e) {
    console.log('Role authenticated might already exist:', e.message);
  } finally {
    await dbSql.end();
  }
}

resetDb();