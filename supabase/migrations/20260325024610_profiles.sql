-- Types
create type public.user_role as enum ('super_admin', 'admin', 'caissier');

-- Profiles (étend auth.users)
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role public.user_role not null default 'caissier',
  establishment_id uuid references public.establishments(id),
  org_id uuid references public.organizations(id),
  created_at timestamptz not null default now()
);

-- RLS
alter table public.profiles enable row level security;

-- Politique : un utilisateur peut lire son propre profil
create policy "Utilisateur lit son profil"
  on public.profiles for select
  using (auth.uid() = id);

-- Politique : un admin peut lire les profils de son établissement
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

-- Trigger : créer un profil automatiquement à l'inscription
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
