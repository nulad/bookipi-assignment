import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const { createSale } = require('../../src/repositories/sale.repository');
const { createTestDatabase } = require('./helpers/postgres-test-helpers');

describe('sale.repository', () => {
  const testDatabase = createTestDatabase();

  beforeAll(async () => {
    await testDatabase.ensureDatabaseSchema();
  });

  afterAll(async () => {
    await testDatabase.closeDatabase();
  });

  it('creates a sale in Postgres and returns the persisted row', async () => {
    const client = await testDatabase.openTransaction();
    const startTime = new Date('2026-03-18T10:00:00.000Z');
    const endTime = new Date('2026-03-18T10:10:00.000Z');

    try {
      const sale = await createSale(
        {
          productName: 'Keyboard',
          initialStock: 25,
          startTime,
          endTime,
        },
        client,
      );

      expect(sale).toMatchObject({
        productName: 'Keyboard',
        initialStock: 25,
      });
      expect(sale.id).toBeTypeOf('string');
      expect(sale.startTime).toEqual(startTime);
      expect(sale.endTime).toEqual(endTime);
      expect(sale.createdAt).toBeInstanceOf(Date);

      const persistedSale = await client.query(
        `
          SELECT product_name, initial_stock
          FROM sales
          WHERE id = $1
        `,
        [sale.id],
      );

      expect(persistedSale.rows).toEqual([
        {
          product_name: 'Keyboard',
          initial_stock: 25,
        },
      ]);
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
  });
});
