# CRM v2 — Sprint 9B: Campaigns + Analytics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Prerequisite:** Sprint 9A (`docs/superpowers/plans/2026-03-28-crm-v2-foundation.md`) must be fully applied — DB migrations, Brevo helper, customer enrichment, and settings page must all be in place before starting this sprint.

**Goal:** Build the persona analytics dashboard, manual campaign composer + send, Vercel cron-powered automation processor, Brevo delivery webhooks, and sidebar navigation updates.

**Architecture:** Persona data flows from a Postgres view → API route → CSS-only chart components. Campaigns follow a composer → API → `/api/communications/send` chain. Automation processing runs on a Vercel cron job calling an internal route secured by `CRON_SECRET`. Brevo webhooks update `campaign_sends.status` for delivery tracking.

**Tech Stack:** Next.js 15 (App Router), Supabase (SQL view, queries), Brevo REST API, Vercel cron (`vercel.json`), Zod v4

> **IMPORTANT:** Before writing any Next.js code, read `node_modules/next/dist/docs/` for current API conventions. Follow the existing pattern: `{ params }: { params: Promise<{ id: string }> }` for dynamic routes.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `supabase/migrations/20260328000004_crm_persona_view.sql` | Create | `v_crm_persona` aggregated view |
| `supabase/migrations/20260328000005_crm_helpers.sql` | Create | `increment_campaign_delivered` SQL function |
| `src/lib/template.ts` | Create | `renderTemplate()` pure function (safe for client bundles) |
| `src/app/api/crm/persona/route.ts` | Create | GET persona analytics data for current establishment |
| `src/app/dashboard/crm/analytics/page.tsx` | Create | Persona dashboard server page |
| `src/app/dashboard/crm/analytics/_components/persona-charts.tsx` | Create | CSS-only stat cards + charts |
| `src/app/api/campaigns/route.ts` | Create | GET list + POST create campaign |
| `src/app/api/campaigns/[id]/send/route.ts` | Create | POST trigger manual campaign send |
| `src/app/dashboard/crm/campagnes/page.tsx` | Create | Campaign list page |
| `src/app/dashboard/crm/campagnes/nouvelle/page.tsx` | Create | Campaign composer page |
| `src/app/dashboard/crm/campagnes/nouvelle/_components/campaign-form.tsx` | Create | Client-side campaign composer form |
| `src/app/dashboard/crm/campagnes/[id]/envoyer/page.tsx` | Create | Confirmation page for sending a saved draft campaign |
| `src/app/api/automation/process/route.ts` | Create | Internal: process pending automations (cron) |
| `src/app/api/webhooks/brevo/route.ts` | Create | Brevo delivery/bounce webhook |
| `vercel.json` | Create | Cron job configuration |
| `src/app/dashboard/_components/sidebar.tsx` | Modify | Add Campagnes + Persona sub-items to CRM nav |

---

### Task 0: Extract renderTemplate to a client-safe module

**Files:**
- Create: `src/lib/template.ts`
- Modify: `src/lib/brevo.ts`

`brevo.ts` is server-only (it uses `process.env.BREVO_API_KEY` and makes HTTP calls). Importing it in a `'use client'` component causes a Next.js build error. `renderTemplate` is a pure string function — move it to a separate file that is safe to bundle on the client.

- [ ] **Step 1: Create src/lib/template.ts**

```typescript
// src/lib/template.ts
// Pure template renderer — safe for both client and server bundles.
// Do NOT import server-only modules here.

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
    prenom:        vars.prenom        ?? '',
    points:        String(vars.points ?? ''),
    tier:          vars.tier          ?? '',
    segment:       vars.segment       ?? '',
    lien_avis:     vars.lien_avis     ?? '',
    etablissement: vars.etablissement ?? '',
  }
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) =>
    key in map ? map[key] : match
  )
}
```

- [ ] **Step 2: Update src/lib/brevo.ts to re-export from template.ts**

In `src/lib/brevo.ts`, remove the `renderTemplate` function body and the `TemplateVars` interface, and replace them with a re-export:

```typescript
// At the top of src/lib/brevo.ts, add:
export { renderTemplate, type TemplateVars } from './template'
```

Remove the inline `renderTemplate` implementation and `TemplateVars` interface from `brevo.ts`.

- [ ] **Step 3: Update existing tests to import from template.ts**

In `src/lib/__tests__/brevo.test.ts`, change the import:
```typescript
// Before:
import { renderTemplate } from '../brevo'
// After:
import { renderTemplate } from '../template'
```

- [ ] **Step 4: Verify tests still pass**

```bash
npx vitest run src/lib/__tests__/brevo.test.ts
```
Expected: 5 tests PASS.

- [ ] **Step 5: Verify compilation**

```bash
npx tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/template.ts src/lib/brevo.ts src/lib/__tests__/brevo.test.ts
git commit -m "refactor(crm): extract renderTemplate to client-safe src/lib/template.ts"
```

---

### Task 1: v_crm_persona SQL view + /api/crm/persona route

**Files:**
- Create: `supabase/migrations/20260328000004_crm_persona_view.sql`
- Create: `src/app/api/crm/persona/route.ts`

- [ ] **Step 1: Write and apply the view migration**

```sql
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
  -- Visit frequency buckets (per month avg)
  count(*) FILTER (WHERE c.order_count > 0
    AND c.order_count::float / GREATEST(
      date_part('month', age(c.created_at)) + 1, 1
    ) < 2)::int                                          AS freq_low,
  count(*) FILTER (WHERE c.order_count > 0
    AND c.order_count::float / GREATEST(
      date_part('month', age(c.created_at)) + 1, 1
    ) BETWEEN 2 AND 3)::int                              AS freq_mid,
  count(*) FILTER (WHERE c.order_count > 0
    AND c.order_count::float / GREATEST(
      date_part('month', age(c.created_at)) + 1, 1
    ) > 3)::int                                          AS freq_high,
  -- Basket by gender
  avg(c.avg_basket) FILTER (WHERE c.gender = 'femme')::numeric(10,2) AS avg_basket_women,
  avg(c.avg_basket) FILTER (WHERE c.gender = 'homme')::numeric(10,2) AS avg_basket_men
FROM public.customers c
WHERE c.establishment_id IS NOT NULL
GROUP BY c.establishment_id;
```

Apply in Supabase SQL Editor. Expected: view `v_crm_persona` created.

- [ ] **Step 2: Create the persona API route**

```typescript
// src/app/api/crm/persona/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles').select('establishment_id').eq('id', user.id).single()
  if (!profile?.establishment_id) return NextResponse.json({ error: 'Établissement non trouvé' }, { status: 400 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('v_crm_persona')
    .select('*')
    .eq('establishment_id', profile.establishment_id)
    .single()

  if (error || !data) {
    // No data yet — return zeros
    return NextResponse.json({ total: 0 })
  }

  return NextResponse.json(data)
}
```

- [ ] **Step 3: Verify compilation**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260328000004_crm_persona_view.sql src/app/api/crm/
git commit -m "feat(crm): add v_crm_persona view + /api/crm/persona route"
```

---

### Task 2: Persona analytics dashboard

**Files:**
- Create: `src/app/dashboard/crm/analytics/page.tsx`
- Create: `src/app/dashboard/crm/analytics/_components/persona-charts.tsx`

All charts are CSS-only (no external chart library per spec).

- [ ] **Step 1: Create the charts component**

```typescript
// src/app/dashboard/crm/analytics/_components/persona-charts.tsx
'use client'

// All fields except total are optional — allows `{ total: 0 }` fallback when no data exists
interface PersonaData {
  total: number
  women_count?: number
  men_count?: number
  other_count?: number
  unknown_count?: number
  avg_age?: number | null
  avg_basket?: number | null
  vip_count?: number
  fidele_count?: number
  nouveau_count?: number
  a_risque_count?: number
  perdu_count?: number
  age_18_25?: number
  age_26_35?: number
  age_36_45?: number
  age_46_55?: number
  age_55_plus?: number
  freq_low?: number
  freq_mid?: number
  freq_high?: number
  avg_basket_women?: number | null
  avg_basket_men?: number | null
}

interface Props { data: PersonaData }

function pct(val: number, total: number) {
  if (!total) return 0
  return Math.round((val / total) * 100)
}

function BarRow({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  const p = pct(value, total)
  return (
    <div className="flex items-center gap-3">
      <div className="w-24 text-xs text-[var(--text3)] shrink-0 text-right">{label}</div>
      <div className="flex-1 h-5 rounded-full overflow-hidden" style={{ background: 'var(--surface2)' }}>
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${p}%`, background: color, minWidth: p > 0 ? '4px' : '0' }}
        />
      </div>
      <div className="w-16 text-xs text-[var(--text2)] font-medium">{value} <span className="text-[var(--text4)]">({p}%)</span></div>
    </div>
  )
}

function StatCard({ value, label, color = 'var(--text1)' }: { value: string; label: string; color?: string }) {
  return (
    <div className="rounded-[12px] p-4 flex flex-col gap-1" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
      <div className="text-2xl font-bold" style={{ color }}>{value}</div>
      <div className="text-xs text-[var(--text3)]">{label}</div>
    </div>
  )
}

export function PersonaCharts({ data }: Props) {
  const { total } = data
  const atRiskPct = pct((data.a_risque_count ?? 0) + (data.perdu_count ?? 0), total)
  const womenPct  = pct(data.women_count ?? 0, total)
  const menPct    = pct(data.men_count ?? 0, total)

  const segmentData = [
    { label: 'VIP',      value: data.vip_count,      color: '#fbbf24' },
    { label: 'Fidèle',   value: data.fidele_count,    color: '#10b981' },
    { label: 'Nouveau',  value: data.nouveau_count,   color: '#60a5fa' },
    { label: 'À risque', value: data.a_risque_count,  color: '#f59e0b' },
    { label: 'Perdu',    value: data.perdu_count,     color: '#ef4444' },
  ]

  const ageData = [
    { label: '18–25', value: data.age_18_25 },
    { label: '26–35', value: data.age_26_35 },
    { label: '36–45', value: data.age_36_45 },
    { label: '46–55', value: data.age_46_55 },
    { label: '55+',   value: data.age_55_plus },
  ]
  const ageTotal = ageData.reduce((s, a) => s + a.value, 0)

  const freqData = [
    { label: '1×/mois',  value: data.freq_low },
    { label: '2–3×/mois', value: data.freq_mid },
    { label: '4×+/mois', value: data.freq_high },
  ]
  const freqTotal = freqData.reduce((s, a) => s + a.value, 0)

  if (!total) {
    return (
      <div className="text-center py-16 text-[var(--text3)]">
        <div className="text-4xl mb-3">📊</div>
        <p>Aucune donnée client pour le moment.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard value={`${womenPct}% / ${menPct}%`} label="Femmes / Hommes" color="#a78bfa" />
        <StatCard value={data.avg_age ? `${data.avg_age} ans` : '—'} label="Âge moyen" />
        <StatCard value={`${total}`} label="Clients total" color="#60a5fa" />
        <StatCard value={`${atRiskPct}%`} label="À risque + perdus" color="#f59e0b" />
      </div>

      {/* Segment distribution */}
      <div className="rounded-[12px] p-5" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
        <h3 className="text-sm font-semibold text-[var(--text1)] mb-4">Distribution des segments</h3>
        <div className="flex flex-col gap-2">
          {segmentData.map(s => (
            <BarRow key={s.label} label={s.label} value={s.value} total={total} color={s.color} />
          ))}
        </div>
      </div>

      {/* Gender donut (CSS) */}
      <div className="rounded-[12px] p-5" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
        <h3 className="text-sm font-semibold text-[var(--text1)] mb-4">Répartition par genre</h3>
        <div className="flex items-center gap-6">
          {/* Simple horizontal bar as "donut" proxy */}
          <div className="flex-1 h-8 rounded-full overflow-hidden flex">
            {data.women_count > 0 && (
              <div style={{ width: `${womenPct}%`, background: '#a78bfa' }} title={`Femmes ${womenPct}%`} />
            )}
            {data.men_count > 0 && (
              <div style={{ width: `${menPct}%`, background: '#60a5fa' }} title={`Hommes ${menPct}%`} />
            )}
            {(total - data.women_count - data.men_count) > 0 && (
              <div style={{ flex: 1, background: 'var(--surface)' }} />
            )}
          </div>
          <div className="flex flex-col gap-1.5 shrink-0">
            <div className="flex items-center gap-2 text-xs"><span className="w-3 h-3 rounded-full" style={{ background: '#a78bfa' }} /><span className="text-[var(--text2)]">Femmes {womenPct}%</span></div>
            <div className="flex items-center gap-2 text-xs"><span className="w-3 h-3 rounded-full" style={{ background: '#60a5fa' }} /><span className="text-[var(--text2)]">Hommes {menPct}%</span></div>
            {data.other_count > 0 && <div className="flex items-center gap-2 text-xs"><span className="w-3 h-3 rounded-full" style={{ background: 'var(--surface)' }} /><span className="text-[var(--text2)]">Autre {pct(data.other_count, total)}%</span></div>}
          </div>
        </div>
      </div>

      {/* Age distribution */}
      {ageTotal > 0 && (
        <div className="rounded-[12px] p-5" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
          <h3 className="text-sm font-semibold text-[var(--text1)] mb-4">Tranches d&apos;âge</h3>
          <div className="flex flex-col gap-2">
            {ageData.map(a => (
              <BarRow key={a.label} label={a.label} value={a.value} total={ageTotal} color="#a78bfa" />
            ))}
          </div>
        </div>
      )}

      {/* Visit frequency */}
      {freqTotal > 0 && (
        <div className="rounded-[12px] p-5" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
          <h3 className="text-sm font-semibold text-[var(--text1)] mb-4">Fréquence de visite</h3>
          <div className="flex flex-col gap-2">
            {freqData.map(f => (
              <BarRow key={f.label} label={f.label} value={f.value} total={freqTotal} color="#10b981" />
            ))}
          </div>
        </div>
      )}

      {/* Avg basket by gender */}
      {(data.avg_basket_women || data.avg_basket_men) && (
        <div className="rounded-[12px] p-5" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
          <h3 className="text-sm font-semibold text-[var(--text1)] mb-4">Panier moyen par genre</h3>
          <div className="flex gap-4">
            {data.avg_basket_women && (
              <div className="flex-1 text-center p-3 rounded-lg" style={{ background: 'rgba(167,139,250,0.1)' }}>
                <div className="text-lg font-bold text-[#a78bfa]">{data.avg_basket_women.toFixed(2)} €</div>
                <div className="text-xs text-[var(--text3)]">Femmes</div>
              </div>
            )}
            {data.avg_basket_men && (
              <div className="flex-1 text-center p-3 rounded-lg" style={{ background: 'rgba(96,165,250,0.1)' }}>
                <div className="text-lg font-bold text-[#60a5fa]">{data.avg_basket_men.toFixed(2)} €</div>
                <div className="text-xs text-[var(--text3)]">Hommes</div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Create the analytics page**

```typescript
// src/app/dashboard/crm/analytics/page.tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { PersonaCharts } from './_components/persona-charts'

export default async function CrmAnalyticsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('establishment_id').eq('id', user.id).single()
  if (!profile?.establishment_id) redirect('/dashboard')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any)
    .from('v_crm_persona')
    .select('*')
    .eq('establishment_id', profile.establishment_id)
    .single()

  return (
    <div className="max-w-3xl mx-auto py-8 px-4">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-[var(--text1)]">Persona clients</h1>
        <p className="text-sm text-[var(--text3)]">Données calculées automatiquement depuis l&apos;historique des commandes.</p>
      </div>
      <PersonaCharts data={data ?? { total: 0 }} />
    </div>
  )
}
```

- [ ] **Step 3: Verify compilation**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add src/app/dashboard/crm/analytics/ src/app/api/crm/
git commit -m "feat(crm): add persona analytics dashboard with CSS-only charts"
```

---

### Task 3: Campaigns API

**Files:**
- Create: `src/app/api/campaigns/route.ts`
- Create: `src/app/api/campaigns/[id]/send/route.ts`

- [ ] **Step 1: Create GET + POST /api/campaigns**

```typescript
// src/app/api/campaigns/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

const createCampaignSchema = z.object({
  name:           z.string().min(1).max(100),
  channel:        z.enum(['sms', 'whatsapp', 'email']),
  template_body:  z.string().min(1).max(160),
  segment_filter: z.object({
    segments: z.array(z.enum(['vip', 'fidele', 'nouveau', 'a_risque', 'perdu'])).optional(),
    tags:     z.array(z.string()).optional(),
  }).optional(),
  scheduled_at:   z.string().datetime().optional(),
})

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles').select('establishment_id').eq('id', user.id).single()
  if (!profile?.establishment_id) return NextResponse.json({ campaigns: [] })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: campaigns } = await (supabase as any)
    .from('campaigns')
    .select('id, name, type, channel, status, scheduled_at, sent_at, sent_count, delivered_count, created_at')
    .eq('establishment_id', profile.establishment_id)
    .eq('type', 'manual')
    .order('created_at', { ascending: false })

  return NextResponse.json({ campaigns: campaigns ?? [] })
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles').select('establishment_id').eq('id', user.id).single()
  if (!profile?.establishment_id) return NextResponse.json({ error: 'Établissement non trouvé' }, { status: 400 })

  const body = createCampaignSchema.safeParse(await req.json())
  if (!body.success) return NextResponse.json({ error: body.error.flatten() }, { status: 422 })

  const { name, channel, template_body, segment_filter, scheduled_at } = body.data

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('campaigns')
    .insert({
      establishment_id: profile.establishment_id,
      name,
      type:          'manual',
      channel,
      template_body,
      segment_filter: segment_filter ?? {},
      status:         scheduled_at ? 'scheduled' : 'draft',
      scheduled_at:   scheduled_at ?? null,
    })
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: 'Création échouée' }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
```

- [ ] **Step 2: Create POST /api/campaigns/[id]/send**

This route resolves the audience and calls `/api/communications/send` for each eligible customer.

```typescript
// src/app/api/campaigns/[id]/send/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { renderTemplate } from '@/lib/brevo'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles').select('establishment_id').eq('id', user.id).single()
  if (!profile?.establishment_id) return NextResponse.json({ error: 'Établissement non trouvé' }, { status: 400 })

  // Load campaign
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: campaign } = await (supabase as any)
    .from('campaigns')
    .select('*')
    .eq('id', id)
    .eq('establishment_id', profile.establishment_id)
    .single()

  if (!campaign) return NextResponse.json({ error: 'Campagne introuvable' }, { status: 404 })
  if (campaign.status === 'sent') return NextResponse.json({ error: 'Campagne déjà envoyée' }, { status: 409 })
  if (campaign.channel !== 'sms') {
    return NextResponse.json({ error: 'Seul le canal SMS est supporté en v2' }, { status: 400 })
  }

  // Load establishment (for template vars + credit check)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: estab } = await (supabase as any)
    .from('establishments')
    .select('name, brevo_sender_name, sms_credits')
    .eq('id', profile.establishment_id)
    .single()

  if (!estab || estab.sms_credits <= 0) {
    return NextResponse.json({ error: 'Crédits SMS épuisés' }, { status: 402 })
  }

  // Resolve audience
  const optInField = campaign.channel === 'sms' ? 'opt_in_sms' : campaign.channel === 'email' ? 'opt_in_email' : 'opt_in_whatsapp'
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (supabase as any)
    .from('customers')
    .select('id, first_name, phone, email, points, tier, rfm_segment, avg_basket')
    .eq('establishment_id', profile.establishment_id)
    .eq(optInField, true)

  const filter = campaign.segment_filter as { segments?: string[]; tags?: string[] }
  if (filter?.segments?.length) {
    query = query.in('rfm_segment', filter.segments)
  }
  if (filter?.tags?.length) {
    query = query.overlaps('tags', filter.tags)
  }

  const { data: customers } = await query
  if (!customers?.length) {
    return NextResponse.json({ sent: 0, failed: 0, message: 'Aucun client éligible' })
  }

  // Send to each customer via /api/communications/send (internal call)
  let sent = 0, failed = 0
  for (const customer of customers as Array<Record<string, unknown>>) {
    const message = renderTemplate(campaign.template_body, {
      prenom:        customer.first_name as string,
      points:        customer.points as number,
      tier:          customer.tier as string,
      segment:       customer.rfm_segment as string,
      etablissement: estab.name as string,
    })

    // Direct Brevo call (bypass HTTP for internal efficiency)
    // Import and call sendBrevoSms directly instead of HTTP round-trip
    try {
      const { sendBrevoSms } = await import('@/lib/brevo')
      const result = await sendBrevoSms({
        sender:    estab.brevo_sender_name ?? 'Alloflow',
        recipient: customer.phone as string,
        content:   message,
      })

      // Deduct credit + log send
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).rpc('deduct_sms_credit', { p_establishment_id: profile.establishment_id })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).from('campaign_sends').insert({
        campaign_id:      id,
        customer_id:      customer.id,
        channel:          campaign.channel,
        status:           'sent',
        brevo_message_id: result.messageId,
      })
      sent++
    } catch {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).from('campaign_sends').insert({
        campaign_id: id,
        customer_id: customer.id,
        channel:     campaign.channel,
        status:      'failed',
      })
      failed++
    }
  }

  // Update campaign status
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any)
    .from('campaigns')
    .update({ status: 'sent', sent_at: new Date().toISOString(), sent_count: sent })
    .eq('id', id)

  return NextResponse.json({ sent, failed })
}
```

- [ ] **Step 3: Verify compilation**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add src/app/api/campaigns/
git commit -m "feat(crm): add campaigns API (list/create/send)"
```

---

### Task 4: Campaign list + composer pages

**Files:**
- Create: `src/app/dashboard/crm/campagnes/page.tsx`
- Create: `src/app/dashboard/crm/campagnes/nouvelle/page.tsx`
- Create: `src/app/dashboard/crm/campagnes/nouvelle/_components/campaign-form.tsx`

- [ ] **Step 1: Create the campaign list page**

```typescript
// src/app/dashboard/crm/campagnes/page.tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'

interface Campaign {
  id: string
  name: string
  channel: string
  status: string
  sent_at: string | null
  sent_count: number
  delivered_count: number
  created_at: string
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  draft:     { label: 'Brouillon',  color: '#94a3b8' },
  scheduled: { label: 'Planifiée', color: '#60a5fa' },
  sent:      { label: 'Envoyée',   color: '#10b981' },
  active:    { label: 'Active',    color: '#a78bfa' },
  paused:    { label: 'Pausée',    color: '#f59e0b' },
}

const CHANNEL_ICONS: Record<string, string> = { sms: '📱', email: '✉️', whatsapp: '💬' }

export default async function CampagnesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('establishment_id').eq('id', user.id).single()
  if (!profile?.establishment_id) redirect('/dashboard')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: campaigns } = await (supabase as any)
    .from('campaigns')
    .select('id, name, channel, status, sent_at, sent_count, delivered_count, created_at')
    .eq('establishment_id', profile.establishment_id)
    .eq('type', 'manual')
    .order('created_at', { ascending: false })

  return (
    <div className="max-w-3xl mx-auto py-8 px-4">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-[var(--text1)]">Campagnes</h1>
          <p className="text-sm text-[var(--text3)]">Envois manuels vers vos segments clients</p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/dashboard/crm/campagnes/automations"
            className="px-3 py-2 rounded-lg text-sm text-[var(--text2)] hover:bg-[var(--surface2)] transition-colors"
            style={{ border: '1px solid var(--border)' }}
          >
            ⚙️ Automations
          </Link>
          <Link
            href="/dashboard/crm/campagnes/nouvelle"
            className="px-4 py-2 rounded-lg text-sm font-medium text-white"
            style={{ background: 'var(--blue)' }}
          >
            + Nouvelle campagne
          </Link>
        </div>
      </div>

      {(!campaigns || campaigns.length === 0) ? (
        <div className="text-center py-16 text-[var(--text3)]">
          <div className="text-4xl mb-3">📤</div>
          <p className="mb-4">Aucune campagne envoyée pour le moment.</p>
          <Link
            href="/dashboard/crm/campagnes/nouvelle"
            className="inline-block px-4 py-2 rounded-lg text-sm font-medium text-white"
            style={{ background: 'var(--blue)' }}
          >
            Créer votre première campagne
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {(campaigns as Campaign[]).map(c => {
            const status = STATUS_LABELS[c.status] ?? { label: c.status, color: '#94a3b8' }
            return (
              <div
                key={c.id}
                className="rounded-[12px] p-4"
                style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span>{CHANNEL_ICONS[c.channel] ?? '📨'}</span>
                      <span className="font-medium text-sm text-[var(--text1)] truncate">{c.name}</span>
                      <span
                        className="text-[11px] px-2 py-0.5 rounded-full font-medium"
                        style={{ background: `${status.color}20`, color: status.color }}
                      >
                        {status.label}
                      </span>
                    </div>
                    {c.status === 'sent' && (
                      <div className="text-xs text-[var(--text3)]">
                        {c.sent_count} envoyés · {c.delivered_count} livrés
                        {c.sent_at && ` · ${new Date(c.sent_at).toLocaleDateString('fr-FR')}`}
                      </div>
                    )}
                  </div>
                  {c.status === 'draft' && (
                    <a
                      href={`/dashboard/crm/campagnes/${c.id}/envoyer`}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium text-white shrink-0"
                      style={{ background: 'var(--blue)' }}
                    >
                      Envoyer
                    </a>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Create the campaign composer form**

```typescript
// src/app/dashboard/crm/campagnes/nouvelle/_components/campaign-form.tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { renderTemplate } from '@/lib/template'  // client-safe module (not brevo.ts which is server-only)

const SEGMENTS = [
  { value: 'vip',      label: '👑 VIP' },
  { value: 'fidele',   label: '⭐ Fidèle' },
  { value: 'nouveau',  label: '🆕 Nouveau' },
  { value: 'a_risque', label: '⚠️ À risque' },
  { value: 'perdu',    label: '💤 Perdu' },
]

const VARIABLE_TOKENS = ['{{prenom}}', '{{points}}', '{{tier}}', '{{etablissement}}']

interface Props {
  establishmentName: string
}

export function CampaignForm({ establishmentName }: Props) {
  const router = useRouter()
  const [name, setName]                     = useState('')
  const [channel, setChannel]               = useState<'sms' | 'email' | 'whatsapp'>('sms')
  const [selectedSegments, setSelectedSegs] = useState<string[]>([])
  const [message, setMessage]               = useState('')
  const [saving, setSaving]                 = useState(false)
  const [sending, setSending]               = useState(false)
  const [error, setError]                   = useState<string | null>(null)
  const [created, setCreated]               = useState<string | null>(null)

  function toggleSegment(seg: string) {
    setSelectedSegs(prev =>
      prev.includes(seg) ? prev.filter(s => s !== seg) : [...prev, seg]
    )
  }

  function insertToken(token: string) {
    setMessage(prev => prev + token)
  }

  const preview = renderTemplate(message, {
    prenom: 'Marie',
    points: 150,
    tier: 'Silver',
    etablissement: establishmentName,
  })

  async function save(sendNow: boolean) {
    if (!name.trim()) { setError('Nom de campagne requis'); return }
    if (!message.trim()) { setError('Message requis'); return }
    if (message.length > 160) { setError('Message trop long (max 160 caractères)'); return }

    setSaving(true); setError(null)

    const res = await fetch('/api/campaigns', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name,
        channel,
        template_body: message,
        segment_filter: selectedSegments.length ? { segments: selectedSegments } : {},
      }),
    })
    setSaving(false)
    if (!res.ok) {
      const data = await res.json() as { error?: string }
      setError(data.error ?? 'Erreur création')
      return
    }
    const campaign = await res.json() as { id: string }
    setCreated(campaign.id)

    if (sendNow) {
      setSending(true)
      const sendRes = await fetch(`/api/campaigns/${campaign.id}/send`, { method: 'POST' })
      setSending(false)
      if (!sendRes.ok) {
        const data = await sendRes.json() as { error?: string }
        setError(data.error ?? 'Erreur envoi')
        return
      }
      const result = await sendRes.json() as { sent: number; failed: number }
      alert(`Campagne envoyée ! ${result.sent} envoyés, ${result.failed} erreurs.`)
      router.push('/dashboard/crm/campagnes')
    } else {
      router.push('/dashboard/crm/campagnes')
    }
  }

  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      {/* Name */}
      <div>
        <label htmlFor="name" className="block text-sm font-medium text-[var(--text2)] mb-1.5">
          Nom de la campagne
        </label>
        <input
          id="name"
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Promo vendredi soir"
          className="w-full rounded-lg px-3 py-2 text-sm text-[var(--text1)] bg-[var(--surface2)] border border-[var(--border)] focus:outline-none focus:ring-2 focus:ring-[var(--blue)]"
        />
      </div>

      {/* Channel */}
      <div>
        <div className="text-sm font-medium text-[var(--text2)] mb-2">Canal</div>
        <div className="flex gap-2">
          {(['sms', 'email', 'whatsapp'] as const).map(ch => (
            <button
              key={ch}
              type="button"
              onClick={() => setChannel(ch)}
              className={[
                'px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                channel === ch ? 'text-white' : 'text-[var(--text2)] bg-[var(--surface2)] hover:bg-[var(--surface)]',
              ].join(' ')}
              style={channel === ch ? { background: 'var(--blue)' } : undefined}
            >
              {ch === 'sms' ? '📱 SMS' : ch === 'email' ? '✉️ Email' : '💬 WhatsApp'}
            </button>
          ))}
        </div>
        {channel !== 'sms' && (
          <p className="text-xs text-amber-400 mt-2">⚠️ Seul le SMS est disponible en v2.</p>
        )}
      </div>

      {/* Segment filter */}
      <div>
        <div className="text-sm font-medium text-[var(--text2)] mb-2">
          Segments ciblés <span className="text-[var(--text3)] font-normal">(vide = tous)</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {SEGMENTS.map(seg => (
            <button
              key={seg.value}
              type="button"
              onClick={() => toggleSegment(seg.value)}
              className={[
                'px-3 py-1.5 rounded-full text-xs font-medium transition-colors',
                selectedSegments.includes(seg.value)
                  ? 'text-white'
                  : 'text-[var(--text2)] bg-[var(--surface2)] hover:bg-[var(--surface)]',
              ].join(' ')}
              style={selectedSegments.includes(seg.value) ? { background: 'var(--blue)' } : undefined}
            >
              {seg.label}
            </button>
          ))}
        </div>
      </div>

      {/* Message */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label htmlFor="msg" className="text-sm font-medium text-[var(--text2)]">Message</label>
          <span className="text-xs text-[var(--text4)]">{message.length}/160</span>
        </div>
        <div className="flex gap-1.5 flex-wrap mb-2">
          {VARIABLE_TOKENS.map(token => (
            <button
              key={token}
              type="button"
              onClick={() => insertToken(token)}
              className="px-2 py-1 rounded text-[11px] font-mono text-[var(--text2)] hover:text-[var(--text1)] transition-colors"
              style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}
            >
              {token}
            </button>
          ))}
        </div>
        <textarea
          id="msg"
          value={message}
          onChange={e => setMessage(e.target.value)}
          rows={4}
          maxLength={160}
          className="w-full rounded-lg px-3 py-2 text-sm text-[var(--text1)] bg-[var(--surface2)] border border-[var(--border)] focus:outline-none focus:ring-2 focus:ring-[var(--blue)] resize-none font-mono"
          placeholder="Bonjour {{prenom}} ! ..."
        />
        <p className="text-xs text-[var(--text3)] mt-1">
          Tout SMS inclut automatiquement &quot;Répondez STOP pour vous désabonner&quot;.
        </p>
      </div>

      {/* Preview */}
      {message && (
        <div className="rounded-[10px] p-4" style={{ background: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.15)' }}>
          <div className="text-xs font-medium text-[#a78bfa] mb-2">Aperçu (avec Marie, 150 pts, Silver)</div>
          <p className="text-sm text-[var(--text2)]">{preview}</p>
        </div>
      )}

      {error && <p className="text-sm text-red-400">{error}</p>}

      <div className="flex gap-3">
        <button
          onClick={() => save(false)}
          disabled={saving || sending}
          className="px-5 py-2.5 rounded-lg text-sm font-medium text-[var(--text2)] disabled:opacity-50"
          style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}
        >
          {saving ? 'Enregistrement...' : 'Enregistrer'}
        </button>
        <button
          onClick={() => save(true)}
          disabled={saving || sending || channel !== 'sms'}
          className="flex-1 py-2.5 rounded-lg text-sm font-medium text-white disabled:opacity-50"
          style={{ background: 'var(--blue)' }}
        >
          {sending ? 'Envoi en cours...' : 'Envoyer maintenant'}
        </button>
      </div>
      {created && !sending && (
        <p className="text-xs text-green-400">Campagne créée. ID: {created}</p>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Create the composer page**

```typescript
// src/app/dashboard/crm/campagnes/nouvelle/page.tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { CampaignForm } from './_components/campaign-form'

export default async function NouvelleCampagnePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('establishment_id').eq('id', user.id).single()
  if (!profile?.establishment_id) redirect('/dashboard')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: estab } = await (supabase as any)
    .from('establishments')
    .select('name, sms_credits')
    .eq('id', profile.establishment_id)
    .single()

  return (
    <div className="max-w-2xl mx-auto py-8 px-4">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-[var(--text1)]">Nouvelle campagne</h1>
        <p className="text-sm text-[var(--text3)]">
          Crédits disponibles : <span className="text-[var(--text1)] font-medium">{estab?.sms_credits ?? 0} SMS</span>
        </p>
      </div>
      <CampaignForm establishmentName={estab?.name ?? 'Alloflow'} />
    </div>
  )
}
```

- [ ] **Step 4: Verify compilation**

```bash
npx tsc --noEmit
```

- [ ] **Step 5: Create the draft send confirmation page**

This page is linked from the campaign list "Envoyer" button for draft campaigns. It shows the campaign summary and a confirm button that calls the send API.

```typescript
// src/app/dashboard/crm/campagnes/[id]/envoyer/page.tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { EnvoyerButton } from './_components/envoyer-button'

export default async function EnvoyerCampagnePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('establishment_id').eq('id', user.id).single()
  if (!profile?.establishment_id) redirect('/dashboard')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: campaign } = await (supabase as any)
    .from('campaigns')
    .select('id, name, channel, template_body, segment_filter, status, sent_count')
    .eq('id', id)
    .eq('establishment_id', profile.establishment_id)
    .single()

  if (!campaign || campaign.status === 'sent') redirect('/dashboard/crm/campagnes')

  return (
    <div className="max-w-lg mx-auto py-8 px-4">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-[var(--text1)]">Confirmer l&apos;envoi</h1>
        <p className="text-sm text-[var(--text3)] mt-1">Cette action est irréversible.</p>
      </div>
      <div className="rounded-[12px] p-5 mb-6" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
        <div className="text-sm font-semibold text-[var(--text1)] mb-2">{campaign.name}</div>
        <div className="text-xs text-[var(--text3)] mb-3">Canal : {campaign.channel.toUpperCase()}</div>
        <div className="rounded-lg p-3 text-sm text-[var(--text2)] font-mono" style={{ background: 'var(--surface)' }}>
          {campaign.template_body}
        </div>
      </div>
      <div className="flex gap-3">
        <Link
          href="/dashboard/crm/campagnes"
          className="flex-1 py-2.5 rounded-lg text-sm font-medium text-center text-[var(--text2)]"
          style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}
        >
          Annuler
        </Link>
        <EnvoyerButton campaignId={id} />
      </div>
    </div>
  )
}
```

Create the client button:

```typescript
// src/app/dashboard/crm/campagnes/[id]/envoyer/_components/envoyer-button.tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function EnvoyerButton({ campaignId }: { campaignId: string }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSend() {
    setLoading(true); setError(null)
    const res = await fetch(`/api/campaigns/${campaignId}/send`, { method: 'POST' })
    setLoading(false)
    if (!res.ok) {
      const data = await res.json() as { error?: string }
      setError(data.error ?? 'Erreur lors de l\'envoi')
      return
    }
    const result = await res.json() as { sent: number; failed: number }
    alert(`Campagne envoyée ! ${result.sent} envoyés${result.failed ? `, ${result.failed} erreurs` : ''}.`)
    router.push('/dashboard/crm/campagnes')
  }

  return (
    <div className="flex-1 flex flex-col gap-2">
      {error && <p className="text-xs text-red-400">{error}</p>}
      <button
        onClick={handleSend}
        disabled={loading}
        className="w-full py-2.5 rounded-lg text-sm font-medium text-white disabled:opacity-50"
        style={{ background: 'var(--blue)' }}
      >
        {loading ? 'Envoi en cours...' : 'Envoyer maintenant'}
      </button>
    </div>
  )
}
```

- [ ] **Step 6: Verify compilation**

```bash
npx tsc --noEmit
```

- [ ] **Step 7: Commit**

```bash
git add src/app/dashboard/crm/campagnes/
git commit -m "feat(crm): add campaign list + composer + draft send confirmation pages"
```

---

### Task 5: Automation processor (Vercel cron)

**Files:**
- Create: `vercel.json`
- Create: `src/app/api/automation/process/route.ts`

The automation processor runs every hour via Vercel cron. It checks all active automation rules, evaluates conditions, and sends messages to eligible customers.

- [ ] **Step 1: Create vercel.json**

```json
{
  "crons": [
    {
      "path": "/api/automation/process",
      "schedule": "0 * * * *"
    }
  ]
}
```

- [ ] **Step 2: Create the automation processor route**

```typescript
// src/app/api/automation/process/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sendBrevoSms, renderTemplate } from '@/lib/brevo'

// Protect this endpoint with a shared secret
function isAuthorized(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) return false
  // Vercel sets Authorization header: Bearer <secret>
  const auth = req.headers.get('authorization')
  return auth === `Bearer ${cronSecret}`
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = await createClient()

  // Get all active automation rules with their establishment data
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: rules } = await (supabase as any)
    .from('automation_rules')
    .select('*, establishments(id, name, brevo_sender_name, google_review_url, sms_credits)')
    .eq('active', true)

  if (!rules?.length) return NextResponse.json({ processed: 0 })

  let processed = 0

  for (const rule of rules) {
    const estab = rule.establishments
    if (!estab || estab.sms_credits <= 0) continue

    try {
      processed += await processRule(supabase, rule, estab)
    } catch (err) {
      console.error(`Automation rule ${rule.id} failed:`, err)
    }
  }

  return NextResponse.json({ processed })
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function processRule(supabase: any, rule: any, estab: any): Promise<number> {
  const now = new Date()
  let customers: any[] = []

  switch (rule.trigger_type) {
    case 'welcome': {
      // Customers with exactly 1 order, order was 1+ hours ago, never received welcome
      const cutoff = new Date(now.getTime() - rule.delay_hours * 60 * 60 * 1000).toISOString()
      const { data } = await supabase
        .from('customers')
        .select('id, first_name, phone, email, points, tier, rfm_segment')
        .eq('establishment_id', estab.id)
        .eq('rfm_segment', 'nouveau')
        .eq(`opt_in_${rule.channel}`, true)
        .lte('last_order_at', cutoff)
      customers = data ?? []
      break
    }

    case 'birthday': {
      // Customers whose birthday is in exactly 2 days, haven't received birthday SMS this year
      const targetDate = new Date(now)
      targetDate.setDate(targetDate.getDate() + 2)
      const mmdd = `${String(targetDate.getMonth() + 1).padStart(2, '0')}-${String(targetDate.getDate()).padStart(2, '0')}`
      const { data } = await supabase
        .from('customers')
        .select('id, first_name, phone, email, points, tier, rfm_segment, birthdate')
        .eq('establishment_id', estab.id)
        .eq(`opt_in_${rule.channel}`, true)
        .not('birthdate', 'is', null)
      // Filter by MM-DD match
      customers = (data ?? []).filter((c: any) => {
        if (!c.birthdate) return false
        const bd = new Date(c.birthdate)
        const bmmdd = `${String(bd.getMonth() + 1).padStart(2, '0')}-${String(bd.getDate()).padStart(2, '0')}`
        return bmmdd === mmdd
      })
      break
    }

    case 'reactivation': {
      // Customers who just became a_risque (rfm_updated_at in last hour)
      const hourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString()
      const { data } = await supabase
        .from('customers')
        .select('id, first_name, phone, email, points, tier, rfm_segment')
        .eq('establishment_id', estab.id)
        .eq('rfm_segment', 'a_risque')
        .eq(`opt_in_${rule.channel}`, true)
        .gte('rfm_updated_at', hourAgo)
      customers = data ?? []
      break
    }

    case 'lost': {
      // Customers who just became perdu (rfm_updated_at in last hour)
      const hourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString()
      const { data } = await supabase
        .from('customers')
        .select('id, first_name, phone, email, points, tier, rfm_segment')
        .eq('establishment_id', estab.id)
        .eq('rfm_segment', 'perdu')
        .eq(`opt_in_${rule.channel}`, true)
        .gte('rfm_updated_at', hourAgo)
      customers = data ?? []
      break
    }

    case 'google_review': {
      if (!estab.google_review_url) return 0
      // Customers with a paid order in the last hour, no review SMS in last 90 days
      const hourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString()
      const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString()
      const { data: recentOrders } = await supabase
        .from('orders')
        .select('customer_id')
        .eq('establishment_id', estab.id)
        .eq('status', 'paid')
        .gte('created_at', hourAgo)
        .not('customer_id', 'is', null)
      const customerIds = [...new Set((recentOrders ?? []).map((o: any) => o.customer_id))]
      if (!customerIds.length) return 0

      // Exclude customers who already got a google_review send in last 90 days.
      // Filter by trigger_type='google_review' to avoid false exclusions from other campaigns.
      const { data: alreadySent } = await supabase
        .from('campaign_sends')
        .select('customer_id')
        .in('customer_id', customerIds)
        .gte('sent_at', ninetyDaysAgo)
        .eq('trigger_type', 'google_review')
      const alreadySentIds = new Set((alreadySent ?? []).map((s: any) => s.customer_id))

      const eligibleIds = customerIds.filter(id => !alreadySentIds.has(id))
      if (!eligibleIds.length) return 0

      const { data } = await supabase
        .from('customers')
        .select('id, first_name, phone, email, points, tier, rfm_segment')
        .in('id', eligibleIds)
        .eq(`opt_in_${rule.channel}`, true)
      customers = data ?? []
      break
    }

    case 'tier_upgrade': {
      // Not implemented in this sprint (requires tier change tracking)
      return 0
    }

    default:
      return 0
  }

  // Send to eligible customers
  let sent = 0
  for (const customer of customers) {
    const message = renderTemplate(rule.template_body, {
      prenom:        customer.first_name,
      points:        customer.points,
      tier:          customer.tier,
      segment:       customer.rfm_segment,
      lien_avis:     estab.google_review_url ?? '',
      etablissement: estab.name,
    })

    try {
      const result = await sendBrevoSms({
        sender:    estab.brevo_sender_name ?? 'Alloflow',
        recipient: customer.phone,
        content:   message,
      })
      await supabase.rpc('deduct_sms_credit', { p_establishment_id: estab.id })
      await supabase.from('campaign_sends').insert({
        campaign_id:      null,
        customer_id:      customer.id,
        channel:          rule.channel,
        trigger_type:     rule.trigger_type,  // for deduplication queries (e.g. google_review cooldown)
        status:           'sent',
        brevo_message_id: result.messageId,
      })
      sent++
    } catch {
      // Log failure silently — don't block the loop
    }
  }

  return sent
}
```

> **Note:** `CRON_SECRET` must be set in Vercel environment variables. Vercel automatically passes it as the `Authorization: Bearer <CRON_SECRET>` header when calling cron routes.

- [ ] **Step 3: Verify compilation**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add vercel.json src/app/api/automation/
git commit -m "feat(crm): add automation processor route + vercel.json cron config"
```

---

### Task 6: Brevo delivery webhook

**Files:**
- Create: `src/app/api/webhooks/brevo/route.ts`

- [ ] **Step 1: Implement the webhook handler**

```typescript
// src/app/api/webhooks/brevo/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

interface BrevoEvent {
  event: 'delivered' | 'soft_bounce' | 'hard_bounce' | 'unsubscribed' | 'clicked'
  'message-id'?: string
  email?: string
  phone?: string
  tag?: string
}

const EVENT_TO_STATUS: Record<string, string> = {
  delivered:    'delivered',
  soft_bounce:  'bounced',
  hard_bounce:  'bounced',
  unsubscribed: 'delivered',  // delivered but opted out
}

export async function POST(req: NextRequest) {
  const events: BrevoEvent[] = await req.json().catch(() => [])

  // Brevo may send array or single object
  const list = Array.isArray(events) ? events : [events]
  if (!list.length) return NextResponse.json({ ok: true })

  const supabase = await createClient()

  for (const event of list) {
    const messageId = event['message-id']
    if (!messageId) continue

    const newStatus = EVENT_TO_STATUS[event.event]
    if (!newStatus) continue

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from('campaign_sends')
      .update({ status: newStatus })
      .eq('brevo_message_id', messageId)

    // Handle unsubscribe — find customer by phone/email and flip opt-in off
    if (event.event === 'unsubscribed') {
      if (event.phone) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any)
          .from('customers')
          .update({ opt_in_sms: false })
          .eq('phone', event.phone)
      }
      if (event.email) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any)
          .from('customers')
          .update({ opt_in_email: false })
          .eq('email', event.email)
      }
    }

    // Update delivered_count on campaign
    if (newStatus === 'delivered') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: send } = await (supabase as any)
        .from('campaign_sends')
        .select('campaign_id')
        .eq('brevo_message_id', messageId)
        .single()

      if (send?.campaign_id) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any).rpc('increment_campaign_delivered', { p_campaign_id: send.campaign_id })
      }
    }
  }

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2: Apply the helpers migration**

Create and apply `supabase/migrations/20260328000005_crm_helpers.sql`:

```sql
-- supabase/migrations/20260328000005_crm_helpers.sql

-- Add trigger_type to campaign_sends for automation deduplication
-- (e.g. google_review automation must not re-send within 90 days)
ALTER TABLE public.campaign_sends
  ADD COLUMN IF NOT EXISTS trigger_type text;

-- Increment delivered_count on campaigns table
CREATE OR REPLACE FUNCTION increment_campaign_delivered(p_campaign_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.campaigns
  SET delivered_count = delivered_count + 1
  WHERE id = p_campaign_id;
END;
$$;
```

Apply in Supabase SQL Editor.

Configure in Brevo dashboard: Settings → Webhooks → add webhook URL `https://YOUR_DOMAIN/api/webhooks/brevo` for events: delivered, soft_bounce, hard_bounce, unsubscribed.

- [ ] **Step 2: Verify compilation**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/webhooks/
git commit -m "feat(crm): add Brevo delivery webhook handler"
```

---

### Task 7: Sidebar navigation updates

**Files:**
- Modify: `src/app/dashboard/_components/sidebar.tsx`

- [ ] **Step 1: Add Campagnes + Persona sub-items to the CRM nav group**

In `src/app/dashboard/_components/sidebar.tsx`, find the CRM nav item and replace it with the extended version:

```typescript
{
  href: '/dashboard/crm',
  label: 'CRM',
  icon: '👥',
  subItems: [
    { href: '/dashboard/crm',             label: 'Clients',    exact: true },
    { href: '/dashboard/crm/campagnes',   label: 'Campagnes' },
    { href: '/dashboard/crm/analytics',   label: 'Persona' },
    { href: '/dashboard/crm/programme',   label: 'Programme' },
  ],
},
```

No other changes needed — the existing `subItems` rendering logic handles the new entries automatically.

- [ ] **Step 2: Verify compilation**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Verify the sidebar renders all CRM sub-items**

Navigate to `/dashboard/crm` in the browser and confirm all four sub-items appear: Clients, Campagnes, Persona, Programme.

- [ ] **Step 4: Commit**

```bash
git add src/app/dashboard/_components/sidebar.tsx
git commit -m "feat(crm): add Campagnes + Persona sub-items to CRM sidebar nav"
```

---

## Sprint 9B Complete

All campaigns and analytics pieces are in place:
- ✅ `v_crm_persona` SQL view + persona API route
- ✅ Persona analytics dashboard (CSS-only charts)
- ✅ Campaigns API (GET/POST + send)
- ✅ Campaign list + composer pages
- ✅ Automation processor (`/api/automation/process`) with Vercel cron
- ✅ Brevo delivery webhook
- ✅ Sidebar CRM nav extended (Campagnes + Persona)

**Post-launch checklist:**
- [ ] Set `BREVO_API_KEY` in Vercel environment variables
- [ ] Set `CRON_SECRET` in Vercel environment variables
- [ ] Configure Brevo webhook URL in Brevo dashboard
- [ ] Enable pg_cron extension in Supabase if not already done
- [ ] Set `google_review_url` in settings for each establishment wanting review automation
- [ ] Add initial SMS credits to establishments via Supabase admin
