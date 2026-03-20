import { afterEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

const appModule = require('../../src/app');
const app = appModule;
const { createApp } = appModule;
const { InvalidRequestError } = require('../../src/errors/invalid-request-error');
const { PurchasePersistenceError } = require('../../src/errors/purchase-persistence-error');
const { createPurchaseRouter } = require('../../src/routes/purchase.routes');
const { createSaleRouter } = require('../../src/routes/sale.routes');

describe('app', () => {
  let consoleErrorSpy;

  afterEach(() => {
    consoleErrorSpy?.mockRestore();
    consoleErrorSpy = undefined;
  });

  it('returns JSON from the health endpoint', async () => {
    const response = await request(app).get('/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });

  it('logs each successful request once with method, path, status, and duration', async () => {
    const logger = {
      log: vi.fn(),
    };
    const customApp = createApp({ logger });

    const response = await request(customApp).get('/health');

    expect(response.status).toBe(200);
    expect(logger.log).toHaveBeenCalledTimes(1);
    expect(logger.log).toHaveBeenCalledWith(expect.stringMatching(/^GET \/health 200 \d+ms$/));
  });

  it('returns a JSON 404 payload for unknown routes', async () => {
    const response = await request(app).get('/does-not-exist');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      error: {
        type: 'not_found_error',
        code: 'not_found',
        message: 'Route not found',
      },
    });
  });

  it('returns a JSON 400 payload for malformed JSON bodies', async () => {
    const response = await request(app)
      .post('/health')
      .set('Content-Type', 'application/json')
      .send('{');

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: {
        type: 'validation_error',
        code: 'invalid_json',
        message: 'Request body must be valid JSON',
      },
    });
  });

  it('returns a JSON 400 payload for invalid request errors', async () => {
    const customApp = createApp({
      purchaseRouter: createPurchaseRouter({
        purchase: vi.fn().mockRejectedValue(
          new InvalidRequestError('userId must be a non-empty string'),
        ),
      }),
    });

    const response = await request(customApp)
      .post('/purchase')
      .send({});

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: {
        type: 'validation_error',
        code: 'invalid_request',
        message: 'userId must be a non-empty string',
      },
    });
  });

  it('mounts the injected sale router before the 404 handler', async () => {
    const saleRouter = express.Router();
    saleRouter.get('/sale-status', (_request, response) => {
      response.status(200).json({
        status: 'active',
        remainingStock: 5,
      });
    });

    const customApp = createApp({ saleRouter });
    const response = await request(customApp).get('/sale-status');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      status: 'active',
      remainingStock: 5,
    });
  });

  it('mounts the injected purchase router before the 404 handler', async () => {
    const purchaseRouter = express.Router();
    purchaseRouter.post('/purchase', (_request, response) => {
      response.status(200).json({
        status: 'success',
      });
    });

    const customApp = createApp({ purchaseRouter });
    const response = await request(customApp)
      .post('/purchase')
      .send({ userId: 'alice@example.com' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      status: 'success',
    });
  });

  it('forwards rejected async sale handlers to the app error middleware', async () => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const logger = {
      log: vi.fn(),
    };

    const customApp = createApp({
      logger,
      saleRouter: createSaleRouter({
        getSaleStatus: vi.fn().mockRejectedValue(new Error('Redis unavailable')),
      }),
    });

    const response = await request(customApp).get('/sale-status');

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      error: {
        type: 'internal_error',
        code: 'internal_error',
        message: 'Internal server error',
      },
    });
    expect(logger.log).toHaveBeenCalledTimes(1);
    expect(logger.log).toHaveBeenCalledWith(
      expect.stringMatching(/^GET \/sale-status 500 \d+ms$/),
    );
  });

  it('forwards rejected async purchase handlers to the app error middleware', async () => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const customApp = createApp({
      purchaseRouter: createPurchaseRouter({
        purchase: vi.fn().mockRejectedValue(new Error('Redis unavailable')),
      }),
    });

    const response = await request(customApp)
      .post('/purchase')
      .send({ userId: 'alice@example.com' });

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      error: {
        type: 'internal_error',
        code: 'internal_error',
        message: 'Internal server error',
      },
    });
  });

  it('preserves the explicit purchase persistence error payload', async () => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const customApp = createApp({
      purchaseRouter: createPurchaseRouter({
        purchase: vi.fn().mockRejectedValue(new PurchasePersistenceError()),
      }),
    });

    const response = await request(customApp)
      .post('/purchase')
      .send({ userId: 'alice@example.com' });

    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      error: {
        type: 'service_unavailable_error',
        code: 'purchase_persistence_failed',
        message: 'Purchase could not be durably persisted; outcome pending reconciliation',
      },
    });
  });
});
