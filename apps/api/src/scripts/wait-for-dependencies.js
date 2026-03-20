const { Client } = require('pg');
const { createClient } = require('redis');

const config = require('../config/env');

function resolvePostgresWaitConnectionString() {
  return process.env.DEPENDENCY_WAIT_POSTGRES_URL
    ?? process.env.POSTGRES_URL
    ?? config.postgresUrl;
}

function parsePositiveInteger(name, fallbackValue) {
  const rawValue = process.env[name];

  if (rawValue === undefined || rawValue === '') {
    return fallbackValue;
  }

  if (!/^\d+$/.test(rawValue.trim())) {
    throw new Error(`${name} must be a positive integer when provided`);
  }

  const parsedValue = Number.parseInt(rawValue, 10);

  if (parsedValue <= 0) {
    throw new Error(`${name} must be a positive integer when provided`);
  }

  return parsedValue;
}

async function sleep(delayMs) {
  await new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });
}

async function verifyPostgresConnection() {
  const client = new Client({
    connectionString: resolvePostgresWaitConnectionString(),
  });

  await client.connect();

  try {
    await client.query('SELECT 1');
  } finally {
    await client.end();
  }
}

async function verifyRedisConnection() {
  const client = createClient({
    url: config.redisUrl,
  });

  client.on('error', () => {});

  await client.connect();

  try {
    await client.ping();
  } finally {
    if (client.isOpen) {
      await client.quit();
    }
  }
}

async function waitForDependencies() {
  const maxAttempts = parsePositiveInteger('DEPENDENCY_WAIT_ATTEMPTS', 30);
  const delayMs = parsePositiveInteger('DEPENDENCY_WAIT_DELAY_MS', 2000);

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await verifyPostgresConnection();
      await verifyRedisConnection();
      console.log(`Dependencies ready after ${attempt} attempt(s).`);
      return;
    } catch (error) {
      if (attempt === maxAttempts) {
        throw error;
      }

      console.log(
        `Dependencies not ready yet (attempt ${attempt}/${maxAttempts}): ${error.message}`,
      );
      await sleep(delayMs);
    }
  }
}

waitForDependencies().catch((error) => {
  console.error(`Failed waiting for dependencies: ${error.message}`);
  process.exit(1);
});
