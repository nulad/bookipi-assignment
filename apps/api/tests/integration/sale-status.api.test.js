import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const { createBackendTestHarness } = require('../helpers/backend-test-harness');

function createSaleStatusScenario({
  initialStock,
  startOffsetMs,
  endOffsetMs,
}) {
  const now = Date.now();

  return {
    initialStock,
    saleConfig: {
      productName: 'Sale Status API Test',
      initialStock,
      startTime: new Date(now + startOffsetMs),
      endTime: new Date(now + endOffsetMs),
    },
  };
}

describe.sequential('GET /sale-status', () => {
  const harness = createBackendTestHarness();

  beforeAll(async () => {
    await harness.setupSuite();
  });

  afterAll(async () => {
    await harness.teardownSuite();
  });

  async function expectSaleStatusResponse({
    initialStock,
    startOffsetMs,
    endOffsetMs,
    expectedStatus,
  }) {
    await harness.setupTest(
      createSaleStatusScenario({
        initialStock,
        startOffsetMs,
        endOffsetMs,
      }),
    );

    try {
      const response = await harness.createRequest().get('/sale-status');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        status: expectedStatus,
        remainingStock: initialStock,
      });
    } finally {
      await harness.teardownTest();
    }
  }

  it('returns upcoming before the sale window opens', async () => {
    await expectSaleStatusResponse({
      initialStock: 5,
      startOffsetMs: 60_000,
      endOffsetMs: 120_000,
      expectedStatus: 'upcoming',
    });
  });

  it('returns active during the sale window when stock remains', async () => {
    await expectSaleStatusResponse({
      initialStock: 4,
      startOffsetMs: -60_000,
      endOffsetMs: 60_000,
      expectedStatus: 'active',
    });
  });

  it('returns ended after the sale window closes', async () => {
    await expectSaleStatusResponse({
      initialStock: 3,
      startOffsetMs: -120_000,
      endOffsetMs: -60_000,
      expectedStatus: 'ended',
    });
  });

  it('returns sold_out during the sale window when stock is exhausted', async () => {
    await expectSaleStatusResponse({
      initialStock: 0,
      startOffsetMs: -60_000,
      endOffsetMs: 60_000,
      expectedStatus: 'sold_out',
    });
  });
});
