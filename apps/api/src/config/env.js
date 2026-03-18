const path = require('node:path');
const dotenv = require('dotenv');

const envPath = path.resolve(__dirname, '../../../../.env');
dotenv.config({ path: envPath });

function requireEnv(name) {
  const value = process.env[name];

  if (value === undefined || value === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function parseInteger(name) {
  const value = requireEnv(name);
  const normalizedValue = value.trim();

  if (!/^[+-]?\d+$/.test(normalizedValue)) {
    throw new Error(`Environment variable ${name} must be a valid integer`);
  }

  const parsedValue = Number.parseInt(normalizedValue, 10);

  if (!Number.isInteger(parsedValue)) {
    throw new Error(`Environment variable ${name} must be a valid integer`);
  }

  return parsedValue;
}

function parseDate(name) {
  const value = requireEnv(name);
  const parsedValue = new Date(value);

  if (Number.isNaN(parsedValue.getTime())) {
    throw new Error(`Environment variable ${name} must be a valid ISO-8601 date`);
  }

  return parsedValue;
}

function isTestRuntime() {
  return process.env.NODE_ENV === 'test' || process.env.VITEST !== undefined;
}

const port = parseInteger('PORT');
const postgresTestUrl = process.env.POSTGRES_TEST_URL;
const postgresUrl = isTestRuntime() && postgresTestUrl
  ? postgresTestUrl
  : requireEnv('POSTGRES_URL');
const redisUrl = requireEnv('REDIS_URL');
const saleProductName = requireEnv('SALE_PRODUCT_NAME');
const saleStartTime = parseDate('SALE_START_TIME');
const saleEndTime = parseDate('SALE_END_TIME');
const saleInitialStock = parseInteger('SALE_INITIAL_STOCK');

if (saleEndTime <= saleStartTime) {
  throw new Error('SALE_END_TIME must be later than SALE_START_TIME');
}

if (saleInitialStock < 0) {
  throw new Error('SALE_INITIAL_STOCK must be zero or greater');
}

module.exports = {
  port,
  postgresUrl,
  postgresTestUrl,
  redisUrl,
  sale: {
    productName: saleProductName,
    startTime: saleStartTime,
    endTime: saleEndTime,
    initialStock: saleInitialStock,
  },
};
