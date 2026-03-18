const config = require('../config/env');
const { redisClient } = require('../lib/redis');
const {
  createPurchase: defaultCreatePurchase,
} = require('../repositories/purchase.repository');
const {
  resolveActiveSaleId: defaultResolveActiveSaleId,
} = require('./active-sale.service');
const {
  PurchasePersistenceError,
} = require('../errors/purchase-persistence-error');
const {
  PURCHASE_SCRIPT_RESULTS,
  runPurchaseScript: defaultPurchaseScript,
} = require('../redis/purchase-script');
const {
  recordPurchasePersistenceFailure: defaultRecordPurchasePersistenceFailure,
} = require('./purchase-reconciliation.service');
const { normalizeUserId: defaultNormalizeUserId } = require('../utils/normalize-user-id');
const { FLASH_SALE_REDIS_KEYS } = require('../redis/keys');

const PURCHASE_STATUS_BY_SCRIPT_RESULT = {
  [PURCHASE_SCRIPT_RESULTS.SUCCESS]: 'success',
  [PURCHASE_SCRIPT_RESULTS.ALREADY_PURCHASED]: 'already_purchased',
  [PURCHASE_SCRIPT_RESULTS.SOLD_OUT]: 'sold_out',
  [PURCHASE_SCRIPT_RESULTS.NOT_STARTED]: 'sale_not_started',
  [PURCHASE_SCRIPT_RESULTS.ENDED]: 'sale_ended',
};

function serializeError(error) {
  return {
    name: error?.name || 'Error',
    message: error?.message || 'Unknown error',
  };
}

async function purchase({ userId, now = new Date() }, deps = {}) {
  const redis = deps.redisClient || redisClient;
  const saleConfig = deps.saleConfig || config.sale;
  const normalizeUserId = deps.normalizeUserId || defaultNormalizeUserId;
  const runPurchaseScript = deps.runPurchaseScript || defaultPurchaseScript;
  const createPurchase = deps.createPurchase || defaultCreatePurchase;
  const resolveActiveSaleId = deps.resolveActiveSaleId || defaultResolveActiveSaleId;
  const logger = deps.logger || console;
  const recordPurchasePersistenceFailure = (
    deps.recordPurchasePersistenceFailure
    || defaultRecordPurchasePersistenceFailure
  );
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
  const status = PURCHASE_STATUS_BY_SCRIPT_RESULT[result];

  if (!status) {
    throw new Error(`Unexpected purchase script result: ${String(result)}`);
  }

  if (result === PURCHASE_SCRIPT_RESULTS.SUCCESS) {
    const saleId = await resolveActiveSaleId({
      saleConfig,
    }, {
      redisClient: redis,
      getOrCreateSale: deps.getOrCreateSale,
    });

    let purchaseRecord;

    try {
      purchaseRecord = await createPurchase({
        saleId,
        userId: normalizedUserId,
      });
    } catch (error) {
      let reconciliationRecord;

      try {
        reconciliationRecord = await recordPurchasePersistenceFailure({
          saleId,
          userId: normalizedUserId,
          failedAt: new Date(),
          error,
        }, {
          redisClient: redis,
        });
      } catch (reconciliationError) {
        logger.error('Failed to record purchase persistence reconciliation event', {
          saleId,
          userId: normalizedUserId,
          reconciliationKey: FLASH_SALE_REDIS_KEYS.purchasePersistenceFailures,
          error: serializeError(reconciliationError),
        });
      }

      logger.error('Purchase persistence failed after Redis success', {
        saleId,
        userId: normalizedUserId,
        reconciliationKey: FLASH_SALE_REDIS_KEYS.purchasePersistenceFailures,
        reconciliationRecorded: Boolean(reconciliationRecord),
        reconciliationRecord,
        error: serializeError(error),
      });

      throw new PurchasePersistenceError();
    }

    return { status, purchase: purchaseRecord };
  }

  return { status };
}

module.exports = {
  purchase,
};
