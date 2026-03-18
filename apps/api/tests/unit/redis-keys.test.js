import { describe, expect, it } from 'vitest';

const {
  FLASH_SALE_REDIS_KEYS,
  getPurchaseScriptKeys,
} = require('../../src/redis/keys');

describe('redis key strategy', () => {
  it('defines the expected stock, purchased users, and active sale id keys', () => {
    expect(FLASH_SALE_REDIS_KEYS.stock).toBe('flashsale:stock');
    expect(FLASH_SALE_REDIS_KEYS.purchasedUsers).toBe('flashsale:purchased_users');
    expect(FLASH_SALE_REDIS_KEYS.activeSaleId).toBe('flashsale:active_sale_id');
  });

  it('returns purchase script keys in the required order', () => {
    expect(getPurchaseScriptKeys()).toEqual([
      'flashsale:stock',
      'flashsale:purchased_users',
    ]);
  });

  it('freezes the exported key object', () => {
    expect(Object.isFrozen(FLASH_SALE_REDIS_KEYS)).toBe(true);

    expect(() => {
      'use strict';
      FLASH_SALE_REDIS_KEYS.stock = 'other_stock';
    }).toThrow(TypeError);
    expect(FLASH_SALE_REDIS_KEYS.stock).toBe('flashsale:stock');
  });
});
