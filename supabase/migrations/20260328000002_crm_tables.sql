-- supabase/migrations/20260328000002_crm_tables.sql

-- ── campaigns ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.campaigns (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id uuid        NOT NULL REFERENCES public.establishments(id) ON DELETE CASCADE,
  name             text        NOT NULL,
  type             text        NOT NULL CHECK (type IN ('manual', 'automated')),
  trigger          text        CHECK (trigger IN ('birthday', 'welcome', 'reactivation', 'lost', 'tier_upgrade', 'google_review')),
  channel          text        NOT NULL CHECK (channel IN ('sms', 'whatsapp', 'email')),
  template_body    text        NOT NULL,
  segment_filter   jsonb       NOT NULL DEFAULT '{}',
  status           text        NOT NULL DEFAULT 'draft'
                               CHECK (status IN ('draft', 'scheduled', 'sent', 'active', 'paused')),
  scheduled_at     timestamptz,
  sent_at          timestamptz,
  sent_count       int         NOT NULL DEFAULT 0,
  delivered_count  int         NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS campaigns_establishment_id_idx ON public.campaigns(establishment_id);
CREATE INDEX IF NOT EXISTS campaigns_status_idx ON public.campaigns(status);

-- ── campaign_sends ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.campaign_sends (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id       uuid        REFERENCES public.campaigns(id) ON DELETE CASCADE,
  customer_id       uuid        NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  channel           text        NOT NULL CHECK (channel IN ('sms', 'whatsapp', 'email')),
  status            text        NOT NULL DEFAULT 'pending'
                                CHECK (status IN ('pending', 'sent', 'delivered', 'failed', 'bounced')),
  brevo_message_id  text,
  sent_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS campaign_sends_campaign_id_idx ON public.campaign_sends(campaign_id);
CREATE INDEX IF NOT EXISTS campaign_sends_customer_id_idx ON public.campaign_sends(customer_id);

-- ── automation_rules ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.automation_rules (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id uuid        NOT NULL REFERENCES public.establishments(id) ON DELETE CASCADE,
  trigger_type     text        NOT NULL CHECK (trigger_type IN ('welcome', 'birthday', 'reactivation', 'lost', 'google_review', 'tier_upgrade')),
  channel          text        NOT NULL CHECK (channel IN ('sms', 'whatsapp', 'email')),
  delay_hours      int         NOT NULL DEFAULT 0,
  template_body    text        NOT NULL,
  active           boolean     NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (establishment_id, trigger_type)
);

CREATE INDEX IF NOT EXISTS automation_rules_establishment_id_idx ON public.automation_rules(establishment_id);
