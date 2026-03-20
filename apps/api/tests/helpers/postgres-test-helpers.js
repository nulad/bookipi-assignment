const fs = require('node:fs');
const path = require('node:path');
const { URL } = require('node:url');

const { Client, Pool } = require('pg');
const config = require('../../src/config/env');

const schemaPath = path.resolve(__dirname, '../../src/scripts/schema.sql');
const schemaSql = fs.readFileSync(schemaPath, 'utf8');
const TEST_TABLES = ['purchases', 'sales'];

function requirePostgresTestUrl() {
  if (!config.postgresTestUrl) {
    throw new Error('Missing required environment variable for repository tests: POSTGRES_TEST_URL');
  }

  return config.postgresTestUrl;
}

function getAdminConnectionString(connectionString) {
  const connectionUrl = new URL(connectionString);

  connectionUrl.pathname = '/postgres';

  return connectionUrl.toString();
}

function getDatabaseName(connectionString) {
  const connectionUrl = new URL(connectionString);
  const databaseName = connectionUrl.pathname.slice(1);

  if (!databaseName) {
    throw new Error('POSTGRES_TEST_URL must include a database name');
  }

  return databaseName;
}

function quoteIdentifier(identifier) {
  return `"${identifier.replaceAll('"', '""')}"`;
}

async function ensureTestDatabaseExists(connectionString) {
  const databaseName = getDatabaseName(connectionString);

  const adminClient = new Client({
    connectionString: getAdminConnectionString(connectionString),
  });

  await adminClient.connect();

  try {
    const result = await adminClient.query(
      'SELECT 1 FROM pg_database WHERE datname = $1',
      [databaseName],
    );

    if (result.rowCount === 0) {
      try {
        await adminClient.query(`CREATE DATABASE ${quoteIdentifier(databaseName)}`);
      } catch (error) {
        if (error.code !== '42P04' && error.code !== '23505') {
          throw error;
        }
      }
    }
  } finally {
    await adminClient.end();
  }
}

async function cleanupDatabase(db) {
  await db.query(`TRUNCATE TABLE ${TEST_TABLES.join(', ')} RESTART IDENTITY CASCADE`);
}

function createTestDatabase(options = {}) {
  const connectionString = options.connectionString ?? requirePostgresTestUrl();
  const db = new Pool({
    connectionString,
  });

  async function ensureDatabaseSchema() {
    await ensureTestDatabaseExists(connectionString);
    const schemaClient = new Client({
      connectionString,
    });
    const schemaLockName = `${getDatabaseName(connectionString)}:schema`;

    await schemaClient.connect();

    try {
      await schemaClient.query(
        'SELECT pg_advisory_lock(hashtext($1))',
        [schemaLockName],
      );
      await schemaClient.query(schemaSql);
    } finally {
      await Promise.allSettled([
        schemaClient.query(
          'SELECT pg_advisory_unlock(hashtext($1))',
          [schemaLockName],
        ),
        schemaClient.end(),
      ]);
    }
  }

  async function closeDatabase() {
    await db.end();
  }

  async function cleanupDatabaseState() {
    await cleanupDatabase(db);
  }

  async function openTransaction() {
    const client = await db.connect();
    await client.query('BEGIN');

    return client;
  }

  return {
    db,
    ensureDatabaseSchema,
    cleanupDatabase: cleanupDatabaseState,
    closeDatabase,
    openTransaction,
  };
}

module.exports = {
  cleanupDatabase,
  createTestDatabase,
};
