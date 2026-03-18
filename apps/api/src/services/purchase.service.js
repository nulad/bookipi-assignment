const config = require('../config/env');
const { redisClient } = require('../lib/redis');
const {
  createPurchase: defaultCreatePurchase,
} = require('../repositories/purchase.repository');
const { getOrCreateSale: defaultGetOrCreateSale } = require('../repositories/sale.repository');
const { FLASH_SALE_REDIS_KEYS } = require('../redis/keys');
const {
  PURCHASE_SCRIPT_RESULTS,
  runPurchaseScript: defaultPurchaseScript,
} = require('../redis/purchase-script');
const { normalizeUserId: defaultNormalizeUserId } = require('../utils/normalize-user-id');

const luaStatusMap = {
  [PURCHASE_SCRIPT_RESULTS.SUCCESS]: 'success',
  [PURCHASE_SCRIPT_RESULTS.ALREADY_PURCHASED]: 'already_purchased',
  [PURCHASE_SCRIPT_RESULTS.SOLD_OUT]: 'sold_out',
  [PURCHASE_SCRIPT_RESULTS.NOT_STARTED]: 'sale_not_started',
  [PURCHASE_SCRIPT_RESULTS.ENDED]: 'sale_ended',
};

async function getActiveSaleId(deps = {}) {
  const redis = deps.redisClient || redisClient;
  const saleConfig = deps.saleConfig || config.sale;
  const getOrCreateSale = deps.getOrCreateSale || defaultGetOrCreateSale;
  const cachedSaleId = await redis.get(FLASH_SALE_REDIS_KEYS.activeSaleId);

  if (typeof cachedSaleId === 'string' && cachedSaleId.length > 0) {
    return cachedSaleId;
  }

  const sale = await getOrCreateSale(saleConfig);
  await redis.set(FLASH_SALE_REDIS_KEYS.activeSaleId, sale.id);

  return sale.id;
}

async function purchase({ userId, now = new Date() }, deps = {}) {
  const redis = deps.redisClient || redisClient;
  const saleConfig = deps.saleConfig || config.sale;
  const normalizeUserId = deps.normalizeUserId || defaultNormalizeUserId;
  const runPurchaseScript = deps.runPurchaseScript || defaultPurchaseScript;
  const createPurchase = deps.createPurchase || defaultCreatePurchase;
  const normalizedUserId = normalizeUserId(userId);

  const nowMs = now.getTime();
  const saleStartMs = saleConfig.startTime.getTime();
  const saleEndMs = saleConfig.endTime.getTime();

  const result = await runPurchaseScript({
    redisClient: redis,
    userId: normalizedUserId,
    nowMs,
    saleStartMs,
    saleEndMs,
  });
  const status = luaStatusMap[result];

  if (!status) {
    throw new Error(`Unexpected purchase script result: ${String(result)}`);
  }

  if (result === PURCHASE_SCRIPT_RESULTS.SUCCESS) {
    const saleId = await getActiveSaleId({
      redisClient: redis,
      saleConfig,
      getOrCreateSale: deps.getOrCreateSale,
    });
    const purchaseRecord = await createPurchase({
      saleId,
      userId: normalizedUserId,
    });

    return { status, purchase: purchaseRecord };
  }

  return { status };
}

module.exports = {
  getActiveSaleId,
  purchase,
};
