import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const { redisClient } = require('../../src/lib/redis');
const { countPurchases } = require('../../src/repositories/purchase.repository');
const { FLASH_SALE_REDIS_KEYS } = require('../../src/redis/keys');
const { createBackendTestHarness } = require('../helpers/backend-test-harness');

function createActiveSaleScenario(initialStock = 10) {
  const now = Date.now();

  return {
    initialStock,
    saleConfig: {
      productName: 'Purchase API Mixed User Concurrency Test',
      initialStock,
      startTime: new Date(now - 60_000),
      endTime: new Date(now + 60_000),
    },
  };
}

function createMixedUserRequestIds() {
  const repeatedUserIds = [
    'repeat-a@example.com',
    'repeat-b@example.com',
    'repeat-c@example.com',
    'repeat-d@example.com',
  ];
  const requestUserIds = [];

  for (let round = 0; round < 10; round += 1) {
    requestUserIds.push(...repeatedUserIds);

    for (let uniqueIndex = 0; uniqueIndex < 4; uniqueIndex += 1) {
      requestUserIds.push(`buyer-${(round * 4) + uniqueIndex}@example.com`);
    }
  }

  return {
    repeatedUserIds,
    requestUserIds,
  };
}

describe.sequential('POST /purchase mixed-user concurrency', () => {
  const harness = createBackendTestHarness();

  beforeAll(async () => {
    await harness.setupSuite();
  });

  afterAll(async () => {
    await harness.teardownSuite();
  });

  it('prevents duplicate winners and overselling across repeated and unique users', async () => {
    const { sale } = await harness.setupTest(createActiveSaleScenario(10));
    const { repeatedUserIds, requestUserIds } = createMixedUserRequestIds();

    try {
      const purchaseResponses = await Promise.all(
        requestUserIds.map((userId) => harness
          .createRequest()
          .post('/purchase')
          .send({ userId })),
      );

      const statuses = purchaseResponses.map((response) => response.body.status);
      const successResponses = purchaseResponses.filter(
        (response) => response.body.status === 'success',
      );
      const successUserIds = successResponses.map(
        (response) => response.body.purchase.userId,
      );
      const successCount = successResponses.length;
      const alreadyPurchasedCount = statuses.filter(
        (status) => status === 'already_purchased',
      ).length;
      const soldOutCount = statuses.filter((status) => status === 'sold_out').length;

      expect(purchaseResponses).toHaveLength(80);
      expect(purchaseResponses.every((response) => response.status === 200)).toBe(true);
      expect(
        statuses.every((status) => ['success', 'already_purchased', 'sold_out'].includes(status)),
      ).toBe(true);
      expect(successCount).toBe(10);
      expect(successCount + alreadyPurchasedCount + soldOutCount).toBe(80);
      expect(new Set(successUserIds).size).toBe(successCount);
      await expect(countPurchases({ saleId: sale.id })).resolves.toBe(10);

      const repeatedUserPurchaseCounts = await Promise.all(
        repeatedUserIds.map((userId) => countPurchases({
          saleId: sale.id,
          userId,
        })),
      );

      repeatedUserPurchaseCounts.forEach((purchaseCount) => {
        expect(purchaseCount).toBeLessThanOrEqual(1);
      });

      await expect(redisClient.get(FLASH_SALE_REDIS_KEYS.stock)).resolves.toBe('0');
    } finally {
      await harness.teardownTest();
    }
  });
});
