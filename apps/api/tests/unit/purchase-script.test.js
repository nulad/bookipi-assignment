import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('purchase-script wrapper', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('loads the Lua script, caches it, and executes eval with the expected keys and arguments', async () => {
    const fs = require('node:fs/promises');
    const readFile = vi.spyOn(fs, 'readFile').mockResolvedValue('-- lua script');

    const { PURCHASE_SCRIPT_RESULTS, runPurchaseScript } = require('../../src/redis/purchase-script');
    const redisClient = {
      eval: vi.fn().mockResolvedValue(PURCHASE_SCRIPT_RESULTS.SUCCESS),
    };

    const executionOptions = {
      redisClient,
      userId: 'alice@example.com',
      nowMs: 1710000000000,
      saleStartMs: 1709999999000,
      saleEndMs: 1710000001000,
    };

    await expect(runPurchaseScript(executionOptions)).resolves.toBe(PURCHASE_SCRIPT_RESULTS.SUCCESS);
    await expect(runPurchaseScript(executionOptions)).resolves.toBe(PURCHASE_SCRIPT_RESULTS.SUCCESS);

    expect(readFile).toHaveBeenCalledTimes(1);
    expect(readFile).toHaveBeenCalledWith(expect.stringMatching(/purchase\.lua$/), 'utf8');
    expect(redisClient.eval).toHaveBeenCalledTimes(2);
    expect(redisClient.eval).toHaveBeenCalledWith('-- lua script', {
      keys: ['flashsale:stock', 'flashsale:purchased_users'],
      arguments: [
        'alice@example.com',
        '1710000000000',
        '1709999999000',
        '1710000001000',
      ],
    });
  });

  it('returns valid purchase result codes unchanged', async () => {
    const fs = require('node:fs/promises');
    vi.spyOn(fs, 'readFile').mockResolvedValue('-- lua script');

    const { PURCHASE_SCRIPT_RESULTS, runPurchaseScript } = require('../../src/redis/purchase-script');
    const redisClient = {
      eval: vi.fn()
        .mockResolvedValueOnce(PURCHASE_SCRIPT_RESULTS.NOT_STARTED)
        .mockResolvedValueOnce(PURCHASE_SCRIPT_RESULTS.ENDED)
        .mockResolvedValueOnce(PURCHASE_SCRIPT_RESULTS.ALREADY_PURCHASED)
        .mockResolvedValueOnce(PURCHASE_SCRIPT_RESULTS.SOLD_OUT)
        .mockResolvedValueOnce(PURCHASE_SCRIPT_RESULTS.SUCCESS),
    };

    const baseOptions = {
      redisClient,
      userId: 'alice@example.com',
      nowMs: 10,
      saleStartMs: 5,
      saleEndMs: 15,
    };

    await expect(runPurchaseScript(baseOptions)).resolves.toBe(PURCHASE_SCRIPT_RESULTS.NOT_STARTED);
    await expect(runPurchaseScript(baseOptions)).resolves.toBe(PURCHASE_SCRIPT_RESULTS.ENDED);
    await expect(runPurchaseScript(baseOptions)).resolves.toBe(PURCHASE_SCRIPT_RESULTS.ALREADY_PURCHASED);
    await expect(runPurchaseScript(baseOptions)).resolves.toBe(PURCHASE_SCRIPT_RESULTS.SOLD_OUT);
    await expect(runPurchaseScript(baseOptions)).resolves.toBe(PURCHASE_SCRIPT_RESULTS.SUCCESS);
  });

  it('throws when Redis returns an unknown result code', async () => {
    const fs = require('node:fs/promises');
    vi.spyOn(fs, 'readFile').mockResolvedValue('-- lua script');

    const { runPurchaseScript } = require('../../src/redis/purchase-script');
    const redisClient = {
      eval: vi.fn().mockResolvedValue('BAD_RESULT'),
    };

    await expect(
      runPurchaseScript({
        redisClient,
        userId: 'alice@example.com',
        nowMs: 10,
        saleStartMs: 5,
        saleEndMs: 15,
      }),
    ).rejects.toThrow('Unexpected purchase script result: BAD_RESULT');
  });
});
