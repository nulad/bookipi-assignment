import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const { connectRedis, disconnectRedis } = require('../../src/lib/redis');
const { FLASH_SALE_REDIS_KEYS } = require('../../src/redis/keys');
const { PURCHASE_SCRIPT_RESULTS, runPurchaseScript } = require('../../src/redis/purchase-script');
const { resetSaleState } = require('../../src/scripts/init-sale');
const {
  acquireRedisTestLock,
  releaseRedisTestLock,
} = require('./helpers/redis-test-lock');

describe.sequential('runPurchaseScript no-oversell concurrency', () => {
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

  it('allows no more successful purchases than available stock across unique users', async () => {
    await resetSaleState(redisClient, 10);

    const nowMs = Date.now();
    const saleStartMs = nowMs - 1_000;
    const saleEndMs = nowMs + 1_000;
    const purchaseResults = await Promise.all(
      Array.from({ length: 100 }, (_, index) => runPurchaseScript({
        redisClient,
        userId: `buyer-${index}@example.com`,
        nowMs,
        saleStartMs,
        saleEndMs,
      })),
    );

    expect(
      purchaseResults.filter((result) => result === PURCHASE_SCRIPT_RESULTS.SUCCESS),
    ).toHaveLength(10);
    expect(
      purchaseResults.filter((result) => result === PURCHASE_SCRIPT_RESULTS.SOLD_OUT),
    ).toHaveLength(90);
    await expect(redisClient.get(FLASH_SALE_REDIS_KEYS.stock)).resolves.toBe('0');
    await expect(redisClient.sCard(FLASH_SALE_REDIS_KEYS.purchasedUsers)).resolves.toBe(10);
  });

  it('treats missing stock as sold out', async () => {
    const nowMs = Date.now();

    await expect(
      runPurchaseScript({
        redisClient,
        userId: 'missing-stock@example.com',
        nowMs,
        saleStartMs: nowMs - 1_000,
        saleEndMs: nowMs + 1_000,
      }),
    ).resolves.toBe(PURCHASE_SCRIPT_RESULTS.SOLD_OUT);

    await expect(redisClient.sCard(FLASH_SALE_REDIS_KEYS.purchasedUsers)).resolves.toBe(0);
  });
});
