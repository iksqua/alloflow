-- Add unique constraint for stock upsert on onboarding
ALTER TABLE public.stock_items
  ADD CONSTRAINT stock_items_establishment_name_unique
  UNIQUE (establishment_id, name);
