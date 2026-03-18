const express = require('express');

const { createPurchaseController } = require('../controllers/purchase.controller');

function createPurchaseRouter(deps = {}) {
  const router = express.Router();
  const controller = createPurchaseController(deps);

  router.post('/purchase', controller.purchase);

  return router;
}

module.exports = {
  createPurchaseRouter,
};
