function getDefaultDb() {
  const { postgresPool } = require('../lib/postgres');

  return postgresPool;
}

function mapPurchase(row) {
  return {
    id: row.id,
    saleId: row.sale_id,
    userId: row.user_id,
    purchasedAt: row.purchased_at,
  };
}

async function createPurchase(
  {
    saleId,
    userId,
  },
  db = getDefaultDb(),
) {
  const result = await db.query(
    `
      INSERT INTO purchases (
        sale_id,
        user_id
      )
      VALUES ($1, $2)
      RETURNING
        id,
        sale_id,
        user_id,
        purchased_at
    `,
    [saleId, userId],
  );

  return mapPurchase(result.rows[0]);
}

async function findPurchaseBySaleIdAndUserId(
  {
    saleId,
    userId,
  },
  db = getDefaultDb(),
) {
  const result = await db.query(
    `
      SELECT
        id,
        sale_id,
        user_id,
        purchased_at
      FROM purchases
      WHERE sale_id = $1
        AND user_id = $2
      LIMIT 1
    `,
    [saleId, userId],
  );

  if (result.rowCount === 0) {
    return null;
  }

  return mapPurchase(result.rows[0]);
}

async function hasPurchaseForUserId(userId, db = getDefaultDb()) {
  const result = await db.query(
    `
      SELECT EXISTS (
        SELECT 1
        FROM purchases
        WHERE user_id = $1
      ) AS has_purchased
    `,
    [userId],
  );

  return result.rows[0].has_purchased;
}

async function countPurchases(filters = {}, db = getDefaultDb()) {
  const values = [];
  const conditions = [];

  if (filters.saleId !== undefined) {
    values.push(filters.saleId);
    conditions.push(`sale_id = $${values.length}`);
  }

  if (filters.userId !== undefined) {
    values.push(filters.userId);
    conditions.push(`user_id = $${values.length}`);
  }

  const whereClause = conditions.length > 0
    ? `WHERE ${conditions.join(' AND ')}`
    : '';

  const result = await db.query(
    `
      SELECT COUNT(*)::INTEGER AS purchase_count
      FROM purchases
      ${whereClause}
    `,
    values,
  );

  return result.rows[0].purchase_count;
}

module.exports = {
  createPurchase,
  findPurchaseBySaleIdAndUserId,
  hasPurchaseForUserId,
  countPurchases,
};
