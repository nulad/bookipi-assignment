const express = require('express');
const { createPurchaseRouter } = require('./routes/purchase.routes');
const { createSaleRouter } = require('./routes/sale.routes');
const {
  errorHandler,
  notFoundHandler,
} = require('./middleware/error.middleware');
const { createRequestLogger } = require('./middleware/request-logger.middleware');

const defaultLogger = process.env.NODE_ENV === 'test'
  ? { log: () => {} }
  : console;

function createApp({
  purchaseRouter = createPurchaseRouter(),
  saleRouter = createSaleRouter(),
  logger = defaultLogger,
} = {}) {
  const app = express();

  app.use(createRequestLogger({ logger }));

  app.use((request, response, next) => {
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (request.method === 'OPTIONS') {
      response.status(204).end();
      return;
    }

    next();
  });

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
