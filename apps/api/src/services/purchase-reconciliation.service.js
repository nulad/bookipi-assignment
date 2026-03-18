const { redisClient } = require('../lib/redis');
const { FLASH_SALE_REDIS_KEYS } = require('../redis/keys');

function createPurchasePersistenceFailureRecord({
  saleId,
  userId,
  failedAt = new Date(),
  error,
}) {
  return {
    eventType: 'purchase_persistence_failed',
    saleId: String(saleId),
    userId,
    failedAt: failedAt.toISOString(),
    errorName: error?.name || 'Error',
    errorMessage: error?.message || 'Unknown error',
  };
}

async function recordPurchasePersistenceFailure(
  payload,
  deps = {},
) {
  const redis = deps.redisClient || redisClient;
  const record = createPurchasePersistenceFailureRecord(payload);

  await redis.rPush(
    FLASH_SALE_REDIS_KEYS.purchasePersistenceFailures,
    JSON.stringify(record),
  );

  return record;
}

module.exports = {
  createPurchasePersistenceFailureRecord,
  recordPurchasePersistenceFailure,
};
