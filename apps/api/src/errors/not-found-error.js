const { ApiError } = require('./api-error');

class NotFoundError extends ApiError {
  constructor(message = 'Route not found') {
    super(message, {
      statusCode: 404,
      code: 'not_found',
      type: 'not_found_error',
    });
  }
}

module.exports = {
  NotFoundError,
};
