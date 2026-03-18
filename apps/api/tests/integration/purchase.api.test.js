import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const { createBackendTestHarness } = require('../helpers/backend-test-harness');

function createActiveSaleScenario(initialStock = 10) {
  const now = Date.now();

  return {
    initialStock,
    saleConfig: {
      productName: 'Purchase API Test',
      initialStock,
      startTime: new Date(now - 60_000),
      endTime: new Date(now + 60_000),
    },
  };
}

describe.sequential('POST /purchase', () => {
  const harness = createBackendTestHarness();

  beforeAll(async () => {
    await harness.setupSuite();
  });

  afterAll(async () => {
    await harness.teardownSuite();
  });

  it('returns success for a valid purchase during an active sale', async () => {
    await harness.setupTest(createActiveSaleScenario(5));

    try {
      const response = await harness
        .createRequest()
        .post('/purchase')
        .send({ userId: 'alice@example.com' });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
      expect(response.body.purchase).toBeDefined();
      expect(response.body.purchase.userId).toBe('alice@example.com');
    } finally {
      await harness.teardownTest();
    }
  });

  it('returns already_purchased when the same user attempts a repeat purchase', async () => {
    await harness.setupTest(createActiveSaleScenario(5));

    try {
      const request = harness.createRequest();

      const firstResponse = await request
        .post('/purchase')
        .send({ userId: 'bob@example.com' });

      expect(firstResponse.status).toBe(200);
      expect(firstResponse.body.status).toBe('success');

      const secondResponse = await harness
        .createRequest()
        .post('/purchase')
        .send({ userId: 'bob@example.com' });

      expect(secondResponse.status).toBe(200);
      expect(secondResponse.body.status).toBe('already_purchased');
      expect(secondResponse.body.purchase).toBeUndefined();
    } finally {
      await harness.teardownTest();
    }
  });

  it('returns sold_out when stock is exhausted', async () => {
    await harness.setupTest(createActiveSaleScenario(1));

    try {
      const firstResponse = await harness
        .createRequest()
        .post('/purchase')
        .send({ userId: 'buyer1@example.com' });

      expect(firstResponse.status).toBe(200);
      expect(firstResponse.body.status).toBe('success');

      const secondResponse = await harness
        .createRequest()
        .post('/purchase')
        .send({ userId: 'buyer2@example.com' });

      expect(secondResponse.status).toBe(200);
      expect(secondResponse.body.status).toBe('sold_out');
    } finally {
      await harness.teardownTest();
    }
  });

  it('returns sale_not_started before the sale window opens', async () => {
    const now = Date.now();
    await harness.setupTest({
      initialStock: 5,
      saleConfig: {
        productName: 'Purchase API Test - Not Started',
        initialStock: 5,
        startTime: new Date(now + 60_000),
        endTime: new Date(now + 120_000),
      },
    });

    try {
      const response = await harness
        .createRequest()
        .post('/purchase')
        .send({ userId: 'early@example.com' });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('sale_not_started');
    } finally {
      await harness.teardownTest();
    }
  });

  it('returns sale_ended after the sale window closes', async () => {
    const now = Date.now();
    await harness.setupTest({
      initialStock: 5,
      saleConfig: {
        productName: 'Purchase API Test - Ended',
        initialStock: 5,
        startTime: new Date(now - 120_000),
        endTime: new Date(now - 60_000),
      },
    });

    try {
      const response = await harness
        .createRequest()
        .post('/purchase')
        .send({ userId: 'late@example.com' });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('sale_ended');
    } finally {
      await harness.teardownTest();
    }
  });

  it('returns 400 when userId is missing', async () => {
    await harness.setupTest(createActiveSaleScenario(5));

    try {
      const response = await harness
        .createRequest()
        .post('/purchase')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
      expect(response.body.error.type).toBe('validation_error');
      expect(response.body.error.code).toBe('invalid_request');
    } finally {
      await harness.teardownTest();
    }
  });

  it('returns 400 when userId is an empty string', async () => {
    await harness.setupTest(createActiveSaleScenario(5));

    try {
      const response = await harness
        .createRequest()
        .post('/purchase')
        .send({ userId: '' });

      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
      expect(response.body.error.type).toBe('validation_error');
      expect(response.body.error.code).toBe('invalid_request');
    } finally {
      await harness.teardownTest();
    }
  });

  it('returns 400 when userId is whitespace only', async () => {
    await harness.setupTest(createActiveSaleScenario(5));

    try {
      const response = await harness
        .createRequest()
        .post('/purchase')
        .send({ userId: '   ' });

      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
      expect(response.body.error.type).toBe('validation_error');
      expect(response.body.error.code).toBe('invalid_request');
    } finally {
      await harness.teardownTest();
    }
  });

  it('returns 400 when userId is not a string', async () => {
    await harness.setupTest(createActiveSaleScenario(5));

    try {
      const response = await harness
        .createRequest()
        .post('/purchase')
        .send({ userId: 12345 });

      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
      expect(response.body.error.type).toBe('validation_error');
      expect(response.body.error.code).toBe('invalid_request');
    } finally {
      await harness.teardownTest();
    }
  });
});
