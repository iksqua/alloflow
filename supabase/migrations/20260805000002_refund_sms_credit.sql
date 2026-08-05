-- Companion to deduct_sms_credit: restores one SMS credit when Brevo delivery fails.
create or replace function public.refund_sms_credit(p_establishment_id uuid)
returns void
language plpgsql security definer as $$
begin
  update public.establishments
  set sms_credits    = sms_credits + 1,
      sms_used_total = greatest(0, sms_used_total - 1)
  where id = p_establishment_id;
end;
$$;
