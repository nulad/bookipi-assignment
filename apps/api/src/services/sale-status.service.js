const config = require('../config/env');
const { redisClient } = require('../lib/redis');
const { FLASH_SALE_REDIS_KEYS } = require('../redis/keys');
const {
  computeSaleStatus: defaultComputeSaleStatus,
} = require('../utils/sale-status');

async function readRemainingStock(deps = {}) {
  const redis = deps.redisClient || redisClient;
  const stockKey = deps.stockKey || FLASH_SALE_REDIS_KEYS.stock;
  const rawRemainingStock = await redis.get(stockKey);

  if (rawRemainingStock === null) {
    throw new Error('Sale stock is not initialized in Redis');
  }

  const remainingStock = Number(rawRemainingStock);

  if (!Number.isInteger(remainingStock) || remainingStock < 0) {
    throw new Error('Redis stock value is invalid');
  }

  return remainingStock;
}

async function getSaleStatus({ now = new Date() } = {}, deps = {}) {
  const saleConfig = deps.saleConfig || config.sale;
  const computeSaleStatus = deps.computeSaleStatus || defaultComputeSaleStatus;
  const remainingStock = await readRemainingStock(deps);
  const status = computeSaleStatus({
    now,
    startTime: saleConfig.startTime,
    endTime: saleConfig.endTime,
    remainingStock,
  });

  return {
    status,
    remainingStock,
  };
}

module.exports = {
  getSaleStatus,
  readRemainingStock,
};
