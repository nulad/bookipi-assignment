import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const { createBackendTestHarness } = require('../helpers/backend-test-harness');

function createActiveSaleScenario(initialStock = 5) {
  const now = Date.now();

  return {
    initialStock,
    saleConfig: {
      productName: 'Purchase Status API Test',
      initialStock,
      startTime: new Date(now - 60_000),
      endTime: new Date(now + 60_000),
    },
  };
}

describe.sequential('GET /purchase-status/:userId', () => {
  const harness = createBackendTestHarness();

  beforeAll(async () => {
    await harness.setupSuite();
  });

  afterAll(async () => {
    await harness.teardownSuite();
  });

  it('returns hasPurchased false when the user has no persisted purchase', async () => {
    await harness.setupTest(createActiveSaleScenario());

    try {
      const response = await harness
        .createRequest()
        .get('/purchase-status/never-bought@example.com');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        userId: 'never-bought@example.com',
        hasPurchased: false,
      });
    } finally {
      await harness.teardownTest();
    }
  });

  it('returns hasPurchased true after a successful purchase is persisted', async () => {
    await harness.setupTest(createActiveSaleScenario());

    try {
      const purchaseResponse = await harness
        .createRequest()
        .post('/purchase')
        .send({ userId: 'Winner@example.com' });

      expect(purchaseResponse.status).toBe(200);
      expect(purchaseResponse.body.status).toBe('success');

      const statusResponse = await harness
        .createRequest()
        .get('/purchase-status/winner@example.com');

      expect(statusResponse.status).toBe(200);
      expect(statusResponse.body).toEqual({
        userId: 'winner@example.com',
        hasPurchased: true,
      });
    } finally {
      await harness.teardownTest();
    }
  });

  it('returns 400 when the decoded path userId is blank', async () => {
    await harness.setupTest(createActiveSaleScenario());

    try {
      const response = await harness
        .createRequest()
        .get('/purchase-status/%20%20%20');

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        error: {
          code: 'invalid_request',
          message: 'userId must be a non-empty string',
        },
      });
    } finally {
      await harness.teardownTest();
    }
  });
});
