-- Types
create type public.product_category as enum ('entree', 'plat', 'dessert', 'boisson', 'autre');

-- Products
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

-- RLS
alter table public.products enable row level security;

-- Politique : les utilisateurs voient les produits de leur établissement
create policy "Utilisateurs voient produits établissement"
  on public.products for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and (p.establishment_id = products.establishment_id or p.role = 'super_admin')
    )
  );

-- Politique : seuls admin et super_admin peuvent modifier
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
