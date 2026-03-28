-- Sprint 10: Franchise infrastructure
-- 1. Add 'franchise_admin' to user_role enum
alter type public.user_role add value if not exists 'franchise_admin';

-- 2. Add parent_org_id to organizations
alter table public.organizations
  add column if not exists parent_org_id uuid references public.organizations(id) on delete set null;

-- 3. Ensure type column exists with correct constraint
alter table public.organizations
  add column if not exists type text not null default 'independent';

alter table public.organizations
  drop constraint if exists organizations_type_check;

alter table public.organizations
  add constraint organizations_type_check check (type in ('siege', 'franchise', 'independent'));

-- 4. Restrict organizations RLS to own network only
-- Drop any permissive SELECT policy that exposes all orgs
drop policy if exists "Enable read access for all users" on public.organizations;
drop policy if exists "orgs_visible_to_own_network" on public.organizations;
drop policy if exists "Utilisateurs authentifiés lisent les organisations" on public.organizations;

alter table public.organizations enable row level security;

create policy "orgs_visible_to_own_network"
  on public.organizations for select
  using (
    id = (select org_id from public.profiles where id = auth.uid() and org_id is not null)
    or
    parent_org_id = (select org_id from public.profiles where id = auth.uid() and org_id is not null)
  );

-- Allow franchise_admin to insert/update orgs in their network (needed for onboarding)
create policy "franchise_admin_manages_orgs"
  on public.organizations for all
  using (
    id = (select org_id from public.profiles where id = auth.uid() and role = 'franchise_admin' and org_id is not null)
    or
    parent_org_id = (select org_id from public.profiles where id = auth.uid() and role = 'franchise_admin' and org_id is not null)
  )
  with check (
    -- On INSERT of new franchise org: parent_org_id must belong to caller's network
    -- On UPDATE of caller's own siege org: id = <my org_id> passes
    parent_org_id = (select org_id from public.profiles where id = auth.uid() and role = 'franchise_admin' and org_id is not null)
    or
    id = (select org_id from public.profiles where id = auth.uid() and role = 'franchise_admin' and org_id is not null)
  );

-- 5. Create franchise_contracts table
create table if not exists public.franchise_contracts (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references public.organizations(id) on delete cascade,
  establishment_id uuid not null references public.establishments(id) on delete cascade,
  royalty_rate     numeric(5,2) not null default 0
                     check (royalty_rate >= 0 and royalty_rate <= 100),
  marketing_rate   numeric(5,2) not null default 0
                     check (marketing_rate >= 0 and marketing_rate <= 100),
  start_date       date not null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique(org_id, establishment_id)
);

-- Performance indexes for frequently-queried FK columns
create index if not exists idx_organizations_parent_org_id on public.organizations(parent_org_id);
create index if not exists idx_franchise_contracts_org_id on public.franchise_contracts(org_id);
create index if not exists idx_franchise_contracts_establishment_id on public.franchise_contracts(establishment_id);

alter table public.franchise_contracts enable row level security;

-- franchise_admin can do everything on their own contracts
create policy "franchise_admin_manages_contracts"
  on public.franchise_contracts for all
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

-- franchisee admin can read their own contract
create policy "franchisee_admin_reads_own_contract"
  on public.franchise_contracts for select
  using (
    establishment_id in (
      select establishment_id from public.profiles
      where id = auth.uid() and role = 'admin' and establishment_id is not null
    )
  );

-- 6. updated_at trigger for franchise_contracts
create or replace function public.handle_updated_at()
  returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_franchise_contracts_updated_at on public.franchise_contracts;
create trigger set_franchise_contracts_updated_at
  before update on public.franchise_contracts
  for each row execute function public.handle_updated_at();

-- 7. Update handle_new_user trigger to also set org_id
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, role, establishment_id, org_id, first_name)
  values (
    new.id,
    coalesce((new.raw_user_meta_data->>'role')::text, 'caissier'),
    (new.raw_user_meta_data->>'establishment_id')::uuid,
    (new.raw_user_meta_data->>'org_id')::uuid,
    coalesce(new.raw_user_meta_data->>'first_name', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
