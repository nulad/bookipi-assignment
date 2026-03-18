const request = require('supertest');

const { createApp } = require('../../src/app');
const config = require('../../src/config/env');
const { verifyPostgresConnection, disconnectPostgres } = require('../../src/lib/postgres');
const { connectRedis, disconnectRedis, redisClient } = require('../../src/lib/redis');
const { getOrCreateSale } = require('../../src/repositories/sale.repository');
const { createTestDatabase } = require('./postgres-test-helpers');
const { acquireRedisTestLock, releaseRedisTestLock } = require('./redis-test-lock');
const { clearRedisState, resetRedisState } = require('./redis-test-helpers');

function cloneSaleConfig(saleConfig) {
  return {
    productName: saleConfig.productName,
    initialStock: saleConfig.initialStock,
    startTime: new Date(saleConfig.startTime),
    endTime: new Date(saleConfig.endTime),
  };
}

function applySaleConfig(saleConfig) {
  config.sale.productName = saleConfig.productName;
  config.sale.initialStock = saleConfig.initialStock;
  config.sale.startTime = saleConfig.startTime;
  config.sale.endTime = saleConfig.endTime;
}

function createBackendTestHarness(options = {}) {
  const appFactory = options.appFactory ?? createApp;
  const testDatabase = createTestDatabase();
  const defaultSaleConfig = cloneSaleConfig(config.sale);
  let redisLockToken;

  async function setupSuite() {
    await testDatabase.ensureDatabaseSchema();
    await verifyPostgresConnection();
    await connectRedis();
  }

  async function teardownSuite() {
    await Promise.allSettled([
      disconnectRedis(),
      disconnectPostgres(),
      testDatabase.closeDatabase(),
    ]);
  }

  async function cleanDatabase() {
    await testDatabase.cleanupDatabase();
  }

  async function clearState() {
    await Promise.all([
      cleanDatabase(),
      clearRedisState(redisClient),
    ]);
  }

  async function seedSaleState(options = {}) {
    const saleConfig = {
      ...cloneSaleConfig(defaultSaleConfig),
      ...options.saleConfig,
    };
    const initialStock = options.initialStock ?? saleConfig.initialStock;

    applySaleConfig(saleConfig);
    const sale = await getOrCreateSale(saleConfig);

    await resetRedisState(redisClient, {
      initialStock,
      saleId: sale.id,
    });

    return sale;
  }

  async function setupTest(options = {}) {
    redisLockToken = await acquireRedisTestLock(redisClient);
    await clearState();

    if (options.seedSale !== false) {
      const sale = await seedSaleState(options);

      return { sale };
    }

    applySaleConfig({
      ...cloneSaleConfig(defaultSaleConfig),
      ...options.saleConfig,
    });

    return {};
  }

  async function teardownTest() {
    try {
      await clearState();
    } finally {
      applySaleConfig(cloneSaleConfig(defaultSaleConfig));

      if (redisLockToken) {
        await releaseRedisTestLock(redisClient, redisLockToken);
        redisLockToken = undefined;
      }
    }
  }

  function createRequest(app = appFactory()) {
    return request(app);
  }

  function getDefaultSaleConfig() {
    return cloneSaleConfig(defaultSaleConfig);
  }

  return {
    cleanDatabase,
    clearRedisState: () => clearRedisState(redisClient),
    createRequest,
    getDefaultSaleConfig,
    seedSaleState,
    setupSuite,
    setupTest,
    teardownSuite,
    teardownTest,
  };
}

module.exports = {
  createBackendTestHarness,
};
