-- Fix double loyalty-points deduction on reward redemption.
--
-- Root cause: migration 20260622000001 added a `v_redeem` deduction to the
-- credit_loyalty_points trigger, but orders/route.ts already deducts
-- points_required at order-creation time via a CAS UPDATE. The result is that
-- a customer's points are subtracted twice for every redeemed reward.
--
-- Fix: remove the balance update for `v_redeem` from the trigger.
-- The trigger still inserts the 'redeem' loyalty_transaction row (audit trail)
-- and still credits earned points; only the duplicate points.points -= v_redeem
-- is dropped. The API-level CAS deduction is the authoritative one because it
-- fires at order-creation time (preventing double-spend races) and uses the
-- customer's current balance as a concurrency guard.

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

    -- Determine reward points cost for the audit trail (0 if no reward)
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

    -- Record redeem transaction for the audit trail only.
    -- NOTE: do NOT update customers.points here — the API already deducted
    -- points_required at order-creation time with a CAS guard.  Repeating the
    -- deduction in this trigger caused a double-deduction bug.
    if v_redeem > 0 then
      insert into public.loyalty_transactions (customer_id, order_id, points, type)
      values (NEW.customer_id, NEW.id, v_redeem, 'redeem');
    end if;

    -- Update customer balance (earn only) and tier
    if v_earn > 0 then
      update public.customers
      set
        points = greatest(0, points + v_earn),
        tier = case
          when greatest(0, points + v_earn) >= 2000 then 'gold'
          when greatest(0, points + v_earn) >= 500  then 'silver'
          else 'standard'
        end
      where id = NEW.customer_id;
    end if;

  end if;
  return NEW;
end;
$$;
