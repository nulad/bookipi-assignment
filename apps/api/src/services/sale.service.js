const config = require('../config/env');
const { redisClient } = require('../lib/redis');
const { FLASH_SALE_REDIS_KEYS } = require('../redis/keys');
const {
  findPurchasesByUserId: defaultFindPurchasesByUserId,
} = require('../repositories/purchase.repository');
const {
  normalizeUserId: defaultNormalizeUserId,
} = require('../utils/normalize-user-id');
const {
  getSaleStatus: defaultComputeSaleStatus,
} = require('../utils/sale-status');

async function getRemainingStock(deps = {}) {
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
  const remainingStock = await getRemainingStock(deps);
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

async function getPurchaseStatus({ userId } = {}, deps = {}) {
  const normalizeUserId = deps.normalizeUserId || defaultNormalizeUserId;
  const findPurchasesByUserId = deps.findPurchasesByUserId || defaultFindPurchasesByUserId;
  const normalizedUserId = normalizeUserId(userId);
  const purchases = await findPurchasesByUserId(normalizedUserId);

  return {
    userId: normalizedUserId,
    hasPurchased: purchases.length > 0,
  };
}

module.exports = {
  getRemainingStock,
  getSaleStatus,
  getPurchaseStatus,
};
