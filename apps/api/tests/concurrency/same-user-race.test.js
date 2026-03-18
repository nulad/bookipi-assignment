import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const { countPurchases } = require('../../src/repositories/purchase.repository');
const { createBackendTestHarness } = require('../helpers/backend-test-harness');

function createActiveSaleScenario(initialStock = 10) {
  const now = Date.now();

  return {
    initialStock,
    saleConfig: {
      productName: 'Purchase API Same User Concurrency Test',
      initialStock,
      startTime: new Date(now - 60_000),
      endTime: new Date(now + 60_000),
    },
  };
}

describe.sequential('POST /purchase same-user concurrency', () => {
  const harness = createBackendTestHarness();

  beforeAll(async () => {
    await harness.setupSuite();
  });

  afterAll(async () => {
    await harness.teardownSuite();
  });

  it('allows at most one successful purchase when the same user races multiple requests', async () => {
    const { sale } = await harness.setupTest(createActiveSaleScenario(10));
    const userId = 'Repeat-Buyer@example.com';
    const normalizedUserId = 'repeat-buyer@example.com';

    try {
      const purchaseResponses = await Promise.all(
        Array.from({ length: 20 }, () => harness
          .createRequest()
          .post('/purchase')
          .send({ userId })),
      );

      const statuses = purchaseResponses.map((response) => response.body.status);
      const successCount = statuses.filter((status) => status === 'success').length;
      const alreadyPurchasedCount = statuses.filter(
        (status) => status === 'already_purchased',
      ).length;

      expect(purchaseResponses.every((response) => response.status === 200)).toBe(true);
      expect(successCount).toBeLessThanOrEqual(1);
      expect(successCount + alreadyPurchasedCount).toBe(20);
      expect(
        statuses.every((status) => ['success', 'already_purchased'].includes(status)),
      ).toBe(true);
      expect(alreadyPurchasedCount).toBe(20 - successCount);
      await expect(
        countPurchases({
          saleId: sale.id,
          userId: normalizedUserId,
        }),
      ).resolves.toBe(1);
    } finally {
      await harness.teardownTest();
    }
  });
});
