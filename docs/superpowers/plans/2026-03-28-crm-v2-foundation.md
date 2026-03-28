# CRM v2 — Sprint 9A: Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lay the database, communication, and configuration foundation for CRM v2 — new customer/establishment columns, Brevo SMS integration, enriched customer profile form, and automation rules setup.

**Architecture:** Supabase migrations add new columns and tables + DB triggers for RFM auto-computation. A thin Brevo REST helper (no SDK) powers `/api/communications/send`. Customer profile and POS forms are extended for opt-ins. A new `/dashboard/settings` page hosts the CRM config tab per establishment.

**Tech Stack:** Next.js 15 (App Router, async params), Supabase (PostgreSQL triggers + pg_cron), Brevo REST API (direct fetch, no SDK), Zod v4, Vitest

> **IMPORTANT:** Before writing any Next.js code, read `node_modules/next/dist/docs/` for current API conventions. This project uses Next.js 16.2.1 which may differ from training data. Async params (`params: Promise<{id: string}>`) are already in use — follow that pattern.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `supabase/migrations/20260328000001_crm_columns.sql` | Create | Add new columns to `customers` + `establishments` |
| `supabase/migrations/20260328000002_crm_tables.sql` | Create | New tables: `campaigns`, `campaign_sends`, `automation_rules` |
| `supabase/migrations/20260328000003_rfm_trigger.sql` | Create | RFM trigger on `orders` + daily pg_cron drift job |
| `src/lib/brevo.ts` | Create | Brevo REST helper + `renderTemplate()` pure function |
| `src/lib/validations/customer.ts` | Create | Zod schemas for enriched customer PATCH |
| `src/app/api/communications/send/route.ts` | Create | POST: validate opt-in → deduct credit → call Brevo → log send |
| `src/app/api/customers/[id]/route.ts` | Modify | Extend GET (new columns) + PATCH (all enrichment fields) |
| `src/app/api/settings/crm/route.ts` | Create | GET + PATCH `brevo_sender_name`, `google_review_url` on establishments |
| `src/app/api/automation-rules/route.ts` | Create | GET all rules + PUT upsert a rule |
| `src/app/dashboard/crm/[id]/_components/customer-profile.tsx` | Modify | Add gender, birthdate, opt-ins, tags, RFM badge |
| `src/app/dashboard/crm/[id]/_components/customer-edit-form.tsx` | Create | Client form for all enrichment fields |
| `src/app/dashboard/crm/[id]/_components/customer-profile-client.tsx` | Create | Client wrapper holding `useRouter` for form save callback |
| `src/app/dashboard/crm/_components/customer-table.tsx` | Modify | Add RFM segment badge column |
| `src/app/caisse/pos/_components/loyalty-modal.tsx` | Modify | Add opt-in SMS/Email checkboxes on new customer creation |
| `src/app/dashboard/settings/page.tsx` | Create | Server page: loads establishment data, renders CRM tab |
| `src/app/dashboard/settings/_components/crm-settings-form.tsx` | Create | Client form: sender name + Google review URL + credit balance |
| `src/app/dashboard/_components/sidebar.tsx` | Modify | Enable Settings link (remove disabled state) |

---

### Task 1: DB Migration — Customer and Establishment new columns

**Files:**
- Create: `supabase/migrations/20260328000001_crm_columns.sql`

> Apply this migration in the Supabase dashboard (SQL Editor) or via `supabase db push`. This task has no automated tests — verify by checking column existence in Supabase table editor after applying.

- [ ] **Step 1: Write the migration SQL**

```sql
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
```

- [ ] **Step 2: Apply the migration**

In Supabase dashboard → SQL Editor → paste and run.
Expected: no errors, columns appear in `customers` and `establishments` tables.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260328000001_crm_columns.sql
git commit -m "feat(crm): add enrichment columns to customers + establishments"
```

---

### Task 2: DB Migration — New CRM tables

**Files:**
- Create: `supabase/migrations/20260328000002_crm_tables.sql`

- [ ] **Step 1: Write the migration SQL**

```sql
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
  campaign_id       uuid        REFERENCES public.campaigns(id) ON DELETE CASCADE,  -- nullable: direct sends (automations) have no campaign
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
```

- [ ] **Step 2: Apply the migration**

Supabase dashboard → SQL Editor → paste and run.
Expected: tables `campaigns`, `campaign_sends`, `automation_rules` appear.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260328000002_crm_tables.sql
git commit -m "feat(crm): add campaigns, campaign_sends, automation_rules tables"
```

---

### Task 3: DB Migration — RFM trigger

**Files:**
- Create: `supabase/migrations/20260328000003_rfm_trigger.sql`

> The trigger fires after any `UPDATE` on `orders`. It only acts when `status` changes to `'paid'` and the order has a `customer_id`. Verify the orders table's total amount column name in Supabase before applying — adjust `o.total_amount` if the column is named differently (e.g. `amount`, `total`).

- [ ] **Step 1: Write the migration SQL**

```sql
-- supabase/migrations/20260328000003_rfm_trigger.sql

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

  -- Aggregate from all paid orders
  SELECT
    count(*) FILTER (WHERE o.created_at >= now() - interval '90 days'),
    count(*),
    avg(o.total_amount),
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

-- Drop existing trigger if any, then recreate
DROP TRIGGER IF EXISTS trg_customer_rfm ON public.orders;
CREATE TRIGGER trg_customer_rfm
  AFTER UPDATE OF status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.update_customer_rfm();

-- ── Daily drift job via pg_cron (reclassify inactive customers) ────────────
-- This requires pg_cron extension. Enable it in Supabase dashboard:
-- Database → Extensions → pg_cron → Enable
-- Then run this once:
SELECT cron.schedule(
  'rfm-daily-drift',
  '0 2 * * *',   -- 2 AM UTC daily
  $$
  -- NOTE: Uses a 90-day window subquery for order count (not the lifetime order_count column)
  -- to match spec: "≥ 4 orders in last 90 days" for vip, "≥ 2 orders in last 90 days" for fidele
  UPDATE public.customers c SET
    rfm_segment = CASE
      WHEN c.last_order_at >= now() - interval '7 days'
           AND (SELECT count(*) FROM public.orders o
                WHERE o.customer_id = c.id AND o.status = 'paid'
                  AND o.created_at >= now() - interval '90 days') >= 4
                                                                   THEN 'vip'
      WHEN c.last_order_at >= now() - interval '30 days'
           AND (SELECT count(*) FROM public.orders o
                WHERE o.customer_id = c.id AND o.status = 'paid'
                  AND o.created_at >= now() - interval '90 days') >= 2
                                                                   THEN 'fidele'
      WHEN c.rfm_segment IN ('vip', 'fidele')
           AND c.last_order_at < now() - interval '30 days'
           AND c.last_order_at >= now() - interval '60 days'       THEN 'a_risque'
      WHEN c.last_order_at < now() - interval '60 days'
           OR (c.last_order_at IS NULL AND c.created_at < now() - interval '60 days') THEN 'perdu'
      ELSE c.rfm_segment
    END,
    rfm_updated_at = now()
  WHERE c.establishment_id IS NOT NULL;
  $$
);
```

- [ ] **Step 2: Apply the migration**

Apply in Supabase SQL Editor. If pg_cron isn't enabled, enable it first (Dashboard → Database → Extensions → pg_cron). The `cron.schedule` line can be run separately after enabling the extension.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260328000003_rfm_trigger.sql
git commit -m "feat(crm): add RFM auto-computation trigger + daily pg_cron drift job"
```

---

### Task 4: Brevo REST helper + template renderer

**Files:**
- Create: `src/lib/brevo.ts`
- Test: `src/lib/__tests__/brevo.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/lib/__tests__/brevo.test.ts
import { describe, it, expect } from 'vitest'
import { renderTemplate } from '../brevo'

describe('renderTemplate', () => {
  it('replaces all known variables', () => {
    const tpl = 'Bonjour {{prenom}} ! Tu as {{points}} pts · Tier {{tier}} · {{etablissement}}'
    const result = renderTemplate(tpl, {
      prenom: 'Marie',
      points: 150,
      tier: 'Silver',
      etablissement: 'Le Café',
    })
    expect(result).toBe('Bonjour Marie ! Tu as 150 pts · Tier Silver · Le Café')
  })

  it('replaces {{lien_avis}} and {{segment}}', () => {
    const tpl = 'Segment: {{segment}} — Avis: {{lien_avis}}'
    const result = renderTemplate(tpl, { segment: 'vip', lien_avis: 'https://g.page/r/ABC/review' })
    expect(result).toBe('Segment: vip — Avis: https://g.page/r/ABC/review')
  })

  it('leaves unknown variables untouched', () => {
    const tpl = 'Hello {{prenom}} {{unknown}}'
    const result = renderTemplate(tpl, { prenom: 'Alex' })
    expect(result).toBe('Hello Alex {{unknown}}')
  })

  it('handles missing vars with empty string', () => {
    const tpl = 'Bonjour {{prenom}} !'
    const result = renderTemplate(tpl, {})
    expect(result).toBe('Bonjour  !')
  })

  it('replaces multiple occurrences', () => {
    const tpl = '{{prenom}} {{prenom}} {{prenom}}'
    const result = renderTemplate(tpl, { prenom: 'test' })
    expect(result).toBe('test test test')
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run src/lib/__tests__/brevo.test.ts
```
Expected: FAIL — `renderTemplate` not found.

- [ ] **Step 3: Implement the helper**

```typescript
// src/lib/brevo.ts
const BREVO_SMS_URL = 'https://api.brevo.com/v3/transactionalSMS/sms'

export interface BrevoSmsResult {
  messageId: string
  smsCount: number
}

export interface TemplateVars {
  prenom?: string
  points?: number
  tier?: string
  segment?: string
  lien_avis?: string
  etablissement?: string
}

/**
 * Replace {{variable}} tokens in a template string.
 * Unknown tokens are left as-is.
 */
export function renderTemplate(template: string, vars: TemplateVars): string {
  const map: Record<string, string> = {
    prenom:       vars.prenom       ?? '',
    points:       String(vars.points ?? ''),
    tier:         vars.tier         ?? '',
    segment:      vars.segment      ?? '',
    lien_avis:    vars.lien_avis    ?? '',
    etablissement: vars.etablissement ?? '',
  }
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) =>
    key in map ? map[key] : match
  )
}

/**
 * Send a single transactional SMS via Brevo.
 * Throws on API error. Must only be called server-side.
 */
export async function sendBrevoSms(params: {
  sender: string       // max 11 chars alphanumeric
  recipient: string    // E.164 format: +33612345678
  content: string
}): Promise<BrevoSmsResult> {
  const apiKey = process.env.BREVO_API_KEY
  if (!apiKey) throw new Error('BREVO_API_KEY is not configured')

  const res = await fetch(BREVO_SMS_URL, {
    method: 'POST',
    headers: {
      'accept':       'application/json',
      'content-type': 'application/json',
      'api-key':      apiKey,
    },
    body: JSON.stringify({
      sender:    params.sender,
      recipient: params.recipient,
      content:   params.content,
      type:      'marketing',
    }),
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { message?: string }
    throw new Error(`Brevo SMS error ${res.status}: ${body.message ?? 'Unknown error'}`)
  }

  return res.json() as Promise<BrevoSmsResult>
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx vitest run src/lib/__tests__/brevo.test.ts
```
Expected: 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/brevo.ts src/lib/__tests__/brevo.test.ts
git commit -m "feat(crm): add Brevo REST helper + renderTemplate"
```

---

### Task 5: /api/communications/send route

**Files:**
- Create: `src/app/api/communications/send/route.ts`

This is an internal route. It validates opt-in, checks credits, calls Brevo, logs the send in `campaign_sends`.

- [ ] **Step 1: Implement the route**

```typescript
// src/app/api/communications/send/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { sendBrevoSms, renderTemplate } from '@/lib/brevo'

const sendSchema = z.object({
  customerId:   z.string().uuid(),
  channel:      z.enum(['sms', 'whatsapp', 'email']),
  message:      z.string().min(1).max(160),
  campaignId:   z.string().uuid().optional(),
})

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('establishment_id')
    .eq('id', user.id)
    .single()
  if (!profile?.establishment_id) return NextResponse.json({ error: 'Établissement non trouvé' }, { status: 400 })

  const body = sendSchema.safeParse(await req.json())
  if (!body.success) return NextResponse.json({ error: body.error.flatten() }, { status: 422 })

  const { customerId, channel, message, campaignId } = body.data

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: customer } = await (supabase as any)
    .from('customers')
    .select('id, first_name, phone, email, opt_in_sms, opt_in_email, opt_in_whatsapp')
    .eq('id', customerId)
    .eq('establishment_id', profile.establishment_id)
    .single()

  if (!customer) return NextResponse.json({ error: 'Client non trouvé' }, { status: 404 })

  // Check opt-in for channel
  const optInField = `opt_in_${channel}` as 'opt_in_sms' | 'opt_in_email' | 'opt_in_whatsapp'
  if (!customer[optInField]) {
    return NextResponse.json({ error: `Client sans opt-in ${channel}` }, { status: 422 })
  }

  if (channel !== 'sms') {
    return NextResponse.json({ error: 'Seul le canal SMS est disponible en v2' }, { status: 422 })
  }

  if (!customer.phone) {
    return NextResponse.json({ error: 'Client sans numéro de téléphone' }, { status: 422 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: establishment } = await (supabase as any)
    .from('establishments')
    .select('sms_credits, brevo_sender_name')
    .eq('id', profile.establishment_id)
    .single()

  if (!establishment || establishment.sms_credits <= 0) {
    return NextResponse.json({ error: 'Crédits SMS épuisés — contactez Alloflow pour recharger' }, { status: 402 })
  }

  const sender = establishment.brevo_sender_name ?? 'Alloflow'

  // Deduct credit atomically BEFORE calling Brevo to prevent race conditions.
  // deduct_sms_credit raises an exception if credits = 0, so this is the authoritative check.
  // The earlier credit check above is just a fast-fail UX optimization, not the guard.
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).rpc('deduct_sms_credit', { p_establishment_id: profile.establishment_id })
  } catch {
    return NextResponse.json({ error: 'Crédits SMS épuisés' }, { status: 402 })
  }

  let brevoMessageId: string | null = null
  try {
    const result = await sendBrevoSms({
      sender,
      recipient: customer.phone,
      content:   message,
    })
    brevoMessageId = result.messageId
  } catch (err) {
    // Credit already deducted — log failure but don't refund (credit is lost on send failure)
    // This is acceptable for v2; a refund mechanism can be added in a future sprint.
    const msg = err instanceof Error ? err.message : 'Erreur Brevo'
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from('campaign_sends').insert({
      campaign_id:      campaignId ?? null,
      customer_id:      customerId,
      channel,
      status:           'failed',
      brevo_message_id: null,
    })
    return NextResponse.json({ error: msg }, { status: 502 })
  }

  // Log the send
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any).from('campaign_sends').insert({
    campaign_id:      campaignId ?? null,
    customer_id:      customerId,
    channel,
    status:           'sent',
    brevo_message_id: brevoMessageId,
  })

  return NextResponse.json({ ok: true, messageId: brevoMessageId })
}
```

- [ ] **Step 2: Verify the route compiles**

```bash
npx tsc --noEmit
```
Expected: no type errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/communications/send/route.ts
git commit -m "feat(crm): add /api/communications/send route"
```

---

### Task 6: Extend /api/customers/[id] GET + PATCH

**Files:**
- Modify: `src/app/api/customers/[id]/route.ts`

- [ ] **Step 1: Extend GET to include all new columns**

Replace the `select(...)` in GET:
```typescript
.select('id, first_name, last_name, tier, points, phone, email, notes, created_at, gender, birthdate, opt_in_sms, opt_in_email, opt_in_whatsapp, opt_in_at, tags, rfm_segment, rfm_updated_at, last_order_at, order_count, avg_basket')
```

- [ ] **Step 2: Extend PATCH to accept all enrichment fields**

Replace the entire PATCH handler body with:

```typescript
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles').select('establishment_id').eq('id', user.id).single()
  if (!profile?.establishment_id) return NextResponse.json({ error: 'Établissement non trouvé' }, { status: 400 })

  const body = await req.json() as Record<string, unknown>

  // Build update object — only include fields present in body
  const allowed = ['notes', 'gender', 'birthdate', 'opt_in_sms', 'opt_in_email',
                   'opt_in_whatsapp', 'tags', 'rfm_segment'] as const
  const update: Record<string, unknown> = {}
  for (const field of allowed) {
    if (field in body) update[field] = body[field]
  }

  // Record consent timestamp when any opt-in is being set to true
  const setsOptIn = ['opt_in_sms', 'opt_in_email', 'opt_in_whatsapp']
    .some(f => update[f] === true)
  if (setsOptIn) update.opt_in_at = new Date().toISOString()

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'Aucun champ à mettre à jour' }, { status: 400 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('customers')
    .update(update)
    .eq('id', id)
    .eq('establishment_id', profile.establishment_id)
    .select('id, notes, gender, birthdate, opt_in_sms, opt_in_email, opt_in_whatsapp, opt_in_at, tags, rfm_segment')
    .single()

  if (error || !data) return NextResponse.json({ error: 'Mise à jour échouée' }, { status: 500 })
  return NextResponse.json(data)
}
```

- [ ] **Step 3: Verify compilation**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add src/app/api/customers/[id]/route.ts
git commit -m "feat(crm): extend customer GET + PATCH with enrichment fields"
```

---

### Task 7: Customer enrichment form — client component

**Files:**
- Create: `src/app/dashboard/crm/[id]/_components/customer-edit-form.tsx`
- Modify: `src/app/dashboard/crm/[id]/_components/customer-profile.tsx`

- [ ] **Step 1: Create the edit form component**

```typescript
// src/app/dashboard/crm/[id]/_components/customer-edit-form.tsx
'use client'
import { useState } from 'react'

interface Customer {
  id: string
  gender: string | null
  birthdate: string | null
  opt_in_sms: boolean
  opt_in_email: boolean
  opt_in_whatsapp: boolean
  tags: string[]
  notes: string | null
}

interface Props {
  customer: Customer
  onSaved: (updated: Customer) => void
}

const GENDER_OPTIONS = [
  { value: 'homme', label: 'Homme' },
  { value: 'femme', label: 'Femme' },
  { value: 'autre', label: 'Autre' },
]

export function CustomerEditForm({ customer, onSaved }: Props) {
  const [gender, setGender]           = useState(customer.gender ?? '')
  const [birthdate, setBirthdate]     = useState(customer.birthdate ?? '')
  const [optSms, setOptSms]           = useState(customer.opt_in_sms)
  const [optEmail, setOptEmail]       = useState(customer.opt_in_email)
  const [optWa, setOptWa]             = useState(customer.opt_in_whatsapp)
  const [tagsRaw, setTagsRaw]         = useState(customer.tags.join(', '))
  const [notes, setNotes]             = useState(customer.notes ?? '')
  const [saving, setSaving]           = useState(false)
  const [error, setError]             = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)

    const tags = tagsRaw.split(',').map(t => t.trim()).filter(Boolean)

    const res = await fetch(`/api/customers/${customer.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        gender:         gender || null,
        birthdate:      birthdate || null,
        opt_in_sms:     optSms,
        opt_in_email:   optEmail,
        opt_in_whatsapp: optWa,
        tags,
        notes,
      }),
    })

    setSaving(false)
    if (!res.ok) {
      const data = await res.json() as { error?: string }
      setError(data.error ?? 'Erreur lors de la sauvegarde')
      return
    }

    const updated = await res.json() as Customer
    onSaved(updated)
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {/* Gender */}
      <div>
        <label className="block text-xs font-medium text-[var(--text3)] mb-1.5">Genre</label>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setGender('')}
            className={[
              'px-3 py-1.5 rounded-lg text-xs transition-colors',
              gender === '' ? 'bg-[var(--blue)] text-white' : 'bg-[var(--surface2)] text-[var(--text2)] hover:bg-[var(--surface)]',
            ].join(' ')}
          >
            Non précisé
          </button>
          {GENDER_OPTIONS.map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setGender(opt.value)}
              className={[
                'px-3 py-1.5 rounded-lg text-xs transition-colors',
                gender === opt.value ? 'bg-[var(--blue)] text-white' : 'bg-[var(--surface2)] text-[var(--text2)] hover:bg-[var(--surface)]',
              ].join(' ')}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Birthdate */}
      <div>
        <label htmlFor="birthdate" className="block text-xs font-medium text-[var(--text3)] mb-1.5">
          Date de naissance
        </label>
        <input
          id="birthdate"
          type="date"
          value={birthdate}
          onChange={e => setBirthdate(e.target.value)}
          className="w-full rounded-lg px-3 py-2 text-sm text-[var(--text1)] bg-[var(--surface2)] border border-[var(--border)] focus:outline-none focus:ring-2 focus:ring-[var(--blue)]"
        />
      </div>

      {/* Opt-ins */}
      <div>
        <div className="text-xs font-medium text-[var(--text3)] mb-2">Consentements (RGPD)</div>
        <div className="flex flex-col gap-2">
          {[
            { id: 'opt_sms', label: 'SMS', value: optSms, setter: setOptSms },
            { id: 'opt_email', label: 'Email', value: optEmail, setter: setOptEmail },
            { id: 'opt_wa', label: 'WhatsApp', value: optWa, setter: setOptWa },
          ].map(({ id, label, value, setter }) => (
            <label key={id} className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                id={id}
                checked={value}
                onChange={e => setter(e.target.checked)}
                className="w-4 h-4 rounded accent-[var(--blue)]"
              />
              <span className="text-sm text-[var(--text2)]">Opt-in {label}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Tags */}
      <div>
        <label htmlFor="tags" className="block text-xs font-medium text-[var(--text3)] mb-1.5">
          Tags (séparés par des virgules)
        </label>
        <input
          id="tags"
          type="text"
          value={tagsRaw}
          onChange={e => setTagsRaw(e.target.value)}
          placeholder="vip, influenceur, allergie-gluten"
          className="w-full rounded-lg px-3 py-2 text-sm text-[var(--text1)] bg-[var(--surface2)] border border-[var(--border)] focus:outline-none focus:ring-2 focus:ring-[var(--blue)]"
        />
      </div>

      {/* Notes */}
      <div>
        <label htmlFor="notes" className="block text-xs font-medium text-[var(--text3)] mb-1.5">
          Notes internes
        </label>
        <textarea
          id="notes"
          value={notes}
          onChange={e => setNotes(e.target.value)}
          rows={3}
          className="w-full rounded-lg px-3 py-2 text-sm text-[var(--text1)] bg-[var(--surface2)] border border-[var(--border)] focus:outline-none focus:ring-2 focus:ring-[var(--blue)] resize-none"
        />
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}

      <button
        type="submit"
        disabled={saving}
        className="w-full py-2 rounded-lg text-sm font-medium text-white transition-opacity disabled:opacity-50"
        style={{ background: 'var(--blue)' }}
      >
        {saving ? 'Enregistrement...' : 'Enregistrer'}
      </button>
    </form>
  )
}
```

- [ ] **Step 2: Create a client wrapper for the profile bottom section**

`customer-profile.tsx` is a server component — it cannot use hooks. Create a thin client wrapper that owns `useRouter` and passes it down:

```typescript
// src/app/dashboard/crm/[id]/_components/customer-profile-client.tsx
'use client'
import { useRouter } from 'next/navigation'
import { CustomerEditForm } from './customer-edit-form'

interface CustomerForEdit {
  id: string
  gender: string | null
  birthdate: string | null
  opt_in_sms: boolean
  opt_in_email: boolean
  opt_in_whatsapp: boolean
  tags: string[]
  notes: string | null
}

interface Props { customer: CustomerForEdit }

export function CustomerProfileClient({ customer }: Props) {
  const router = useRouter()
  return (
    <div className="mt-6 border-t border-[var(--border)] pt-5">
      <h2 className="text-sm font-semibold text-[var(--text2)] mb-4">Profil & consentements</h2>
      <CustomerEditForm customer={customer} onSaved={() => router.refresh()} />
    </div>
  )
}
```

- [ ] **Step 3: Add RFM badge + client wrapper to customer-profile.tsx**

In `customer-profile.tsx`, extend the `Customer` interface to include new fields and add the RFM badge. Import `CustomerProfileClient` (a client component) — this is valid because a server component can render client components.

Add to the `Customer` interface:
```typescript
  gender: string | null
  birthdate: string | null
  opt_in_sms: boolean
  opt_in_email: boolean
  opt_in_whatsapp: boolean
  tags: string[]
  notes: string | null
  rfm_segment: 'vip' | 'fidele' | 'nouveau' | 'a_risque' | 'perdu'
  avg_basket: number
  order_count: number
```

Add the RFM color map and badge after the tier badge:
```typescript
const RFM_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  vip:      { bg: 'rgba(251,191,36,0.15)',  text: '#fbbf24', label: '👑 VIP' },
  fidele:   { bg: 'rgba(16,185,129,0.15)',  text: '#10b981', label: '⭐ Fidèle' },
  nouveau:  { bg: 'rgba(59,130,246,0.15)',  text: '#60a5fa', label: '🆕 Nouveau' },
  a_risque: { bg: 'rgba(245,158,11,0.15)',  text: '#f59e0b', label: '⚠️ À risque' },
  perdu:    { bg: 'rgba(239,68,68,0.15)',   text: '#ef4444', label: '💤 Perdu' },
}
```

Add RFM badge next to tier badge in the header section:
```tsx
{customer.rfm_segment && (() => {
  const rfm = RFM_COLORS[customer.rfm_segment]
  return rfm ? (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
      style={{ background: rfm.bg, color: rfm.text }}
    >
      {rfm.label}
    </span>
  ) : null
})()}
```

Add `CustomerProfileClient` after the stats grid:
```tsx
import { CustomerProfileClient } from './customer-profile-client'
// ...
<CustomerProfileClient customer={customer} />
```

- [ ] **Step 3: Verify compilation**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add src/app/dashboard/crm/[id]/_components/
git commit -m "feat(crm): add enrichment form + RFM badge to customer profile"
```

---

### Task 8: RFM badge on CRM list

**Files:**
- Modify: `src/app/dashboard/crm/_components/customer-table.tsx`

- [ ] **Step 1: Read the file first**

Read `src/app/dashboard/crm/_components/customer-table.tsx` to understand the current table structure and `TierBadge` component before editing.

- [ ] **Step 2: Add RFM badge column**

First, add `rfm_segment` to the `Customer` type **inside `customer-table.tsx`** (wherever the interface is defined):
```typescript
rfm_segment: string | null
```

Then update the select string in `src/app/dashboard/crm/page.tsx` to include `rfm_segment`:
```typescript
.select('id, first_name, last_name, tier, points, phone, email, created_at, rfm_segment')
```

And update the `Customer` type in `crm/page.tsx` (or the shared type it uses) to include `rfm_segment: string | null`.

Then add a new `RfmBadge` component and column:

```typescript
const RFM_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  vip:      { label: '👑 VIP',       color: '#fbbf24', bg: 'rgba(251,191,36,0.12)' },
  fidele:   { label: '⭐ Fidèle',    color: '#10b981', bg: 'rgba(16,185,129,0.12)' },
  nouveau:  { label: '🆕 Nouveau',   color: '#60a5fa', bg: 'rgba(59,130,246,0.12)' },
  a_risque: { label: '⚠ À risque',  color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
  perdu:    { label: '💤 Perdu',     color: '#ef4444', bg: 'rgba(239,68,68,0.12)'  },
}

function RfmBadge({ segment }: { segment: string | null }) {
  if (!segment) return null
  const cfg = RFM_CONFIG[segment]
  if (!cfg) return null
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium whitespace-nowrap"
      style={{ background: cfg.bg, color: cfg.color }}
    >
      {cfg.label}
    </span>
  )
}
```

Add `rfm_segment` to the Customer type in this file, add `<RfmBadge>` in each row after `<TierBadge>`, and add the "Segment" column header.

Also update the `select` call in the parent server component (`src/app/dashboard/crm/page.tsx`) to include `rfm_segment`.

- [ ] **Step 3: Verify compilation**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add src/app/dashboard/crm/
git commit -m "feat(crm): add RFM segment badge to customer list"
```

---

### Task 9: POS opt-in checkboxes

**Files:**
- Modify: `src/app/caisse/pos/_components/loyalty-modal.tsx`

- [ ] **Step 1: Read the file**

Read `src/app/caisse/pos/_components/loyalty-modal.tsx` to find the new customer creation form section (the 3-state modal has a `new-customer` state).

- [ ] **Step 2: Add opt-in fields to the new customer form**

In the new customer creation form, add three checkboxes after the phone/email fields:

```tsx
{/* RGPD opt-ins */}
<div className="mt-3 border-t border-[var(--border)] pt-3">
  <p className="text-xs text-[var(--text3)] mb-2">Consentements communications (RGPD)</p>
  <div className="flex flex-col gap-1.5">
    {[
      { id: 'new-opt-sms',   field: 'opt_in_sms',   label: 'SMS' },
      { id: 'new-opt-email', field: 'opt_in_email',  label: 'Email' },
    ].map(({ id, field, label }) => (
      <label key={id} className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          id={id}
          checked={newCustomer[field as keyof typeof newCustomer] as boolean ?? false}
          onChange={e => setNewCustomer(prev => ({ ...prev, [field]: e.target.checked }))}
          className="w-4 h-4 rounded accent-[var(--blue)]"
        />
        <span className="text-xs text-[var(--text2)]">Opt-in {label}</span>
      </label>
    ))}
  </div>
  <p className="text-[10px] text-[var(--text4)] mt-1">
    Le client consent à recevoir des communications de notre établissement.
  </p>
</div>
```

Add `opt_in_sms` and `opt_in_email` to the `newCustomer` state object initial value and to the POST body in `/api/customers`.

Also extend `createCustomerSchema` in `src/lib/validations/loyalty.ts`:
```typescript
opt_in_sms:      z.boolean().optional(),
opt_in_email:    z.boolean().optional(),
opt_in_whatsapp: z.boolean().optional(),
```

And extend the customer `INSERT` in `/api/customers/route.ts` to include these fields. **Important:** The Supabase client in this file may not have regenerated types for the new columns. Use the `(supabase as any)` cast already used in other routes (e.g. `customers/[id]/route.ts`) to avoid TypeScript errors from stale generated types. Do NOT run `supabase gen types` as part of this task — that would change generated files outside this task's scope.

- [ ] **Step 3: Verify compilation**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add src/app/caisse/pos/_components/loyalty-modal.tsx src/lib/validations/loyalty.ts src/app/api/customers/route.ts
git commit -m "feat(crm): add opt-in checkboxes to POS new customer form"
```

---

### Task 10: Settings page + CRM tab

**Files:**
- Create: `src/app/dashboard/settings/page.tsx`
- Create: `src/app/dashboard/settings/_components/crm-settings-form.tsx`
- Create: `src/app/api/settings/crm/route.ts`

- [ ] **Step 1: Create the API route**

```typescript
// src/app/api/settings/crm/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

const crmSettingsSchema = z.object({
  brevo_sender_name: z.string().max(11).regex(/^[A-Za-z0-9]+$/, 'Alphanumerique, 11 chars max').optional(),
  google_review_url: z.string().url().optional().or(z.literal('')),
})

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles').select('establishment_id').eq('id', user.id).single()
  if (!profile?.establishment_id) return NextResponse.json({ error: 'Établissement non trouvé' }, { status: 400 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any)
    .from('establishments')
    .select('brevo_sender_name, google_review_url, sms_credits')
    .eq('id', profile.establishment_id)
    .single()

  return NextResponse.json(data ?? {})
}

export async function PATCH(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles').select('establishment_id').eq('id', user.id).single()
  if (!profile?.establishment_id) return NextResponse.json({ error: 'Établissement non trouvé' }, { status: 400 })

  const body = crmSettingsSchema.safeParse(await req.json())
  if (!body.success) return NextResponse.json({ error: body.error.flatten() }, { status: 422 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('establishments')
    .update(body.data)
    .eq('id', profile.establishment_id)
    .select('brevo_sender_name, google_review_url, sms_credits')
    .single()

  if (error) return NextResponse.json({ error: 'Mise à jour échouée' }, { status: 500 })
  return NextResponse.json(data)
}
```

- [ ] **Step 2: Create the CRM settings form component**

```typescript
// src/app/dashboard/settings/_components/crm-settings-form.tsx
'use client'
import { useState } from 'react'

interface Props {
  initialSenderName: string
  initialReviewUrl: string
  smsCredits: number
}

export function CrmSettingsForm({ initialSenderName, initialReviewUrl, smsCredits }: Props) {
  const [senderName, setSenderName] = useState(initialSenderName)
  const [reviewUrl, setReviewUrl]   = useState(initialReviewUrl)
  const [saving, setSaving]         = useState(false)
  const [error, setError]           = useState<string | null>(null)
  const [saved, setSaved]           = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true); setError(null); setSaved(false)

    const res = await fetch('/api/settings/crm', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        brevo_sender_name: senderName || undefined,
        google_review_url: reviewUrl || '',
      }),
    })
    setSaving(false)
    if (!res.ok) {
      const data = await res.json() as { error?: string }
      setError(data.error ?? 'Erreur')
      return
    }
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5 max-w-lg">
      <div
        className="p-4 rounded-[10px]"
        style={{ background: 'rgba(59,130,246,0.07)', border: '1px solid rgba(59,130,246,0.15)' }}
      >
        <div className="text-xs font-semibold text-[var(--text3)] uppercase tracking-wide mb-1">
          Crédits SMS restants
        </div>
        <div className="text-2xl font-bold text-[var(--text1)]">{smsCredits} SMS</div>
        <p className="text-xs text-[var(--text3)] mt-1">
          Contactez Alloflow pour recharger vos crédits.
        </p>
      </div>

      <div>
        <label htmlFor="sender" className="block text-sm font-medium text-[var(--text2)] mb-1.5">
          Nom expéditeur SMS <span className="text-[var(--text3)]">(max 11 caractères)</span>
        </label>
        <input
          id="sender"
          type="text"
          maxLength={11}
          value={senderName}
          onChange={e => setSenderName(e.target.value.replace(/[^A-Za-z0-9]/g, ''))}
          placeholder="MonCafe"
          className="w-full rounded-lg px-3 py-2 text-sm text-[var(--text1)] bg-[var(--surface2)] border border-[var(--border)] focus:outline-none focus:ring-2 focus:ring-[var(--blue)]"
        />
        <p className="text-xs text-[var(--text3)] mt-1">
          Apparaît comme expéditeur sur le téléphone du client. Alphanumerique uniquement.
        </p>
      </div>

      <div>
        <label htmlFor="review-url" className="block text-sm font-medium text-[var(--text2)] mb-1.5">
          Lien avis Google
        </label>
        <input
          id="review-url"
          type="url"
          value={reviewUrl}
          onChange={e => setReviewUrl(e.target.value)}
          placeholder="https://g.page/r/VOTRE_PLACE_ID/review"
          className="w-full rounded-lg px-3 py-2 text-sm text-[var(--text1)] bg-[var(--surface2)] border border-[var(--border)] focus:outline-none focus:ring-2 focus:ring-[var(--blue)]"
        />
        <p className="text-xs text-[var(--text3)] mt-1">
          Depuis Google Business → Obtenir plus d&apos;avis → copier le lien.
        </p>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}
      {saved && <p className="text-sm text-green-400">Paramètres sauvegardés ✓</p>}

      <button
        type="submit"
        disabled={saving}
        className="self-start px-5 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
        style={{ background: 'var(--blue)' }}
      >
        {saving ? 'Enregistrement...' : 'Enregistrer'}
      </button>
    </form>
  )
}
```

- [ ] **Step 3: Create the settings page**

```typescript
// src/app/dashboard/settings/page.tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { CrmSettingsForm } from './_components/crm-settings-form'

export default async function SettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('establishment_id').eq('id', user.id).single()
  if (!profile?.establishment_id) redirect('/dashboard')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: estab } = await (supabase as any)
    .from('establishments')
    .select('brevo_sender_name, google_review_url, sms_credits')
    .eq('id', profile.establishment_id)
    .single()

  return (
    <div className="max-w-2xl mx-auto py-8 px-4">
      <h1 className="text-xl font-semibold text-[var(--text1)] mb-6">Paramètres</h1>

      <div
        className="rounded-[14px] overflow-hidden"
        style={{ border: '1px solid var(--border)' }}
      >
        {/* Tab header */}
        <div
          className="px-5 py-3 border-b border-[var(--border)]"
          style={{ background: 'var(--surface2)' }}
        >
          <span
            className="text-sm font-medium px-3 py-1.5 rounded-lg text-white"
            style={{ background: 'var(--blue)' }}
          >
            📱 CRM & Communications
          </span>
        </div>

        <div className="p-5" style={{ background: 'var(--surface)' }}>
          <CrmSettingsForm
            initialSenderName={estab?.brevo_sender_name ?? ''}
            initialReviewUrl={estab?.google_review_url ?? ''}
            smsCredits={estab?.sms_credits ?? 0}
          />
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Enable Settings link in sidebar**

In `src/app/dashboard/_components/sidebar.tsx`, replace the disabled Settings `<div>` at the bottom with an actual `<Link>`:

```tsx
{/* Settings — was disabled, now enabled */}
<Link
  href={SETTINGS_ITEM.href}
  title={SETTINGS_ITEM.label}
  onClick={() => setMobileOpen(false)}
  className={[
    'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
    pathname.startsWith(SETTINGS_ITEM.href)
      ? 'text-white'
      : 'text-[var(--text2)] hover:bg-[var(--surface2)]',
  ].join(' ')}
  style={pathname.startsWith(SETTINGS_ITEM.href) ? { background: 'var(--blue)' } : undefined}
>
  <span className="flex-shrink-0">{SETTINGS_ITEM.icon}</span>
  <span className="md:hidden lg:block">{SETTINGS_ITEM.label}</span>
</Link>
```

- [ ] **Step 5: Verify compilation**

```bash
npx tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add src/app/dashboard/settings/ src/app/api/settings/ src/app/dashboard/_components/sidebar.tsx
git commit -m "feat(crm): add /dashboard/settings page with CRM tab + enable sidebar link"
```

---

### Task 11: Automation rules API + config page

**Files:**
- Create: `src/app/api/automation-rules/route.ts`
- Create: `src/app/dashboard/crm/campagnes/automations/page.tsx`
- Create: `src/app/dashboard/crm/campagnes/automations/_components/automation-rules-form.tsx`

- [ ] **Step 1: Create the automation rules API**

```typescript
// src/app/api/automation-rules/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

const ruleSchema = z.object({
  trigger_type:  z.enum(['welcome', 'birthday', 'reactivation', 'lost', 'google_review', 'tier_upgrade']),
  channel:       z.enum(['sms', 'whatsapp', 'email']),
  delay_hours:   z.number().int().min(0).max(168),
  template_body: z.string().min(1).max(160),
  active:        z.boolean(),
})

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles').select('establishment_id').eq('id', user.id).single()
  if (!profile?.establishment_id) return NextResponse.json({ rules: [] })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: rules } = await (supabase as any)
    .from('automation_rules')
    .select('*')
    .eq('establishment_id', profile.establishment_id)
    .order('trigger_type')

  return NextResponse.json({ rules: rules ?? [] })
}

export async function PUT(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles').select('establishment_id').eq('id', user.id).single()
  if (!profile?.establishment_id) return NextResponse.json({ error: 'Établissement non trouvé' }, { status: 400 })

  const body = ruleSchema.safeParse(await req.json())
  if (!body.success) return NextResponse.json({ error: body.error.flatten() }, { status: 422 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('automation_rules')
    .upsert({
      establishment_id: profile.establishment_id,
      ...body.data,
    }, { onConflict: 'establishment_id,trigger_type' })
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: 'Sauvegarde échouée' }, { status: 500 })
  return NextResponse.json(data)
}
```

- [ ] **Step 2: Create the automation rules config UI**

```typescript
// src/app/dashboard/crm/campagnes/automations/_components/automation-rules-form.tsx
'use client'
import { useState } from 'react'

interface AutomationRule {
  id?: string
  trigger_type: string
  channel: string
  delay_hours: number
  template_body: string
  active: boolean
}

interface Props {
  initialRules: AutomationRule[]
  googleReviewUrl: string | null
  senderName: string | null
  smsCredits: number
}

const TRIGGER_LABELS: Record<string, { icon: string; label: string; desc: string; defaultDelay: number; defaultMsg: string }> = {
  welcome:      { icon: '🆕', label: 'Bienvenue',         desc: 'Après la 1ère commande',          defaultDelay: 1,  defaultMsg: 'Bienvenue {{prenom}} chez {{etablissement}} ! Merci pour ta 1ère visite. À très vite !' },
  birthday:     { icon: '🎂', label: 'Anniversaire',       desc: '2 jours avant le jour J (10h)',   defaultDelay: 48, defaultMsg: 'Joyeux anniversaire {{prenom}} ! Viens fêter ça chez {{etablissement}} — une surprise t\'attend 🎉' },
  reactivation: { icon: '⚠️', label: 'Réactivation',      desc: 'Client À risque (30j sans visite)', defaultDelay: 0,  defaultMsg: 'On ne t\'a pas vu depuis un moment {{prenom}} ! Reviens chez {{etablissement}}, tu nous manques ☕' },
  lost:         { icon: '💤', label: 'Client perdu',       desc: 'Client Perdu (60j sans visite)',   defaultDelay: 0,  defaultMsg: '{{prenom}}, ça fait longtemps ! 😢 Reviens chez {{etablissement}} avec une offre spéciale te attend.' },
  google_review: { icon: '⭐', label: 'Avis Google',       desc: '1h après un paiement',             defaultDelay: 1,  defaultMsg: 'Merci pour ta visite chez {{etablissement}} {{prenom}} ! Un avis nous aiderait beaucoup : {{lien_avis}}' },
  tier_upgrade:  { icon: '👑', label: 'Passage de niveau', desc: 'Lors du passage de tier',          defaultDelay: 0,  defaultMsg: '{{prenom}}, tu viens de passer {{tier}} chez {{etablissement}} 🎉 Bravo !' },
}

export function AutomationRulesForm({ initialRules, googleReviewUrl, senderName, smsCredits }: Props) {
  const [rules, setRules] = useState<Record<string, AutomationRule>>(() => {
    const map: Record<string, AutomationRule> = {}
    for (const r of initialRules) map[r.trigger_type] = r
    return map
  })
  const [saving, setSaving] = useState<string | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})

  function getRule(trigger: string): AutomationRule {
    return rules[trigger] ?? {
      trigger_type: trigger,
      channel: 'sms',
      delay_hours: TRIGGER_LABELS[trigger]?.defaultDelay ?? 0,
      template_body: TRIGGER_LABELS[trigger]?.defaultMsg ?? '',
      active: false,
    }
  }

  async function saveRule(trigger: string) {
    const rule = getRule(trigger)
    setSaving(trigger)
    setErrors(prev => ({ ...prev, [trigger]: '' }))

    const res = await fetch('/api/automation-rules', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(rule),
    })
    setSaving(null)
    if (!res.ok) {
      const data = await res.json() as { error?: string }
      setErrors(prev => ({ ...prev, [trigger]: data.error ?? 'Erreur' }))
      return
    }
    const saved = await res.json() as AutomationRule
    setRules(prev => ({ ...prev, [trigger]: saved }))
  }

  function update(trigger: string, field: keyof AutomationRule, value: unknown) {
    setRules(prev => ({
      ...prev,
      [trigger]: { ...getRule(trigger), [field]: value },
    }))
  }

  const missing = !senderName || !googleReviewUrl

  return (
    <div className="flex flex-col gap-4">
      {/* Setup warnings */}
      {smsCredits <= 0 && (
        <div className="p-3 rounded-lg text-sm text-amber-300" style={{ background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.25)' }}>
          ⚠️ Crédits SMS épuisés — contactez Alloflow pour recharger
        </div>
      )}
      {missing && (
        <div className="p-3 rounded-lg text-sm text-blue-300" style={{ background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.2)' }}>
          📡 Configurez votre <a href="/dashboard/settings" className="underline">nom expéditeur SMS et lien Google</a> pour activer les automations.
        </div>
      )}

      {Object.entries(TRIGGER_LABELS).map(([trigger, meta]) => {
        const rule = getRule(trigger)
        return (
          <div key={trigger} className="rounded-[12px] p-4" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="text-sm font-semibold text-[var(--text1)]">{meta.icon} {meta.label}</div>
                <div className="text-xs text-[var(--text3)]">{meta.desc}</div>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={rule.active}
                  onChange={e => update(trigger, 'active', e.target.checked)}
                  className="w-4 h-4 rounded accent-[var(--blue)]"
                />
                <span className="text-xs text-[var(--text2)]">{rule.active ? 'Actif' : 'Inactif'}</span>
              </label>
            </div>

            <textarea
              value={rule.template_body}
              onChange={e => update(trigger, 'template_body', e.target.value)}
              rows={2}
              maxLength={160}
              className="w-full rounded-lg px-3 py-2 text-sm text-[var(--text1)] bg-[var(--surface)] border border-[var(--border)] focus:outline-none focus:ring-1 focus:ring-[var(--blue)] resize-none mb-3"
              placeholder="Votre message avec {{prenom}}, {{etablissement}}, {{points}}..."
            />
            <div className="text-right text-[10px] text-[var(--text4)] -mt-2 mb-3">{rule.template_body.length}/160</div>

            {errors[trigger] && <p className="text-xs text-red-400 mb-2">{errors[trigger]}</p>}

            <button
              onClick={() => saveRule(trigger)}
              disabled={saving === trigger}
              className="px-4 py-1.5 rounded-lg text-xs font-medium text-white disabled:opacity-50"
              style={{ background: 'var(--blue)' }}
            >
              {saving === trigger ? 'Enregistrement...' : 'Enregistrer'}
            </button>
          </div>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 3: Create the automations page**

```typescript
// src/app/dashboard/crm/campagnes/automations/page.tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { AutomationRulesForm } from './_components/automation-rules-form'

export default async function AutomationsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('establishment_id').eq('id', user.id).single()
  if (!profile?.establishment_id) redirect('/dashboard')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [{ data: rules }, { data: estab }] = await Promise.all([
    (supabase as any).from('automation_rules').select('*').eq('establishment_id', profile.establishment_id),
    (supabase as any).from('establishments').select('brevo_sender_name, google_review_url, sms_credits').eq('id', profile.establishment_id).single(),
  ])

  return (
    <div className="max-w-2xl mx-auto py-8 px-4">
      <h1 className="text-xl font-semibold text-[var(--text1)] mb-2">Automations</h1>
      <p className="text-sm text-[var(--text3)] mb-6">
        Ces messages partent automatiquement quand la condition est déclenchée.
      </p>
      <AutomationRulesForm
        initialRules={rules ?? []}
        googleReviewUrl={estab?.google_review_url ?? null}
        senderName={estab?.brevo_sender_name ?? null}
        smsCredits={estab?.sms_credits ?? 0}
      />
    </div>
  )
}
```

- [ ] **Step 4: Add automations sub-item to CRM sidebar nav**

In `src/app/dashboard/_components/sidebar.tsx`, find the CRM `subItems` array and add the automations link so the page is reachable:

```typescript
{
  href: '/dashboard/crm',
  label: 'CRM',
  icon: '👥',
  subItems: [
    { href: '/dashboard/crm',                        label: 'Clients',     exact: true },
    { href: '/dashboard/crm/campagnes/automations',  label: 'Automations' },
    { href: '/dashboard/crm/programme',              label: 'Programme'   },
  ],
},
```

> **Note:** The full Campagnes + Persona sub-items are added in Sprint 9B. For now, just Automations is needed to make the page reachable.

- [ ] **Step 5: Verify compilation**

```bash
npx tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add src/app/api/automation-rules/ src/app/dashboard/crm/campagnes/ src/app/dashboard/_components/sidebar.tsx
git commit -m "feat(crm): add automation rules API + config page + sidebar link"
```

---

## Sprint 9A Complete

All foundation pieces are in place:
- ✅ DB migrations: new columns, tables, RFM trigger
- ✅ Brevo REST helper + template renderer
- ✅ `/api/communications/send` with credit deduction
- ✅ Customer GET/PATCH extended
- ✅ Customer profile enrichment form with RFM badge
- ✅ POS opt-in checkboxes
- ✅ Settings page CRM tab (sender name, Google review URL, credit balance)
- ✅ Automation rules API + config page

Proceed to Sprint 9B: `docs/superpowers/plans/2026-03-28-crm-v2-campaigns.md`
