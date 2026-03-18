import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const { createBackendTestHarness } = require('../helpers/backend-test-harness');

describe.sequential('backend test harness', () => {
  const harness = createBackendTestHarness();

  beforeAll(async () => {
    await harness.setupSuite();
  });

  beforeEach(async () => {
    const now = Date.now();

    await harness.setupTest({
      initialStock: 2,
      saleConfig: {
        productName: 'Harness Sale',
        initialStock: 2,
        startTime: new Date(now - 60_000),
        endTime: new Date(now + 60_000),
      },
    });
  });

  afterEach(async () => {
    await harness.teardownTest();
  });

  afterAll(async () => {
    await harness.teardownSuite();
  });

  it('boots the real app and persists purchases through the HTTP API', async () => {
    const api = harness.createRequest();

    await expect(api.get('/sale-status')).resolves.toMatchObject({
      status: 200,
      body: {
        status: 'active',
        remainingStock: 2,
      },
    });

    await expect(
      api
        .post('/purchase')
        .send({ userId: 'Alice@example.com' }),
    ).resolves.toMatchObject({
      status: 200,
      body: {
        status: 'success',
      },
    });

    await expect(api.get('/purchase-status/Alice@example.com')).resolves.toMatchObject({
      status: 200,
      body: {
        userId: 'alice@example.com',
        hasPurchased: true,
      },
    });
  });

  it('starts each test from a clean Postgres and Redis state', async () => {
    const api = harness.createRequest();

    await expect(api.get('/purchase-status/alice@example.com')).resolves.toMatchObject({
      status: 200,
      body: {
        userId: 'alice@example.com',
        hasPurchased: false,
      },
    });

    await expect(api.get('/sale-status')).resolves.toMatchObject({
      status: 200,
      body: {
        status: 'active',
        remainingStock: 2,
      },
    });
  });
});
