-- Fix: update_customer_rfm trigger references o.total_amount which does not exist.
-- The correct column name is total_ttc (set in 20260326000010_caisse.sql).
-- Without this fix, any UPDATE of orders.status to 'paid' for an order with a
-- customer_id would throw "column o.total_amount does not exist" and roll back
-- the transaction, preventing the payment from being recorded.

CREATE OR REPLACE FUNCTION public.update_customer_rfm()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_cid         uuid;
  v_orders_90   int;
  v_total_cnt   int;
  v_avg_basket  numeric(10,2);
  v_last_order  timestamptz;
  v_prev_seg    text;
  v_new_seg     text;
BEGIN
  -- Only act when status transitions TO 'paid'
  IF NEW.status <> 'paid' OR OLD.status = 'paid' THEN
    RETURN NEW;
  END IF;

  v_cid := NEW.customer_id;
  IF v_cid IS NULL THEN RETURN NEW; END IF;

  -- Get current segment before recomputing (needed for a_risque logic)
  SELECT rfm_segment INTO v_prev_seg FROM public.customers WHERE id = v_cid;

  -- Aggregate from all paid orders (total_ttc is the correct column, not total_amount)
  SELECT
    count(*) FILTER (WHERE o.created_at >= now() - interval '90 days'),
    count(*),
    avg(o.total_ttc),
    max(o.created_at)
  INTO v_orders_90, v_total_cnt, v_avg_basket, v_last_order
  FROM public.orders o
  WHERE o.customer_id = v_cid AND o.status = 'paid';

  -- Segment priority: vip → fidele → a_risque → perdu → nouveau
  -- Uses v_orders_90 (90-day window count), NOT the lifetime order_count
  IF v_last_order >= now() - interval '7 days' AND v_orders_90 >= 4 THEN
    v_new_seg := 'vip';
  ELSIF v_last_order >= now() - interval '30 days' AND v_orders_90 >= 2 THEN
    v_new_seg := 'fidele';
  ELSIF v_prev_seg IN ('vip', 'fidele')
        AND v_last_order < now() - interval '30 days'
        AND v_last_order >= now() - interval '60 days' THEN
    v_new_seg := 'a_risque';
  ELSIF v_last_order < now() - interval '60 days' THEN
    v_new_seg := 'perdu';
  ELSE
    v_new_seg := 'nouveau';
  END IF;

  UPDATE public.customers SET
    last_order_at  = v_last_order,
    order_count    = v_total_cnt,
    avg_basket     = COALESCE(v_avg_basket, 0),
    rfm_segment    = v_new_seg,
    rfm_updated_at = now()
  WHERE id = v_cid;

  RETURN NEW;
END;
$$;
