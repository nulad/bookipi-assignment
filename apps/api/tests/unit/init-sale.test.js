import { describe, expect, it, vi } from 'vitest';

const { resetSaleState, runInitSale } = require('../../src/scripts/init-sale');

function createRedisTransaction() {
  const transaction = {
    set: vi.fn(),
    del: vi.fn(),
    exec: vi.fn(),
  };

  transaction.set.mockReturnValue(transaction);
  transaction.del.mockReturnValue(transaction);

  return transaction;
}

describe('init-sale script', () => {
  it('sets the stock key, clears purchased users, and stores active sale id in a single Redis transaction', async () => {
    const transaction = createRedisTransaction();
    const redisClient = {
      multi: vi.fn().mockReturnValue(transaction),
    };

    transaction.exec.mockResolvedValue(['OK', 1, 'OK']);

    await expect(resetSaleState(redisClient, 42, '123')).resolves.toEqual({
      initialStock: 42,
      saleId: '123',
      stockKey: 'flashsale:stock',
      purchasedUsersKey: 'flashsale:purchased_users',
      activeSaleIdKey: 'flashsale:active_sale_id',
    });

    expect(redisClient.multi).toHaveBeenCalledTimes(1);
    expect(transaction.set).toHaveBeenCalledWith('flashsale:stock', '42');
    expect(transaction.del).toHaveBeenCalledWith('flashsale:purchased_users');
    expect(transaction.set).toHaveBeenCalledWith('flashsale:active_sale_id', '123');
    expect(transaction.exec).toHaveBeenCalledTimes(1);
  });

  it('creates or loads the configured sale and disconnects Redis after a successful reset', async () => {
    const transaction = createRedisTransaction();
    const redisClient = {
      isOpen: true,
      multi: vi.fn().mockReturnValue(transaction),
      quit: vi.fn().mockResolvedValue('OK'),
    };
    const connectRedis = vi.fn().mockResolvedValue(redisClient);
    const getOrCreateSale = vi.fn().mockResolvedValue({
      id: '77',
    });

    transaction.exec.mockResolvedValue(['OK', 1, 'OK']);

    await expect(
      runInitSale({
        initialStock: 7,
        connectRedis,
        getOrCreateSale,
      }),
    ).resolves.toEqual({
      initialStock: 7,
      saleId: '77',
      stockKey: 'flashsale:stock',
      purchasedUsersKey: 'flashsale:purchased_users',
      activeSaleIdKey: 'flashsale:active_sale_id',
    });

    expect(connectRedis).toHaveBeenCalledTimes(1);
    expect(getOrCreateSale).toHaveBeenCalledWith(expect.objectContaining({
      productName: expect.any(String),
      initialStock: expect.any(Number),
      startTime: expect.any(Date),
      endTime: expect.any(Date),
    }));
    expect(redisClient.quit).toHaveBeenCalledTimes(1);
  });

  it('disconnects Redis even when the reset operation fails', async () => {
    const transaction = createRedisTransaction();
    const redisClient = {
      isOpen: true,
      multi: vi.fn().mockReturnValue(transaction),
      quit: vi.fn().mockResolvedValue('OK'),
    };
    const connectRedis = vi.fn().mockResolvedValue(redisClient);
    const getOrCreateSale = vi.fn().mockResolvedValue({
      id: '55',
    });

    transaction.exec.mockRejectedValue(new Error('boom'));

    await expect(
      runInitSale({
        initialStock: 9,
        connectRedis,
        getOrCreateSale,
      }),
    ).rejects.toThrow('boom');

    expect(connectRedis).toHaveBeenCalledTimes(1);
    expect(redisClient.quit).toHaveBeenCalledTimes(1);
  });

  it('uses SALE_INITIAL_STOCK when no explicit stock is provided', async () => {
    const originalInitialStock = process.env.SALE_INITIAL_STOCK;
    const transaction = createRedisTransaction();
    const redisClient = {
      multi: vi.fn().mockReturnValue(transaction),
    };
    const getOrCreateSale = vi.fn().mockResolvedValue({
      id: '88',
    });

    transaction.exec.mockResolvedValue(['OK', 1, 'OK']);
    process.env.SALE_INITIAL_STOCK = '13';

    try {
      await expect(
        runInitSale({
          redisClient,
          getOrCreateSale,
        }),
      ).resolves.toMatchObject({
        initialStock: 13,
        saleId: '88',
      });
    } finally {
      if (originalInitialStock === undefined) {
        delete process.env.SALE_INITIAL_STOCK;
      } else {
        process.env.SALE_INITIAL_STOCK = originalInitialStock;
      }
    }

    expect(transaction.set).toHaveBeenCalledWith('flashsale:stock', '13');
    expect(transaction.set).toHaveBeenCalledWith('flashsale:active_sale_id', '88');
  });

  it('rejects an empty SALE_INITIAL_STOCK value instead of treating it as zero', async () => {
    const originalInitialStock = process.env.SALE_INITIAL_STOCK;

    process.env.SALE_INITIAL_STOCK = '';

    try {
      await expect(runInitSale({})).rejects.toThrow(
        'Initial stock must be an integer greater than or equal to 0',
      );
    } finally {
      if (originalInitialStock === undefined) {
        delete process.env.SALE_INITIAL_STOCK;
      } else {
        process.env.SALE_INITIAL_STOCK = originalInitialStock;
      }
    }
  });
});
