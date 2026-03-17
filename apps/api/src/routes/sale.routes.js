const express = require('express');

const { createSaleController } = require('../controllers/sale.controller');

function createSaleRouter(deps = {}) {
  const router = express.Router();
  const controller = createSaleController(deps);

  router.get('/sale-status', controller.getSaleStatus);
  router.get('/purchase-status/:userId', controller.getPurchaseStatus);

  return router;
}

module.exports = {
  createSaleRouter,
};
