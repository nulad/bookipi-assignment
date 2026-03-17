import { afterEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

const appModule = require('../../src/app');
const app = appModule;
const { createApp } = appModule;
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

  it('returns a JSON 404 payload for unknown routes', async () => {
    const response = await request(app).get('/does-not-exist');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      error: {
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
        code: 'invalid_json',
        message: 'Request body must be valid JSON',
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

  it('forwards rejected async sale handlers to the app error middleware', async () => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const customApp = createApp({
      saleRouter: createSaleRouter({
        getSaleStatus: vi.fn().mockRejectedValue(new Error('Redis unavailable')),
      }),
    });

    const response = await request(customApp).get('/sale-status');

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      error: {
        code: 'internal_error',
        message: 'Internal server error',
      },
    });
  });
});
