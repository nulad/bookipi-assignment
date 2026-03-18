const { purchase: defaultPurchase } = require('../services/purchase.service');

function createPurchaseController(deps = {}) {
  const purchase = deps.purchase || defaultPurchase;

  return {
    async purchase(request, response) {
      const payload = await purchase({ userId: request.body?.userId });
      response.status(200).json(payload);
    },
  };
}

module.exports = {
  createPurchaseController,
};
