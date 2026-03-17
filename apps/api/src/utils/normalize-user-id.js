function normalizeUserId(userId) {
  if (typeof userId !== 'string') {
    throw new TypeError('User ID must be a string');
  }

  const normalizedUserId = userId.trim().toLowerCase();

  if (!normalizedUserId) {
    throw new Error('User ID cannot be empty');
  }

  return normalizedUserId;
}

module.exports = {
  normalizeUserId,
};
