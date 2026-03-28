-- supabase/migrations/20260327000007_stock_item_pos.sql
-- Allow stock items to be sold directly at POS (e.g. sodas, packaged products)

alter table public.stock_items
  add column if not exists is_pos          boolean not null default false,
  add column if not exists pos_price       numeric,
  add column if not exists pos_tva_rate    numeric not null default 10,
  add column if not exists pos_category_id uuid references public.categories(id),
  add column if not exists product_id      uuid references public.products(id);
