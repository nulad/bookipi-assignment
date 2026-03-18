import { describe, expect, it, vi } from 'vitest';

const { createPurchaseController } = require('../../src/controllers/purchase.controller');

function createResponse() {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
}

describe('purchase.controller', () => {
  it('returns the purchase payload from the service', async () => {
    const payload = {
      status: 'success',
      purchase: {
        id: '1',
        saleId: '123',
        userId: 'alice@example.com',
        purchasedAt: new Date('2026-03-18T10:01:00.000Z'),
      },
    };
    const response = createResponse();
    const controller = createPurchaseController({
      purchase: vi.fn().mockResolvedValue(payload),
    });

    await controller.purchase(
      {
        body: {
          userId: ' Alice@example.com ',
        },
      },
      response,
    );

    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.json).toHaveBeenCalledWith(payload);
  });

  it.each([
    [{}, 'missing userId'],
    [{ userId: 123 }, 'non-string userId'],
    [{ userId: '   ' }, 'blank userId'],
  ])('returns 400 for %s', async (body) => {
    const response = createResponse();
    const purchase = vi.fn();
    const controller = createPurchaseController({ purchase });

    await controller.purchase({ body }, response);

    expect(purchase).not.toHaveBeenCalled();
    expect(response.status).toHaveBeenCalledWith(400);
    expect(response.json).toHaveBeenCalledWith({
      error: {
        code: 'invalid_request',
        message: 'userId must be a non-empty string',
      },
    });
  });

  it('does not swallow rejected service promises', async () => {
    const error = new Error('boom');
    const response = createResponse();
    const controller = createPurchaseController({
      purchase: vi.fn().mockRejectedValue(error),
    });

    await expect(
      controller.purchase(
        {
          body: {
            userId: 'alice@example.com',
          },
        },
        response,
      ),
    ).rejects.toThrow('boom');

    expect(response.status).not.toHaveBeenCalled();
    expect(response.json).not.toHaveBeenCalled();
  });
});
