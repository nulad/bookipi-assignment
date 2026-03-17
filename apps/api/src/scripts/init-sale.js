const path = require('node:path');
const dotenv = require('dotenv');
const { createClient } = require('redis');

const { FLASH_SALE_REDIS_KEYS } = require('../redis/keys');

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

async function resetSaleState(redisClient, initialStock) {
  const normalizedInitialStock = resolveInitialStock(initialStock);

  await redisClient
    .multi()
    .set(FLASH_SALE_REDIS_KEYS.stock, normalizedInitialStock.toString())
    .del(FLASH_SALE_REDIS_KEYS.purchasedUsers)
    .exec();

  return {
    initialStock: normalizedInitialStock,
    stockKey: FLASH_SALE_REDIS_KEYS.stock,
    purchasedUsersKey: FLASH_SALE_REDIS_KEYS.purchasedUsers,
  };
}

async function runInitSale(options = {}) {
  const initialStock = resolveInitialStock(options.initialStock);

  if (options.redisClient) {
    return resetSaleState(options.redisClient, initialStock);
  }

  const connectRedis = options.connectRedis ?? connectInitSaleRedis;
  const disconnectRedis = options.disconnectRedis ?? disconnectRedisClient;
  const redisClient = await connectRedis(options.redisUrl);

  try {
    return await resetSaleState(redisClient, initialStock);
  } finally {
    await disconnectRedis(redisClient);
  }
}

async function main() {
  const result = await runInitSale({
    initialStock: process.argv[2],
  });

  console.log(
    `Initialized flash sale state with stock=${result.initialStock} using keys ${result.stockKey} and ${result.purchasedUsersKey}`,
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
