-- supabase/migrations/20260328000005_crm_helpers.sql

-- Add trigger_type to campaign_sends for automation deduplication
-- (e.g. google_review automation must not re-send within 90 days)
ALTER TABLE public.campaign_sends
  ADD COLUMN IF NOT EXISTS trigger_type text;

-- Increment delivered_count on campaigns table
-- Only called from /api/webhooks/brevo which validates BREVO_WEBHOOK_SECRET
CREATE OR REPLACE FUNCTION increment_campaign_delivered(p_campaign_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- Only update if campaign exists (prevents increments on non-existent UUIDs)
  UPDATE public.campaigns
  SET delivered_count = delivered_count + 1
  WHERE id = p_campaign_id;
END;
$$;
