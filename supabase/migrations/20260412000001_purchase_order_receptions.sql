-- supabase/migrations/20260412000001_purchase_order_receptions.sql

-- Rename statuses: 'draft' and 'sent' → 'pending', keep 'partial'/'received', add 'cancelled'
update public.purchase_orders set status = 'pending' where status in ('draft', 'sent');

-- Create reception history table
create table public.purchase_order_receptions (
  id                uuid primary key default gen_random_uuid(),
  purchase_order_id uuid not null references public.purchase_orders(id) on delete cascade,
  received_at       timestamptz not null default now(),
  notes             text,
  lines             jsonb not null default '[]'
  -- lines = [{ purchase_order_item_id, quantity_received }]
);

create index purchase_order_receptions_order_id_idx
  on public.purchase_order_receptions (purchase_order_id);

alter table public.purchase_order_receptions enable row level security;

create policy "establishment members can manage purchase_order_receptions"
  on public.purchase_order_receptions for all
  using (
    purchase_order_id in (
      select id from public.purchase_orders
      where establishment_id in (
        select establishment_id from public.profiles where id = auth.uid()
      )
    )
  );
