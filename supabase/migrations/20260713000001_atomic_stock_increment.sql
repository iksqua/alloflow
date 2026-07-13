-- Atomic stock quantity increment to avoid TOCTOU race on concurrent receptions.
-- Uses a single UPDATE that both increments quantity and recomputes status in one statement.
create or replace function public.increment_stock_quantity(
  p_stock_item_id uuid,
  p_delta         numeric
)
returns void
language sql
security definer
set search_path = public
as $$
  update public.stock_items
  set
    quantity = quantity + p_delta,
    status = case
      when quantity + p_delta <= 0            then 'out_of_stock'
      when quantity + p_delta < alert_threshold then 'alert'
      else 'ok'
    end
  where id = p_stock_item_id;
$$;
