class InvalidRequestError extends Error {
  constructor(message) {
    super(message);
    this.name = 'InvalidRequestError';
    this.code = 'invalid_request';
  }
}

module.exports = {
  InvalidRequestError,
};
