const config = require('../config/env');
const { redisClient } = require('../lib/redis');
const { getOrCreateSale: defaultGetOrCreateSale } = require('../repositories/sale.repository');
const { FLASH_SALE_REDIS_KEYS } = require('../redis/keys');

async function ensureActiveSale({ saleConfig = config.sale } = {}, deps = {}) {
  const getOrCreateSale = deps.getOrCreateSale || defaultGetOrCreateSale;

  return getOrCreateSale(saleConfig);
}

async function resolveActiveSaleId({ saleConfig = config.sale } = {}, deps = {}) {
  const redis = deps.redisClient || redisClient;
  const cachedSaleId = await redis.get(FLASH_SALE_REDIS_KEYS.activeSaleId);

  if (typeof cachedSaleId === 'string' && cachedSaleId.length > 0) {
    return cachedSaleId;
  }

  const sale = await ensureActiveSale({ saleConfig }, deps);
  await redis.set(FLASH_SALE_REDIS_KEYS.activeSaleId, sale.id);

  return sale.id;
}

module.exports = {
  ensureActiveSale,
  resolveActiveSaleId,
};
