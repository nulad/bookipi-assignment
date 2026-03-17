import { describe, expect, it, vi } from 'vitest';

const {
  getPurchaseStatus,
  getRemainingStock,
  getSaleStatus,
} = require('../../src/services/sale.service');

function createSaleStatusDeps(overrides = {}) {
  return {
    redisClient: {
      get: vi.fn(),
    },
    saleConfig: {
      startTime: new Date('2026-03-18T10:00:00.000Z'),
      endTime: new Date('2026-03-18T10:10:00.000Z'),
    },
    computeSaleStatus: vi.fn(),
    ...overrides,
  };
}

function createPurchaseStatusDeps(overrides = {}) {
  return {
    normalizeUserId: vi.fn().mockImplementation((userId) => userId.trim().toLowerCase()),
    findPurchasesByUserId: vi.fn(),
    ...overrides,
  };
}

describe('sale.service', () => {
  describe('getRemainingStock', () => {
    it('reads the Redis stock key once and parses numeric string values', async () => {
      const deps = createSaleStatusDeps({
        redisClient: {
          get: vi.fn().mockResolvedValue('12'),
        },
      });

      await expect(getRemainingStock(deps)).resolves.toBe(12);
      expect(deps.redisClient.get).toHaveBeenCalledWith('flashsale:stock');
    });

    it('throws when the Redis stock key is missing', async () => {
      const deps = createSaleStatusDeps({
        redisClient: {
          get: vi.fn().mockResolvedValue(null),
        },
      });

      await expect(getRemainingStock(deps)).rejects.toThrow(
        'Sale stock is not initialized in Redis',
      );
    });

    it.each(['abc', '1.5', '-1'])(
      'throws when Redis stock value %s is invalid',
      async (rawValue) => {
        const deps = createSaleStatusDeps({
          redisClient: {
            get: vi.fn().mockResolvedValue(rawValue),
          },
        });

        await expect(getRemainingStock(deps)).rejects.toThrow(
          'Redis stock value is invalid',
        );
      },
    );
  });

  describe('getSaleStatus', () => {
    it.each([
      ['upcoming', '2026-03-18T09:59:59.000Z', '7'],
      ['active', '2026-03-18T10:05:00.000Z', '7'],
      ['sold_out', '2026-03-18T10:05:00.000Z', '0'],
      ['ended', '2026-03-18T10:10:01.000Z', '7'],
    ])('returns %s for sale state', async (expectedStatus, nowIsoString, stockValue) => {
      const now = new Date(nowIsoString);
      const deps = createSaleStatusDeps({
        redisClient: {
          get: vi.fn().mockResolvedValue(stockValue),
        },
        computeSaleStatus: vi.fn().mockReturnValue(expectedStatus),
      });

      await expect(getSaleStatus({ now }, deps)).resolves.toEqual({
        status: expectedStatus,
        remainingStock: Number(stockValue),
      });

      expect(deps.redisClient.get).toHaveBeenCalledWith('flashsale:stock');
      expect(deps.computeSaleStatus).toHaveBeenCalledWith({
        now,
        startTime: deps.saleConfig.startTime,
        endTime: deps.saleConfig.endTime,
        remainingStock: Number(stockValue),
      });
    });

    it('defaults now to a Date instance when omitted', async () => {
      const deps = createSaleStatusDeps({
        redisClient: {
          get: vi.fn().mockResolvedValue('3'),
        },
        computeSaleStatus: vi.fn().mockReturnValue('active'),
      });

      await expect(getSaleStatus(undefined, deps)).resolves.toEqual({
        status: 'active',
        remainingStock: 3,
      });

      expect(deps.computeSaleStatus).toHaveBeenCalledWith({
        now: expect.any(Date),
        startTime: deps.saleConfig.startTime,
        endTime: deps.saleConfig.endTime,
        remainingStock: 3,
      });
    });
  });

  describe('getPurchaseStatus', () => {
    it('normalizes the user id before querying Postgres', async () => {
      const deps = createPurchaseStatusDeps({
        normalizeUserId: vi.fn().mockReturnValue('alice@example.com'),
        findPurchasesByUserId: vi.fn().mockResolvedValue([]),
      });

      await expect(
        getPurchaseStatus(
          {
            userId: ' Alice@example.com ',
          },
          deps,
        ),
      ).resolves.toEqual({
        userId: 'alice@example.com',
        hasPurchased: false,
      });

      expect(deps.normalizeUserId).toHaveBeenCalledWith(' Alice@example.com ');
      expect(deps.findPurchasesByUserId).toHaveBeenCalledWith('alice@example.com');
    });

    it('returns hasPurchased false when no persisted purchases exist', async () => {
      const deps = createPurchaseStatusDeps({
        findPurchasesByUserId: vi.fn().mockResolvedValue([]),
      });

      await expect(
        getPurchaseStatus(
          {
            userId: 'alice@example.com',
          },
          deps,
        ),
      ).resolves.toEqual({
        userId: 'alice@example.com',
        hasPurchased: false,
      });
    });

    it('returns hasPurchased true when persisted purchases exist', async () => {
      const deps = createPurchaseStatusDeps({
        findPurchasesByUserId: vi.fn().mockResolvedValue([
          {
            id: '1',
            saleId: '123',
            userId: 'alice@example.com',
            purchasedAt: new Date('2026-03-18T10:01:00.000Z'),
          },
        ]),
      });

      await expect(
        getPurchaseStatus(
          {
            userId: 'alice@example.com',
          },
          deps,
        ),
      ).resolves.toEqual({
        userId: 'alice@example.com',
        hasPurchased: true,
      });
    });

    it('bubbles normalization errors without querying Postgres', async () => {
      const deps = createPurchaseStatusDeps({
        normalizeUserId: vi.fn().mockImplementation(() => {
          throw new Error('User ID cannot be empty');
        }),
      });

      await expect(
        getPurchaseStatus(
          {
            userId: '   ',
          },
          deps,
        ),
      ).rejects.toThrow('User ID cannot be empty');

      expect(deps.findPurchasesByUserId).not.toHaveBeenCalled();
    });
  });
});
