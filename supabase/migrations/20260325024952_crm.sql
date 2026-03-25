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

-- Ajouter la FK customer_id sur orders maintenant que customers existe
alter table public.orders
  add constraint orders_customer_id_fkey
  foreign key (customer_id) references public.customers(id);

alter table public.customers enable row level security;
alter table public.loyalty_rewards enable row level security;
alter table public.loyalty_transactions enable row level security;
