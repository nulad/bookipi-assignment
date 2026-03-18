const express = require('express');
const { createPurchaseRouter } = require('./routes/purchase.routes');
const { createSaleRouter } = require('./routes/sale.routes');
const {
  errorHandler,
  notFoundHandler,
} = require('./middleware/error.middleware');

function createApp({
  purchaseRouter = createPurchaseRouter(),
  saleRouter = createSaleRouter(),
} = {}) {
  const app = express();

  app.use(express.json());
  app.use(purchaseRouter);
  app.use(saleRouter);

  app.get('/health', (_request, response) => {
    response.status(200).json({ status: 'ok' });
  });

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

const app = createApp();

module.exports = app;
module.exports.createApp = createApp;
