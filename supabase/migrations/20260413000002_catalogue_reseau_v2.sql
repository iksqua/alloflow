-- supabase/migrations/20260413000002_catalogue_reseau_v2.sql

-- 1. Ajouter le type 'ingredient' au CHECK
ALTER TABLE public.network_catalog_items
  DROP CONSTRAINT network_catalog_items_type_check,
  ADD CONSTRAINT network_catalog_items_type_check
    CHECK (type IN ('product', 'recipe', 'sop', 'ingredient'));

-- 2. Ajouter la colonne available_from
ALTER TABLE public.network_catalog_items
  ADD COLUMN IF NOT EXISTS available_from date;
