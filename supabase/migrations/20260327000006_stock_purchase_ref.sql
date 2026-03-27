-- supabase/migrations/20260327000006_stock_purchase_ref.sql
-- Persist purchase reference (total paid + qty bought) for the cost calculator

alter table public.stock_items
  add column if not exists purchase_price numeric not null default 0,
  add column if not exists purchase_qty   numeric not null default 0;
