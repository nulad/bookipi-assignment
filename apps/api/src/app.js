const express = require('express');
const { createPurchaseRouter } = require('./routes/purchase.routes');
const { createSaleRouter } = require('./routes/sale.routes');
const { InvalidRequestError } = require('./errors/invalid-request-error');

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

  app.use((_request, response) => {
    response.status(404).json({
      error: {
        code: 'not_found',
        message: 'Route not found',
      },
    });
  });

  app.use((error, _request, response, _next) => {
    if (error instanceof SyntaxError && error.status === 400 && 'body' in error) {
      response.status(400).json({
        error: {
          code: 'invalid_json',
          message: 'Request body must be valid JSON',
        },
      });
      return;
    }

    if (error instanceof InvalidRequestError) {
      response.status(400).json({
        error: {
          code: error.code,
          message: error.message,
        },
      });
      return;
    }

    console.error(error);
    response.status(500).json({
      error: {
        code: 'internal_error',
        message: 'Internal server error',
      },
    });
  });

  return app;
}

const app = createApp();

module.exports = app;
module.exports.createApp = createApp;
