-- Prevent duplicate default sop_categories when two concurrent GET requests
-- both see count=0 and both try to seed the same establishment.
create unique index if not exists sop_categories_est_name_uidx
  on public.sop_categories(establishment_id, name);
