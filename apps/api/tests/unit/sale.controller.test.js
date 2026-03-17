import { describe, expect, it, vi } from 'vitest';

const { createSaleController } = require('../../src/controllers/sale.controller');

function createResponse() {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
}

describe('sale.controller', () => {
  it('returns the sale status payload from the service', async () => {
    const payload = {
      status: 'active',
      remainingStock: 7,
    };
    const response = createResponse();
    const controller = createSaleController({
      getSaleStatus: vi.fn().mockResolvedValue(payload),
    });

    await controller.getSaleStatus({}, response);

    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.json).toHaveBeenCalledWith(payload);
  });

  it('passes the route param to purchase status service and returns its payload', async () => {
    const getPurchaseStatus = vi.fn().mockResolvedValue({
      userId: 'alice@example.com',
      hasPurchased: true,
    });
    const response = createResponse();
    const controller = createSaleController({
      getPurchaseStatus,
    });

    await controller.getPurchaseStatus(
      {
        params: {
          userId: ' Alice@example.com ',
        },
      },
      response,
    );

    expect(getPurchaseStatus).toHaveBeenCalledWith({
      userId: ' Alice@example.com ',
    });
    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.json).toHaveBeenCalledWith({
      userId: 'alice@example.com',
      hasPurchased: true,
    });
  });

  it('does not swallow rejected service promises', async () => {
    const error = new Error('boom');
    const response = createResponse();
    const controller = createSaleController({
      getSaleStatus: vi.fn().mockRejectedValue(error),
    });

    await expect(controller.getSaleStatus({}, response)).rejects.toThrow('boom');
    expect(response.status).not.toHaveBeenCalled();
    expect(response.json).not.toHaveBeenCalled();
  });
});
