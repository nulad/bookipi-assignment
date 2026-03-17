const fs = require('node:fs/promises');
const path = require('node:path');
const dotenv = require('dotenv');
const { Client } = require('pg');

const envPath = path.resolve(__dirname, '../../../../.env');
dotenv.config({ path: envPath });

async function applySchema() {
  const connectionString = process.env.POSTGRES_URL;

  if (!connectionString) {
    throw new Error(`Missing required environment variable: POSTGRES_URL (expected in ${envPath})`);
  }

  const schemaPath = path.resolve(__dirname, 'schema.sql');
  const schemaSql = await fs.readFile(schemaPath, 'utf8');
  const client = new Client({ connectionString });

  await client.connect();

  try {
    await client.query(schemaSql);
    console.log(`Applied schema from ${schemaPath}`);
  } finally {
    await client.end();
  }
}

applySchema().catch((error) => {
  console.error(`Failed to apply schema: ${error.message}`);
  process.exit(1);
});
