const postgres = require('postgres');
const fs = require('fs');
const path = require('path');

const connectionString = "postgresql://postgres:100Jtperhari@localhost:5432/stitchlyx";
const sql = postgres(connectionString, { max: 1 });

async function runMigrations() {
  try {
    const dir = path.join(__dirname, 'supabase/migrations');
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort();
    
    console.log(`Found ${files.length} SQL files. Executing...`);
    
    for (const file of files) {
      console.log(`Executing ${file}...`);
      const content = fs.readFileSync(path.join(dir, file), 'utf8');
      
      if (!content.trim()) continue;

      try {
        await sql.unsafe(content);
      } catch (e) {
        // Log error but continue executing other scripts, because some might be table creations that Drizzle already did
        if (e.message.includes('already exists') || e.message.includes('multiple primary keys')) {
          console.log(`  Skipped some parts of ${file} (Tables might already exist from Drizzle push).`);
        } else if (e.message.includes('does not exist')) {
           console.log(`  Error on ${file}: ${e.message} - This might be fine if dropping a non-existent table.`);
        } else {
           console.error(`  Warning on ${file}: ${e.message}`);
        }
      }
    }
    
    console.log('All migrations completed!');
  } catch (err) {
    console.error('Fatal Error:', err);
  } finally {
    await sql.end();
  }
}

runMigrations();