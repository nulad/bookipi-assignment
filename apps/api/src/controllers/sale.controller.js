const {
  getSaleStatus: defaultGetSaleStatus,
} = require('../services/sale-status.service');
const {
  getPurchaseStatus: defaultGetPurchaseStatus,
} = require('../services/purchase-status.service');

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
