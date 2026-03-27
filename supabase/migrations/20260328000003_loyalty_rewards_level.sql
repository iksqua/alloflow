alter table public.loyalty_rewards
  add column if not exists level_required text not null default 'standard';
