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
  it('sets the stock key and clears purchased users in a single Redis transaction', async () => {
    const transaction = createRedisTransaction();
    const redisClient = {
      multi: vi.fn().mockReturnValue(transaction),
    };

    transaction.exec.mockResolvedValue(['OK', 1]);

    await expect(resetSaleState(redisClient, 42)).resolves.toEqual({
      initialStock: 42,
      stockKey: 'flashsale:stock',
      purchasedUsersKey: 'flashsale:purchased_users',
    });

    expect(redisClient.multi).toHaveBeenCalledTimes(1);
    expect(transaction.set).toHaveBeenCalledWith('flashsale:stock', '42');
    expect(transaction.del).toHaveBeenCalledWith('flashsale:purchased_users');
    expect(transaction.exec).toHaveBeenCalledTimes(1);
  });

  it('disconnects Redis after a successful reset', async () => {
    const transaction = createRedisTransaction();
    const redisClient = {
      isOpen: true,
      multi: vi.fn().mockReturnValue(transaction),
      quit: vi.fn().mockResolvedValue('OK'),
    };
    const connectRedis = vi.fn().mockResolvedValue(redisClient);

    transaction.exec.mockResolvedValue(['OK', 1]);

    await expect(
      runInitSale({
        initialStock: 7,
        connectRedis,
      }),
    ).resolves.toMatchObject({
      initialStock: 7,
    });

    expect(connectRedis).toHaveBeenCalledTimes(1);
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

    transaction.exec.mockRejectedValue(new Error('boom'));

    await expect(
      runInitSale({
        initialStock: 9,
        connectRedis,
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

    transaction.exec.mockResolvedValue(['OK', 1]);
    process.env.SALE_INITIAL_STOCK = '13';

    try {
      await expect(
        runInitSale({
          redisClient,
        }),
      ).resolves.toMatchObject({
        initialStock: 13,
      });
    } finally {
      if (originalInitialStock === undefined) {
        delete process.env.SALE_INITIAL_STOCK;
      } else {
        process.env.SALE_INITIAL_STOCK = originalInitialStock;
      }
    }

    expect(transaction.set).toHaveBeenCalledWith('flashsale:stock', '13');
  });
});
