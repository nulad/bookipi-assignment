import { afterEach, describe, expect, it } from 'vitest';

function loadFreshEnvModule() {
  const modulePath = require.resolve('../../src/config/env');
  delete require.cache[modulePath];
  return require('../../src/config/env');
}

describe('config.env', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    const modulePath = require.resolve('../../src/config/env');
    delete require.cache[modulePath];
  });

  it('loads strict integer env values successfully', () => {
    process.env.PORT = '3000';
    process.env.POSTGRES_URL = 'postgresql://localhost:5432/bookipi';
    process.env.REDIS_URL = 'redis://localhost:6379';
    process.env.SALE_PRODUCT_NAME = 'Flash Sale Item';
    process.env.SALE_START_TIME = '2026-03-18T10:00:00.000Z';
    process.env.SALE_END_TIME = '2026-03-18T10:10:00.000Z';
    process.env.SALE_INITIAL_STOCK = '100';

    const config = loadFreshEnvModule();

    expect(config.port).toBe(3000);
    expect(config.sale.initialStock).toBe(100);
  });

  it('prefers POSTGRES_TEST_URL during test runs when it is available', () => {
    process.env.NODE_ENV = 'test';
    process.env.PORT = '3000';
    process.env.POSTGRES_URL = 'postgresql://localhost:5432/bookipi';
    process.env.POSTGRES_TEST_URL = 'postgresql://localhost:5432/bookipi_test';
    process.env.REDIS_URL = 'redis://localhost:6379';
    process.env.SALE_PRODUCT_NAME = 'Flash Sale Item';
    process.env.SALE_START_TIME = '2026-03-18T10:00:00.000Z';
    process.env.SALE_END_TIME = '2026-03-18T10:10:00.000Z';
    process.env.SALE_INITIAL_STOCK = '100';

    const config = loadFreshEnvModule();

    expect(config.postgresUrl).toBe('postgresql://localhost:5432/bookipi_test');
    expect(config.postgresTestUrl).toBe('postgresql://localhost:5432/bookipi_test');
  });

  it('rejects malformed integer env values instead of truncating them', () => {
    process.env.PORT = '3000';
    process.env.POSTGRES_URL = 'postgresql://localhost:5432/bookipi';
    process.env.REDIS_URL = 'redis://localhost:6379';
    process.env.SALE_PRODUCT_NAME = 'Flash Sale Item';
    process.env.SALE_START_TIME = '2026-03-18T10:00:00.000Z';
    process.env.SALE_END_TIME = '2026-03-18T10:10:00.000Z';
    process.env.SALE_INITIAL_STOCK = '100items';

    expect(() => loadFreshEnvModule()).toThrow(
      'Environment variable SALE_INITIAL_STOCK must be a valid integer',
    );
  });
});
