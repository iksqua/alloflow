-- supabase/migrations/20260328000004_crm_persona_view.sql

CREATE OR REPLACE VIEW public.v_crm_persona
WITH (security_invoker = true) AS
SELECT
  c.establishment_id,
  -- Gender counts
  count(*) FILTER (WHERE c.gender = 'femme')::int        AS women_count,
  count(*) FILTER (WHERE c.gender = 'homme')::int        AS men_count,
  count(*) FILTER (WHERE c.gender = 'autre')::int        AS other_count,
  count(*) FILTER (WHERE c.gender IS NULL)::int          AS unknown_count,
  -- Age
  avg(date_part('year', age(c.birthdate)))
    FILTER (WHERE c.birthdate IS NOT NULL)::numeric(5,1) AS avg_age,
  -- Basket
  avg(c.avg_basket)::numeric(10,2)                       AS avg_basket,
  -- RFM segments
  count(*) FILTER (WHERE c.rfm_segment = 'vip')::int     AS vip_count,
  count(*) FILTER (WHERE c.rfm_segment = 'fidele')::int  AS fidele_count,
  count(*) FILTER (WHERE c.rfm_segment = 'nouveau')::int AS nouveau_count,
  count(*) FILTER (WHERE c.rfm_segment = 'a_risque')::int AS a_risque_count,
  count(*) FILTER (WHERE c.rfm_segment = 'perdu')::int   AS perdu_count,
  -- Totals
  count(*)::int                                          AS total,
  -- Age brackets
  count(*) FILTER (WHERE date_part('year', age(c.birthdate)) BETWEEN 18 AND 25)::int AS age_18_25,
  count(*) FILTER (WHERE date_part('year', age(c.birthdate)) BETWEEN 26 AND 35)::int AS age_26_35,
  count(*) FILTER (WHERE date_part('year', age(c.birthdate)) BETWEEN 36 AND 45)::int AS age_36_45,
  count(*) FILTER (WHERE date_part('year', age(c.birthdate)) BETWEEN 46 AND 55)::int AS age_46_55,
  count(*) FILTER (WHERE date_part('year', age(c.birthdate)) > 55)::int              AS age_55_plus,
  -- Visit frequency buckets (total order count)
  count(*) FILTER (WHERE c.order_count = 1)::int         AS freq_low,
  count(*) FILTER (WHERE c.order_count BETWEEN 2 AND 3)::int AS freq_mid,
  count(*) FILTER (WHERE c.order_count >= 4)::int        AS freq_high,
  -- Basket by gender
  avg(c.avg_basket) FILTER (WHERE c.gender = 'femme')::numeric(10,2) AS avg_basket_women,
  avg(c.avg_basket) FILTER (WHERE c.gender = 'homme')::numeric(10,2) AS avg_basket_men
FROM public.customers c
WHERE c.establishment_id IS NOT NULL
GROUP BY c.establishment_id;
