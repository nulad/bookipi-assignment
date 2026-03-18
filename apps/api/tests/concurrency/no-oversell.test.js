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
      productName: 'Purchase API Concurrency Test',
      initialStock,
      startTime: new Date(now - 60_000),
      endTime: new Date(now + 60_000),
    },
  };
}

describe.sequential('POST /purchase no-oversell concurrency', () => {
  const harness = createBackendTestHarness();

  beforeAll(async () => {
    await harness.setupSuite();
  });

  afterAll(async () => {
    await harness.teardownSuite();
  });

  it('persists no more successful purchases than available stock across unique users', async () => {
    const { sale } = await harness.setupTest(createActiveSaleScenario(10));

    try {
      const purchaseResponses = await Promise.all(
        Array.from({ length: 100 }, (_, index) => harness
          .createRequest()
          .post('/purchase')
          .send({ userId: `buyer-${index}@example.com` })),
      );

      const statuses = purchaseResponses.map((response) => response.body.status);
      const successCount = statuses.filter((status) => status === 'success').length;
      const soldOutCount = statuses.filter((status) => status === 'sold_out').length;

      expect(purchaseResponses.every((response) => response.status === 200)).toBe(true);
      expect(successCount).toBe(10);
      expect(soldOutCount).toBe(90);
      expect(statuses.every((status) => ['success', 'sold_out'].includes(status))).toBe(true);
      await expect(countPurchases({ saleId: sale.id })).resolves.toBe(10);
      await expect(redisClient.get(FLASH_SALE_REDIS_KEYS.stock)).resolves.toBe('0');
    } finally {
      await harness.teardownTest();
    }
  });
});
