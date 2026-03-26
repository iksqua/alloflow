ALTER TABLE products
  ADD COLUMN IF NOT EXISTS emoji        VARCHAR(10),
  ADD COLUMN IF NOT EXISTS description  TEXT,
  ADD COLUMN IF NOT EXISTS category_id  UUID REFERENCES categories(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sort_order   INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS deleted_at   TIMESTAMPTZ;

-- ATTENTION : renommer active → is_active
ALTER TABLE products RENAME COLUMN active TO is_active;

CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_establishment ON products(establishment_id);
