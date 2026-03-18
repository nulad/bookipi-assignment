const { purchase: defaultPurchase } = require('../services/purchase.service');

function createPurchaseController(deps = {}) {
  const purchase = deps.purchase || defaultPurchase;

  return {
    async purchase(request, response) {
      const userId = request.body?.userId;

      if (typeof userId !== 'string' || userId.trim().length === 0) {
        response.status(400).json({
          error: {
            code: 'invalid_request',
            message: 'userId must be a non-empty string',
          },
        });
        return;
      }

      const payload = await purchase({ userId });
      response.status(200).json(payload);
    },
  };
}

module.exports = {
  createPurchaseController,
};
