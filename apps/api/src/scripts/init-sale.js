const { createClient } = require('redis');

const config = require('../config/env');
const { disconnectPostgres } = require('../lib/postgres');
const { FLASH_SALE_REDIS_KEYS } = require('../redis/keys');
const { ensureActiveSale: defaultEnsureActiveSale } = require('../services/active-sale.service');

function resolveInitialStock(initialStock) {
  if (initialStock === undefined) {
    const envInitialStock = process.env.SALE_INITIAL_STOCK;

    return resolveInitialStock(envInitialStock === undefined ? config.sale.initialStock : envInitialStock);
  }

  const parsedInitialStock = typeof initialStock === 'string'
    ? Number.parseInt(initialStock.trim(), 10)
    : initialStock;

  if (
    !Number.isInteger(parsedInitialStock)
    || parsedInitialStock < 0
    || (typeof initialStock === 'string' && !/^[+-]?\d+$/.test(initialStock.trim()))
  ) {
    throw new Error('Initial stock must be an integer greater than or equal to 0');
  }

  return parsedInitialStock;
}

async function connectInitSaleRedis(redisUrl) {
  const redisClient = createClient({
    url: redisUrl ?? config.redisUrl,
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
  const ensureActiveSale = options.ensureActiveSale ?? defaultEnsureActiveSale;
  const disconnectDb = options.disconnectPostgres ?? disconnectPostgres;
  const usesDefaultSaleDependencies = (
    options.ensureActiveSale === undefined
    && options.getOrCreateSale === undefined
  );

  if (options.redisClient) {
    try {
      const sale = await ensureActiveSale(
        { saleConfig },
        { getOrCreateSale: options.getOrCreateSale },
      );
      
      return await resetSaleState(options.redisClient, initialStock, sale.id);
    } finally {
      if (usesDefaultSaleDependencies) {
        await disconnectDb();
      }
    }
  }

  const connectRedis = options.connectRedis ?? connectInitSaleRedis;
  const disconnectRedis = options.disconnectRedis ?? disconnectRedisClient;
  const redisClient = await connectRedis(options.redisUrl);

  try {
    const sale = await ensureActiveSale(
      { saleConfig },
      { getOrCreateSale: options.getOrCreateSale },
    );

    return await resetSaleState(redisClient, initialStock, sale.id);
  } finally {
    await Promise.allSettled([
      disconnectRedis(redisClient),
      usesDefaultSaleDependencies ? disconnectDb() : Promise.resolve(),
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
