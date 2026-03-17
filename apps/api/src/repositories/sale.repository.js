function getDefaultDb() {
  const { postgresPool } = require('../lib/postgres');

  return postgresPool;
}

function mapSale(row) {
  return {
    id: row.id,
    productName: row.product_name,
    initialStock: Number(row.initial_stock),
    startTime: row.start_time,
    endTime: row.end_time,
    createdAt: row.created_at,
  };
}

async function createSale(
  {
    productName,
    initialStock,
    startTime,
    endTime,
  },
  db = getDefaultDb(),
) {
  const result = await db.query(
    `
      INSERT INTO sales (
        product_name,
        initial_stock,
        start_time,
        end_time
      )
      VALUES ($1, $2, $3, $4)
      RETURNING
        id,
        product_name,
        initial_stock,
        start_time,
        end_time,
        created_at
    `,
    [productName, initialStock, startTime, endTime],
  );

  return mapSale(result.rows[0]);
}

module.exports = {
  createSale,
};
