const {
  hasPurchaseForUserId: defaultHasPurchaseForUserId,
} = require('../repositories/purchase.repository');
const {
  normalizeUserId: defaultNormalizeUserId,
} = require('../utils/normalize-user-id');

async function getPurchaseStatus({ userId } = {}, deps = {}) {
  const normalizeUserId = deps.normalizeUserId || defaultNormalizeUserId;
  const hasPurchaseForUserId = deps.hasPurchaseForUserId || defaultHasPurchaseForUserId;
  const normalizedUserId = normalizeUserId(userId);
  const hasPurchased = await hasPurchaseForUserId(normalizedUserId);

  return {
    userId: normalizedUserId,
    hasPurchased,
  };
}

module.exports = {
  getPurchaseStatus,
};
