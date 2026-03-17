const express = require('express');
const { createSaleRouter } = require('./routes/sale.routes');

function createApp({ saleRouter = createSaleRouter() } = {}) {
  const app = express();

  app.use(express.json());
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
