import { describe, expect, it, vi } from 'vitest';

const {
  createPurchasePersistenceFailureRecord,
  recordPurchasePersistenceFailure,
} = require('../../src/services/purchase-reconciliation.service');

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
});
