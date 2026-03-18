import { describe, expect, it, vi } from 'vitest';

const {
  ensureActiveSale,
  resolveActiveSaleId,
} = require('../../src/services/active-sale.service');

describe('active-sale.service', () => {
  it('returns the cached active sale id when Redis already has it', async () => {
    const redisClient = {
      get: vi.fn().mockResolvedValue('123'),
      set: vi.fn(),
    };
    const getOrCreateSale = vi.fn();

    await expect(
      resolveActiveSaleId(
        {},
        {
          redisClient,
          getOrCreateSale,
        },
      ),
    ).resolves.toBe('123');

    expect(redisClient.get).toHaveBeenCalledWith('flashsale:active_sale_id');
    expect(getOrCreateSale).not.toHaveBeenCalled();
    expect(redisClient.set).not.toHaveBeenCalled();
  });

  it('loads the active sale from Postgres and caches the id when Redis is missing it', async () => {
    const redisClient = {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue('OK'),
    };
    const saleConfig = {
      productName: 'Keyboard',
      initialStock: 10,
      startTime: new Date('2026-03-18T10:00:00.000Z'),
      endTime: new Date('2026-03-18T10:10:00.000Z'),
    };
    const getOrCreateSale = vi.fn().mockResolvedValue({ id: '999' });

    await expect(
      resolveActiveSaleId(
        { saleConfig },
        {
          redisClient,
          getOrCreateSale,
        },
      ),
    ).resolves.toBe('999');

    expect(redisClient.get).toHaveBeenCalledWith('flashsale:active_sale_id');
    expect(getOrCreateSale).toHaveBeenCalledWith(saleConfig);
    expect(redisClient.set).toHaveBeenCalledWith('flashsale:active_sale_id', '999');
  });

  it('delegates active sale creation to the sale repository boundary', async () => {
    const saleConfig = {
      productName: 'Mouse',
      initialStock: 5,
      startTime: new Date('2026-03-18T10:00:00.000Z'),
      endTime: new Date('2026-03-18T10:10:00.000Z'),
    };
    const getOrCreateSale = vi.fn().mockResolvedValue({ id: '77' });

    await expect(
      ensureActiveSale(
        { saleConfig },
        { getOrCreateSale },
      ),
    ).resolves.toEqual({ id: '77' });

    expect(getOrCreateSale).toHaveBeenCalledWith(saleConfig);
  });
});
