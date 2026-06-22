-- Fix credit_loyalty_points trigger (two bugs):
--
-- Bug 1: formula was `floor(total_ttc - discount_amount)` which mixes TTC and HT
--        amounts and double-deducts the discount (total_ttc already reflects the
--        discount). Corrected to `floor(total_ttc)` = 1 pt per euro paid TTC.
--
-- Bug 2: loyalty reward points were never deducted when a reward was applied.
--        A customer with 500 pts could redeem the same 500-pt reward indefinitely.
--        Fixed by reading points_required from loyalty_rewards and inserting a
--        'redeem' transaction + updating customers.points accordingly.

create or replace function public.credit_loyalty_points()
returns trigger language plpgsql security definer as $$
declare
  v_earn    int;
  v_redeem  int;
begin
  -- Only fire when transitioning to 'paid' with a linked customer
  if NEW.status = 'paid' and OLD.status <> 'paid' and NEW.customer_id is not null then

    -- Points earned = 1 per euro TTC actually paid (already discounted)
    v_earn := greatest(0, floor(NEW.total_ttc));

    -- Points to redeem = cost of the loyalty reward used (0 if none)
    v_redeem := 0;
    if NEW.reward_id is not null then
      select coalesce(points_required, 0)
        into v_redeem
        from public.loyalty_rewards
       where id = NEW.reward_id;
    end if;

    -- Record earn transaction
    if v_earn > 0 then
      insert into public.loyalty_transactions (customer_id, order_id, points, type)
      values (NEW.customer_id, NEW.id, v_earn, 'earn');
    end if;

    -- Record redeem transaction (positive value = points consumed)
    if v_redeem > 0 then
      insert into public.loyalty_transactions (customer_id, order_id, points, type)
      values (NEW.customer_id, NEW.id, v_redeem, 'redeem');
    end if;

    -- Update customer balance and tier (floor at 0 — never negative)
    update public.customers
    set
      points = greatest(0, points + v_earn - v_redeem),
      tier = case
        when greatest(0, points + v_earn - v_redeem) >= 2000 then 'gold'
        when greatest(0, points + v_earn - v_redeem) >= 500  then 'silver'
        else 'standard'
      end
    where id = NEW.customer_id;

  end if;
  return NEW;
end;
$$;
