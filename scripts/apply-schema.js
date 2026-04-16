require('dotenv').config({ path: '.env.local' });
const fs = require('fs');
const { Client } = require('pg');

(async () => {
  const sql = fs.readFileSync('supabase-schema.sql', 'utf8');
  const client = new Client({
    connectionString: process.env.SUPABASE_DB_URL,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();
  await client.query(sql);
  await client.end();
  console.log('schema applied');
})().catch((error) => {
  console.error('schema apply failed:', error);
  process.exit(1);
});
