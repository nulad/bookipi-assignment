const {
  getSaleStatus: defaultGetSaleStatus,
  getPurchaseStatus: defaultGetPurchaseStatus,
} = require('../services/sale.service');

function createSaleController(deps = {}) {
  const getSaleStatus = deps.getSaleStatus || defaultGetSaleStatus;
  const getPurchaseStatus = deps.getPurchaseStatus || defaultGetPurchaseStatus;

  return {
    async getSaleStatus(_request, response) {
      const payload = await getSaleStatus();
      response.status(200).json(payload);
    },

    async getPurchaseStatus(request, response) {
      const payload = await getPurchaseStatus({
        userId: request.params.userId,
      });

      response.status(200).json(payload);
    },
  };
}

module.exports = {
  createSaleController,
};
