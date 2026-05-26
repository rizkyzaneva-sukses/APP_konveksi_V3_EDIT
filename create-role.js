const postgres = require('postgres');
const sql = postgres('postgresql://postgres:100Jtperhari@localhost:5432/stitchlyx');
sql`CREATE ROLE authenticated`
  .then(()=>console.log('Role authenticated created'))
  .catch(e => console.log('Role might exist:', e.message))
  .finally(() => process.exit(0));