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
