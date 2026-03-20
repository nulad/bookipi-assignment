import { describe, expect, it, vi } from 'vitest';

const {
  PURCHASE_PERSISTENCE_RECONCILIATION_STATUSES,
  PURCHASE_SALE_USER_UNIQUE_CONSTRAINT,
  createPurchasePersistenceReconciliationArchiveRecord,
  createPurchasePersistenceFailureRecord,
  inspectPurchasePersistenceFailure,
  parsePurchasePersistenceFailureRecord,
  repairPurchasePersistenceFailure,
  recordPurchasePersistenceFailure,
  runPurchasePersistenceReconciliation,
} = require('../../src/services/purchase-reconciliation.service');

function createRedisTransaction() {
  const transaction = {
    rPush: vi.fn(),
    lPop: vi.fn(),
    exec: vi.fn(),
  };

  transaction.rPush.mockReturnValue(transaction);
  transaction.lPop.mockReturnValue(transaction);

  return transaction;
}

describe('purchase-reconciliation.service', () => {
  it('builds a stable reconciliation record for a failed purchase persistence attempt', () => {
    const record = createPurchasePersistenceFailureRecord({
      saleId: '123',
      userId: 'alice@example.com',
      failedAt: new Date('2026-03-18T10:02:00.000Z'),
      error: new Error('insert failed'),
    });

    expect(record).toEqual({
      eventType: 'purchase_persistence_failed',
      saleId: '123',
      userId: 'alice@example.com',
      failedAt: '2026-03-18T10:02:00.000Z',
      errorName: 'Error',
      errorMessage: 'insert failed',
    });
  });

  it('parses and normalizes a queued reconciliation record', () => {
    const record = parsePurchasePersistenceFailureRecord(
      JSON.stringify({
        eventType: 'purchase_persistence_failed',
        saleId: 123,
        userId: ' Alice@example.com ',
        failedAt: '2026-03-18T10:02:00.000Z',
        errorName: 'Error',
        errorMessage: 'insert failed',
      }),
    );

    expect(record).toEqual({
      rawRecord: JSON.stringify({
        eventType: 'purchase_persistence_failed',
        saleId: 123,
        userId: ' Alice@example.com ',
        failedAt: '2026-03-18T10:02:00.000Z',
        errorName: 'Error',
        errorMessage: 'insert failed',
      }),
      eventType: 'purchase_persistence_failed',
      saleId: '123',
      userId: 'alice@example.com',
      failedAt: '2026-03-18T10:02:00.000Z',
      errorName: 'Error',
      errorMessage: 'insert failed',
    });
  });

  it('rejects invalid JSON when parsing queued reconciliation records', () => {
    expect(() => {
      parsePurchasePersistenceFailureRecord('not-json');
    }).toThrow('Reconciliation record is not valid JSON');
  });

  it('writes the reconciliation record to the configured Redis list', async () => {
    const redisClient = {
      rPush: vi.fn().mockResolvedValue(1),
    };

    const record = await recordPurchasePersistenceFailure({
      saleId: '123',
      userId: 'alice@example.com',
      failedAt: new Date('2026-03-18T10:02:00.000Z'),
      error: new Error('insert failed'),
    }, {
      redisClient,
    });

    expect(redisClient.rPush).toHaveBeenCalledWith(
      'flashsale:purchase_persistence_failures',
      JSON.stringify(record),
    );
    expect(record).toEqual({
      eventType: 'purchase_persistence_failed',
      saleId: '123',
      userId: 'alice@example.com',
      failedAt: '2026-03-18T10:02:00.000Z',
      errorName: 'Error',
      errorMessage: 'insert failed',
    });
  });

  it('reports when a queued failure already exists in Postgres', async () => {
    const purchase = {
      id: '7',
      saleId: '123',
      userId: 'alice@example.com',
      purchasedAt: new Date('2026-03-18T10:05:00.000Z'),
    };

    await expect(
      inspectPurchasePersistenceFailure(
        JSON.stringify({
          eventType: 'purchase_persistence_failed',
          saleId: '123',
          userId: 'alice@example.com',
          failedAt: '2026-03-18T10:02:00.000Z',
          errorName: 'Error',
          errorMessage: 'insert failed',
        }),
        {
          findPurchaseBySaleIdAndUserId: vi.fn().mockResolvedValue(purchase),
        },
      ),
    ).resolves.toEqual({
      status: PURCHASE_PERSISTENCE_RECONCILIATION_STATUSES.ALREADY_PERSISTED,
      record: {
        rawRecord: JSON.stringify({
          eventType: 'purchase_persistence_failed',
          saleId: '123',
          userId: 'alice@example.com',
          failedAt: '2026-03-18T10:02:00.000Z',
          errorName: 'Error',
          errorMessage: 'insert failed',
        }),
        eventType: 'purchase_persistence_failed',
        saleId: '123',
        userId: 'alice@example.com',
        failedAt: '2026-03-18T10:02:00.000Z',
        errorName: 'Error',
        errorMessage: 'insert failed',
      },
      purchase,
    });
  });

  it('persists a missing purchase during reconciliation', async () => {
    const createPurchase = vi.fn().mockResolvedValue({
      id: '9',
      saleId: '123',
      userId: 'alice@example.com',
      purchasedAt: new Date('2026-03-18T10:06:00.000Z'),
    });
    const findPurchaseBySaleIdAndUserId = vi.fn().mockResolvedValue(null);

    await expect(
      repairPurchasePersistenceFailure(
        JSON.stringify({
          eventType: 'purchase_persistence_failed',
          saleId: '123',
          userId: 'alice@example.com',
          failedAt: '2026-03-18T10:02:00.000Z',
          errorName: 'Error',
          errorMessage: 'insert failed',
        }),
        {
          createPurchase,
          findPurchaseBySaleIdAndUserId,
        },
      ),
    ).resolves.toMatchObject({
      status: PURCHASE_PERSISTENCE_RECONCILIATION_STATUSES.PERSISTED_NOW,
      record: {
        saleId: '123',
        userId: 'alice@example.com',
      },
      purchase: {
        id: '9',
        saleId: '123',
        userId: 'alice@example.com',
      },
    });

    expect(createPurchase).toHaveBeenCalledWith({
      saleId: '123',
      userId: 'alice@example.com',
    });
    expect(findPurchaseBySaleIdAndUserId).toHaveBeenCalledTimes(1);
  });

  it('treats a unique-constraint race as already persisted after re-reading Postgres', async () => {
    const purchase = {
      id: '10',
      saleId: '123',
      userId: 'alice@example.com',
      purchasedAt: new Date('2026-03-18T10:06:30.000Z'),
    };
    const createPurchase = vi.fn().mockRejectedValue({
      code: '23505',
      constraint: PURCHASE_SALE_USER_UNIQUE_CONSTRAINT,
      message: 'duplicate key',
    });
    const findPurchaseBySaleIdAndUserId = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(purchase);

    await expect(
      repairPurchasePersistenceFailure(
        JSON.stringify({
          eventType: 'purchase_persistence_failed',
          saleId: '123',
          userId: 'alice@example.com',
          failedAt: '2026-03-18T10:02:00.000Z',
          errorName: 'Error',
          errorMessage: 'insert failed',
        }),
        {
          createPurchase,
          findPurchaseBySaleIdAndUserId,
        },
      ),
    ).resolves.toMatchObject({
      status: PURCHASE_PERSISTENCE_RECONCILIATION_STATUSES.ALREADY_PERSISTED,
      purchase,
    });

    expect(findPurchaseBySaleIdAndUserId).toHaveBeenCalledTimes(2);
  });

  it('rethrows unrelated unique-constraint violations instead of treating them as already persisted', async () => {
    const error = {
      code: '23505',
      constraint: 'purchases_some_other_unique_key',
      message: 'different duplicate key',
    };
    const findPurchaseBySaleIdAndUserId = vi.fn().mockResolvedValue(null);

    await expect(
      repairPurchasePersistenceFailure(
        JSON.stringify({
          eventType: 'purchase_persistence_failed',
          saleId: '123',
          userId: 'alice@example.com',
          failedAt: '2026-03-18T10:02:00.000Z',
          errorName: 'Error',
          errorMessage: 'insert failed',
        }),
        {
          createPurchase: vi.fn().mockRejectedValue(error),
          findPurchaseBySaleIdAndUserId,
        },
      ),
    ).rejects.toBe(error);

    expect(findPurchaseBySaleIdAndUserId).toHaveBeenCalledTimes(1);
  });

  it('archives a successfully handled queue item only after a repair decision is made', async () => {
    const rawRecord = JSON.stringify({
      eventType: 'purchase_persistence_failed',
      saleId: '123',
      userId: 'alice@example.com',
      failedAt: '2026-03-18T10:02:00.000Z',
      errorName: 'Error',
      errorMessage: 'insert failed',
    });
    const transaction = createRedisTransaction();
    const redisClient = {
      lLen: vi.fn()
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(0),
      lRange: vi.fn(),
      lIndex: vi.fn()
        .mockResolvedValueOnce(rawRecord)
        .mockResolvedValueOnce(rawRecord)
        .mockResolvedValueOnce(null),
      multi: vi.fn().mockReturnValue(transaction),
    };

    transaction.exec.mockResolvedValue(['OK', rawRecord]);

    const summary = await runPurchasePersistenceReconciliation(
      {
        apply: true,
      },
      {
        redisClient,
        findPurchaseBySaleIdAndUserId: vi.fn().mockResolvedValue({
          id: '7',
          saleId: '123',
          userId: 'alice@example.com',
          purchasedAt: new Date('2026-03-18T10:05:00.000Z'),
        }),
      },
    );

    expect(summary).toMatchObject({
      mode: 'apply',
      reviewedCount: 1,
      archivedCount: 1,
      remainingCount: 0,
      results: [
        {
          index: 1,
          status: PURCHASE_PERSISTENCE_RECONCILIATION_STATUSES.ALREADY_PERSISTED,
          saleId: '123',
          userId: 'alice@example.com',
          purchaseId: '7',
        },
      ],
    });
    expect(redisClient.multi).toHaveBeenCalledTimes(1);
    expect(transaction.lPop).toHaveBeenCalledWith('flashsale:purchase_persistence_failures');
    expect(transaction.exec).toHaveBeenCalledTimes(1);

    const [archiveKey, archivePayload] = transaction.rPush.mock.calls[0];

    expect(archiveKey).toBe('flashsale:purchase_persistence_failures_archive');
    expect(JSON.parse(archivePayload)).toMatchObject({
      eventType: 'purchase_persistence_failure_reconciled',
      status: PURCHASE_PERSISTENCE_RECONCILIATION_STATUSES.ALREADY_PERSISTED,
      sourceKey: 'flashsale:purchase_persistence_failures',
      saleId: '123',
      userId: 'alice@example.com',
      purchaseId: '7',
    });
  });

  it('creates an archive record for malformed queue entries without dropping the raw payload', () => {
    const archiveRecord = createPurchasePersistenceReconciliationArchiveRecord({
      rawRecord: 'not-json',
      status: PURCHASE_PERSISTENCE_RECONCILIATION_STATUSES.ARCHIVED_INVALID,
      reason: 'Reconciliation record is not valid JSON',
      reconciledAt: new Date('2026-03-18T10:07:00.000Z'),
    });

    expect(archiveRecord).toEqual({
      eventType: 'purchase_persistence_failure_reconciled',
      status: PURCHASE_PERSISTENCE_RECONCILIATION_STATUSES.ARCHIVED_INVALID,
      reconciledAt: '2026-03-18T10:07:00.000Z',
      sourceKey: 'flashsale:purchase_persistence_failures',
      rawRecord: 'not-json',
      saleId: undefined,
      userId: undefined,
      failedAt: undefined,
      errorName: undefined,
      errorMessage: undefined,
      purchaseId: undefined,
      purchasedAt: undefined,
      reason: 'Reconciliation record is not valid JSON',
    });
  });
});
