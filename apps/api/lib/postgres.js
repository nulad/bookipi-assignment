const { Pool } = require('pg');
const config = require('../config/env');

const postgresPool = new Pool({
  connectionString: config.postgresUrl,
});

postgresPool.on('error', (error) => {
  console.error('Postgres pool error:', error.message);
});

async function verifyPostgresConnection() {
  await postgresPool.query('SELECT 1');

  return postgresPool;
}

async function disconnectPostgres() {
  await postgresPool.end();
}

module.exports = {
  postgresPool,
  verifyPostgresConnection,
  disconnectPostgres,
};
