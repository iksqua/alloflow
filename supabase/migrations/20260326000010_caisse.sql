-- supabase/migrations/20260326000010_caisse.sql

-- ===== SESSIONS CAISSE =====
CREATE TABLE cash_sessions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id UUID NOT NULL REFERENCES establishments(id) ON DELETE CASCADE,
  opened_by        UUID NOT NULL REFERENCES profiles(id),
  opened_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_by        UUID REFERENCES profiles(id),
  closed_at        TIMESTAMPTZ,
  opening_float    NUMERIC(10,2) NOT NULL DEFAULT 0,
  closing_float    NUMERIC(10,2),
  total_cash       NUMERIC(10,2),
  total_card       NUMERIC(10,2),
  total_sales      NUMERIC(10,2),
  status           VARCHAR(10) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed'))
);

CREATE INDEX idx_sessions_establishment ON cash_sessions(establishment_id, status);

ALTER TABLE cash_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sessions_by_establishment" ON cash_sessions
  FOR ALL USING (
    establishment_id IN (
      SELECT establishment_id FROM profiles WHERE id = auth.uid()
    )
  );

-- ===== SALLES ET TABLES =====
CREATE TABLE rooms (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id UUID NOT NULL REFERENCES establishments(id) ON DELETE CASCADE,
  name             VARCHAR(50) NOT NULL,
  sort_order       INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE restaurant_tables (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id UUID NOT NULL REFERENCES establishments(id) ON DELETE CASCADE,
  room_id          UUID REFERENCES rooms(id) ON DELETE SET NULL,
  name             VARCHAR(20) NOT NULL,  -- "Table 1", "Bar 3", etc.
  seats            INTEGER NOT NULL DEFAULT 4,
  status           VARCHAR(15) NOT NULL DEFAULT 'free' CHECK (status IN ('free', 'occupied', 'reserved')),
  current_order_id UUID,  -- FK circulaire — ajouté après orders
  x_pos            INTEGER NOT NULL DEFAULT 0,  -- position dans plan salle
  y_pos            INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_tables_establishment ON restaurant_tables(establishment_id);

ALTER TABLE restaurant_tables ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tables_by_establishment" ON restaurant_tables
  FOR ALL USING (
    establishment_id IN (
      SELECT establishment_id FROM profiles WHERE id = auth.uid()
    )
  );

-- ===== COMMANDES (version caisse) =====
-- Supprimer et recréer orders avec le bon schéma
DROP TABLE IF EXISTS transactions CASCADE;
DROP TABLE IF EXISTS order_items CASCADE;
DROP TABLE IF EXISTS orders CASCADE;

CREATE TABLE orders (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id UUID NOT NULL REFERENCES establishments(id) ON DELETE CASCADE,
  session_id       UUID REFERENCES cash_sessions(id),
  table_id         UUID REFERENCES restaurant_tables(id) ON DELETE SET NULL,
  cashier_id       UUID NOT NULL REFERENCES profiles(id),
  status           VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'paying', 'paid', 'cancelled', 'refunded')),
  subtotal_ht      NUMERIC(10,2) NOT NULL DEFAULT 0,
  tax_5_5          NUMERIC(10,2) NOT NULL DEFAULT 0,
  tax_10           NUMERIC(10,2) NOT NULL DEFAULT 0,
  tax_20           NUMERIC(10,2) NOT NULL DEFAULT 0,
  discount_type    VARCHAR(10) CHECK (discount_type IN ('percent', 'amount')),
  discount_value   NUMERIC(10,2),
  discount_amount  NUMERIC(10,2) NOT NULL DEFAULT 0,
  total_ttc        NUMERIC(10,2) NOT NULL DEFAULT 0,
  note             TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_orders_session ON orders(session_id);
CREATE INDEX idx_orders_establishment ON orders(establishment_id, status);

ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "orders_by_establishment" ON orders
  FOR ALL USING (
    establishment_id IN (
      SELECT establishment_id FROM profiles WHERE id = auth.uid()
    )
  );

-- ===== LIGNES DE COMMANDE =====
CREATE TABLE order_items (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id     UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id   UUID NOT NULL REFERENCES products(id),
  product_name VARCHAR(100) NOT NULL,  -- snapshot au moment de la commande
  emoji        VARCHAR(10),
  unit_price   NUMERIC(10,2) NOT NULL,  -- prix HT au moment de la commande
  tva_rate     NUMERIC(4,2) NOT NULL,
  quantity     INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  discount_pct NUMERIC(5,2) DEFAULT 0,
  line_total   NUMERIC(10,2) NOT NULL,  -- (unit_price * qty) * (1 + tva/100)
  note         TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_items_order ON order_items(order_id);

ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "items_via_orders" ON order_items
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM orders o
      JOIN profiles p ON p.id = auth.uid()
      WHERE o.id = order_items.order_id
        AND o.establishment_id = p.establishment_id
    )
  );

-- ===== PAIEMENTS =====
CREATE TABLE payments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id     UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  method       VARCHAR(10) NOT NULL CHECK (method IN ('card', 'cash', 'ticket_resto')),
  amount       NUMERIC(10,2) NOT NULL,
  cash_given   NUMERIC(10,2),  -- pour espèces seulement
  change_due   NUMERIC(10,2),
  tpe_ref      VARCHAR(50),    -- référence terminal CB
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_payments_order ON payments(order_id);

ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "payments_via_orders" ON payments
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM orders o
      JOIN profiles p ON p.id = auth.uid()
      WHERE o.id = payments.order_id
        AND o.establishment_id = p.establishment_id
    )
  );

-- ===== FK circulaire tables ↔ orders =====
ALTER TABLE restaurant_tables
  ADD CONSTRAINT fk_table_current_order
  FOREIGN KEY (current_order_id) REFERENCES orders(id) ON DELETE SET NULL;
