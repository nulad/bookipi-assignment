import { describe, expect, it, vi } from 'vitest';

const {
  getSaleStatus,
  readRemainingStock,
} = require('../../src/services/sale-status.service');

function createDeps(overrides = {}) {
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

describe('sale-status.service', () => {
  describe('readRemainingStock', () => {
    it('reads the Redis stock key once and parses numeric string values', async () => {
      const deps = createDeps({
        redisClient: {
          get: vi.fn().mockResolvedValue('12'),
        },
      });

      await expect(readRemainingStock(deps)).resolves.toBe(12);
      expect(deps.redisClient.get).toHaveBeenCalledWith('flashsale:stock');
    });

    it('throws when the Redis stock key is missing', async () => {
      const deps = createDeps({
        redisClient: {
          get: vi.fn().mockResolvedValue(null),
        },
      });

      await expect(readRemainingStock(deps)).rejects.toThrow(
        'Sale stock is not initialized in Redis',
      );
    });

    it.each(['abc', '1.5', '-1'])(
      'throws when Redis stock value %s is invalid',
      async (rawValue) => {
        const deps = createDeps({
          redisClient: {
            get: vi.fn().mockResolvedValue(rawValue),
          },
        });

        await expect(readRemainingStock(deps)).rejects.toThrow(
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
      const deps = createDeps({
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
      const deps = createDeps({
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
});
