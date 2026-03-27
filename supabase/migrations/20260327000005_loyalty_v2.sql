-- supabase/migrations/20260327000005_loyalty_v2.sql

-- 1. Extend customers table
alter table public.customers
  add column if not exists first_name  text,
  add column if not exists last_name   text,
  add column if not exists created_by  uuid references public.profiles(id) on delete set null;

-- Backfill: copy name into first_name for existing rows
update public.customers set first_name = name where first_name is null;

-- Make first_name NOT NULL now that backfill is done
alter table public.customers alter column first_name set not null;
alter table public.customers alter column first_name set default '';

-- Update tier check constraint: bronze/argent/or → standard/silver/gold
alter table public.customers drop constraint if exists customers_tier_check;
alter table public.customers add constraint customers_tier_check
  check (tier in ('standard', 'silver', 'gold'));
-- Update existing tier values
update public.customers set tier = 'standard' where tier in ('bronze');
update public.customers set tier = 'silver'   where tier in ('argent');
update public.customers set tier = 'gold'     where tier in ('or');
-- Change default to 'standard'
alter table public.customers alter column tier set default 'standard';

-- 2. Add customer_id + reward_id to orders
alter table public.orders
  add column if not exists customer_id  uuid references public.customers(id) on delete set null,
  add column if not exists reward_id    uuid references public.loyalty_rewards(id) on delete set null;

-- 3. RLS on customers (establishment-scoped)
create policy "customers_by_establishment"
  on public.customers for all
  using (
    establishment_id in (
      select establishment_id from public.profiles where id = auth.uid()
    )
  );

-- 4. RLS on loyalty_rewards
create policy "loyalty_rewards_by_establishment"
  on public.loyalty_rewards for all
  using (
    establishment_id in (
      select establishment_id from public.profiles where id = auth.uid()
    )
  );

-- 5. RLS on loyalty_transactions (via customer's establishment)
create policy "loyalty_transactions_by_establishment"
  on public.loyalty_transactions for all
  using (
    customer_id in (
      select c.id from public.customers c
      join public.profiles p on p.establishment_id = c.establishment_id
      where p.id = auth.uid()
    )
  );

-- 6. DB trigger: credit points when order is paid
create or replace function public.credit_loyalty_points()
returns trigger language plpgsql security definer as $$
declare
  v_points int;
begin
  -- Only fire when transitioning to 'paid' with a customer
  if NEW.status = 'paid' and OLD.status <> 'paid' and NEW.customer_id is not null then
    v_points := floor(NEW.total_ttc - NEW.discount_amount);
    if v_points > 0 then
      -- Insert loyalty transaction
      insert into public.loyalty_transactions (customer_id, order_id, points, type)
      values (NEW.customer_id, NEW.id, v_points, 'earn');
      -- Update customer points + tier
      update public.customers
      set
        points = points + v_points,
        tier = case
          when points + v_points >= 200 then 'gold'
          when points + v_points >= 100 then 'silver'
          else 'standard'
        end
      where id = NEW.customer_id;
    end if;
  end if;
  return NEW;
end;
$$;

create trigger trg_credit_loyalty_points
  after update on public.orders
  for each row execute function public.credit_loyalty_points();
