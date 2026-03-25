-- ============================================
-- ALLOFLOW — Migrations complètes Phase 1
-- À coller dans Supabase SQL Editor
-- ============================================

-- -----------------------------------------------
-- Migration 1: Organizations & Establishments
-- -----------------------------------------------

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null check (type in ('siege', 'franchise')),
  created_at timestamptz not null default now()
);

create table public.establishments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  org_id uuid not null references public.organizations(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.organizations enable row level security;
alter table public.establishments enable row level security;

create policy "Utilisateurs authentifiés lisent les organisations"
  on public.organizations for select
  using (auth.role() = 'authenticated');

create policy "Utilisateurs authentifiés lisent les établissements"
  on public.establishments for select
  using (auth.role() = 'authenticated');

-- -----------------------------------------------
-- Migration 2: Profiles + RLS + Trigger
-- -----------------------------------------------

create type public.user_role as enum ('super_admin', 'admin', 'caissier');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role public.user_role not null default 'caissier',
  establishment_id uuid references public.establishments(id),
  org_id uuid references public.organizations(id),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Utilisateur lit son profil"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Admin lit profils établissement"
  on public.profiles for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('admin', 'super_admin')
        and (p.establishment_id = profiles.establishment_id or p.role = 'super_admin')
    )
  );

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id)
  values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- -----------------------------------------------
-- Migration 3: Products
-- -----------------------------------------------

create type public.product_category as enum ('entree', 'plat', 'dessert', 'boisson', 'autre');

create table public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  price numeric(10, 2) not null check (price >= 0),
  category public.product_category not null,
  tva_rate numeric(4, 2) not null check (tva_rate in (5.5, 10, 20)),
  establishment_id uuid not null references public.establishments(id) on delete cascade,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.products enable row level security;

create policy "Utilisateurs voient produits établissement"
  on public.products for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and (p.establishment_id = products.establishment_id or p.role = 'super_admin')
    )
  );

create policy "Admins modifient produits"
  on public.products for all
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('admin', 'super_admin')
        and (p.establishment_id = products.establishment_id or p.role = 'super_admin')
    )
  );

-- -----------------------------------------------
-- Migration 4: Orders & Transactions (Phase 2)
-- -----------------------------------------------

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  establishment_id uuid not null references public.establishments(id),
  total numeric(10, 2) not null default 0,
  payment_method text,
  status text not null default 'pending',
  customer_id uuid,
  created_at timestamptz not null default now()
);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid not null references public.products(id),
  quantity int not null check (quantity > 0),
  unit_price numeric(10, 2) not null
);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id),
  amount numeric(10, 2) not null,
  type text not null,
  tpe_ref text,
  created_at timestamptz not null default now()
);

alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.transactions enable row level security;

-- -----------------------------------------------
-- Migration 5: Stocks & Recettes (Phase 3)
-- -----------------------------------------------

create table public.stock_items (
  id uuid primary key default gen_random_uuid(),
  establishment_id uuid not null references public.establishments(id),
  ingredient text not null,
  quantity numeric not null default 0,
  unit text not null,
  alert_threshold numeric not null default 0
);

create table public.recipes (
  id uuid primary key default gen_random_uuid(),
  establishment_id uuid not null references public.establishments(id),
  title text not null,
  content text,
  media_urls text[] default '{}',
  version int not null default 1
);

create table public.sops (
  id uuid primary key default gen_random_uuid(),
  establishment_id uuid not null references public.establishments(id),
  title text not null,
  content text,
  media_urls text[] default '{}',
  version int not null default 1
);

alter table public.stock_items enable row level security;
alter table public.recipes enable row level security;
alter table public.sops enable row level security;

-- -----------------------------------------------
-- Migration 6: CRM Fidélité (Phase 4)
-- -----------------------------------------------

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  establishment_id uuid not null references public.establishments(id),
  name text not null,
  phone text,
  email text,
  points int not null default 0,
  tier text not null default 'bronze' check (tier in ('bronze', 'argent', 'or'))
);

create table public.loyalty_rewards (
  id uuid primary key default gen_random_uuid(),
  establishment_id uuid not null references public.establishments(id),
  name text not null,
  points_required int not null,
  discount_type text not null check (discount_type in ('percent', 'fixed', 'product')),
  discount_value numeric not null default 0
);

create table public.loyalty_transactions (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id),
  order_id uuid references public.orders(id),
  points int not null,
  type text not null check (type in ('earn', 'redeem')),
  created_at timestamptz not null default now()
);

alter table public.orders
  add constraint orders_customer_id_fkey
  foreign key (customer_id) references public.customers(id);

alter table public.customers enable row level security;
alter table public.loyalty_rewards enable row level security;
alter table public.loyalty_transactions enable row level security;
