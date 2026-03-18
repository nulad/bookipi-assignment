const FLASH_SALE_REDIS_KEYS = Object.freeze({
  stock: 'flashsale:stock',
  purchasedUsers: 'flashsale:purchased_users',
  activeSaleId: 'flashsale:active_sale_id',
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
