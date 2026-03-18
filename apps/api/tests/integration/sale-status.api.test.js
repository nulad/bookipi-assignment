import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const { createBackendTestHarness } = require('../helpers/backend-test-harness');
const { createApp } = require('../../src/app');
const { createSaleRouter } = require('../../src/routes/sale.routes');
const { getSaleStatus } = require('../../src/services/sale-status.service');

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

function createSaleStatusAppAt(now) {
  return createApp({
    saleRouter: createSaleRouter({
      getSaleStatus: () => getSaleStatus({ now }),
    }),
  });
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
    app,
  }) {
    await harness.setupTest(
      createSaleStatusScenario({
        initialStock,
        startOffsetMs,
        endOffsetMs,
      }),
    );

    try {
      const response = await harness.createRequest(app).get('/sale-status');

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

  it('returns active at the exact sale start time when stock remains', async () => {
    const boundaryNow = new Date('2026-03-18T10:00:00.000Z');

    await harness.setupTest({
      initialStock: 4,
      saleConfig: {
        productName: 'Sale Status API Test - Start Boundary',
        initialStock: 4,
        startTime: new Date(boundaryNow),
        endTime: new Date(boundaryNow.getTime() + 60_000),
      },
    });

    try {
      const response = await harness
        .createRequest(createSaleStatusAppAt(boundaryNow))
        .get('/sale-status');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        status: 'active',
        remainingStock: 4,
      });
    } finally {
      await harness.teardownTest();
    }
  });

  it('returns sold_out at the exact sale end time when stock is exhausted', async () => {
    const boundaryNow = new Date('2026-03-18T10:01:00.000Z');

    await harness.setupTest({
      initialStock: 0,
      saleConfig: {
        productName: 'Sale Status API Test - End Boundary',
        initialStock: 0,
        startTime: new Date(boundaryNow.getTime() - 60_000),
        endTime: new Date(boundaryNow),
      },
    });

    try {
      const response = await harness
        .createRequest(createSaleStatusAppAt(boundaryNow))
        .get('/sale-status');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        status: 'sold_out',
        remainingStock: 0,
      });
    } finally {
      await harness.teardownTest();
    }
  });

  it('reflects decremented stock after a successful purchase', async () => {
    const now = Date.now();

    await harness.setupTest({
      initialStock: 2,
      saleConfig: {
        productName: 'Sale Status API Test - Stock Change',
        initialStock: 2,
        startTime: new Date(now - 60_000),
        endTime: new Date(now + 60_000),
      },
    });

    try {
      const api = harness.createRequest();

      const purchaseResponse = await api
        .post('/purchase')
        .send({ userId: 'stock-check@example.com' });

      expect(purchaseResponse.status).toBe(200);
      expect(purchaseResponse.body.status).toBe('success');

      const statusResponse = await api.get('/sale-status');

      expect(statusResponse.status).toBe(200);
      expect(statusResponse.body).toEqual({
        status: 'active',
        remainingStock: 1,
      });
    } finally {
      await harness.teardownTest();
    }
  });
});
