const { ApiError } = require('./api-error');

class PurchasePersistenceError extends ApiError {
  constructor(message = 'Purchase could not be durably persisted; outcome pending reconciliation') {
    super(message, {
      statusCode: 503,
      code: 'purchase_persistence_failed',
      type: 'service_unavailable_error',
    });
  }
}

module.exports = {
  PurchasePersistenceError,
};
