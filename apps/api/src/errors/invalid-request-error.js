const { ValidationError } = require('./validation-error');

class InvalidRequestError extends ValidationError {
  constructor(message) {
    super(message, {
      code: 'invalid_request',
    });
  }
}

module.exports = {
  InvalidRequestError,
};
