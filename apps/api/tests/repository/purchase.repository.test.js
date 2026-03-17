import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const { createSale } = require('../../src/repositories/sale.repository');
const {
  countPurchases,
  createPurchase,
  findPurchasesByUserId,
} = require('../../src/repositories/purchase.repository');
const { createTestDatabase } = require('./helpers/postgres-test-helpers');

describe('purchase.repository', () => {
  const testDatabase = createTestDatabase();

  async function createFixtureSale(client, productName = 'Monitor') {
    return createSale(
      {
        productName,
        initialStock: 50,
        startTime: new Date('2026-03-18T10:00:00.000Z'),
        endTime: new Date('2026-03-18T10:10:00.000Z'),
      },
      client,
    );
  }

  beforeAll(async () => {
    await testDatabase.ensureDatabaseSchema();
  });

  afterAll(async () => {
    await testDatabase.closeDatabase();
  });

  it('creates a purchase in Postgres and returns the persisted row', async () => {
    const client = await testDatabase.openTransaction();

    try {
      const sale = await createFixtureSale(client);

      const purchase = await createPurchase(
        {
          saleId: sale.id,
          userId: 'alice@example.com',
        },
        client,
      );

      expect(purchase).toMatchObject({
        saleId: sale.id,
        userId: 'alice@example.com',
      });
      expect(purchase.id).toBeTypeOf('string');
      expect(purchase.purchasedAt).toBeInstanceOf(Date);

      const persistedPurchase = await client.query(
        `
          SELECT sale_id, user_id
          FROM purchases
          WHERE id = $1
        `,
        [purchase.id],
      );

      expect(persistedPurchase.rows).toEqual([
        {
          sale_id: sale.id,
          user_id: 'alice@example.com',
        },
      ]);
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
  });

  it('finds all purchases for a user id across sales', async () => {
    const client = await testDatabase.openTransaction();

    try {
      const userId = `alice-${Date.now()}@example.com`;
      const saleOne = await createSale(
        {
          productName: 'Laptop',
          initialStock: 50,
          startTime: new Date('2026-03-18T10:00:00.000Z'),
          endTime: new Date('2026-03-18T10:10:00.000Z'),
        },
        client,
      );
      const saleTwo = await createSale(
        {
          productName: 'Mouse',
          initialStock: 50,
          startTime: new Date('2026-03-18T10:00:00.000Z'),
          endTime: new Date('2026-03-18T10:10:00.000Z'),
        },
        client,
      );

      await createPurchase(
        {
          saleId: saleOne.id,
          userId,
        },
        client,
      );
      await createPurchase(
        {
          saleId: saleTwo.id,
          userId,
        },
        client,
      );
      await createPurchase(
        {
          saleId: saleTwo.id,
          userId: `bob-${Date.now()}@example.com`,
        },
        client,
      );

      const purchases = await findPurchasesByUserId(userId, client);

      expect(purchases).toHaveLength(2);
      expect(purchases.map((purchase) => purchase.saleId)).toEqual([
        saleOne.id,
        saleTwo.id,
      ]);
      expect(purchases.every((purchase) => purchase.userId === userId)).toBe(true);
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
  });

  it('counts purchases with and without filters', async () => {
    const client = await testDatabase.openTransaction();

    try {
      const userId = `alice-${Date.now()}@example.com`;
      const otherUserId = `bob-${Date.now()}@example.com`;
      const baselineCount = await countPurchases({}, client);
      const saleOne = await createSale(
        {
          productName: 'Desk',
          initialStock: 50,
          startTime: new Date('2026-03-18T10:00:00.000Z'),
          endTime: new Date('2026-03-18T10:10:00.000Z'),
        },
        client,
      );
      const saleTwo = await createSale(
        {
          productName: 'Chair',
          initialStock: 50,
          startTime: new Date('2026-03-18T10:00:00.000Z'),
          endTime: new Date('2026-03-18T10:10:00.000Z'),
        },
        client,
      );

      await createPurchase(
        {
          saleId: saleOne.id,
          userId,
        },
        client,
      );
      await createPurchase(
        {
          saleId: saleOne.id,
          userId: otherUserId,
        },
        client,
      );
      await createPurchase(
        {
          saleId: saleTwo.id,
          userId,
        },
        client,
      );

      await expect(countPurchases({}, client)).resolves.toBe(baselineCount + 3);
      await expect(countPurchases({ saleId: saleOne.id }, client)).resolves.toBe(2);
      await expect(countPurchases({ userId }, client)).resolves.toBe(2);
      await expect(
        countPurchases({
          saleId: saleTwo.id,
          userId,
        }, client),
      ).resolves.toBe(1);
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
  });

  it('surfaces the Postgres unique constraint when inserting a duplicate purchase', async () => {
    const client = await testDatabase.openTransaction();

    try {
      const userId = `alice-${Date.now()}@example.com`;
      const sale = await createSale(
        {
          productName: 'Monitor',
          initialStock: 50,
          startTime: new Date('2026-03-18T10:00:00.000Z'),
          endTime: new Date('2026-03-18T10:10:00.000Z'),
        },
        client,
      );

      await createPurchase(
        {
          saleId: sale.id,
          userId,
        },
        client,
      );

      await expect(
        createPurchase(
          {
            saleId: sale.id,
            userId,
          },
          client,
        ),
      ).rejects.toMatchObject({
        code: '23505',
        constraint: 'purchases_sale_id_user_id_key',
      });
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
  });
});
