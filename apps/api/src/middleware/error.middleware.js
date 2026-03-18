const { ApiError } = require('../errors/api-error');
const { NotFoundError } = require('../errors/not-found-error');
const { ValidationError } = require('../errors/validation-error');

function isMalformedJsonError(error) {
  return (
    error instanceof SyntaxError
    && error.status === 400
    && Object.prototype.hasOwnProperty.call(error, 'body')
  );
}

function normalizeError(error) {
  if (error instanceof ApiError) {
    return error;
  }

  if (isMalformedJsonError(error)) {
    return new ValidationError('Request body must be valid JSON', {
      code: 'invalid_json',
    });
  }

  return new ApiError('Internal server error', {
    statusCode: 500,
    code: 'internal_error',
    type: 'internal_error',
  });
}

function createErrorPayload(error) {
  return {
    error: {
      type: error.type,
      code: error.code,
      message: error.message,
    },
  };
}

function notFoundHandler(_request, _response, next) {
  next(new NotFoundError());
}

function errorHandler(error, _request, response, _next) {
  const normalizedError = normalizeError(error);

  if (normalizedError.statusCode >= 500) {
    console.error(error);
  }

  response
    .status(normalizedError.statusCode)
    .json(createErrorPayload(normalizedError));
}

module.exports = {
  createErrorPayload,
  errorHandler,
  isMalformedJsonError,
  normalizeError,
  notFoundHandler,
};
