-- Rename loyalty_rewards columns to match new schema
-- discount_type -> type, discount_value -> value, add active column

alter table public.loyalty_rewards
  rename column discount_type to type;

alter table public.loyalty_rewards
  rename column discount_value to value;

alter table public.loyalty_rewards
  add column if not exists active boolean not null default true;

-- Drop old check constraint and recreate with new column name
alter table public.loyalty_rewards
  drop constraint if exists loyalty_rewards_discount_type_check;

alter table public.loyalty_rewards
  add constraint loyalty_rewards_type_check
  check (type in ('percent', 'fixed', 'product', 'produit_offert', 'reduction_euros', 'reduction_pct'));
