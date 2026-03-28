-- supabase/migrations/20260328000005_fix_loyalty_tier_thresholds.sql
-- Fix: loyalty tier thresholds were 100/200 instead of 500/2000

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
      -- Update customer points + tier (correct thresholds: silver=500, gold=2000)
      update public.customers
      set
        points = points + v_points,
        tier = case
          when points + v_points >= 2000 then 'gold'
          when points + v_points >= 500  then 'silver'
          else 'standard'
        end
      where id = NEW.customer_id;
    end if;
  end if;
  return NEW;
end;
$$;

-- Also fix any customers with wrong tiers (accumulated from old wrong thresholds)
update public.customers
set tier = case
  when points >= 2000 then 'gold'
  when points >= 500  then 'silver'
  else 'standard'
end
where tier <> case
  when points >= 2000 then 'gold'
  when points >= 500  then 'silver'
  else 'standard'
end;
