import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const { connectRedis, disconnectRedis } = require('../../src/lib/redis');
const { FLASH_SALE_REDIS_KEYS } = require('../../src/redis/keys');
const { PURCHASE_SCRIPT_RESULTS, runPurchaseScript } = require('../../src/redis/purchase-script');
const { resetSaleState } = require('../../src/scripts/init-sale');
const {
  acquireRedisTestLock,
  releaseRedisTestLock,
} = require('./helpers/redis-test-lock');

describe.sequential('runPurchaseScript same-user concurrency', () => {
  let redisClient;
  let redisLockToken;

  beforeAll(async () => {
    redisClient = await connectRedis();
  });

  beforeEach(async () => {
    redisLockToken = await acquireRedisTestLock(redisClient);
    await redisClient.del(FLASH_SALE_REDIS_KEYS.stock);
    await redisClient.del(FLASH_SALE_REDIS_KEYS.purchasedUsers);
  });

  afterEach(async () => {
    await redisClient.del(FLASH_SALE_REDIS_KEYS.stock);
    await redisClient.del(FLASH_SALE_REDIS_KEYS.purchasedUsers);
    await releaseRedisTestLock(redisClient, redisLockToken);
    redisLockToken = undefined;
  });

  afterAll(async () => {
    await disconnectRedis();
  });

  it('allows only one success when the same user races multiple times', async () => {
    await resetSaleState(redisClient, 5);

    const nowMs = Date.now();
    const saleStartMs = nowMs - 1_000;
    const saleEndMs = nowMs + 1_000;
    const purchaseResults = await Promise.all(
      Array.from({ length: 50 }, () => runPurchaseScript({
        redisClient,
        userId: 'repeat-buyer@example.com',
        nowMs,
        saleStartMs,
        saleEndMs,
      })),
    );

    expect(
      purchaseResults.filter((result) => result === PURCHASE_SCRIPT_RESULTS.SUCCESS),
    ).toHaveLength(1);
    expect(
      purchaseResults.filter((result) => result === PURCHASE_SCRIPT_RESULTS.ALREADY_PURCHASED),
    ).toHaveLength(49);
    await expect(redisClient.get(FLASH_SALE_REDIS_KEYS.stock)).resolves.toBe('4');
    await expect(redisClient.sCard(FLASH_SALE_REDIS_KEYS.purchasedUsers)).resolves.toBe(1);
  });

  it('returns NOT_STARTED before checking prior purchase state', async () => {
    const nowMs = Date.now();

    await resetSaleState(redisClient, 5);
    await redisClient.sAdd(FLASH_SALE_REDIS_KEYS.purchasedUsers, 'repeat-buyer@example.com');

    await expect(
      runPurchaseScript({
        redisClient,
        userId: 'repeat-buyer@example.com',
        nowMs,
        saleStartMs: nowMs + 1_000,
        saleEndMs: nowMs + 2_000,
      }),
    ).resolves.toBe(PURCHASE_SCRIPT_RESULTS.NOT_STARTED);

    await expect(redisClient.get(FLASH_SALE_REDIS_KEYS.stock)).resolves.toBe('5');
  });

  it('returns ENDED before checking prior purchase state', async () => {
    const nowMs = Date.now();

    await resetSaleState(redisClient, 5);
    await redisClient.sAdd(FLASH_SALE_REDIS_KEYS.purchasedUsers, 'repeat-buyer@example.com');

    await expect(
      runPurchaseScript({
        redisClient,
        userId: 'repeat-buyer@example.com',
        nowMs,
        saleStartMs: nowMs - 2_000,
        saleEndMs: nowMs - 1_000,
      }),
    ).resolves.toBe(PURCHASE_SCRIPT_RESULTS.ENDED);

    await expect(redisClient.get(FLASH_SALE_REDIS_KEYS.stock)).resolves.toBe('5');
  });
});
