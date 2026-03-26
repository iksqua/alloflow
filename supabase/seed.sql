-- =============================================================================
-- Alloflow — Seed Data (Coffee Shop Demo)
-- Idempotent : ON CONFLICT (id) DO NOTHING sur tous les inserts
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Organisation demo
-- -----------------------------------------------------------------------------
INSERT INTO public.organizations (id, name, type) VALUES
  ('00000000-0000-0000-0000-000000000001', 'Alloflow Demo', 'siege')
ON CONFLICT (id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 2. Établissement demo
-- Note : la table establishments utilise org_id (pas organization_id)
--        et ne possède pas les colonnes city/postal_code/siret/timezone
--        (non définies dans la migration 20260325024521_organizations.sql)
-- -----------------------------------------------------------------------------
INSERT INTO public.establishments (id, name, address, org_id) VALUES
  ('00000000-0000-0000-0000-000000000010',
   'Coffee Shop Demo',
   '12 Rue de la Paix, Paris 75001',
   '00000000-0000-0000-0000-000000000001')
ON CONFLICT (id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 3. Catégories
-- -----------------------------------------------------------------------------
INSERT INTO public.categories (id, establishment_id, name, color_hex, icon, sort_order) VALUES
  ('00000000-0000-0000-0001-000000000001',
   '00000000-0000-0000-0000-000000000010',
   'Cafés Chauds',   '#1d4ed8', '☕', 1),
  ('00000000-0000-0000-0001-000000000002',
   '00000000-0000-0000-0000-000000000010',
   'Cookies',        '#92400e', '🍪', 2),
  ('00000000-0000-0000-0001-000000000003',
   '00000000-0000-0000-0000-000000000010',
   'Boissons Fraîches', '#065f46', '🥤', 3),
  ('00000000-0000-0000-0001-000000000004',
   '00000000-0000-0000-0000-000000000010',
   'Viennoiseries',  '#92400e', '🥐', 4),
  ('00000000-0000-0000-0001-000000000005',
   '00000000-0000-0000-0000-000000000010',
   'Merch',          '#7c3aed', '🎁', 5)
ON CONFLICT (id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 4. Produits
-- Note : price = prix HT, tva_rate = taux TVA (5.5 / 10 / 20)
--        La colonne category de l'enum product_category reste obligatoire ;
--        on utilise 'boisson' pour les cafés/boissons, 'dessert' pour
--        cookies/viennoiseries, 'autre' pour le merch.
-- -----------------------------------------------------------------------------

-- Cafés Chauds
INSERT INTO public.products
  (id, establishment_id, name, emoji, price, tva_rate, category, category_id, is_active, sort_order)
VALUES
  ('00000000-0000-0000-0003-000000000001',
   '00000000-0000-0000-0000-000000000010',
   'Espresso',        '☕', 1.82, 10, 'boisson',
   '00000000-0000-0000-0001-000000000001', true, 1),

  ('00000000-0000-0000-0003-000000000002',
   '00000000-0000-0000-0000-000000000010',
   'Americano',       '☕', 2.00, 10, 'boisson',
   '00000000-0000-0000-0001-000000000001', true, 2),

  ('00000000-0000-0000-0003-000000000003',
   '00000000-0000-0000-0000-000000000010',
   'Cappuccino',      '☕', 2.55, 10, 'boisson',
   '00000000-0000-0000-0001-000000000001', true, 3),

  ('00000000-0000-0000-0003-000000000004',
   '00000000-0000-0000-0000-000000000010',
   'Latte Vanille',   '☕', 3.18, 10, 'boisson',
   '00000000-0000-0000-0001-000000000001', true, 4),

  ('00000000-0000-0000-0003-000000000005',
   '00000000-0000-0000-0000-000000000010',
   'Matcha Latte',    '🍵', 3.64, 10, 'boisson',
   '00000000-0000-0000-0001-000000000001', true, 5),

  ('00000000-0000-0000-0003-000000000006',
   '00000000-0000-0000-0000-000000000010',
   'Chocolat Chaud',  '🍫', 2.73, 10, 'boisson',
   '00000000-0000-0000-0001-000000000001', true, 6)
ON CONFLICT (id) DO NOTHING;

-- Cookies
INSERT INTO public.products
  (id, establishment_id, name, emoji, price, tva_rate, category, category_id, is_active, sort_order)
VALUES
  ('00000000-0000-0000-0003-000000000007',
   '00000000-0000-0000-0000-000000000010',
   'Cookie Choco',        '🍪', 1.64, 5.5, 'dessert',
   '00000000-0000-0000-0001-000000000002', true, 1),

  ('00000000-0000-0000-0003-000000000008',
   '00000000-0000-0000-0000-000000000010',
   'Cookie Pistache',     '🍪', 1.82, 5.5, 'dessert',
   '00000000-0000-0000-0001-000000000002', true, 2),

  ('00000000-0000-0000-0003-000000000009',
   '00000000-0000-0000-0000-000000000010',
   'Cookie Double Choco', '🍪', 1.73, 5.5, 'dessert',
   '00000000-0000-0000-0001-000000000002', true, 3),

  ('00000000-0000-0000-0003-000000000010',
   '00000000-0000-0000-0000-000000000010',
   'Cookie Caramel Salé', '🍪', 1.82, 5.5, 'dessert',
   '00000000-0000-0000-0001-000000000002', true, 4)
ON CONFLICT (id) DO NOTHING;

-- Boissons Fraîches
INSERT INTO public.products
  (id, establishment_id, name, emoji, price, tva_rate, category, category_id, is_active, sort_order)
VALUES
  ('00000000-0000-0000-0003-000000000011',
   '00000000-0000-0000-0000-000000000010',
   'Limonade Maison',        '🥤', 2.55, 10, 'boisson',
   '00000000-0000-0000-0001-000000000003', true, 1),

  ('00000000-0000-0000-0003-000000000012',
   '00000000-0000-0000-0000-000000000010',
   'Ice Tea Pêche',          '🥤', 2.36, 10, 'boisson',
   '00000000-0000-0000-0001-000000000003', true, 2),

  ('00000000-0000-0000-0003-000000000013',
   '00000000-0000-0000-0000-000000000010',
   'Smoothie Fruits Rouges', '🧃', 3.36, 10, 'boisson',
   '00000000-0000-0000-0001-000000000003', true, 3),

  ('00000000-0000-0000-0003-000000000014',
   '00000000-0000-0000-0000-000000000010',
   'Eau Sparkling',          '💧', 1.27, 10, 'boisson',
   '00000000-0000-0000-0001-000000000003', true, 4)
ON CONFLICT (id) DO NOTHING;

-- Viennoiseries
INSERT INTO public.products
  (id, establishment_id, name, emoji, price, tva_rate, category, category_id, is_active, sort_order)
VALUES
  ('00000000-0000-0000-0003-000000000015',
   '00000000-0000-0000-0000-000000000010',
   'Croissant',       '🥐', 1.14, 5.5, 'dessert',
   '00000000-0000-0000-0001-000000000004', true, 1),

  ('00000000-0000-0000-0003-000000000016',
   '00000000-0000-0000-0000-000000000010',
   'Pain au Chocolat','🥐', 1.27, 5.5, 'dessert',
   '00000000-0000-0000-0001-000000000004', true, 2),

  ('00000000-0000-0000-0003-000000000017',
   '00000000-0000-0000-0000-000000000010',
   'Muffin Myrtille', '🧁', 1.73, 5.5, 'dessert',
   '00000000-0000-0000-0001-000000000004', true, 3)
ON CONFLICT (id) DO NOTHING;

-- Merch
INSERT INTO public.products
  (id, establishment_id, name, emoji, price, tva_rate, category, category_id, is_active, sort_order)
VALUES
  ('00000000-0000-0000-0003-000000000018',
   '00000000-0000-0000-0000-000000000010',
   'Tote Bag Alloflow', '🎁', 12.50, 20, 'autre',
   '00000000-0000-0000-0001-000000000005', true, 1),

  ('00000000-0000-0000-0003-000000000019',
   '00000000-0000-0000-0000-000000000010',
   'Mug Alloflow',      '☕', 10.00, 20, 'autre',
   '00000000-0000-0000-0001-000000000005', true, 2),

  ('00000000-0000-0000-0003-000000000020',
   '00000000-0000-0000-0000-000000000010',
   'T-Shirt Logo',      '👕', 20.00, 20, 'autre',
   '00000000-0000-0000-0001-000000000005', true, 3)
ON CONFLICT (id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 5. Salles et tables
-- Note : aucune migration rooms/tables n'existe dans le projet à ce jour.
--        Ces inserts sont préparés pour une future migration qui devra créer
--        les tables public.rooms et public.tables avec au minimum :
--          rooms  : id, establishment_id, name, sort_order
--          tables : id, room_id, name, seats
--        Décommentez ces blocs une fois la migration créée.
-- -----------------------------------------------------------------------------

/*

INSERT INTO public.rooms (id, establishment_id, name, sort_order) VALUES
  ('00000000-0000-0000-0002-000000000001',
   '00000000-0000-0000-0000-000000000010',
   'Salle principale', 1)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.tables (id, room_id, name, seats) VALUES
  ('00000000-0000-0000-0004-000000000001', '00000000-0000-0000-0002-000000000001', 'Table 1',   4),
  ('00000000-0000-0000-0004-000000000002', '00000000-0000-0000-0002-000000000001', 'Table 2',   4),
  ('00000000-0000-0000-0004-000000000003', '00000000-0000-0000-0002-000000000001', 'Table 3',   2),
  ('00000000-0000-0000-0004-000000000004', '00000000-0000-0000-0002-000000000001', 'Table 4',   6),
  ('00000000-0000-0000-0004-000000000005', '00000000-0000-0000-0002-000000000001', 'Bar 1',     2),
  ('00000000-0000-0000-0004-000000000006', '00000000-0000-0000-0002-000000000001', 'Bar 2',     2),
  ('00000000-0000-0000-0004-000000000007', '00000000-0000-0000-0002-000000000001', 'Terrasse 1',4),
  ('00000000-0000-0000-0004-000000000008', '00000000-0000-0000-0002-000000000001', 'Terrasse 2',4)
ON CONFLICT (id) DO NOTHING;

*/
