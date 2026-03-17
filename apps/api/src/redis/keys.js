const FLASH_SALE_REDIS_KEYS = Object.freeze({
  stock: 'flashsale:stock',
  purchasedUsers: 'flashsale:purchased_users',
});

function getPurchaseScriptKeys() {
  return [
    FLASH_SALE_REDIS_KEYS.stock,
    FLASH_SALE_REDIS_KEYS.purchasedUsers,
  ];
}

module.exports = {
  FLASH_SALE_REDIS_KEYS,
  getPurchaseScriptKeys,
};
