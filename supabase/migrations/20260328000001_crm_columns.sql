-- supabase/migrations/20260328000001_crm_columns.sql

-- ── customers: new enrichment columns ──────────────────────────────────────
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS gender            text            CHECK (gender IN ('homme', 'femme', 'autre')),
  ADD COLUMN IF NOT EXISTS birthdate         date,
  ADD COLUMN IF NOT EXISTS opt_in_sms        boolean         NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS opt_in_email      boolean         NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS opt_in_whatsapp   boolean         NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS opt_in_at         timestamptz,
  ADD COLUMN IF NOT EXISTS tags              text[]          NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS rfm_segment       text            NOT NULL DEFAULT 'nouveau'
                                             CHECK (rfm_segment IN ('vip', 'fidele', 'nouveau', 'a_risque', 'perdu')),
  ADD COLUMN IF NOT EXISTS rfm_updated_at    timestamptz,
  ADD COLUMN IF NOT EXISTS brevo_contact_id  bigint,
  ADD COLUMN IF NOT EXISTS last_order_at     timestamptz,
  ADD COLUMN IF NOT EXISTS order_count       int             NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS avg_basket        numeric(10,2)   NOT NULL DEFAULT 0;

-- ── establishments: CRM communication columns ──────────────────────────────
ALTER TABLE public.establishments
  ADD COLUMN IF NOT EXISTS google_review_url  text,
  ADD COLUMN IF NOT EXISTS brevo_sender_name  text            CHECK (char_length(brevo_sender_name) <= 11),
  ADD COLUMN IF NOT EXISTS sms_credits        int             NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sms_used_total     int             NOT NULL DEFAULT 0;

-- ── Atomic SMS credit deduction (raises exception if insufficient) ──────────
CREATE OR REPLACE FUNCTION deduct_sms_credit(p_establishment_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.establishments
  SET sms_credits = sms_credits - 1,
      sms_used_total = sms_used_total + 1
  WHERE id = p_establishment_id AND sms_credits > 0;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Insufficient SMS credits for establishment %', p_establishment_id;
  END IF;
END;
$$;
