import { describe, expect, it, vi } from 'vitest';

const { PURCHASE_SCRIPT_RESULTS } = require('../../src/redis/purchase-script');
const { purchase } = require('../../src/services/purchase.service');

function createDeps(overrides = {}) {
  return {
    redisClient: {
      eval: vi.fn(),
      get: vi.fn(),
      set: vi.fn(),
    },
    saleConfig: {
      productName: 'Keyboard',
      initialStock: 10,
      startTime: new Date('2026-03-18T10:00:00.000Z'),
      endTime: new Date('2026-03-18T10:10:00.000Z'),
    },
    normalizeUserId: vi.fn().mockImplementation((userId) => userId.trim().toLowerCase()),
    runPurchaseScript: vi.fn(),
    createPurchase: vi.fn(),
    getOrCreateSale: vi.fn(),
    ...overrides,
  };
}

describe('purchase.service', () => {
  it.each([
    [PURCHASE_SCRIPT_RESULTS.ALREADY_PURCHASED, 'already_purchased'],
    [PURCHASE_SCRIPT_RESULTS.SOLD_OUT, 'sold_out'],
    [PURCHASE_SCRIPT_RESULTS.NOT_STARTED, 'sale_not_started'],
    [PURCHASE_SCRIPT_RESULTS.ENDED, 'sale_ended'],
  ])('returns %s as %s and skips DB persistence', async (scriptResult, expectedStatus) => {
    const deps = createDeps({
      runPurchaseScript: vi.fn().mockResolvedValue(scriptResult),
    });

    await expect(
      purchase(
        {
          userId: ' Alice@example.com ',
        },
        deps,
      ),
    ).resolves.toEqual({ status: expectedStatus });

    expect(deps.normalizeUserId).toHaveBeenCalledWith(' Alice@example.com ');
    expect(deps.redisClient.get).not.toHaveBeenCalled();
    expect(deps.getOrCreateSale).not.toHaveBeenCalled();
    expect(deps.createPurchase).not.toHaveBeenCalled();
  });

  it('normalizes the user id before calling Redis and Postgres using the cached active sale id', async () => {
    const persistedPurchase = {
      id: '1',
      saleId: '123',
      userId: 'alice@example.com',
      purchasedAt: new Date('2026-03-18T10:01:00.000Z'),
    };
    const deps = createDeps({
      redisClient: {
        eval: vi.fn(),
        get: vi.fn().mockResolvedValue('123'),
        set: vi.fn(),
      },
      normalizeUserId: vi.fn().mockReturnValue('alice@example.com'),
      runPurchaseScript: vi.fn().mockResolvedValue(PURCHASE_SCRIPT_RESULTS.SUCCESS),
      createPurchase: vi.fn().mockResolvedValue(persistedPurchase),
    });

    await expect(
      purchase(
        {
          userId: ' Alice@example.com ',
        },
        deps,
      ),
    ).resolves.toEqual({
      status: 'success',
      purchase: persistedPurchase,
    });

    expect(deps.normalizeUserId).toHaveBeenCalledWith(' Alice@example.com ');
    expect(deps.runPurchaseScript).toHaveBeenCalledWith({
      redisClient: deps.redisClient,
      userId: 'alice@example.com',
      nowMs: expect.any(Number),
      saleStartMs: deps.saleConfig.startTime.getTime(),
      saleEndMs: deps.saleConfig.endTime.getTime(),
    });
    expect(deps.redisClient.get).toHaveBeenCalledWith('flashsale:active_sale_id');
    expect(deps.getOrCreateSale).not.toHaveBeenCalled();
    expect(deps.createPurchase).toHaveBeenCalledWith({
      saleId: '123',
      userId: 'alice@example.com',
    });
  });

  it('passes the expected timestamps to the purchase script', async () => {
    const now = new Date('2026-03-18T10:05:30.000Z');
    const saleConfig = {
      productName: 'Keyboard',
      initialStock: 10,
      startTime: new Date('2026-03-18T10:00:00.000Z'),
      endTime: new Date('2026-03-18T10:10:00.000Z'),
    };
    const deps = createDeps({
      saleConfig,
      runPurchaseScript: vi.fn().mockResolvedValue(PURCHASE_SCRIPT_RESULTS.SOLD_OUT),
    });

    await purchase(
      {
        userId: 'alice@example.com',
        now,
      },
      deps,
    );

    expect(deps.runPurchaseScript).toHaveBeenCalledWith({
      redisClient: deps.redisClient,
      userId: 'alice@example.com',
      nowMs: now.getTime(),
      saleStartMs: saleConfig.startTime.getTime(),
      saleEndMs: saleConfig.endTime.getTime(),
    });
  });

  it('throws when the injected purchase script returns an unexpected result', async () => {
    const deps = createDeps({
      runPurchaseScript: vi.fn().mockResolvedValue('BAD_RESULT'),
    });

    await expect(
      purchase(
        {
          userId: 'alice@example.com',
        },
        deps,
      ),
    ).rejects.toThrow('Unexpected purchase script result: BAD_RESULT');

    expect(deps.createPurchase).not.toHaveBeenCalled();
  });

  it('bubbles normalization errors without calling Redis or Postgres', async () => {
    const deps = createDeps({
      normalizeUserId: vi.fn().mockImplementation(() => {
        throw new Error('User ID cannot be empty');
      }),
    });

    await expect(
      purchase(
        {
          userId: '   ',
        },
        deps,
      ),
    ).rejects.toThrow('User ID cannot be empty');

    expect(deps.runPurchaseScript).not.toHaveBeenCalled();
    expect(deps.createPurchase).not.toHaveBeenCalled();
  });

  it('falls back to Postgres to resolve and cache the active sale id on success when Redis is missing it', async () => {
    const deps = createDeps({
      redisClient: {
        eval: vi.fn(),
        get: vi.fn().mockResolvedValue(null),
        set: vi.fn().mockResolvedValue('OK'),
      },
      runPurchaseScript: vi.fn().mockResolvedValue(PURCHASE_SCRIPT_RESULTS.SUCCESS),
      getOrCreateSale: vi.fn().mockResolvedValue({
        id: '999',
      }),
      createPurchase: vi.fn().mockResolvedValue({
        id: 'purchase-1',
        saleId: '999',
        userId: 'alice@example.com',
        purchasedAt: new Date('2026-03-18T10:01:00.000Z'),
      }),
    });

    await expect(
      purchase(
        {
          userId: 'alice@example.com',
        },
        deps,
      ),
    ).resolves.toEqual({
      status: 'success',
      purchase: {
        id: 'purchase-1',
        saleId: '999',
        userId: 'alice@example.com',
        purchasedAt: new Date('2026-03-18T10:01:00.000Z'),
      },
    });

    expect(deps.redisClient.get).toHaveBeenCalledWith('flashsale:active_sale_id');
    expect(deps.getOrCreateSale).toHaveBeenCalledWith(deps.saleConfig);
    expect(deps.redisClient.set).toHaveBeenCalledWith('flashsale:active_sale_id', '999');
    expect(deps.createPurchase).toHaveBeenCalledWith({
      saleId: '999',
      userId: 'alice@example.com',
    });
  });
});
