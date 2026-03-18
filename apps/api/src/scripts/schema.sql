CREATE TABLE IF NOT EXISTS sales (
  id BIGSERIAL PRIMARY KEY,
  product_name TEXT NOT NULL,
  initial_stock INTEGER NOT NULL,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT sales_initial_stock_check CHECK (initial_stock >= 0),
  CONSTRAINT sales_time_window_check CHECK (end_time > start_time),
  CONSTRAINT sales_single_sale_definition_key
    UNIQUE (product_name, initial_stock, start_time, end_time)
);

CREATE TABLE IF NOT EXISTS purchases (
  id BIGSERIAL PRIMARY KEY,
  sale_id BIGINT NOT NULL,
  user_id TEXT NOT NULL,
  purchased_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT purchases_sale_id_fkey
    FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE RESTRICT,
  CONSTRAINT purchases_sale_id_user_id_key UNIQUE (sale_id, user_id)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'sales_single_sale_definition_key'
  ) THEN
    ALTER TABLE sales
      ADD CONSTRAINT sales_single_sale_definition_key
      UNIQUE (product_name, initial_stock, start_time, end_time);
  END IF;
END $$;
