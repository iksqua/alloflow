-- Sprint 9a: Settings & Équipe
-- Colonnes établissement, profiles.first_name, trigger handle_new_user

-- 1. Colonnes établissement
alter table public.establishments
  add column if not exists siret                  text,
  add column if not exists address                text,
  add column if not exists timezone               text not null default 'Europe/Paris',
  add column if not exists default_opening_float  numeric  not null default 0,
  add column if not exists auto_print_receipt     boolean  not null default false,
  add column if not exists receipt_footer         text     not null default '',
  add column if not exists default_tva_rate       numeric  not null default 10;

-- 2. Colonne first_name sur profiles
alter table public.profiles
  add column if not exists first_name text not null default '';

-- 3. Trigger handle_new_user mis à jour pour lire raw_user_meta_data
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, role, establishment_id, first_name)
  values (
    new.id,
    coalesce(
      (new.raw_user_meta_data->>'role')::text,
      'caissier'
    ),
    (new.raw_user_meta_data->>'establishment_id')::uuid,
    coalesce(new.raw_user_meta_data->>'first_name', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
