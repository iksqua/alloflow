-- Fix handle_new_user trigger: cast role metadata to public.user_role enum explicitly.
-- The previous version used ::text which PostgreSQL cannot implicitly assign to an enum column.

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
declare
  v_role public.user_role;
begin
  begin
    v_role := (new.raw_user_meta_data->>'role')::public.user_role;
  exception when invalid_text_representation or others then
    v_role := 'caissier'::public.user_role;
  end;

  insert into public.profiles (id, role, establishment_id, org_id, first_name)
  values (
    new.id,
    coalesce(v_role, 'caissier'::public.user_role),
    (new.raw_user_meta_data->>'establishment_id')::uuid,
    (new.raw_user_meta_data->>'org_id')::uuid,
    coalesce(new.raw_user_meta_data->>'first_name', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
