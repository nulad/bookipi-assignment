import { describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

const { createSaleRouter } = require('../../src/routes/sale.routes');

function createAppWithRouter(deps = {}) {
  const app = express();
  app.use(createSaleRouter(deps));
  return app;
}

describe('sale.routes', () => {
  it('serves GET /sale-status as JSON', async () => {
    const getSaleStatus = vi.fn().mockResolvedValue({
      status: 'upcoming',
      remainingStock: 10,
    });
    const app = createAppWithRouter({ getSaleStatus });

    const response = await request(app).get('/sale-status');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      status: 'upcoming',
      remainingStock: 10,
    });
    expect(getSaleStatus).toHaveBeenCalledTimes(1);
  });

  it('serves GET /purchase-status/:userId as JSON', async () => {
    const getPurchaseStatus = vi.fn().mockResolvedValue({
      userId: 'alice@example.com',
      hasPurchased: false,
    });
    const app = createAppWithRouter({ getPurchaseStatus });

    const response = await request(app).get('/purchase-status/Alice@example.com');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      userId: 'alice@example.com',
      hasPurchased: false,
    });
    expect(getPurchaseStatus).toHaveBeenCalledWith({
      userId: 'Alice@example.com',
    });
  });
});
