const { FLASH_SALE_REDIS_KEYS } = require('../../src/redis/keys');
const { resetSaleState } = require('../../src/scripts/init-sale');

async function clearRedisState(redisClient) {
  await redisClient.del(...Object.values(FLASH_SALE_REDIS_KEYS));
}

async function resetRedisState(redisClient, options = {}) {
  return resetSaleState(redisClient, options.initialStock, options.saleId);
}

module.exports = {
  clearRedisState,
  resetRedisState,
};
