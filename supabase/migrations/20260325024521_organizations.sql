-- Organizations (siège ou franchise)
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null check (type in ('siege', 'franchise')),
  created_at timestamptz not null default now()
);

-- Establishments (points de vente)
create table public.establishments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  org_id uuid not null references public.organizations(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- RLS
alter table public.organizations enable row level security;
alter table public.establishments enable row level security;

-- Policies de base (lecture pour les utilisateurs authentifiés)
create policy "Utilisateurs authentifiés lisent les organisations"
  on public.organizations for select
  using (auth.role() = 'authenticated');

create policy "Utilisateurs authentifiés lisent les établissements"
  on public.establishments for select
  using (auth.role() = 'authenticated');
