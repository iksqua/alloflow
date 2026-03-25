create table public.orders (
  id uuid primary key default gen_random_uuid(),
  establishment_id uuid not null references public.establishments(id),
  total numeric(10, 2) not null default 0,
  payment_method text,
  status text not null default 'pending',
  customer_id uuid, -- FK vers customers ajoutée dans migration crm
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
