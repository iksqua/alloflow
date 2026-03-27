# CRM Alloflow v2 — Design Spec

> **Status:** Approved for implementation
> **Date:** 2026-03-28
> **Scope:** Customer enrichment · RFM segmentation · Persona analytics · Campaigns (manual + automated) · Google Reviews · Brevo integration

---

## 1. Context & Goals

The current CRM (Sprint 6–8) has a basic customer list, loyalty points/tiers, and a POS modal for customer lookup. It lacks communication capabilities, customer profiling depth, and actionable segmentation.

**Goals of v2:**
- Enable the establishment to communicate directly with customers via SMS, WhatsApp, and Email through Brevo
- Auto-classify customers into behavioral segments (RFM) requiring zero manual effort
- Provide persona analytics (gender, age, visit frequency) to understand the customer base
- Automate high-value touchpoints (birthday, welcome, reactivation, Google review requests)
- Allow one-shot manual campaigns for promotions and announcements

---

## 2. Customer Profile Enrichment

### 2.1 New Fields on `customers` table

| Column | Type | Notes |
|---|---|---|
| `gender` | text nullable | `'homme'` \| `'femme'` \| `'autre'` \| null |
| `birthdate` | date nullable | Used for age analytics + birthday automation |
| `opt_in_sms` | boolean | Default false · RGPD consent |
| `opt_in_email` | boolean | Default false · RGPD consent |
| `opt_in_whatsapp` | boolean | Default false · RGPD consent |
| `opt_in_at` | timestamptz nullable | When consent was recorded |
| `tags` | text[] | Free labels: `['vip', 'influenceur', 'allergie-gluten']` |
| `rfm_segment` | text | `'vip'`\|`'fidele'`\|`'nouveau'`\|`'a_risque'`\|`'perdu'` — computed |
| `rfm_updated_at` | timestamptz | Last time rfm_segment was recalculated |
| `brevo_contact_id` | bigint nullable | Brevo contact ID for sync tracking |
| `last_order_at` | timestamptz nullable | Denormalized for fast RFM queries |
| `order_count` | int | Denormalized total order count |
| `avg_basket` | numeric(10,2) | Denormalized average order value |

### 2.2 RFM Segmentation Logic

Computed automatically by a Supabase trigger on `orders` (after status = 'paid') and by a daily `pg_cron` job for segment drift (customers who haven't ordered).

| Segment | Condition |
|---|---|
| `vip` | `last_order_at` ≤ 7 days ago AND ≥ 4 orders in last 90 days |
| `fidele` | `last_order_at` ≤ 30 days ago AND ≥ 2 orders in last 90 days |
| `nouveau` | `order_count` = 1 (any time) |
| `a_risque` | Last segment was `vip` or `fidele` AND `last_order_at` between 30–60 days ago |
| `perdu` | `last_order_at` > 60 days ago (or never ordered and created > 60 days ago) |

Priority order: `vip` → `fidele` → `a_risque` → `perdu` → `nouveau`.
`nouveau` applies only when no higher-priority segment matches — a customer with `order_count = 1` who hasn't ordered in 60+ days is classified as `perdu`, not `nouveau`.

### 2.3 New Fields on `establishments` table

| Column | Type | Notes |
|---|---|---|
| `google_review_url` | text nullable | e.g. `https://g.page/r/PLACE_ID/review` |
| `brevo_api_key` | text nullable | Stored encrypted; used for Brevo API calls |
| `brevo_sender_name` | text nullable | SMS sender name (11 chars max) |
| `brevo_sender_phone` | text nullable | WhatsApp sender number |

> **Security note:** `brevo_api_key` is readable only by the establishment's own profiles via RLS. Never exposed to clients.

---

## 3. Persona Analytics Dashboard

**Route:** `/dashboard/crm/analytics`

### 3.1 Metrics displayed

**Top stat cards (4):**
- Gender breakdown (% femmes / hommes / autre)
- Average customer age (from `birthdate`)
- Average visits per month (from `order_count` / months since creation)
- % at-risk customers (segment = `a_risque` + `perdu`)

**Charts (CSS-only, no external lib):**
- Segment distribution bar (VIP / Fidèle / Nouveau / À risque / Perdu)
- Age bracket distribution (18-25 / 26-35 / 36-45 / 46-55 / 55+)
- Gender split donut (CSS-based)
- Visit frequency histogram (1x / 2-3x / 4+x per month)
- Average basket by gender
- Best hours of visit (from `orders.created_at` hour buckets)

### 3.2 SQL Views

```sql
-- v_crm_persona: aggregated stats per establishment
create or replace view v_crm_persona with (security_invoker = true) as
select
  c.establishment_id,
  count(*) filter (where c.gender = 'femme')::int as women_count,
  count(*) filter (where c.gender = 'homme')::int as men_count,
  count(*) filter (where c.gender = 'autre')::int as other_count,
  avg(date_part('year', age(c.birthdate)))::numeric(4,1) as avg_age,
  avg(c.avg_basket)::numeric(10,2) as avg_basket,
  count(*) filter (where c.rfm_segment = 'vip')::int as vip_count,
  count(*) filter (where c.rfm_segment = 'fidele')::int as fidele_count,
  count(*) filter (where c.rfm_segment = 'nouveau')::int as nouveau_count,
  count(*) filter (where c.rfm_segment = 'a_risque')::int as a_risque_count,
  count(*) filter (where c.rfm_segment = 'perdu')::int as perdu_count,
  count(*)::int as total
from public.customers c
where c.establishment_id is not null
group by c.establishment_id;
```

---

## 4. Communications Infrastructure — Brevo

### 4.1 Integration approach

- **Per-establishment Brevo account** — each establishment provides their own Brevo API key, stored in `establishments.brevo_api_key`. Alloflow does not operate a shared Brevo account.
- **Brevo SDK** (`@getbrevo/brevo`) on the server side only
- **Channels:** SMS · Email · WhatsApp Business (same API, different endpoints)
- **Contact sync:** When a customer opts in, they are created/updated in Brevo with their establishment's list

### 4.2 Server-side send route

```
POST /api/communications/send
Body: { customerId, channel, message, templateVars? }
```

- Validates opt-in for channel
- Fetches customer phone/email
- Calls Brevo API
- Logs send in `campaign_sends`

### 4.3 Brevo Webhook (delivery tracking)

```
POST /api/webhooks/brevo
```

- Receives delivery/bounce/click events from Brevo
- Updates `campaign_sends.status` accordingly

---

## 5. Campaigns

### 5.1 Database schema

**`campaigns` table:**

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `establishment_id` | uuid FK | |
| `name` | text | e.g. "Promo Vendredi 28 mars" |
| `type` | text | `'manual'` \| `'automated'` |
| `trigger` | text nullable | For automated: `'birthday'` \| `'welcome'` \| `'reactivation'` \| `'lost'` \| `'tier_upgrade'` (google_review uses automation_rules only) |
| `channel` | text | `'sms'` \| `'whatsapp'` \| `'email'` |
| `template_body` | text | Message with `{{prenom}}`, `{{points}}`, `{{lien_avis}}` variables |
| `segment_filter` | jsonb | `{"segments": ["a_risque", "perdu"], "tags": ["vip"]}` |
| `status` | text | `'draft'` \| `'scheduled'` \| `'sent'` \| `'active'` \| `'paused'` |
| `scheduled_at` | timestamptz nullable | For planned sends |
| `sent_at` | timestamptz nullable | |
| `sent_count` | int default 0 | |
| `delivered_count` | int default 0 | |
| `created_at` | timestamptz | |

**`campaign_sends` table:**

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `campaign_id` | uuid FK | |
| `customer_id` | uuid FK | |
| `channel` | text | |
| `status` | text | `'pending'` \| `'sent'` \| `'delivered'` \| `'failed'` \| `'bounced'` |
| `brevo_message_id` | text nullable | For delivery tracking |
| `sent_at` | timestamptz | |

### 5.2 Manual campaign flow

1. `/dashboard/crm/campagnes` — list of sent + draft campaigns
2. "Nouvelle campagne" button → `/dashboard/crm/campagnes/nouvelle`
3. Composer:
   - Name the campaign
   - Choose channel (SMS / WhatsApp / Email)
   - Choose target: all opt-in customers, by RFM segment, by tag, or combination
   - Write message with variable tokens (`{{prenom}}`, `{{points}}`, etc.)
   - Preview with a real customer from the list
   - Audience count shown live ("43 clients ciblés · 38 avec opt-in SMS")
   - Send now OR schedule for a datetime
4. Confirmation → sends via `/api/campaigns/[id]/send`
5. Result page with sent/failed counts

### 5.3 Automated campaigns (Automation Rules)

**`automation_rules` table:**

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `establishment_id` | uuid FK | |
| `trigger_type` | text | See triggers below |
| `channel` | text | `'sms'` \| `'whatsapp'` \| `'email'` |
| `delay_hours` | int default 0 | e.g. 1 for "1h after order" |
| `template_body` | text | |
| `active` | boolean default true | |
| `created_at` | timestamptz | |

**Available triggers:**

| Trigger | When fired | Default delay |
|---|---|---|
| `welcome` | After customer's 1st paid order | 1 hour |
| `birthday` | Customer birthdate | 2 days before (at 10:00) |
| `reactivation` | Customer reaches `a_risque` segment | Immediately on segment change |
| `lost` | Customer reaches `perdu` segment | Immediately on segment change |
| `google_review` | After any paid order (with existing customer) | 1 hour |
| `tier_upgrade` | Customer tier changes (standard→silver→gold) | Immediately |

**Execution:** Supabase `pg_cron` job runs every hour, calls `/api/automation/process` (internal route protected by a secret header). The processor queries `automation_rules` (active=true), evaluates trigger conditions against customers, checks `campaign_sends` to avoid duplicates (e.g., `google_review` not sent in last 90 days), then calls `/api/communications/send` for each eligible customer.

### 5.4 Template variables

| Token | Replaced with |
|---|---|
| `{{prenom}}` | Customer first name |
| `{{points}}` | Customer current loyalty points |
| `{{tier}}` | Customer tier (Standard / Silver / Gold) |
| `{{segment}}` | RFM segment label |
| `{{lien_avis}}` | Establishment's `google_review_url` |
| `{{etablissement}}` | Establishment name |

---

## 6. Google Reviews Automation

The `google_review` automation trigger sends a message 1 hour after a paid order if:
- The customer has opted in to the channel
- The establishment has a `google_review_url` configured
- The customer has not already received a Google review request in the last 90 days (tracked via `campaign_sends`)

**Message example (SMS):**
> "Bonjour {{prenom}} ! Merci pour ta visite chez {{etablissement}} ☕ Si tu as un moment, ton avis nous aiderait beaucoup : {{lien_avis}} — À très vite !"

The Google review URL is configured in `/dashboard/settings?tab=crm` (added to the Settings sprint).

---

## 7. Pages & Routes

### New pages

| Route | Type | Description |
|---|---|---|
| `/dashboard/crm` | Enhanced | Add RFM segment badges, persona stat cards at top |
| `/dashboard/crm/[id]` | Enhanced | Add gender, birthdate, opt-ins, tags, rfm badge, avg basket |
| `/dashboard/crm/analytics` | New | Persona dashboard (stats + charts) |
| `/dashboard/crm/campagnes` | New | Campaign list (manual + automation rules) |
| `/dashboard/crm/campagnes/nouvelle` | New | Campaign composer |

### New API routes

| Route | Method | Description |
|---|---|---|
| `/api/customers/[id]` | PATCH | Update profile, tags, opt-ins, new fields |
| `/api/campaigns` | GET, POST | List + create campaigns |
| `/api/campaigns/[id]/send` | POST | Trigger send for a manual campaign |
| `/api/automation-rules` | GET, PUT | List + upsert automation rules |
| `/api/automation/process` | POST | Internal: process pending automations (called by cron) |
| `/api/communications/send` | POST | Internal: send a single message via Brevo |
| `/api/webhooks/brevo` | POST | Brevo delivery webhooks |
| `/api/crm/persona` | GET | Persona analytics data |

---

## 8. RGPD Compliance

- Opt-in checkboxes on customer creation (POS modal) and in the customer detail page
- Consent date recorded in `opt_in_at`
- Every automated message includes an opt-out instruction: "Répondez STOP pour vous désabonner"
- Campaigns only target customers with `opt_in_{channel} = true`
- Brevo handles unsubscribe webhooks → `/api/webhooks/brevo` updates the opt-in to false

---

## 9. Admin Self-Service Setup (per establishment)

All CRM communication settings are configured **by the establishment admin themselves** from the dashboard — no Alloflow intervention required. This applies to every establishment they manage.

### 9.1 Settings page — CRM tab (`/dashboard/settings?tab=crm`)

A dedicated CRM configuration section is added to the existing settings page (Sprint 9 / Settings sprint). Admins can configure:

| Setting | Field | Notes |
|---|---|---|
| Clé API Brevo | `brevo_api_key` | Masked after save · "Tester la connexion" button |
| Nom expéditeur SMS | `brevo_sender_name` | Max 11 chars alphanumeric |
| Numéro WhatsApp | `brevo_sender_phone` | E.164 format |
| Lien avis Google | `google_review_url` | Paste from Google Business dashboard |

### 9.2 First-time setup flow

When an admin accesses `/dashboard/crm/campagnes` or `/dashboard/crm/analytics` for the first time without Brevo configured, a **setup banner** is shown:

> "📡 Configurez votre compte Brevo pour activer les campagnes SMS et WhatsApp → [Paramètres CRM]"

When the `google_review` automation is enabled without a review URL, the automation rule page shows an inline warning:

> "⚠ Ajoutez votre lien Google Business dans les paramètres pour activer cette automation → [Paramètres]"

### 9.3 Multi-establishment support

Each `establishment` row stores its own `brevo_api_key` and `google_review_url` independently. An admin who manages multiple establishments configures each one separately via the establishment switcher (already in sidebar). Settings are always scoped to the current active establishment.

---

## 10. Sidebar Navigation

Add under CRM section:
- **CRM** (existing) → client list
- **Campagnes** → `/dashboard/crm/campagnes`
- **Persona** → `/dashboard/crm/analytics`
- **Programme fidélité** → `/dashboard/crm/programme` (existing)

---

## 12. Out of Scope (v2)

- WhatsApp 2-way inbox (inbound message management) → future sprint
- Advanced campaign A/B testing
- Brevo template library (rich HTML emails) — v2 uses plain text/SMS only
- Customer photo upload
- Point of sale opt-in QR code poster
- Push notifications (PWA)

---

## 13. Implementation Order (suggested sprint split)

**Sprint 9A — Foundation:**
- DB migrations (new columns, RFM trigger, pg_cron job)
- Customer profile enrichment (form updates)
- Settings page CRM tab (Brevo key + sender name + Google review URL) — self-service per establishment
- Brevo SDK integration + `/api/communications/send`
- Automation rules config page (with setup banners for unconfigured establishments)

**Sprint 9B — Campaigns + Analytics:**
- Persona analytics dashboard
- Manual campaign composer + send
- Automation processing (cron job)
- Google review automation
- Brevo webhook handler
- Sidebar updates
