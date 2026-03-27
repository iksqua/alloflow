-- =============================================================================
-- Alloflow — Seed Data (Coffee Shop Demo)
-- Idempotent : ON CONFLICT DO NOTHING sur tous les inserts
--
-- IMPORTANT : Ce seed utilise l'establishment_id fixe :
--   00000000-0000-0000-0000-000000000010
--
-- Pour que les données apparaissent dans l'interface, ton profil doit pointer
-- vers cet établissement. Après inscription, exécute dans le SQL Editor :
--   UPDATE public.profiles
--   SET establishment_id = '00000000-0000-0000-0000-000000000010'
--   WHERE id = auth.uid();
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Organisation demo
-- -----------------------------------------------------------------------------
INSERT INTO public.organizations (id, name, type) VALUES
  ('00000000-0000-0000-0000-000000000001', 'Alloflow Demo', 'siege')
ON CONFLICT (id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 2. Établissement demo
-- -----------------------------------------------------------------------------
INSERT INTO public.establishments (id, name, address, org_id) VALUES
  ('00000000-0000-0000-0000-000000000010',
   'Coffee Shop Demo',
   '12 Rue de la Paix, Paris 75001',
   '00000000-0000-0000-0000-000000000001')
ON CONFLICT (id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 3. Catégories produits
-- -----------------------------------------------------------------------------
INSERT INTO public.categories (id, establishment_id, name, color_hex, icon, sort_order) VALUES
  ('00000000-0000-0000-0001-000000000001', '00000000-0000-0000-0000-000000000010', 'Cafés Chauds',      '#1d4ed8', '☕', 1),
  ('00000000-0000-0000-0001-000000000002', '00000000-0000-0000-0000-000000000010', 'Cookies',            '#92400e', '🍪', 2),
  ('00000000-0000-0000-0001-000000000003', '00000000-0000-0000-0000-000000000010', 'Boissons Fraîches',  '#065f46', '🥤', 3),
  ('00000000-0000-0000-0001-000000000004', '00000000-0000-0000-0000-000000000010', 'Viennoiseries',      '#92400e', '🥐', 4),
  ('00000000-0000-0000-0001-000000000005', '00000000-0000-0000-0000-000000000010', 'Merch',              '#7c3aed', '🎁', 5)
ON CONFLICT (id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 4. Produits
-- -----------------------------------------------------------------------------
INSERT INTO public.products (id, establishment_id, name, emoji, price, tva_rate, category_id, is_active, sort_order) VALUES
  -- Cafés
  ('00000000-0000-0000-0003-000000000001', '00000000-0000-0000-0000-000000000010', 'Espresso',           '☕', 1.82, 10, '00000000-0000-0000-0001-000000000001', true, 1),
  ('00000000-0000-0000-0003-000000000002', '00000000-0000-0000-0000-000000000010', 'Americano',          '☕', 2.00, 10, '00000000-0000-0000-0001-000000000001', true, 2),
  ('00000000-0000-0000-0003-000000000003', '00000000-0000-0000-0000-000000000010', 'Cappuccino',         '☕', 2.55, 10, '00000000-0000-0000-0001-000000000001', true, 3),
  ('00000000-0000-0000-0003-000000000004', '00000000-0000-0000-0000-000000000010', 'Latte Vanille',      '☕', 3.18, 10, '00000000-0000-0000-0001-000000000001', true, 4),
  ('00000000-0000-0000-0003-000000000005', '00000000-0000-0000-0000-000000000010', 'Matcha Latte',       '🍵', 3.64, 10, '00000000-0000-0000-0001-000000000001', true, 5),
  ('00000000-0000-0000-0003-000000000006', '00000000-0000-0000-0000-000000000010', 'Chocolat Chaud',     '🍫', 2.73, 10, '00000000-0000-0000-0001-000000000001', true, 6),
  -- Cookies
  ('00000000-0000-0000-0003-000000000007', '00000000-0000-0000-0000-000000000010', 'Cookie Choco',       '🍪', 1.64, 5.5, '00000000-0000-0000-0001-000000000002', true, 1),
  ('00000000-0000-0000-0003-000000000008', '00000000-0000-0000-0000-000000000010', 'Cookie Pistache',    '🍪', 1.82, 5.5, '00000000-0000-0000-0001-000000000002', true, 2),
  ('00000000-0000-0000-0003-000000000009', '00000000-0000-0000-0000-000000000010', 'Cookie Double Choco','🍪', 1.73, 5.5, '00000000-0000-0000-0001-000000000002', true, 3),
  ('00000000-0000-0000-0003-000000000010', '00000000-0000-0000-0000-000000000010', 'Cookie Caramel Salé','🍪', 1.82, 5.5, '00000000-0000-0000-0001-000000000002', true, 4),
  -- Boissons fraîches
  ('00000000-0000-0000-0003-000000000011', '00000000-0000-0000-0000-000000000010', 'Limonade Maison',        '🥤', 2.55, 10, '00000000-0000-0000-0001-000000000003', true, 1),
  ('00000000-0000-0000-0003-000000000012', '00000000-0000-0000-0000-000000000010', 'Ice Tea Pêche',          '🥤', 2.36, 10, '00000000-0000-0000-0001-000000000003', true, 2),
  ('00000000-0000-0000-0003-000000000013', '00000000-0000-0000-0000-000000000010', 'Smoothie Fruits Rouges', '🧃', 3.36, 10, '00000000-0000-0000-0001-000000000003', true, 3),
  ('00000000-0000-0000-0003-000000000014', '00000000-0000-0000-0000-000000000010', 'Eau Sparkling',          '💧', 1.27, 10, '00000000-0000-0000-0001-000000000003', true, 4),
  -- Viennoiseries
  ('00000000-0000-0000-0003-000000000015', '00000000-0000-0000-0000-000000000010', 'Croissant',         '🥐', 1.14, 5.5, '00000000-0000-0000-0001-000000000004', true, 1),
  ('00000000-0000-0000-0003-000000000016', '00000000-0000-0000-0000-000000000010', 'Pain au Chocolat',  '🥐', 1.27, 5.5, '00000000-0000-0000-0001-000000000004', true, 2),
  ('00000000-0000-0000-0003-000000000017', '00000000-0000-0000-0000-000000000010', 'Muffin Myrtille',   '🧁', 1.73, 5.5, '00000000-0000-0000-0001-000000000004', true, 3),
  -- Merch
  ('00000000-0000-0000-0003-000000000018', '00000000-0000-0000-0000-000000000010', 'Tote Bag Alloflow', '🎁', 12.50, 20, '00000000-0000-0000-0001-000000000005', true, 1),
  ('00000000-0000-0000-0003-000000000019', '00000000-0000-0000-0000-000000000010', 'Mug Alloflow',      '☕', 10.00, 20, '00000000-0000-0000-0001-000000000005', true, 2),
  ('00000000-0000-0000-0003-000000000020', '00000000-0000-0000-0000-000000000010', 'T-Shirt Logo',      '👕', 20.00, 20, '00000000-0000-0000-0001-000000000005', true, 3)
ON CONFLICT (id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 5. Salles et tables (plan de salle)
-- -----------------------------------------------------------------------------
INSERT INTO public.rooms (id, establishment_id, name, sort_order) VALUES
  ('00000000-0000-0000-0002-000000000001', '00000000-0000-0000-0000-000000000010', 'Salle principale', 1),
  ('00000000-0000-0000-0002-000000000002', '00000000-0000-0000-0000-000000000010', 'Terrasse',         2)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.restaurant_tables (id, establishment_id, room_id, name, seats, status, x_pos, y_pos) VALUES
  ('00000000-0000-0000-0004-000000000001', '00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0002-000000000001', 'Table 1', 4, 'free',     50,  50),
  ('00000000-0000-0000-0004-000000000002', '00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0002-000000000001', 'Table 2', 4, 'free',    200,  50),
  ('00000000-0000-0000-0004-000000000003', '00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0002-000000000001', 'Table 3', 2, 'free',    350,  50),
  ('00000000-0000-0000-0004-000000000004', '00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0002-000000000001', 'Table 4', 6, 'free',     50, 200),
  ('00000000-0000-0000-0004-000000000005', '00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0002-000000000001', 'Bar 1',   2, 'free',    200, 200),
  ('00000000-0000-0000-0004-000000000006', '00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0002-000000000001', 'Bar 2',   2, 'free',    350, 200),
  ('00000000-0000-0000-0004-000000000007', '00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0002-000000000002', 'Terrasse 1', 4, 'free',  50,  50),
  ('00000000-0000-0000-0004-000000000008', '00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0002-000000000002', 'Terrasse 2', 4, 'free', 200,  50)
ON CONFLICT (id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 6. Stock items
-- -----------------------------------------------------------------------------
INSERT INTO public.stock_items
  (id, establishment_id, name, category, quantity, unit, alert_threshold, supplier, supplier_ref, unit_price, order_quantity, active)
VALUES
  -- Cafés & ingrédients boissons
  ('00000000-0000-0000-0005-000000000001', '00000000-0000-0000-0000-000000000010',
   'Café en grains',       'Boissons', 8.5,  'kg',   5.0,  'Café Barista Pro', 'CBP-001', 22.50, 10.0, true),
  ('00000000-0000-0000-0005-000000000002', '00000000-0000-0000-0000-000000000010',
   'Lait entier',          'Boissons', 24.0, 'L',    15.0, 'Laiterie du Nord', 'LDN-LAIT', 1.20, 50.0, true),
  ('00000000-0000-0000-0005-000000000003', '00000000-0000-0000-0000-000000000010',
   'Sirop Vanille',        'Boissons', 3.0,  'L',    2.0,  'Monin France',     'MON-VAN', 8.90,  5.0,  true),
  ('00000000-0000-0000-0005-000000000004', '00000000-0000-0000-0000-000000000010',
   'Matcha Poudre',        'Boissons', 0.4,  'kg',   0.5,  'Ippodo Tea',       'IPP-MAT', 45.00, 1.0,  true),
  ('00000000-0000-0000-0005-000000000005', '00000000-0000-0000-0000-000000000010',
   'Chocolat en poudre',   'Boissons', 2.1,  'kg',   1.0,  'Valrhona',         'VAL-CHO', 18.00, 3.0,  true),
  -- Pâtisserie
  ('00000000-0000-0000-0005-000000000006', '00000000-0000-0000-0000-000000000010',
   'Farine T45',           'Pâtisserie', 12.0, 'kg', 5.0,  'Moulin de Paris',  'MDP-T45', 1.80, 25.0,  true),
  ('00000000-0000-0000-0005-000000000007', '00000000-0000-0000-0000-000000000010',
   'Beurre',               'Pâtisserie', 3.5,  'kg', 3.0,  'Laiterie du Nord', 'LDN-BEUR', 7.50, 10.0, true),
  ('00000000-0000-0000-0005-000000000008', '00000000-0000-0000-0000-000000000010',
   'Sucre blanc',          'Pâtisserie', 8.0,  'kg', 3.0,  'Sucre & Co',       'SUC-BLA', 1.20, 20.0,  true),
  ('00000000-0000-0000-0005-000000000009', '00000000-0000-0000-0000-000000000010',
   'Chocolat noir 70%',    'Pâtisserie', 1.2,  'kg', 2.0,  'Valrhona',         'VAL-N70', 28.00, 5.0,  true),
  ('00000000-0000-0000-0005-000000000010', '00000000-0000-0000-0000-000000000010',
   'Oeufs',                'Pâtisserie', 60.0, 'unité', 30.0, 'Ferme Dupont',  'FD-OEUFS', 0.25, 120.0, true),
  ('00000000-0000-0000-0005-000000000011', '00000000-0000-0000-0000-000000000010',
   'Pistaches',            'Pâtisserie', 0.6,  'kg', 1.0,  'Nuts & Co',        'NC-PIS', 32.00, 2.0,   true),
  -- Emballages
  ('00000000-0000-0000-0005-000000000012', '00000000-0000-0000-0000-000000000010',
   'Gobelets 25cl',        'Emballages', 180.0, 'unité', 100.0, 'Pack Pro',    'PP-GOB25', 0.08, 500.0, true),
  ('00000000-0000-0000-0005-000000000013', '00000000-0000-0000-0000-000000000010',
   'Gobelets 35cl',        'Emballages', 220.0, 'unité', 100.0, 'Pack Pro',    'PP-GOB35', 0.09, 500.0, true),
  ('00000000-0000-0000-0005-000000000014', '00000000-0000-0000-0000-000000000010',
   'Sachets papier',       'Emballages', 40.0,  'unité', 50.0,  'Pack Pro',    'PP-SAC', 0.05, 200.0,   true),
  -- Stock critique (pour tester les alertes)
  ('00000000-0000-0000-0005-000000000015', '00000000-0000-0000-0000-000000000010',
   'Crème fraîche',        'Boissons', 0.8,  'L',    2.0,  'Laiterie du Nord', 'LDN-CRE', 3.20, 10.0, true),
  ('00000000-0000-0000-0005-000000000016', '00000000-0000-0000-0000-000000000010',
   'Caramel beurre salé',  'Pâtisserie', 0.0, 'kg',  1.0,  'Artisan Sucré',    'AS-CAR', 14.00, 3.0,  true)
ON CONFLICT (id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 7. Commandes fournisseurs
-- -----------------------------------------------------------------------------
INSERT INTO public.purchase_orders
  (id, establishment_id, order_ref, supplier, supplier_email, requested_delivery_date, status, total_ht, notes)
VALUES
  ('00000000-0000-0000-0006-000000000001', '00000000-0000-0000-0000-000000000010',
   'BC-2026-0001', 'Café Barista Pro', 'commandes@barista-pro.fr',
   '2026-03-30', 'sent', 225.00, 'Commande mensuelle café'),
  ('00000000-0000-0000-0006-000000000002', '00000000-0000-0000-0000-000000000010',
   'BC-2026-0002', 'Laiterie du Nord', 'laiterie.nord@gmail.com',
   '2026-03-28', 'received', 84.00, NULL),
  ('00000000-0000-0000-0006-000000000003', '00000000-0000-0000-0000-000000000010',
   'BC-2026-0003', 'Pack Pro', NULL,
   '2026-04-05', 'draft', 120.00, 'Réappro emballages Q2')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.purchase_order_items
  (id, purchase_order_id, stock_item_id, quantity_ordered, unit_price, quantity_received)
VALUES
  ('00000000-0000-0000-0007-000000000001', '00000000-0000-0000-0006-000000000001',
   '00000000-0000-0000-0005-000000000001', 10.0, 22.50, NULL),
  ('00000000-0000-0000-0007-000000000002', '00000000-0000-0000-0006-000000000002',
   '00000000-0000-0000-0005-000000000002', 50.0, 1.20, 50.0),
  ('00000000-0000-0000-0007-000000000003', '00000000-0000-0000-0006-000000000002',
   '00000000-0000-0000-0005-000000000007', 10.0, 7.50, 10.0),
  ('00000000-0000-0000-0007-000000000004', '00000000-0000-0000-0006-000000000003',
   '00000000-0000-0000-0005-000000000012', 500.0, 0.08, NULL),
  ('00000000-0000-0000-0007-000000000005', '00000000-0000-0000-0006-000000000003',
   '00000000-0000-0000-0005-000000000013', 500.0, 0.09, NULL),
  ('00000000-0000-0000-0007-000000000006', '00000000-0000-0000-0006-000000000003',
   '00000000-0000-0000-0005-000000000014', 200.0, 0.05, NULL)
ON CONFLICT (id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 8. Recettes (avec ingrédients + produit POS lié)
-- -----------------------------------------------------------------------------
INSERT INTO public.recipes
  (id, establishment_id, title, is_internal, category, description, portion, active)
VALUES
  ('00000000-0000-0000-0008-000000000001', '00000000-0000-0000-0000-000000000010',
   'Cappuccino Signature', false, 'Cafés Chauds',
   'Double espresso avec lait vapeur et mousse ferme. La base de notre carte.',
   '1 tasse (240ml)', true),
  ('00000000-0000-0000-0008-000000000002', '00000000-0000-0000-0000-000000000010',
   'Latte Vanille Maison', false, 'Cafés Chauds',
   'Espresso allongé, lait vapeur crémeux et sirop vanille Monin.',
   '1 grand verre (350ml)', true),
  ('00000000-0000-0000-0008-000000000003', '00000000-0000-0000-0000-000000000010',
   'Cookie Choco Classique', false, 'Cookies',
   'Cookie moelleux au cœur fondant. Recette maison, cuisson 12 min à 175°C.',
   '1 cookie (80g)', true),
  ('00000000-0000-0000-0008-000000000004', '00000000-0000-0000-0000-000000000010',
   'Pâte à cookie (batch x24)', true, 'Cookies',
   'Préparation interne pour 24 cookies. Ne pas vendre directement.',
   '24 cookies', true)
ON CONFLICT (id) DO NOTHING;

-- Lier les recettes aux produits POS
UPDATE public.products SET recipe_id = '00000000-0000-0000-0008-000000000001'
  WHERE id = '00000000-0000-0000-0003-000000000003' -- Cappuccino
  AND (recipe_id IS NULL);
UPDATE public.products SET recipe_id = '00000000-0000-0000-0008-000000000002'
  WHERE id = '00000000-0000-0000-0003-000000000004' -- Latte Vanille
  AND (recipe_id IS NULL);
UPDATE public.products SET recipe_id = '00000000-0000-0000-0008-000000000003'
  WHERE id = '00000000-0000-0000-0003-000000000007' -- Cookie Choco
  AND (recipe_id IS NULL);

-- Ingrédients des recettes
INSERT INTO public.recipe_ingredients
  (id, recipe_id, name, quantity, unit, unit_cost, sort_order)
VALUES
  -- Cappuccino Signature
  ('00000000-0000-0000-0009-000000000001', '00000000-0000-0000-0008-000000000001', 'Café en grains', 18.0, 'g',  0.405, 1),
  ('00000000-0000-0000-0009-000000000002', '00000000-0000-0000-0008-000000000001', 'Lait entier',    150.0,'ml', 0.180, 2),
  -- Latte Vanille
  ('00000000-0000-0000-0009-000000000003', '00000000-0000-0000-0008-000000000002', 'Café en grains', 18.0, 'g',  0.405, 1),
  ('00000000-0000-0000-0009-000000000004', '00000000-0000-0000-0008-000000000002', 'Lait entier',    220.0,'ml', 0.264, 2),
  ('00000000-0000-0000-0009-000000000005', '00000000-0000-0000-0008-000000000002', 'Sirop Vanille',  15.0, 'ml', 0.134, 3),
  -- Cookie Choco
  ('00000000-0000-0000-0009-000000000006', '00000000-0000-0000-0008-000000000003', 'Farine T45',     50.0, 'g',  0.09,  1),
  ('00000000-0000-0000-0009-000000000007', '00000000-0000-0000-0008-000000000003', 'Beurre',         35.0, 'g',  0.263, 2),
  ('00000000-0000-0000-0009-000000000008', '00000000-0000-0000-0008-000000000003', 'Sucre blanc',    30.0, 'g',  0.036, 3),
  ('00000000-0000-0000-0009-000000000009', '00000000-0000-0000-0008-000000000003', 'Oeufs',           0.5, 'unité', 0.125, 4),
  ('00000000-0000-0000-0009-000000000010', '00000000-0000-0000-0008-000000000003', 'Chocolat noir 70%', 20.0, 'g', 0.56, 5),
  -- Batch pâte à cookie x24 (recette interne)
  ('00000000-0000-0000-0009-000000000011', '00000000-0000-0000-0008-000000000004', 'Farine T45',    1200.0,'g',  2.16,  1),
  ('00000000-0000-0000-0009-000000000012', '00000000-0000-0000-0008-000000000004', 'Beurre',         840.0,'g',  6.30,  2),
  ('00000000-0000-0000-0009-000000000013', '00000000-0000-0000-0008-000000000004', 'Sucre blanc',    720.0,'g',  0.864, 3),
  ('00000000-0000-0000-0009-000000000014', '00000000-0000-0000-0008-000000000004', 'Oeufs',          12.0, 'unité', 3.00, 4),
  ('00000000-0000-0000-0009-000000000015', '00000000-0000-0000-0008-000000000004', 'Chocolat noir 70%', 480.0,'g', 13.44, 5)
ON CONFLICT (id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 9. Catégories SOP + SOPs avec étapes
-- -----------------------------------------------------------------------------
INSERT INTO public.sop_categories (id, establishment_id, name, emoji, sort_order) VALUES
  ('00000000-0000-0000-0010-000000000001', '00000000-0000-0000-0000-000000000010', 'Recettes & Production', '🍳', 0),
  ('00000000-0000-0000-0010-000000000002', '00000000-0000-0000-0000-000000000010', 'Hygiène & HACCP',       '🧼', 1),
  ('00000000-0000-0000-0010-000000000003', '00000000-0000-0000-0000-000000000010', 'Tenue & Comportement',  '👕', 2),
  ('00000000-0000-0000-0010-000000000004', '00000000-0000-0000-0000-000000000010', 'Nettoyage & Entretien', '🧹', 3),
  ('00000000-0000-0000-0010-000000000005', '00000000-0000-0000-0000-000000000010', 'Rôle & Accueil',        '👤', 4),
  ('00000000-0000-0000-0010-000000000006', '00000000-0000-0000-0000-000000000010', 'Réception & Stocks',    '📦', 5)
ON CONFLICT (id) DO NOTHING;

-- SOPs
INSERT INTO public.sops (id, establishment_id, title, content, category_id, recipe_id, active) VALUES
  ('00000000-0000-0000-0011-000000000001', '00000000-0000-0000-0000-000000000010',
   'Cuisson des Cookies', 'Procédure de cuisson et de contrôle qualité pour tous les cookies.',
   '00000000-0000-0000-0010-000000000001', '00000000-0000-0000-0008-000000000003', true),
  ('00000000-0000-0000-0011-000000000002', '00000000-0000-0000-0000-000000000010',
   'Nettoyage de la machine à café', 'Nettoyage quotidien obligatoire. Non-respect = risque de casse.',
   '00000000-0000-0000-0010-000000000004', NULL, true),
  ('00000000-0000-0000-0011-000000000003', '00000000-0000-0000-0000-000000000010',
   'Accueil et service client', 'Standards de service et d''accueil au Coffee Shop Demo.',
   '00000000-0000-0000-0010-000000000005', NULL, true),
  ('00000000-0000-0000-0011-000000000004', '00000000-0000-0000-0000-000000000010',
   'Réception livraison fournisseur', 'Contrôle qualité et stockage à réception.',
   '00000000-0000-0000-0010-000000000006', NULL, true)
ON CONFLICT (id) DO NOTHING;

-- Étapes SOP
INSERT INTO public.sop_steps (id, sop_id, sort_order, title, description, duration_seconds, note_type, note_text) VALUES
  -- Cuisson cookies
  ('00000000-0000-0000-0012-000000000001', '00000000-0000-0000-0011-000000000001', 0,
   'Préchauffer le four', 'Régler le four à 175°C chaleur tournante. Laisser préchauffer complètement.', 600, 'warning', 'Ne pas enfourner avant que le témoin de préchauffage s''éteigne.'),
  ('00000000-0000-0000-0012-000000000002', '00000000-0000-0000-0011-000000000001', 1,
   'Portionner la pâte', 'Former des boules de 80g. Espacer de 5cm sur la plaque silicone.', NULL, 'tip', 'Utiliser la balance pour chaque portion — homogénéité = cuisson uniforme.'),
  ('00000000-0000-0000-0012-000000000003', '00000000-0000-0000-0011-000000000001', 2,
   'Enfourner et cuire', 'Cuisson 12 minutes. Surveiller à partir de 10 min.', 720, 'warning', 'Sortir dès que les bords sont dorés mais le centre encore mou.'),
  ('00000000-0000-0000-0012-000000000004', '00000000-0000-0000-0011-000000000001', 3,
   'Refroidissement', 'Laisser reposer 5 minutes sur la plaque avant de transférer sur grille.', 300, 'tip', 'Les cookies durcissent en refroidissant — ne pas paniquer s''ils semblent mous à la sortie.'),
  -- Nettoyage machine café
  ('00000000-0000-0000-0012-000000000005', '00000000-0000-0000-0011-000000000002', 0,
   'Vider et rincer les filtres', 'Retirer les porte-filtres. Rincer à l''eau chaude, tamponner les filtres.', 120, NULL, NULL),
  ('00000000-0000-0000-0012-000000000006', '00000000-0000-0000-0011-000000000002', 1,
   'Purger les buses vapeur', 'Activer la vapeur 5 secondes pour purger les résidus de lait dans chaque buse.', 30, 'warning', 'Toujours purger immédiatement après usage — le lait coagule rapidement.'),
  ('00000000-0000-0000-0012-000000000007', '00000000-0000-0000-0011-000000000002', 2,
   'Lancer le programme de rinçage', 'Appuyer sur le bouton "Clean" de la machine. Cycle automatique 8 min.', 480, NULL, NULL),
  ('00000000-0000-0000-0012-000000000008', '00000000-0000-0000-0011-000000000002', 3,
   'Essuyer et contrôler', 'Essuyer toutes les surfaces extérieures. Vérifier qu''il n''y a plus de traces.', 60, NULL, NULL),
  -- Accueil client
  ('00000000-0000-0000-0012-000000000009', '00000000-0000-0000-0011-000000000003', 0,
   'Saluer à l''entrée', 'Toujours saluer le client dans les 30 secondes qui suivent son entrée, sourire.', NULL, 'tip', 'Contact visuel + sourire = 80% de l''impression client.'),
  ('00000000-0000-0000-0012-000000000010', '00000000-0000-0000-0011-000000000003', 1,
   'Présenter le programme fidélité', 'Si c''est la première visite, mentionner le programme de points.', NULL, NULL, NULL),
  ('00000000-0000-0000-0012-000000000011', '00000000-0000-0000-0011-000000000003', 2,
   'Répéter la commande', 'Toujours confirmer la commande à voix haute avant de l''encaisser.', NULL, NULL, NULL)
ON CONFLICT (id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 10. Clients fidélité + récompenses
-- -----------------------------------------------------------------------------
INSERT INTO public.loyalty_rewards (id, establishment_id, name, points_required, discount_type, discount_value) VALUES
  ('00000000-0000-0000-0013-000000000001', '00000000-0000-0000-0000-000000000010',
   'Café offert',         50,  'fixed',   2.50),
  ('00000000-0000-0000-0013-000000000002', '00000000-0000-0000-0000-000000000010',
   '-10% sur la commande', 100, 'percent', 10.0),
  ('00000000-0000-0000-0013-000000000003', '00000000-0000-0000-0000-000000000010',
   'Cookie offert',       30,  'fixed',   1.80)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.customers
  (id, establishment_id, name, first_name, last_name, phone, email, points, tier)
VALUES
  ('00000000-0000-0000-0014-000000000001', '00000000-0000-0000-0000-000000000010',
   'Marie', 'Marie', 'Dupont', '0612345678', 'marie.dupont@email.com', 147, 'silver'),
  ('00000000-0000-0000-0014-000000000002', '00000000-0000-0000-0000-000000000010',
   'Thomas', 'Thomas', 'Martin', '0698765432', 'thomas.martin@gmail.com', 234, 'gold'),
  ('00000000-0000-0000-0014-000000000003', '00000000-0000-0000-0000-000000000010',
   'Sophie', 'Sophie', NULL, '0755443322', NULL, 28, 'standard'),
  ('00000000-0000-0000-0014-000000000004', '00000000-0000-0000-0000-000000000010',
   'Lucas', 'Lucas', 'Bernard', NULL, 'lucas.b@hotmail.com', 82, 'standard'),
  ('00000000-0000-0000-0014-000000000005', '00000000-0000-0000-0000-000000000010',
   'Emma', 'Emma', 'Petit', '0677889900', 'emma.petit@email.fr', 310, 'gold')
ON CONFLICT (id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 11. Journal fiscal — quelques entrées historiques
-- -----------------------------------------------------------------------------
INSERT INTO public.fiscal_journal_entries
  (id, establishment_id, sequence_no, event_type, order_id, amount_ttc, cashier_id,
   occurred_at, previous_hash, entry_hash)
VALUES
  ('00000000-0000-0000-0015-000000000001', '00000000-0000-0000-0000-000000000010',
   1, 'sale', NULL, 8.45, NULL,
   NOW() - INTERVAL '3 days',
   '0000000000000000000000000000000000000000000000000000000000000000',
   'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2'),
  ('00000000-0000-0000-0015-000000000002', '00000000-0000-0000-0000-000000000010',
   2, 'sale', NULL, 12.30, NULL,
   NOW() - INTERVAL '3 days' + INTERVAL '15 minutes',
   'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
   'b2c3d4e5f6a7b2c3d4e5f6a7b2c3d4e5f6a7b2c3d4e5f6a7b2c3d4e5f6a7b2c3'),
  ('00000000-0000-0000-0015-000000000003', '00000000-0000-0000-0000-000000000010',
   3, 'sale', NULL, 5.10, NULL,
   NOW() - INTERVAL '2 days',
   'b2c3d4e5f6a7b2c3d4e5f6a7b2c3d4e5f6a7b2c3d4e5f6a7b2c3d4e5f6a7b2c3',
   'c3d4e5f6a7b8c3d4e5f6a7b8c3d4e5f6a7b8c3d4e5f6a7b8c3d4e5f6a7b8c3d4'),
  ('00000000-0000-0000-0015-000000000004', '00000000-0000-0000-0000-000000000010',
   4, 'sale', NULL, 18.90, NULL,
   NOW() - INTERVAL '1 day',
   'c3d4e5f6a7b8c3d4e5f6a7b8c3d4e5f6a7b8c3d4e5f6a7b8c3d4e5f6a7b8c3d4',
   'd4e5f6a7b8c9d4e5f6a7b8c9d4e5f6a7b8c9d4e5f6a7b8c9d4e5f6a7b8c9d4e5'),
  ('00000000-0000-0000-0015-000000000005', '00000000-0000-0000-0000-000000000010',
   5, 'sale', NULL, 7.25, NULL,
   NOW() - INTERVAL '2 hours',
   'd4e5f6a7b8c9d4e5f6a7b8c9d4e5f6a7b8c9d4e5f6a7b8c9d4e5f6a7b8c9d4e5',
   'e5f6a7b8c9d0e5f6a7b8c9d0e5f6a7b8c9d0e5f6a7b8c9d0e5f6a7b8c9d0e5f6')
ON CONFLICT (id) DO NOTHING;
