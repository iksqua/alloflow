-- supabase/migrations/20260328000009_sprint11_network_loyalty.sql

-- 1. network_customers (org-level customer identity, scoped to siege org)
create table public.network_customers (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizations(id) on delete cascade,
  phone        text not null,
  first_name   text not null default '',
  last_name    text,
  email        text,
  total_points int not null default 0,
  tier         text not null default 'standard'
               check (tier in ('standard', 'silver', 'gold')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique(org_id, phone)
);

alter table public.network_customers enable row level security;

-- franchise_admin sees all network_customers of their org
create policy "franchise_admin_reads_network_customers"
  on public.network_customers for select
  using (
    org_id in (
      select org_id from public.profiles
      where id = auth.uid() and role = 'franchise_admin' and org_id is not null
    )
  );

-- establishment admin sees network_customers linked to their customers (role='admin' only)
create policy "admin_reads_linked_network_customers"
  on public.network_customers for select
  using (
    id in (
      select c.network_customer_id
      from public.customers c
      join public.profiles p on p.establishment_id = c.establishment_id
      where p.id = auth.uid()
        and p.role = 'admin'
        and c.network_customer_id is not null
    )
  );

-- 2. network_loyalty_config (org-level config, managed by franchise_admin)
create table public.network_loyalty_config (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null unique references public.organizations(id) on delete cascade,
  active             boolean not null default true,
  pts_per_euro       numeric(8,2) not null default 1,
  min_redemption_pts int not null default 100,
  levels             jsonb not null default '[
    {"key":"standard","name":"Standard","min":0,"max":499},
    {"key":"silver","name":"Silver","min":500,"max":1999},
    {"key":"gold","name":"Gold","min":2000,"max":null}
  ]'::jsonb,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

alter table public.network_loyalty_config enable row level security;

create policy "franchise_admin_manages_network_config"
  on public.network_loyalty_config for all
  using (
    org_id in (
      select org_id from public.profiles
      where id = auth.uid() and role = 'franchise_admin' and org_id is not null
    )
  )
  with check (
    org_id in (
      select org_id from public.profiles
      where id = auth.uid() and role = 'franchise_admin' and org_id is not null
    )
  );

-- establishment admin reads the network config of their org (resolves siege org via parent_org_id)
create policy "admin_reads_network_config"
  on public.network_loyalty_config for select
  using (
    org_id in (
      select coalesce(o.parent_org_id, o.id)
      from public.establishments e
      join public.organizations o on o.id = e.org_id
      join public.profiles p on p.establishment_id = e.id
      where p.id = auth.uid()
    )
  );

-- 3. Add network_customer_id FK to customers
alter table public.customers
  add column if not exists network_customer_id uuid
  references public.network_customers(id) on delete set null;

create index if not exists idx_customers_network_customer_id
  on public.customers(network_customer_id);

-- 4. Trigger: sync network_customers.total_points and tier on customers.points change
create or replace function public.sync_network_customer_points()
returns trigger language plpgsql security definer as $$
declare
  v_total   int;
  v_tier    text;
  v_levels  jsonb;
  v_level   jsonb;
begin
  if NEW.network_customer_id is null then return new; end if;
  if OLD.points = NEW.points then return new; end if;

  -- Recalculate total across all linked customers
  select coalesce(sum(points), 0) into v_total
  from public.customers
  where network_customer_id = NEW.network_customer_id;

  -- Fetch tier levels from network_loyalty_config
  select nlc.levels into v_levels
  from public.network_customers nc
  join public.network_loyalty_config nlc on nlc.org_id = nc.org_id
  where nc.id = NEW.network_customer_id;

  -- Fall back to defaults if no config exists
  if v_levels is null then
    v_levels := '[
      {"key":"standard","min":0,"max":499},
      {"key":"silver","min":500,"max":1999},
      {"key":"gold","min":2000,"max":null}
    ]'::jsonb;
  end if;

  -- Tier = highest level whose min <= total_points
  -- ORDER BY min ASC ensures the last match is the highest tier
  v_tier := 'standard';
  for v_level in
    select elem from jsonb_array_elements(v_levels) elem
    order by (elem->>'min')::int asc
  loop
    if v_total >= (v_level->>'min')::int then
      v_tier := v_level->>'key';
    end if;
  end loop;

  update public.network_customers
  set total_points = v_total, tier = v_tier, updated_at = now()
  where id = NEW.network_customer_id;

  return new;
end;
$$;

drop trigger if exists sync_network_customer_points_trigger on public.customers;
create trigger sync_network_customer_points_trigger
  after update of points on public.customers
  for each row execute function public.sync_network_customer_points();

-- 5. updated_at triggers (reuses existing handle_updated_at function)
create trigger set_network_customers_updated_at
  before update on public.network_customers
  for each row execute function public.handle_updated_at();

create trigger set_network_loyalty_config_updated_at
  before update on public.network_loyalty_config
  for each row execute function public.handle_updated_at();
