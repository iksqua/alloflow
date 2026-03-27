-- Table categories
CREATE TABLE categories (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id UUID NOT NULL REFERENCES establishments(id) ON DELETE CASCADE,
  name             VARCHAR(50) NOT NULL CHECK (length(name) > 0),
  color_hex        VARCHAR(7) NOT NULL DEFAULT '#6b7280',
  icon             VARCHAR(10),
  sort_order       INTEGER NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_categories_establishment ON categories(establishment_id);
CREATE INDEX idx_categories_sort ON categories(establishment_id, sort_order);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_categories_updated_at
  BEFORE UPDATE ON categories
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "categories_by_establishment" ON categories
  FOR ALL USING (
    establishment_id IN (
      SELECT establishment_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "categories_admin_only_delete" ON categories
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND establishment_id = categories.establishment_id
        AND role IN ('admin', 'super_admin')
    )
  );
