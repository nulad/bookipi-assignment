const { InvalidRequestError } = require('../errors/invalid-request-error');

function normalizeUserId(userId) {
  if (typeof userId !== 'string' || userId.trim().length === 0) {
    throw new InvalidRequestError('userId must be a non-empty string');
  }

  return userId.trim().toLowerCase();
}

module.exports = {
  normalizeUserId,
};
