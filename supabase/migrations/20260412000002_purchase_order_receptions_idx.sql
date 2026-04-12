-- supabase/migrations/20260412000002_purchase_order_receptions_idx.sql
-- Add missing index on purchase_order_receptions.purchase_order_id
create index if not exists purchase_order_receptions_order_id_idx
  on public.purchase_order_receptions (purchase_order_id);
