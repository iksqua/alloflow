-- Create loyalty_config table (one record per establishment)
create table if not exists public.loyalty_config (
  id               uuid primary key default gen_random_uuid(),
  establishment_id uuid not null references public.establishments(id) on delete cascade,
  active           boolean not null default true,
  pts_per_euro     numeric(8,2) not null default 1,
  signup_bonus     int not null default 50,
  pts_validity_days int not null default 365,
  min_redemption_pts int not null default 100,
  levels           jsonb not null default '[
    {"key":"standard","name":"Standard","min":0,"max":499,"description":""},
    {"key":"silver","name":"Silver","min":500,"max":1999,"description":""},
    {"key":"gold","name":"Gold","min":2000,"max":null,"description":""}
  ]'::jsonb,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (establishment_id)
);

alter table public.loyalty_config enable row level security;

create policy "loyalty_config_by_establishment"
  on public.loyalty_config for all
  using (establishment_id = (
    select establishment_id from public.profiles where id = auth.uid()
  ));
