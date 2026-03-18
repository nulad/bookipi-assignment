const { ApiError } = require('./api-error');

class ValidationError extends ApiError {
  constructor(message, { code = 'invalid_request' } = {}) {
    super(message, {
      statusCode: 400,
      code,
      type: 'validation_error',
    });
  }
}

module.exports = {
  ValidationError,
};
