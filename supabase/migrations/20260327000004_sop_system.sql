-- supabase/migrations/20260327000004_sop_system.sql

-- 1. SOP categories (per-establishment, flexible)
create table public.sop_categories (
  id               uuid primary key default gen_random_uuid(),
  establishment_id uuid not null references public.establishments(id) on delete cascade,
  name             text not null,
  emoji            text,
  sort_order       int not null default 0
);

create index idx_sop_categories_establishment on public.sop_categories(establishment_id, sort_order);

alter table public.sop_categories enable row level security;

create policy "sop_categories_by_establishment"
  on public.sop_categories for all
  using (
    establishment_id in (
      select establishment_id from public.profiles where id = auth.uid()
    )
  );

-- 2. Extend sops table
alter table public.sops
  add column if not exists category_id  uuid references public.sop_categories(id) on delete set null,
  add column if not exists recipe_id    uuid references public.recipes(id) on delete set null,
  add column if not exists active       boolean not null default true;

-- RLS on sops
do $$ begin
  if not exists (
    select 1 from pg_policies where tablename = 'sops' and policyname = 'sops_by_establishment'
  ) then
    create policy "sops_by_establishment"
      on public.sops for all
      using (
        establishment_id in (
          select establishment_id from public.profiles where id = auth.uid()
        )
      );
  end if;
end $$;

-- 3. SOP steps
create table public.sop_steps (
  id               uuid primary key default gen_random_uuid(),
  sop_id           uuid not null references public.sops(id) on delete cascade,
  sort_order       int not null default 0,
  title            text not null,
  description      text not null default '',
  duration_seconds int,                          -- null = no timer
  media_url        text,                         -- YouTube/Vimeo URL, null if absent
  note_type        text check (note_type in ('warning', 'tip')),
  note_text        text
);

create index idx_sop_steps_sop on public.sop_steps(sop_id, sort_order);

alter table public.sop_steps enable row level security;

create policy "sop_steps_by_establishment"
  on public.sop_steps for all
  using (
    sop_id in (
      select id from public.sops
      where establishment_id in (
        select establishment_id from public.profiles where id = auth.uid()
      )
    )
  );

-- 4. Seed 6 default categories for all existing establishments
insert into public.sop_categories (establishment_id, name, emoji, sort_order)
select e.id, cats.name, cats.emoji, cats.sort_order
from public.establishments e
cross join (values
  ('Recettes & Production', '🍳', 0),
  ('Hygiène & HACCP',       '🧼', 1),
  ('Tenue & Comportement',  '👕', 2),
  ('Nettoyage & Entretien', '🧹', 3),
  ('Rôle & Accueil',        '👤', 4),
  ('Réception & Stocks',    '📦', 5)
) as cats(name, emoji, sort_order)
on conflict do nothing;
