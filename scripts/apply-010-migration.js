require('dotenv').config({ path: '.env.local' });
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const projectRef = supabaseUrl ? supabaseUrl.replace('https://', '').split('.')[0] : null;

  console.log('Project Reference:', projectRef);

  // Try standard database ports and password if available in env, or log instructions
  const dbPassword = process.env.SUPABASE_DB_PASSWORD || process.env.DB_PASSWORD;
  
  if (dbPassword && projectRef) {
    const client = new Client({
      host: `db.${projectRef}.supabase.co`,
      port: 5432,
      user: 'postgres',
      password: dbPassword,
      database: 'postgres',
      ssl: { rejectUnauthorized: false }
    });

    try {
      await client.connect();
      const sql = fs.readFileSync(path.join(__dirname, '../migrations/010_add_wheels_manager_role.sql'), 'utf8');
      await client.query(sql);
      console.log('Successfully applied migration 010_add_wheels_manager_role.sql');
      await client.end();
      return;
    } catch (err) {
      console.error('Direct pg connection error:', err.message);
    }
  }

  console.log('Notice: If DB password is not in env, ensure migration 010_add_wheels_manager_role.sql is applied via Supabase SQL Editor.');
}

main();
