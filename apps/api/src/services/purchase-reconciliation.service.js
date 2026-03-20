const { redisClient } = require('../lib/redis');
const { FLASH_SALE_REDIS_KEYS } = require('../redis/keys');
const {
  createPurchase: defaultCreatePurchase,
  findPurchaseBySaleIdAndUserId: defaultFindPurchaseBySaleIdAndUserId,
} = require('../repositories/purchase.repository');
const { normalizeUserId: defaultNormalizeUserId } = require('../utils/normalize-user-id');

const PURCHASE_PERSISTENCE_FAILURE_EVENT_TYPE = 'purchase_persistence_failed';
const PURCHASE_PERSISTENCE_RECONCILIATION_EVENT_TYPE = 'purchase_persistence_failure_reconciled';
const PURCHASE_SALE_USER_UNIQUE_CONSTRAINT = 'purchases_sale_id_user_id_key';
const PURCHASE_PERSISTENCE_RECONCILIATION_STATUSES = Object.freeze({
  NEEDS_PERSISTENCE: 'needs_persistence',
  ALREADY_PERSISTED: 'already_persisted',
  INVALID_RECORD: 'invalid_record',
  PERSISTED_NOW: 'persisted_now',
  ARCHIVED_INVALID: 'archived_invalid',
});

function createPurchasePersistenceFailureRecord({
  saleId,
  userId,
  failedAt = new Date(),
  error,
}) {
  return {
    eventType: PURCHASE_PERSISTENCE_FAILURE_EVENT_TYPE,
    saleId: String(saleId),
    userId,
    failedAt: failedAt.toISOString(),
    errorName: error?.name || 'Error',
    errorMessage: error?.message || 'Unknown error',
  };
}

function parsePurchasePersistenceFailureRecord(rawRecord, deps = {}) {
  const normalizeUserId = deps.normalizeUserId || defaultNormalizeUserId;

  if (typeof rawRecord !== 'string' || rawRecord.length === 0) {
    throw new Error('Reconciliation record must be a non-empty string');
  }

  let parsedRecord;

  try {
    parsedRecord = JSON.parse(rawRecord);
  } catch (error) {
    throw new Error('Reconciliation record is not valid JSON');
  }

  if (parsedRecord === null || Array.isArray(parsedRecord) || typeof parsedRecord !== 'object') {
    throw new Error('Reconciliation record must be a JSON object');
  }

  if (parsedRecord.eventType !== PURCHASE_PERSISTENCE_FAILURE_EVENT_TYPE) {
    throw new Error(`Unexpected reconciliation eventType: ${String(parsedRecord.eventType)}`);
  }

  const saleId = String(parsedRecord.saleId ?? '').trim();

  if (saleId.length === 0) {
    throw new Error('Reconciliation record saleId must be present');
  }

  let userId;

  try {
    userId = normalizeUserId(parsedRecord.userId);
  } catch (error) {
    throw new Error(`Reconciliation record userId is invalid: ${error.message}`);
  }

  if (typeof parsedRecord.failedAt !== 'string' || parsedRecord.failedAt.trim().length === 0) {
    throw new Error('Reconciliation record failedAt must be present');
  }

  const failedAt = new Date(parsedRecord.failedAt);

  if (Number.isNaN(failedAt.getTime())) {
    throw new Error('Reconciliation record failedAt must be a valid ISO-8601 date');
  }

  return {
    rawRecord,
    eventType: PURCHASE_PERSISTENCE_FAILURE_EVENT_TYPE,
    saleId,
    userId,
    failedAt: failedAt.toISOString(),
    errorName: typeof parsedRecord.errorName === 'string' && parsedRecord.errorName.length > 0
      ? parsedRecord.errorName
      : 'Error',
    errorMessage: typeof parsedRecord.errorMessage === 'string' && parsedRecord.errorMessage.length > 0
      ? parsedRecord.errorMessage
      : 'Unknown error',
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

async function inspectPurchasePersistenceFailure(rawRecord, deps = {}) {
  const findPurchaseBySaleIdAndUserId = (
    deps.findPurchaseBySaleIdAndUserId
    || defaultFindPurchaseBySaleIdAndUserId
  );
  let record;

  try {
    record = parsePurchasePersistenceFailureRecord(rawRecord, deps);
  } catch (error) {
    return {
      status: PURCHASE_PERSISTENCE_RECONCILIATION_STATUSES.INVALID_RECORD,
      rawRecord,
      reason: error.message,
    };
  }

  const purchase = await findPurchaseBySaleIdAndUserId({
    saleId: record.saleId,
    userId: record.userId,
  });

  return {
    status: purchase
      ? PURCHASE_PERSISTENCE_RECONCILIATION_STATUSES.ALREADY_PERSISTED
      : PURCHASE_PERSISTENCE_RECONCILIATION_STATUSES.NEEDS_PERSISTENCE,
    record,
    purchase,
  };
}

async function repairPurchasePersistenceFailure(rawRecord, deps = {}) {
  const findPurchaseBySaleIdAndUserId = (
    deps.findPurchaseBySaleIdAndUserId
    || defaultFindPurchaseBySaleIdAndUserId
  );
  const createPurchase = deps.createPurchase || defaultCreatePurchase;
  let record;

  try {
    record = parsePurchasePersistenceFailureRecord(rawRecord, deps);
  } catch (error) {
    return {
      status: PURCHASE_PERSISTENCE_RECONCILIATION_STATUSES.ARCHIVED_INVALID,
      rawRecord,
      reason: error.message,
    };
  }

  const persistedPurchase = await findPurchaseBySaleIdAndUserId({
    saleId: record.saleId,
    userId: record.userId,
  });

  if (persistedPurchase) {
    return {
      status: PURCHASE_PERSISTENCE_RECONCILIATION_STATUSES.ALREADY_PERSISTED,
      record,
      purchase: persistedPurchase,
    };
  }

  try {
    const purchase = await createPurchase({
      saleId: record.saleId,
      userId: record.userId,
    });

    return {
      status: PURCHASE_PERSISTENCE_RECONCILIATION_STATUSES.PERSISTED_NOW,
      record,
      purchase,
    };
  } catch (error) {
    if (
      error?.code === '23505'
      && error?.constraint === PURCHASE_SALE_USER_UNIQUE_CONSTRAINT
    ) {
      const concurrentlyPersistedPurchase = await findPurchaseBySaleIdAndUserId({
        saleId: record.saleId,
        userId: record.userId,
      });

      if (concurrentlyPersistedPurchase) {
        return {
          status: PURCHASE_PERSISTENCE_RECONCILIATION_STATUSES.ALREADY_PERSISTED,
          record,
          purchase: concurrentlyPersistedPurchase,
        };
      }
    }

    throw error;
  }
}

function createPurchasePersistenceReconciliationArchiveRecord({
  rawRecord,
  status,
  record,
  purchase,
  reason,
  sourceKey = FLASH_SALE_REDIS_KEYS.purchasePersistenceFailures,
  reconciledAt = new Date(),
}) {
  return {
    eventType: PURCHASE_PERSISTENCE_RECONCILIATION_EVENT_TYPE,
    status,
    reconciledAt: reconciledAt.toISOString(),
    sourceKey,
    rawRecord,
    saleId: record?.saleId,
    userId: record?.userId,
    failedAt: record?.failedAt,
    errorName: record?.errorName,
    errorMessage: record?.errorMessage,
    purchaseId: purchase?.id,
    purchasedAt: purchase?.purchasedAt,
    reason,
  };
}

async function archivePurchasePersistenceFailure({
  rawRecord,
  archiveRecord,
  queueKey = FLASH_SALE_REDIS_KEYS.purchasePersistenceFailures,
  archiveKey = FLASH_SALE_REDIS_KEYS.purchasePersistenceFailuresArchive,
}, deps = {}) {
  const redis = deps.redisClient || redisClient;
  const queueHead = await redis.lIndex(queueKey, 0);

  if (queueHead === null) {
    throw new Error(`Reconciliation queue ${queueKey} is empty`);
  }

  if (queueHead !== rawRecord) {
    throw new Error('Reconciliation queue head changed during processing');
  }

  await redis
    .multi()
    .rPush(archiveKey, JSON.stringify(archiveRecord))
    .lPop(queueKey)
    .exec();

  return archiveRecord;
}

function resolveReconciliationLimit(limit) {
  if (limit === undefined) {
    return Number.POSITIVE_INFINITY;
  }

  if (!Number.isInteger(limit) || limit <= 0) {
    throw new Error('Reconciliation limit must be a positive integer');
  }

  return limit;
}

function summarizeResult(result, index) {
  return {
    index,
    status: result.status,
    saleId: result.record?.saleId,
    userId: result.record?.userId,
    failedAt: result.record?.failedAt,
    purchaseId: result.purchase?.id,
    purchasedAt: result.purchase?.purchasedAt,
    reason: result.reason,
    rawRecord: result.record ? undefined : result.rawRecord,
  };
}

async function runPurchasePersistenceReconciliation(options = {}, deps = {}) {
  const redis = deps.redisClient || redisClient;
  const queueKey = options.queueKey || FLASH_SALE_REDIS_KEYS.purchasePersistenceFailures;
  const archiveKey = options.archiveKey || FLASH_SALE_REDIS_KEYS.purchasePersistenceFailuresArchive;
  const limit = resolveReconciliationLimit(options.limit);
  const initialQueueLength = await redis.lLen(queueKey);
  const results = [];
  let archivedCount = 0;

  if (!options.apply) {
    const rangeEnd = limit === Number.POSITIVE_INFINITY ? -1 : limit - 1;
    const rawRecords = await redis.lRange(queueKey, 0, rangeEnd);

    try {
      for (const rawRecord of rawRecords) {
        const inspection = await inspectPurchasePersistenceFailure(rawRecord, deps);
        results.push(summarizeResult(inspection, results.length + 1));
      }
    } catch (error) {
      return {
        mode: 'inspect',
        queueKey,
        archiveKey,
        initialQueueLength,
        reviewedCount: results.length,
        archivedCount,
        remainingCount: initialQueueLength,
        results,
        error: {
          name: error?.name || 'Error',
          message: error?.message || 'Unknown error',
        },
      };
    }

    return {
      mode: 'inspect',
      queueKey,
      archiveKey,
      initialQueueLength,
      reviewedCount: results.length,
      archivedCount,
      remainingCount: initialQueueLength,
      results,
    };
  }

  try {
    while (results.length < limit) {
      const rawRecord = await redis.lIndex(queueKey, 0);

      if (rawRecord === null) {
        break;
      }

      const repairResult = await repairPurchasePersistenceFailure(rawRecord, deps);
      const archiveRecord = createPurchasePersistenceReconciliationArchiveRecord({
        rawRecord,
        status: repairResult.status,
        record: repairResult.record,
        purchase: repairResult.purchase,
        reason: repairResult.reason,
        sourceKey: queueKey,
      });

      await archivePurchasePersistenceFailure({
        rawRecord,
        archiveRecord,
        queueKey,
        archiveKey,
      }, {
        redisClient: redis,
      });

      archivedCount += 1;
      results.push(summarizeResult(repairResult, results.length + 1));
    }
  } catch (error) {
    return {
      mode: 'apply',
      queueKey,
      archiveKey,
      initialQueueLength,
      reviewedCount: results.length,
      archivedCount,
      remainingCount: await redis.lLen(queueKey),
      results,
      error: {
        name: error?.name || 'Error',
        message: error?.message || 'Unknown error',
      },
    };
  }

  return {
    mode: 'apply',
    queueKey,
    archiveKey,
    initialQueueLength,
    reviewedCount: results.length,
    archivedCount,
    remainingCount: await redis.lLen(queueKey),
    results,
  };
}

module.exports = {
  PURCHASE_PERSISTENCE_FAILURE_EVENT_TYPE,
  PURCHASE_PERSISTENCE_RECONCILIATION_STATUSES,
  PURCHASE_SALE_USER_UNIQUE_CONSTRAINT,
  archivePurchasePersistenceFailure,
  createPurchasePersistenceReconciliationArchiveRecord,
  createPurchasePersistenceFailureRecord,
  inspectPurchasePersistenceFailure,
  parsePurchasePersistenceFailureRecord,
  repairPurchasePersistenceFailure,
  recordPurchasePersistenceFailure,
  runPurchasePersistenceReconciliation,
};
