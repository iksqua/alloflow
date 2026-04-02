-- Add missing reward_discount_amount column to orders
-- (customer_id and reward_id were added in 20260327000005_loyalty_v2.sql)
alter table public.orders
  add column if not exists reward_discount_amount numeric(10,2) not null default 0;
