-- supabase/migrations/20260327000001_stocks_v2.sql

-- 1. Extend stock_items
alter table public.stock_items rename column ingredient to name;

alter table public.stock_items
  add column category        text,
  add column supplier        text,
  add column supplier_ref    text,
  add column unit_price      numeric not null default 0,
  add column order_quantity  numeric not null default 0,
  add column active          boolean not null default true;

-- 2. Purchase orders
create table public.purchase_orders (
  id                      uuid primary key default gen_random_uuid(),
  establishment_id        uuid not null references public.establishments(id) on delete cascade,
  order_ref               text not null,              -- BC-YYYY-XXXX
  supplier                text not null,
  supplier_email          text,
  requested_delivery_date date,
  status                  text not null default 'draft', -- draft | sent | received | partial
  total_ht                numeric not null default 0,
  notes                   text,
  created_by              uuid references auth.users(id),
  created_at              timestamptz not null default now()
);

-- 3. Purchase order items
create table public.purchase_order_items (
  id                  uuid primary key default gen_random_uuid(),
  purchase_order_id   uuid not null references public.purchase_orders(id) on delete cascade,
  stock_item_id       uuid not null references public.stock_items(id),
  quantity_ordered    numeric not null,
  unit_price          numeric not null,
  quantity_received   numeric,                        -- null until received
  sort_order          int not null default 0
);

-- 4. RLS
alter table public.purchase_orders enable row level security;
alter table public.purchase_order_items enable row level security;

-- stock_items RLS (already enabled, add policy)
create policy "establishment members can manage stock_items"
  on public.stock_items for all
  using (
    establishment_id in (
      select establishment_id from public.profiles where id = auth.uid()
    )
  );

create policy "establishment members can manage purchase_orders"
  on public.purchase_orders for all
  using (
    establishment_id in (
      select establishment_id from public.profiles where id = auth.uid()
    )
  );

create policy "establishment members can manage purchase_order_items"
  on public.purchase_order_items for all
  using (
    purchase_order_id in (
      select id from public.purchase_orders
      where establishment_id in (
        select establishment_id from public.profiles where id = auth.uid()
      )
    )
  );
