ALTER TABLE stock_items
  ADD COLUMN IF NOT EXISTS network_status text NOT NULL DEFAULT 'not_shared'
  CHECK (network_status IN ('active', 'inactive', 'coming_soon', 'not_shared'));
