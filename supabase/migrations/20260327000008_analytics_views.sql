-- supabase/migrations/20260327000008_analytics_views.sql

-- View: daily CA for bar chart (last 90 days)
create or replace view public.v_daily_ca as
select
  date_trunc('day', created_at at time zone 'Europe/Paris')       as day,
  establishment_id,
  count(*)::int                                                    as tx_count,
  sum(total_ttc)                                                   as ca_ttc,
  sum(subtotal_ht)                                                 as ca_ht,
  sum(tax_5_5 + tax_10 + tax_20)                                  as tva_total
from public.orders
where status = 'paid'
  and created_at >= now() - interval '90 days'
group by 1, 2;

-- View: hourly transaction count (for rush hours)
create or replace view public.v_hourly_tx as
select
  extract(hour from created_at at time zone 'Europe/Paris')::int  as hour,
  establishment_id,
  count(*)::int                                                    as tx_count
from public.orders
where status = 'paid'
  and created_at >= now() - interval '30 days'
group by 1, 2;

-- View: top products by quantity
create or replace view public.v_top_products as
select
  oi.product_id,
  oi.product_name,
  o.establishment_id,
  sum(oi.quantity)::int                   as qty_sold,
  sum(oi.line_total)                      as ca_ttc
from public.order_items oi
join public.orders o on o.id = oi.order_id
where o.status = 'paid'
  and o.created_at >= now() - interval '30 days'
group by 1, 2, 3;

-- View: TVA breakdown by rate per day
create or replace view public.v_tva_breakdown as
select
  o.establishment_id,
  date_trunc('day', o.created_at at time zone 'Europe/Paris')     as day,
  oi.tva_rate,
  sum(oi.line_total / (1 + oi.tva_rate / 100.0))                  as base_ht,
  sum(oi.line_total) - sum(oi.line_total / (1 + oi.tva_rate / 100.0)) as tva_amount
from public.order_items oi
join public.orders o on o.id = oi.order_id
where o.status = 'paid'
group by 1, 2, 3;

-- Grant read access to authenticated role
grant select on public.v_daily_ca       to authenticated;
grant select on public.v_hourly_tx      to authenticated;
grant select on public.v_top_products   to authenticated;
grant select on public.v_tva_breakdown  to authenticated;
