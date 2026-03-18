import { afterEach, describe, expect, it, vi } from 'vitest';

const { InvalidRequestError } = require('../../src/errors/invalid-request-error');
const { NotFoundError } = require('../../src/errors/not-found-error');
const {
  createErrorPayload,
  errorHandler,
  normalizeError,
  notFoundHandler,
} = require('../../src/middleware/error.middleware');

function createResponse() {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
}

describe('error.middleware', () => {
  let consoleErrorSpy;

  afterEach(() => {
    consoleErrorSpy?.mockRestore();
    consoleErrorSpy = undefined;
  });

  it('keeps application validation errors as 400 responses', () => {
    const error = normalizeError(new InvalidRequestError('userId must be a non-empty string'));

    expect(error).toBeInstanceOf(InvalidRequestError);
    expect(error.statusCode).toBe(400);
    expect(error.type).toBe('validation_error');
    expect(error.code).toBe('invalid_request');
  });

  it('normalizes malformed JSON into a validation error payload', () => {
    const syntaxError = new SyntaxError('Unexpected end of JSON input');
    syntaxError.status = 400;
    syntaxError.body = '{';

    const error = normalizeError(syntaxError);

    expect(error.statusCode).toBe(400);
    expect(createErrorPayload(error)).toEqual({
      error: {
        type: 'validation_error',
        code: 'invalid_json',
        message: 'Request body must be valid JSON',
      },
    });
  });

  it('normalizes unknown failures into an internal error response', () => {
    const error = normalizeError(new Error('Redis unavailable'));

    expect(error.statusCode).toBe(500);
    expect(error.type).toBe('internal_error');
    expect(error.code).toBe('internal_error');
    expect(error.message).toBe('Internal server error');
  });

  it('forwards unknown routes into the centralized error middleware', () => {
    const next = vi.fn();

    notFoundHandler({}, {}, next);

    expect(next).toHaveBeenCalledWith(expect.any(NotFoundError));
  });

  it('logs internal errors and responds with the normalized payload', () => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const response = createResponse();
    const error = new Error('Redis unavailable');

    errorHandler(error, {}, response, () => {});

    expect(consoleErrorSpy).toHaveBeenCalledWith(error);
    expect(response.status).toHaveBeenCalledWith(500);
    expect(response.json).toHaveBeenCalledWith({
      error: {
        type: 'internal_error',
        code: 'internal_error',
        message: 'Internal server error',
      },
    });
  });
});
