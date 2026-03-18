import { describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

const { createPurchaseRouter } = require('../../src/routes/purchase.routes');

function createAppWithRouter(deps = {}) {
  const app = express();
  app.use(express.json());
  app.use(createPurchaseRouter(deps));
  return app;
}

describe('purchase.routes', () => {
  it('serves POST /purchase as JSON', async () => {
    const purchase = vi.fn().mockResolvedValue({
      status: 'success',
      purchase: {
        id: '1',
        saleId: '123',
        userId: 'alice@example.com',
        purchasedAt: '2026-03-18T10:01:00.000Z',
      },
    });
    const app = createAppWithRouter({ purchase });

    const response = await request(app)
      .post('/purchase')
      .send({ userId: 'Alice@example.com' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      status: 'success',
      purchase: {
        id: '1',
        saleId: '123',
        userId: 'alice@example.com',
        purchasedAt: '2026-03-18T10:01:00.000Z',
      },
    });
    expect(purchase).toHaveBeenCalledWith({
      userId: 'Alice@example.com',
    });
  });

  it('returns 400 for invalid bodies', async () => {
    const purchase = vi.fn();
    const app = createAppWithRouter({ purchase });

    const response = await request(app)
      .post('/purchase')
      .send({ userId: '   ' });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: {
        code: 'invalid_request',
        message: 'userId must be a non-empty string',
      },
    });
    expect(purchase).not.toHaveBeenCalled();
  });
});
