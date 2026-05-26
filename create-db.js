const postgres = require('postgres');
const sql = postgres('postgresql://postgres:100Jtperhari@localhost:5432/postgres');
sql`CREATE DATABASE stitchlyx`
  .then(()=>console.log('Database created'))
  .catch(e => {
    if(e.message.includes('already exists')) {
      console.log('Database already exists')
    } else {
      console.error(e)
    }
  })
  .finally(() => process.exit(0));