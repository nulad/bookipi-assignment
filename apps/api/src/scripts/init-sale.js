const path = require('node:path');
const dotenv = require('dotenv');
const { createClient } = require('redis');

const config = require('../config/env');
const { disconnectPostgres } = require('../lib/postgres');
const { FLASH_SALE_REDIS_KEYS } = require('../redis/keys');
const { getOrCreateSale: defaultGetOrCreateSale } = require('../repositories/sale.repository');

const envPath = path.resolve(__dirname, '../../../../.env');
dotenv.config({ path: envPath });

function requireEnv(name) {
  const value = process.env[name];

  if (value === undefined || value === '') {
    throw new Error(`Missing required environment variable: ${name} (expected in ${envPath})`);
  }

  return value;
}

function resolveInitialStock(initialStock) {
  if (initialStock === undefined) {
    return resolveInitialStock(requireEnv('SALE_INITIAL_STOCK'));
  }

  const parsedInitialStock = typeof initialStock === 'string'
    ? Number(initialStock)
    : initialStock;

  if (!Number.isInteger(parsedInitialStock) || parsedInitialStock < 0) {
    throw new Error('Initial stock must be an integer greater than or equal to 0');
  }

  return parsedInitialStock;
}

function resolveRedisUrl(redisUrl) {
  return redisUrl ?? requireEnv('REDIS_URL');
}

async function connectInitSaleRedis(redisUrl) {
  const redisClient = createClient({
    url: resolveRedisUrl(redisUrl),
  });

  redisClient.on('error', (error) => {
    console.error('Redis client error:', error.message);
  });

  try {
    await redisClient.connect();
    await redisClient.ping();
  } catch (error) {
    await disconnectRedisClient(redisClient);
    throw error;
  }

  return redisClient;
}

async function disconnectRedisClient(redisClient) {
  if (redisClient?.isOpen) {
    await redisClient.quit();
  }
}

async function resetSaleState(redisClient, initialStock, saleId) {
  const normalizedInitialStock = resolveInitialStock(initialStock);

  const transaction = redisClient
    .multi()
    .set(FLASH_SALE_REDIS_KEYS.stock, normalizedInitialStock.toString())
    .del(FLASH_SALE_REDIS_KEYS.purchasedUsers);

  const result = {
    initialStock: normalizedInitialStock,
    stockKey: FLASH_SALE_REDIS_KEYS.stock,
    purchasedUsersKey: FLASH_SALE_REDIS_KEYS.purchasedUsers,
  };

  if (saleId === undefined) {
    transaction.del(FLASH_SALE_REDIS_KEYS.activeSaleId);
  } else {
    if (typeof saleId !== 'string' || saleId.length === 0) {
      throw new Error('saleId must be a non-empty string');
    }

    transaction.set(FLASH_SALE_REDIS_KEYS.activeSaleId, saleId);
    result.saleId = saleId;
    result.activeSaleIdKey = FLASH_SALE_REDIS_KEYS.activeSaleId;
  }

  await transaction.exec();

  return result;
}

async function runInitSale(options = {}) {
  const initialStock = resolveInitialStock(options.initialStock);
  const saleConfig = options.saleConfig ?? config.sale;
  const getOrCreateSale = options.getOrCreateSale ?? defaultGetOrCreateSale;
  const disconnectDb = options.disconnectPostgres ?? disconnectPostgres;
  const usesDefaultSaleRepository = options.getOrCreateSale === undefined;

  if (options.redisClient) {
    const sale = await getOrCreateSale(saleConfig);

    try {
      return await resetSaleState(options.redisClient, initialStock, sale.id);
    } finally {
      if (usesDefaultSaleRepository) {
        await disconnectDb();
      }
    }
  }

  const connectRedis = options.connectRedis ?? connectInitSaleRedis;
  const disconnectRedis = options.disconnectRedis ?? disconnectRedisClient;
  const redisClient = await connectRedis(options.redisUrl);

  try {
    const sale = await getOrCreateSale(saleConfig);

    return await resetSaleState(redisClient, initialStock, sale.id);
  } finally {
    await Promise.allSettled([
      disconnectRedis(redisClient),
      usesDefaultSaleRepository ? disconnectDb() : Promise.resolve(),
    ]);
  }
}

async function main() {
  const result = await runInitSale({
    initialStock: process.argv[2],
  });

  console.log(
    `Initialized flash sale state with saleId=${result.saleId} stock=${result.initialStock} using keys ${result.stockKey}, ${result.purchasedUsersKey}, and ${result.activeSaleIdKey}`,
  );
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`Failed to initialize flash sale state: ${error.message}`);
    process.exit(1);
  });
}

module.exports = {
  connectInitSaleRedis,
  disconnectRedisClient,
  resetSaleState,
  runInitSale,
};
