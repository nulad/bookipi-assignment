import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const {
  createSale,
  getOrCreateSale,
} = require('../../src/repositories/sale.repository');
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

  it('returns the same persisted sale for repeated single-sale bootstrap calls', async () => {
    const client = await testDatabase.openTransaction();
    const saleDefinition = {
      productName: 'Keyboard',
      initialStock: 25,
      startTime: new Date('2026-03-18T10:00:00.000Z'),
      endTime: new Date('2026-03-18T10:10:00.000Z'),
    };

    try {
      const firstSale = await getOrCreateSale(saleDefinition, client);
      const secondSale = await getOrCreateSale(saleDefinition, client);

      expect(secondSale).toEqual(firstSale);

      const persistedSales = await client.query(
        `
          SELECT COUNT(*)::INTEGER AS sale_count
          FROM sales
          WHERE product_name = $1
            AND initial_stock = $2
            AND start_time = $3
            AND end_time = $4
        `,
        [
          saleDefinition.productName,
          saleDefinition.initialStock,
          saleDefinition.startTime,
          saleDefinition.endTime,
        ],
      );

      expect(persistedSales.rows).toEqual([
        {
          sale_count: 1,
        },
      ]);
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
  });
});
