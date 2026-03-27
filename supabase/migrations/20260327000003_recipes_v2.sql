-- supabase/migrations/20260327000003_recipes_v2.sql

-- 1. Extend recipes table
alter table public.recipes
  add column if not exists is_internal    boolean not null default true,
  add column if not exists category       text,
  add column if not exists description    text,
  add column if not exists portion        text,       -- ex: "8 portions", "1 assiette"
  add column if not exists active         boolean not null default true,
  add column if not exists created_at     timestamptz not null default now();

-- Backfill existing rows (if any)
update public.recipes set is_internal = true where is_internal is null;

-- 2. Create recipe_ingredients
create table public.recipe_ingredients (
  id          uuid primary key default gen_random_uuid(),
  recipe_id   uuid not null references public.recipes(id) on delete cascade,
  name        text not null,
  quantity    numeric(10, 4) not null check (quantity > 0),
  unit        text not null,
  unit_cost   numeric(10, 4) not null default 0,
  sort_order  int not null default 0
);

create index idx_recipe_ingredients_recipe on public.recipe_ingredients(recipe_id, sort_order);

alter table public.recipe_ingredients enable row level security;

create policy "recipe_ingredients_by_establishment"
  on public.recipe_ingredients for all
  using (
    recipe_id in (
      select id from public.recipes
      where establishment_id in (
        select establishment_id from public.profiles where id = auth.uid()
      )
    )
  );

-- 3. Add recipe_id to products
alter table public.products
  add column if not exists recipe_id uuid references public.recipes(id) on delete set null;

-- RLS on recipes (was enabled, add policy if missing)
do $$ begin
  if not exists (
    select 1 from pg_policies where tablename = 'recipes' and policyname = 'recipes_by_establishment'
  ) then
    create policy "recipes_by_establishment"
      on public.recipes for all
      using (
        establishment_id in (
          select establishment_id from public.profiles where id = auth.uid()
        )
      );
  end if;
end $$;
