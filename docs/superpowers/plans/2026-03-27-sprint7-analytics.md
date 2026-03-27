# Sprint 7 — Analytics & Reporting — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Analytics module — a KPI dashboard and a detailed sales report — giving restaurant/coffee shop managers a clear view of their commercial performance, top products, rush hours, and VAT accounting.

**Architecture:** Server Components fetch aggregated data from Supabase using `searchParams` for period filtering (URL-driven). A thin Client Component wrapper handles column sorting in the report table. CSV export is generated client-side from loaded data. No external charting library — bar charts are pure CSS flexbox. Navigation sidebar gains an Analytics link with sub-navigation.

**Tech Stack:** Next.js 16 App Router, Supabase PostgreSQL, TypeScript, Tailwind CSS

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `supabase/migrations/20260327000006_analytics_views.sql` | SQL views for analytics aggregations |
| Create | `src/lib/analytics/queries.ts` | Supabase query functions with period filter |
| Create | `src/lib/analytics/types.ts` | TypeScript types for analytics data |
| Create | `src/lib/analytics/csv.ts` | CSV export utility |
| Create | `src/app/dashboard/analytics/page.tsx` | Dashboard Analytics — Server Component |
| Create | `src/app/dashboard/analytics/_components/kpi-cards.tsx` | 4 KPI cards row |
| Create | `src/app/dashboard/analytics/_components/ca-bar-chart.tsx` | CA 30-day bar chart (pure CSS) |
| Create | `src/app/dashboard/analytics/_components/rush-hours.tsx` | Heures de pointe horizontal bars |
| Create | `src/app/dashboard/analytics/_components/top-products.tsx` | Top 5 products list |
| Create | `src/app/dashboard/analytics/_components/network-snapshot.tsx` | Multi-site CA snapshot card |
| Create | `src/app/dashboard/analytics/_components/period-picker.tsx` | Client Component: period pills + site select |
| Create | `src/app/dashboard/analytics/report/page.tsx` | Rapport ventes — Server Component |
| Create | `src/app/dashboard/analytics/report/_components/report-table.tsx` | Client Component: sortable transactions table |
| Create | `src/app/dashboard/analytics/report/_components/tva-summary.tsx` | Right sidebar TVA recap card |
| Create | `src/app/dashboard/analytics/report/_components/payment-split.tsx` | Right sidebar payment breakdown |
| Create | `src/app/dashboard/analytics/report/_components/export-buttons.tsx` | CSV / print export buttons |
| Modify | `src/app/dashboard/_components/sidebar.tsx` | Add Analytics nav item + sub-links |

---

## Task 1 — DB Types + Supabase Queries

**Files:**
- Create: `supabase/migrations/20260327000006_analytics_views.sql`
- Create: `src/lib/analytics/types.ts`
- Create: `src/lib/analytics/queries.ts`

### Step 1.1 — SQL views for analytics

- [ ] Create the migration file with optimized views:

```sql
-- supabase/migrations/20260327000006_analytics_views.sql

-- View: daily CA for bar chart (last 90 days)
create or replace view public.v_daily_ca as
select
  date_trunc('day', created_at at time zone 'Europe/Paris') as day,
  establishment_id,
  count(*)::int                                              as tx_count,
  sum(total_ttc)                                            as ca_ttc,
  sum(total_ht)                                             as ca_ht,
  sum(tva_amount)                                           as tva_total
from public.orders
where status = 'paid'
  and created_at >= now() - interval '90 days'
group by 1, 2;

-- View: hourly transaction count (for rush hours)
create or replace view public.v_hourly_tx as
select
  extract(hour from created_at at time zone 'Europe/Paris')::int as hour,
  establishment_id,
  count(*)::int as tx_count
from public.orders
where status = 'paid'
  and created_at >= now() - interval '30 days'
group by 1, 2;

-- View: top products by quantity
create or replace view public.v_top_products as
select
  oi.product_id,
  p.name                     as product_name,
  o.establishment_id,
  sum(oi.quantity)::int      as qty_sold,
  sum(oi.quantity * oi.unit_price_ttc) as ca_ttc
from public.order_items oi
join public.orders o    on o.id = oi.order_id
join public.products p  on p.id = oi.product_id
where o.status = 'paid'
  and o.created_at >= now() - interval '30 days'
group by 1, 2, 3;

-- View: TVA breakdown per order (5.5 / 10 / 20)
-- assumes tva_rate column on order_items; falls back to 10% if null
create or replace view public.v_tva_breakdown as
select
  o.establishment_id,
  date_trunc('day', o.created_at at time zone 'Europe/Paris') as day,
  coalesce(oi.tva_rate, 10)              as tva_rate,
  sum(oi.quantity * oi.unit_price_ttc / (1 + coalesce(oi.tva_rate, 10) / 100.0)) as base_ht,
  sum(oi.quantity * oi.unit_price_ttc)
    - sum(oi.quantity * oi.unit_price_ttc / (1 + coalesce(oi.tva_rate, 10) / 100.0)) as tva_amount
from public.order_items oi
join public.orders o on o.id = oi.order_id
where o.status = 'paid'
group by 1, 2, 3;

-- Grant read access to authenticated role
grant select on public.v_daily_ca       to authenticated;
grant select on public.v_hourly_tx      to authenticated;
grant select on public.v_top_products   to authenticated;
grant select on public.v_tva_breakdown  to authenticated;
```

- [ ] Apply migration:
```bash
npx supabase db push
```

### Step 1.2 — TypeScript types

- [ ] Create `src/lib/analytics/types.ts`:

```typescript
export type Period = 'today' | '7d' | '30d' | 'month'

export interface PeriodRange {
  from: Date
  to: Date
}

export interface KpiSummary {
  caTtc: number
  caHt: number
  txCount: number
  avgTicket: number
  cashPct: number    // 0–100
  cardPct: number
  cashAmount: number
  cardAmount: number
  deltaCaTtc: number | null   // % vs previous period, null if no prev data
  deltaTxCount: number | null
  deltaAvgTicket: number | null
}

export interface DailyCA {
  day: string          // ISO date string YYYY-MM-DD
  caTtc: number
  txCount: number
}

export interface HourlyTx {
  hour: number         // 0–23
  txCount: number
}

export interface TopProduct {
  productId: string
  productName: string
  qtySold: number
  caTtc: number
  pct: number          // % of total CA
}

export interface OrderRow {
  id: string
  ticketNumber: string
  createdAt: string
  products: string     // compact label e.g. "Latte × 2, Cookie × 1"
  paymentMethod: 'card' | 'cash'
  amountHt: number
  tvaAmount: number
  amountTtc: number
}

export interface TvaBreakdown {
  rate: number         // 5.5, 10, or 20
  baseHt: number
  tvaAmount: number
}

export interface SiteSnapshot {
  establishmentId: string
  name: string
  caTtc: number
  txCount: number
  deltaPercent: number | null
}
```

### Step 1.3 — Query functions

- [ ] Create `src/lib/analytics/queries.ts`:

```typescript
import { createClient } from '@/lib/supabase/server'
import type { Period, PeriodRange, KpiSummary, DailyCA, HourlyTx, TopProduct, OrderRow, TvaBreakdown } from './types'

export function getPeriodRange(period: Period): PeriodRange {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  switch (period) {
    case 'today':
      return { from: today, to: now }
    case '7d':
      return { from: new Date(today.getTime() - 6 * 86400000), to: now }
    case '30d':
      return { from: new Date(today.getTime() - 29 * 86400000), to: now }
    case 'month': {
      const from = new Date(now.getFullYear(), now.getMonth(), 1)
      return { from, to: now }
    }
  }
}

export async function fetchKpiSummary(
  range: PeriodRange,
  establishmentId?: string
): Promise<KpiSummary> {
  const supabase = await createClient()
  let query = supabase
    .from('orders')
    .select('total_ttc, total_ht, tva_amount, payment_method')
    .eq('status', 'paid')
    .gte('created_at', range.from.toISOString())
    .lte('created_at', range.to.toISOString())

  if (establishmentId) query = query.eq('establishment_id', establishmentId)

  const { data, error } = await query
  if (error) throw error

  const rows = data ?? []
  const caTtc = rows.reduce((s, r) => s + (r.total_ttc ?? 0), 0)
  const caHt = rows.reduce((s, r) => s + (r.total_ht ?? 0), 0)
  const txCount = rows.length
  const avgTicket = txCount > 0 ? caTtc / txCount : 0
  const cashRows = rows.filter(r => r.payment_method === 'cash')
  const cashAmount = cashRows.reduce((s, r) => s + (r.total_ttc ?? 0), 0)
  const cashPct = caTtc > 0 ? Math.round((cashAmount / caTtc) * 100) : 0

  // TODO: fetch previous period for delta calculation (same duration, shifted back)
  return {
    caTtc, caHt, txCount, avgTicket,
    cashPct, cardPct: 100 - cashPct,
    cashAmount, cardAmount: caTtc - cashAmount,
    deltaCaTtc: null, deltaTxCount: null, deltaAvgTicket: null,
  }
}

export async function fetchDailyCA(
  range: PeriodRange,
  establishmentId?: string
): Promise<DailyCA[]> {
  const supabase = await createClient()
  let query = supabase
    .from('v_daily_ca')
    .select('day, ca_ttc, tx_count')
    .gte('day', range.from.toISOString())
    .lte('day', range.to.toISOString())
    .order('day', { ascending: true })

  if (establishmentId) query = query.eq('establishment_id', establishmentId)

  const { data, error } = await query
  if (error) throw error
  return (data ?? []).map(r => ({
    day: r.day,
    caTtc: r.ca_ttc,
    txCount: r.tx_count,
  }))
}

export async function fetchTopProducts(
  range: PeriodRange,
  establishmentId?: string,
  limit = 5
): Promise<TopProduct[]> {
  const supabase = await createClient()
  let query = supabase
    .from('v_top_products')
    .select('product_id, product_name, qty_sold, ca_ttc')
    .order('ca_ttc', { ascending: false })
    .limit(limit)

  if (establishmentId) query = query.eq('establishment_id', establishmentId)

  const { data, error } = await query
  if (error) throw error

  const rows = data ?? []
  const total = rows.reduce((s, r) => s + (r.ca_ttc ?? 0), 0)
  return rows.map(r => ({
    productId: r.product_id,
    productName: r.product_name,
    qtySold: r.qty_sold,
    caTtc: r.ca_ttc,
    pct: total > 0 ? Math.round((r.ca_ttc / total) * 100) : 0,
  }))
}

export async function fetchOrdersForReport(
  range: PeriodRange,
  establishmentId?: string,
  page = 1,
  pageSize = 50
): Promise<{ rows: OrderRow[]; total: number }> {
  const supabase = await createClient()
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  let query = supabase
    .from('orders')
    .select(`
      id, ticket_number, created_at, payment_method,
      total_ttc, total_ht, tva_amount,
      order_items ( quantity, products ( name ) )
    `, { count: 'exact' })
    .eq('status', 'paid')
    .gte('created_at', range.from.toISOString())
    .lte('created_at', range.to.toISOString())
    .order('created_at', { ascending: false })
    .range(from, to)

  if (establishmentId) query = query.eq('establishment_id', establishmentId)

  const { data, count, error } = await query
  if (error) throw error

  const rows: OrderRow[] = (data ?? []).map((o: any) => {
    const items: string = (o.order_items ?? [])
      .slice(0, 3)
      .map((i: any) => `${i.products?.name ?? '?'} × ${i.quantity}`)
      .join(', ')
    return {
      id: o.id,
      ticketNumber: o.ticket_number ?? o.id.slice(0, 8).toUpperCase(),
      createdAt: o.created_at,
      products: items,
      paymentMethod: o.payment_method === 'cash' ? 'cash' : 'card',
      amountHt: o.total_ht ?? 0,
      tvaAmount: o.tva_amount ?? 0,
      amountTtc: o.total_ttc ?? 0,
    }
  })

  return { rows, total: count ?? 0 }
}

export async function fetchTvaBreakdown(
  range: PeriodRange,
  establishmentId?: string
): Promise<TvaBreakdown[]> {
  const supabase = await createClient()
  let query = supabase
    .from('v_tva_breakdown')
    .select('tva_rate, base_ht, tva_amount')
    .gte('day', range.from.toISOString())
    .lte('day', range.to.toISOString())

  if (establishmentId) query = query.eq('establishment_id', establishmentId)

  const { data, error } = await query
  if (error) throw error

  // Aggregate by rate
  const map = new Map<number, TvaBreakdown>()
  for (const r of data ?? []) {
    const rate = r.tva_rate as number
    const existing = map.get(rate) ?? { rate, baseHt: 0, tvaAmount: 0 }
    existing.baseHt += r.base_ht ?? 0
    existing.tvaAmount += r.tva_amount ?? 0
    map.set(rate, existing)
  }
  return Array.from(map.values()).sort((a, b) => a.rate - b.rate)
}
```

**Test commands:**
```bash
npx tsc --noEmit
```

**Commit:**
```bash
git add supabase/migrations/20260327000006_analytics_views.sql src/lib/analytics/
git commit -m "feat: analytics DB views + query functions (Sprint 7)"
```

---

## Task 2 — Dashboard Analytics Page

**Files:**
- Create: `src/app/dashboard/analytics/page.tsx`
- Create: `src/app/dashboard/analytics/_components/kpi-cards.tsx`
- Create: `src/app/dashboard/analytics/_components/ca-bar-chart.tsx`
- Create: `src/app/dashboard/analytics/_components/rush-hours.tsx`
- Create: `src/app/dashboard/analytics/_components/top-products.tsx`
- Create: `src/app/dashboard/analytics/_components/network-snapshot.tsx`
- Create: `src/app/dashboard/analytics/_components/period-picker.tsx`

### Step 2.1 — Period picker (Client Component)

- [ ] Create `src/app/dashboard/analytics/_components/period-picker.tsx`:

```tsx
'use client'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'

const PERIODS = [
  { label: "Aujourd'hui", value: 'today' },
  { label: '7 jours', value: '7d' },
  { label: '30 jours', value: '30d' },
  { label: 'Mois', value: 'month' },
] as const

interface Props {
  currentPeriod: string
  establishments: { id: string; name: string }[]
  currentEstablishment?: string
}

export function PeriodPicker({ currentPeriod, establishments, currentEstablishment }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()

  function navigate(key: string, value: string) {
    const next = new URLSearchParams(params.toString())
    next.set(key, value)
    router.push(`${pathname}?${next.toString()}`)
  }

  return (
    <div className="flex items-center gap-2">
      <div className="flex gap-1">
        {PERIODS.map(p => (
          <button
            key={p.value}
            onClick={() => navigate('period', p.value)}
            className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
              currentPeriod === p.value
                ? 'bg-blue-500 text-white'
                : 'bg-white/5 text-slate-500 border border-white/10 hover:bg-white/10'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>
      <select
        value={currentEstablishment ?? ''}
        onChange={e => navigate('site', e.target.value)}
        className="h-[34px] px-2 bg-white/5 border border-white/10 rounded-lg text-slate-400 text-xs"
      >
        <option value="">Tous les sites</option>
        {establishments.map(e => (
          <option key={e.id} value={e.id}>{e.name}</option>
        ))}
      </select>
    </div>
  )
}
```

### Step 2.2 — KPI cards component

- [ ] Create `src/app/dashboard/analytics/_components/kpi-cards.tsx`:

```tsx
import type { KpiSummary } from '@/lib/analytics/types'

function fmt(n: number) {
  return n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
}

function Delta({ value }: { value: number | null }) {
  if (value === null) return null
  const color = value >= 0 ? 'text-emerald-400' : 'text-red-400'
  const arrow = value >= 0 ? '↑' : '↓'
  return <span className={`text-[11px] ${color}`}>{arrow} {value >= 0 ? '+' : ''}{value.toFixed(1)}% vs période préc.</span>
}

export function KpiCards({ data }: { data: KpiSummary }) {
  return (
    <div className="grid grid-cols-4 gap-4 mb-5">
      <div className="bg-[#0f2744] border border-white/[0.06] rounded-[14px] p-4">
        <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1.5">CA TTC</div>
        <div className="text-[26px] font-black text-blue-400 mb-1">{fmt(data.caTtc)}</div>
        <Delta value={data.deltaCaTtc} />
      </div>
      <div className="bg-[#0f2744] border border-white/[0.06] rounded-[14px] p-4">
        <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1.5">Transactions</div>
        <div className="text-[26px] font-black text-slate-100 mb-1">{data.txCount}</div>
        <Delta value={data.deltaTxCount} />
      </div>
      <div className="bg-[#0f2744] border border-white/[0.06] rounded-[14px] p-4">
        <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1.5">Ticket moyen</div>
        <div className="text-[26px] font-black text-slate-100 mb-1">{fmt(data.avgTicket)}</div>
        <Delta value={data.deltaAvgTicket} />
      </div>
      <div className="bg-[#0f2744] border border-white/[0.06] rounded-[14px] p-4">
        <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1.5">Espèces vs Carte</div>
        <div className="text-[18px] font-black mb-1">
          <span className="text-amber-400">{data.cashPct}%</span>
          <span className="text-slate-500 text-xs font-normal"> · </span>
          <span className="text-blue-400">{data.cardPct}%</span>
        </div>
        <div className="h-1.5 rounded-full bg-white/[0.06] flex overflow-hidden mt-2">
          <div className="h-full bg-amber-400 rounded-l-full" style={{ width: `${data.cashPct}%` }} />
          <div className="h-full bg-blue-500 rounded-r-full flex-1" />
        </div>
      </div>
    </div>
  )
}
```

### Step 2.3 — CA bar chart

- [ ] Create `src/app/dashboard/analytics/_components/ca-bar-chart.tsx`:

```tsx
import type { DailyCA } from '@/lib/analytics/types'

export function CaBarChart({ data }: { data: DailyCA[] }) {
  if (!data.length) return null
  const max = Math.max(...data.map(d => d.caTtc), 1)
  const total = data.reduce((s, d) => s + d.caTtc, 0)
  const todayStr = new Date().toISOString().slice(0, 10)
  const firstLabel = data[0]?.day?.slice(0, 10) ?? ''
  const midLabel = data[Math.floor(data.length / 2)]?.day?.slice(0, 10) ?? ''

  return (
    <div className="bg-[#0f2744] border border-white/[0.06] rounded-[14px] p-[18px]">
      <div className="flex justify-between items-center mb-4">
        <span className="text-[13px] font-semibold text-slate-100">CA — {data.length} derniers jours</span>
        <span className="text-[11px] text-slate-500">
          Total : <strong className="text-blue-400">
            {total.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} €
          </strong>
        </span>
      </div>
      <div className="flex items-end gap-[3px] h-24">
        {data.map((d, i) => {
          const isToday = d.day?.startsWith(todayStr)
          const heightPct = Math.max((d.caTtc / max) * 100, 2)
          return (
            <div key={i} className="flex-1" title={`${d.day?.slice(0, 10)} — ${d.caTtc.toFixed(2)} €`}>
              <div
                className={`rounded-t-[3px] ${isToday ? 'bg-blue-500' : 'bg-blue-500/50 hover:bg-blue-500'} transition-colors`}
                style={{ height: `${heightPct}%` }}
              />
            </div>
          )
        })}
      </div>
      <div className="flex justify-between mt-1.5">
        <span className="text-[9px] text-slate-500">{firstLabel}</span>
        <span className="text-[9px] text-slate-500">{midLabel}</span>
        <span className="text-[9px] text-blue-400">auj.</span>
      </div>
    </div>
  )
}
```

### Step 2.4 — Top products

- [ ] Create `src/app/dashboard/analytics/_components/top-products.tsx`:

```tsx
import type { TopProduct } from '@/lib/analytics/types'

export function TopProducts({ data }: { data: TopProduct[] }) {
  const max = Math.max(...data.map(d => d.caTtc), 1)
  return (
    <div className="bg-[#0f2744] border border-white/[0.06] rounded-[14px] p-[18px]">
      <div className="text-[13px] font-semibold text-slate-100 mb-4">Top produits</div>
      {data.length === 0 && (
        <div className="text-center py-8 text-slate-500 text-sm">Aucune vente sur cette période</div>
      )}
      {data.map((p, i) => (
        <div key={p.productId} className={`flex items-center gap-3 py-2 ${i < data.length - 1 ? 'border-b border-white/[0.04]' : ''}`}>
          <div className="w-5 h-5 rounded-full bg-blue-500/15 text-blue-400 text-[10px] font-bold flex items-center justify-center shrink-0">
            {i + 1}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-semibold truncate">{p.productName}</div>
            <div className="text-[11px] text-slate-500">{p.qtySold} vendus · {p.caTtc.toFixed(0)} €</div>
          </div>
          <div className="w-16 h-1 bg-white/[0.06] rounded-full overflow-hidden">
            <div className="h-full bg-blue-500 rounded-full" style={{ width: `${(p.caTtc / max) * 100}%` }} />
          </div>
          <div className="text-[12px] text-blue-400 font-semibold w-9 text-right">{p.pct}%</div>
        </div>
      ))}
    </div>
  )
}
```

### Step 2.5 — Main analytics page

- [ ] Create `src/app/dashboard/analytics/page.tsx`:

```tsx
import { Suspense } from 'react'
import type { Period } from '@/lib/analytics/types'
import { getPeriodRange, fetchKpiSummary, fetchDailyCA, fetchTopProducts } from '@/lib/analytics/queries'
import { createClient } from '@/lib/supabase/server'
import { KpiCards } from './_components/kpi-cards'
import { CaBarChart } from './_components/ca-bar-chart'
import { TopProducts } from './_components/top-products'
import { PeriodPicker } from './_components/period-picker'

interface Props {
  searchParams: { period?: string; site?: string }
}

export default async function AnalyticsPage({ searchParams }: Props) {
  const period = (searchParams.period ?? '30d') as Period
  const siteId = searchParams.site || undefined
  const range = getPeriodRange(period)

  const supabase = await createClient()
  const { data: establishments } = await supabase
    .from('establishments')
    .select('id, name')
    .order('name')

  const [kpi, dailyCA, topProducts] = await Promise.all([
    fetchKpiSummary(range, siteId),
    fetchDailyCA(range, siteId),
    fetchTopProducts(range, siteId),
  ])

  return (
    <div className="flex flex-col min-h-0 flex-1">
      {/* Topbar */}
      <div className="h-14 border-b border-white/[0.06] flex items-center justify-between px-6 bg-[#0f2744] shrink-0">
        <div className="text-[14px] font-semibold">Analytics</div>
        <Suspense>
          <PeriodPicker
            currentPeriod={period}
            establishments={establishments ?? []}
            currentEstablishment={siteId}
          />
        </Suspense>
      </div>

      {/* Content */}
      <div className="p-6 overflow-y-auto flex-1">
        <KpiCards data={kpi} />

        <div className="grid grid-cols-[2fr_1fr] gap-4 mb-4">
          <CaBarChart data={dailyCA} />
          {/* Rush hours — placeholder, same pattern */}
          <div className="bg-[#0f2744] border border-white/[0.06] rounded-[14px] p-[18px]">
            <div className="text-[13px] font-semibold text-slate-100 mb-4">Heures de pointe</div>
            <div className="text-[12px] text-slate-500 text-center py-8">— Données à brancher —</div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <TopProducts data={topProducts} />
          <div className="bg-[#0f2744] border border-white/[0.06] rounded-[14px] p-[18px]">
            <div className="text-[13px] font-semibold text-slate-100 mb-4">Réseau — CA</div>
            <div className="text-[12px] text-slate-500 text-center py-8">— Multi-site snapshot —</div>
          </div>
        </div>
      </div>
    </div>
  )
}
```

**Test commands:**
```bash
npx tsc --noEmit
# Navigate to /dashboard/analytics?period=30d in browser
```

**Commit:**
```bash
git add src/app/dashboard/analytics/
git commit -m "feat: Dashboard Analytics page — KPIs, CA chart, top products (Sprint 7)"
```

---

## Task 3 — Rapport Ventes Page

**Files:**
- Create: `src/app/dashboard/analytics/report/page.tsx`
- Create: `src/app/dashboard/analytics/report/_components/report-table.tsx`
- Create: `src/app/dashboard/analytics/report/_components/tva-summary.tsx`
- Create: `src/app/dashboard/analytics/report/_components/export-buttons.tsx`
- Create: `src/lib/analytics/csv.ts`

### Step 3.1 — CSV utility

- [ ] Create `src/lib/analytics/csv.ts`:

```typescript
import type { OrderRow } from './types'

export function ordersToCSV(rows: OrderRow[]): string {
  const headers = ['Date/Heure', 'Ticket#', 'Produits', 'Paiement', 'Montant HT', 'TVA', 'Montant TTC']
  const lines = [
    headers.join(';'),
    ...rows.map(r => [
      new Date(r.createdAt).toLocaleString('fr-FR'),
      r.ticketNumber,
      `"${r.products}"`,
      r.paymentMethod === 'cash' ? 'Espèces' : 'Carte',
      r.amountHt.toFixed(2).replace('.', ','),
      r.tvaAmount.toFixed(2).replace('.', ','),
      r.amountTtc.toFixed(2).replace('.', ','),
    ].join(';'))
  ]
  return lines.join('\n')
}

export function downloadCSV(content: string, filename: string) {
  const blob = new Blob(['\ufeff' + content], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
```

### Step 3.2 — Sortable report table (Client Component)

- [ ] Create `src/app/dashboard/analytics/report/_components/report-table.tsx`:

```tsx
'use client'
import { useState, useMemo } from 'react'
import type { OrderRow, TvaBreakdown } from '@/lib/analytics/types'
import { ordersToCSV, downloadCSV } from '@/lib/analytics/csv'

type SortKey = 'createdAt' | 'amountTtc' | 'amountHt'
type SortDir = 'asc' | 'desc'

function fmt(n: number) {
  return n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
}

interface Props {
  rows: OrderRow[]
  total: number
  tvaBreakdown: TvaBreakdown[]
  totalHt: number
  totalTva: number
  totalTtc: number
}

export function ReportTable({ rows, total, tvaBreakdown, totalHt, totalTva, totalTtc }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>('createdAt')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('desc') }
  }

  const sorted = useMemo(() => [...rows].sort((a, b) => {
    const va = a[sortKey]
    const vb = b[sortKey]
    const cmp = typeof va === 'number' ? va - vb : String(va).localeCompare(String(vb))
    return sortDir === 'asc' ? cmp : -cmp
  }), [rows, sortKey, sortDir])

  function SortIcon({ k }: { k: SortKey }) {
    if (sortKey !== k) return <span className="ml-1 text-slate-600">↕</span>
    return <span className="ml-1 text-blue-400">{sortDir === 'asc' ? '↑' : '↓'}</span>
  }

  function handleExport() {
    const csv = ordersToCSV(rows)
    downloadCSV(csv, `rapport-ventes-${new Date().toISOString().slice(0, 10)}.csv`)
  }

  if (rows.length === 0) {
    return (
      <div className="bg-[#0f2744] border border-white/[0.06] rounded-[14px] py-16 text-center">
        <div className="text-4xl mb-4">📊</div>
        <div className="text-slate-400 font-semibold mb-1">Aucune transaction sur cette période</div>
        <div className="text-slate-500 text-sm">Modifiez le filtre de période pour afficher des données.</div>
      </div>
    )
  }

  return (
    <div className="bg-[#0f2744] border border-white/[0.06] rounded-[14px] overflow-hidden">
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th onClick={() => toggleSort('createdAt')} className="text-left text-[10px] text-slate-500 uppercase tracking-wider px-4 py-3 border-b border-white/[0.06] cursor-pointer hover:text-slate-300 whitespace-nowrap bg-white/[0.01]">
              Date / Heure <SortIcon k="createdAt" />
            </th>
            <th className="text-left text-[10px] text-slate-500 uppercase tracking-wider px-4 py-3 border-b border-white/[0.06] bg-white/[0.01]">Ticket #</th>
            <th className="text-left text-[10px] text-slate-500 uppercase tracking-wider px-4 py-3 border-b border-white/[0.06] bg-white/[0.01]">Produits</th>
            <th className="text-left text-[10px] text-slate-500 uppercase tracking-wider px-4 py-3 border-b border-white/[0.06] bg-white/[0.01]">Paiement</th>
            <th onClick={() => toggleSort('amountHt')} className="text-right text-[10px] text-slate-500 uppercase tracking-wider px-4 py-3 border-b border-white/[0.06] cursor-pointer hover:text-slate-300 whitespace-nowrap bg-white/[0.01]">
              Montant HT <SortIcon k="amountHt" />
            </th>
            <th className="text-right text-[10px] text-slate-500 uppercase tracking-wider px-4 py-3 border-b border-white/[0.06] bg-white/[0.01] whitespace-nowrap">TVA</th>
            <th onClick={() => toggleSort('amountTtc')} className="text-right text-[10px] text-slate-500 uppercase tracking-wider px-4 py-3 border-b border-white/[0.06] cursor-pointer hover:text-slate-300 whitespace-nowrap bg-white/[0.01]">
              Montant TTC <SortIcon k="amountTtc" />
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, i) => (
            <tr key={row.id} className={`${i % 2 === 1 ? 'bg-white/[0.015]' : ''} hover:bg-blue-500/[0.04] cursor-pointer`}>
              <td className="px-4 py-3 text-[12px] text-slate-400">
                {new Date(row.createdAt).toLocaleString('fr-FR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' })}
              </td>
              <td className="px-4 py-3 font-mono text-[11px] text-slate-400">#{row.ticketNumber}</td>
              <td className="px-4 py-3 text-[12px] text-slate-400 max-w-[200px] truncate">{row.products}</td>
              <td className="px-4 py-3">
                {row.paymentMethod === 'card' ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-blue-500/10 text-blue-400">💳 Carte</span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-500/10 text-amber-400">💵 Espèces</span>
                )}
              </td>
              <td className="px-4 py-3 text-[12px] text-slate-400 text-right">{fmt(row.amountHt)}</td>
              <td className="px-4 py-3 text-[12px] text-slate-500 text-right">{fmt(row.tvaAmount)}</td>
              <td className="px-4 py-3 text-[12px] text-slate-100 font-semibold text-right">{fmt(row.amountTtc)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="bg-blue-500/[0.05]">
            <td colSpan={4} className="px-4 py-3 text-[11px] text-slate-500 uppercase tracking-wider font-semibold border-t-2 border-white/10">
              Totaux ({total} transactions)
            </td>
            <td className="px-4 py-3 text-[12px] text-slate-100 font-bold text-right border-t-2 border-white/10">{fmt(totalHt)}</td>
            <td className="px-4 py-3 text-right border-t-2 border-white/10">
              {tvaBreakdown.map(t => (
                <div key={t.rate} className="text-[11px] text-slate-500">{t.rate}%: {fmt(t.tvaAmount)}</div>
              ))}
              <div className="text-[12px] text-slate-100 font-bold mt-1">{fmt(totalTva)}</div>
            </td>
            <td className="px-4 py-3 text-[16px] text-blue-400 font-black text-right border-t-2 border-white/10">{fmt(totalTtc)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}
```

### Step 3.3 — TVA summary card

- [ ] Create `src/app/dashboard/analytics/report/_components/tva-summary.tsx`:

```tsx
import type { TvaBreakdown } from '@/lib/analytics/types'

const TVA_COLORS: Record<number, string> = {
  5.5: 'text-emerald-400',
  10: 'text-amber-400',
  20: 'text-violet-400',
}

function fmt(n: number) {
  return n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
}

export function TvaSummary({ data }: { data: TvaBreakdown[] }) {
  const totalTva = data.reduce((s, t) => s + t.tvaAmount, 0)
  return (
    <div className="bg-[#0f2744] border border-white/[0.06] rounded-[14px] p-[18px]">
      <div className="text-[13px] font-semibold text-slate-100 mb-4">Récapitulatif TVA</div>
      {data.map(t => (
        <div key={t.rate} className="flex justify-between items-start py-2.5 border-b border-white/[0.04] last:border-0">
          <div>
            <div className="text-[12px] font-semibold text-slate-100">TVA {t.rate}%</div>
            <div className="text-[11px] text-slate-500 mt-0.5">Base : {fmt(t.baseHt)}</div>
          </div>
          <div className={`text-[13px] font-bold ${TVA_COLORS[t.rate] ?? 'text-slate-100'}`}>
            {fmt(t.tvaAmount)}
          </div>
        </div>
      ))}
      <div className="flex justify-between items-center pt-2.5 mt-1 border-t border-white/10">
        <span className="text-[11px] text-slate-500 uppercase tracking-wider">Total TVA</span>
        <span className="text-[16px] font-black text-blue-400">{fmt(totalTva)}</span>
      </div>
    </div>
  )
}
```

### Step 3.4 — Report page (Server Component)

- [ ] Create `src/app/dashboard/analytics/report/page.tsx`:

```tsx
import { Suspense } from 'react'
import Link from 'next/link'
import type { Period } from '@/lib/analytics/types'
import { getPeriodRange, fetchOrdersForReport, fetchKpiSummary, fetchTvaBreakdown } from '@/lib/analytics/queries'
import { ReportTable } from './_components/report-table'
import { TvaSummary } from './_components/tva-summary'
import { PeriodPicker } from '../_components/period-picker'
import { createClient } from '@/lib/supabase/server'

interface Props {
  searchParams: { period?: string; site?: string; page?: string }
}

export default async function ReportPage({ searchParams }: Props) {
  const period = (searchParams.period ?? '30d') as Period
  const siteId = searchParams.site || undefined
  const page = parseInt(searchParams.page ?? '1', 10)
  const range = getPeriodRange(period)

  const supabase = await createClient()
  const { data: establishments } = await supabase.from('establishments').select('id, name').order('name')

  const [{ rows, total }, kpi, tvaBreakdown] = await Promise.all([
    fetchOrdersForReport(range, siteId, page),
    fetchKpiSummary(range, siteId),
    fetchTvaBreakdown(range, siteId),
  ])

  const totalTva = tvaBreakdown.reduce((s, t) => s + t.tvaAmount, 0)

  return (
    <div className="flex flex-col min-h-0 flex-1">
      {/* Topbar */}
      <div className="h-14 border-b border-white/[0.06] flex items-center justify-between px-6 bg-[#0f2744] shrink-0">
        <div className="text-[14px] font-semibold">Rapport des ventes</div>
        <div className="flex items-center gap-2">
          <Suspense>
            <PeriodPicker currentPeriod={period} establishments={establishments ?? []} currentEstablishment={siteId} />
          </Suspense>
          <button className="h-[34px] px-3 bg-white/[0.04] border border-white/10 rounded-lg text-slate-400 text-xs font-semibold">
            ⬇ Export CSV
          </button>
        </div>
      </div>

      <div className="p-6 overflow-y-auto flex-1 flex gap-5">
        {/* Main content */}
        <div className="flex-1 min-w-0">
          {/* Breadcrumb */}
          <div className="flex items-center gap-1.5 text-[12px] text-slate-500 mb-5">
            <Link href="/dashboard/analytics" className="text-blue-400 hover:underline">Analytics</Link>
            <span className="text-slate-600">›</span>
            <span className="text-slate-100">Rapport des ventes</span>
          </div>

          {/* KPIs */}
          <div className="grid grid-cols-4 gap-3 mb-5">
            {/* Same pattern as KpiCards — inline for brevity */}
            <div className="bg-[#0f2744] border border-white/[0.06] rounded-[14px] p-4">
              <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1.5">CA TTC</div>
              <div className="text-[24px] font-black text-blue-400">{kpi.caTtc.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €</div>
            </div>
            <div className="bg-[#0f2744] border border-white/[0.06] rounded-[14px] p-4">
              <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1.5">Transactions</div>
              <div className="text-[24px] font-black text-slate-100">{kpi.txCount}</div>
            </div>
            <div className="bg-[#0f2744] border border-white/[0.06] rounded-[14px] p-4">
              <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1.5">Ticket moyen</div>
              <div className="text-[24px] font-black text-slate-100">{kpi.avgTicket.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €</div>
            </div>
            <div className="bg-[#0f2744] border border-white/[0.06] rounded-[14px] p-4">
              <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1.5">Espèces vs Carte</div>
              <div className="text-[18px] font-black">
                <span className="text-amber-400">{kpi.cashPct}%</span>
                <span className="text-slate-500 text-xs"> · </span>
                <span className="text-blue-400">{kpi.cardPct}%</span>
              </div>
              <div className="h-1.5 rounded-full bg-white/[0.06] flex overflow-hidden mt-2">
                <div className="h-full bg-amber-400 rounded-l-full" style={{ width: `${kpi.cashPct}%` }} />
                <div className="h-full bg-blue-500 rounded-r-full flex-1" />
              </div>
            </div>
          </div>

          <Suspense fallback={<div className="text-slate-500 text-sm">Chargement…</div>}>
            <ReportTable
              rows={rows}
              total={total}
              tvaBreakdown={tvaBreakdown}
              totalHt={kpi.caHt}
              totalTva={totalTva}
              totalTtc={kpi.caTtc}
            />
          </Suspense>
        </div>

        {/* Right sidebar */}
        <div className="w-[240px] shrink-0 flex flex-col gap-4">
          <TvaSummary data={tvaBreakdown} />

          {/* Payment split */}
          <div className="bg-[#0f2744] border border-white/[0.06] rounded-[14px] p-[18px]">
            <div className="text-[13px] font-semibold text-slate-100 mb-4">Répartition paiements</div>
            <div className="flex flex-col gap-3">
              <div>
                <div className="flex justify-between text-[12px] mb-1.5">
                  <span className="text-blue-400 font-semibold">💳 Carte</span>
                  <span className="text-slate-100 font-bold">{kpi.cardAmount.toFixed(0)} €</span>
                </div>
                <div className="h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                  <div className="h-full bg-blue-500 rounded-full" style={{ width: `${kpi.cardPct}%` }} />
                </div>
                <div className="text-[10px] text-slate-500 mt-1">{kpi.cardPct}% des paiements</div>
              </div>
              <div>
                <div className="flex justify-between text-[12px] mb-1.5">
                  <span className="text-amber-400 font-semibold">💵 Espèces</span>
                  <span className="text-slate-100 font-bold">{kpi.cashAmount.toFixed(0)} €</span>
                </div>
                <div className="h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                  <div className="h-full bg-amber-400 rounded-full" style={{ width: `${kpi.cashPct}%` }} />
                </div>
                <div className="text-[10px] text-slate-500 mt-1">{kpi.cashPct}% des paiements</div>
              </div>
            </div>
          </div>

          {/* Export */}
          <div className="bg-[#0f2744] border border-white/[0.06] rounded-[14px] p-4">
            <div className="text-[13px] font-semibold text-slate-100 mb-3">Export comptable</div>
            <div className="flex flex-col gap-2">
              <button className="w-full h-9 px-3 bg-white/[0.04] border border-white/10 rounded-lg text-slate-400 text-[12px] text-left hover:bg-white/[0.07]">⬇ Export CSV complet</button>
              <button className="w-full h-9 px-3 bg-white/[0.04] border border-white/10 rounded-lg text-slate-400 text-[12px] text-left hover:bg-white/[0.07]">📄 Journal TVA</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
```

**Test commands:**
```bash
npx tsc --noEmit
# Navigate to /dashboard/analytics/report?period=30d in browser
# Verify table sorts on column header click
# Verify empty state shows when no data
```

**Commit:**
```bash
git add src/app/dashboard/analytics/report/ src/lib/analytics/csv.ts
git commit -m "feat: Rapport ventes — sortable table, TVA summary, CSV export (Sprint 7)"
```

---

## Task 4 — Navigation Update

**Files:**
- Modify: `src/app/dashboard/_components/sidebar.tsx` (or equivalent sidebar component)

### Step 4.1 — Locate the sidebar

- [ ] Find the sidebar component:
```bash
find src/app/dashboard -name "sidebar*" -o -name "nav*" | head -20
```

### Step 4.2 — Add Analytics nav item

- [ ] Add the following nav items to the sidebar, after the fiscal journal entry and before CRM:

```tsx
{/* Analytics */}
<NavItem
  href="/dashboard/analytics"
  icon="📊"
  label="Analytics"
  active={pathname.startsWith('/dashboard/analytics')}
/>
{pathname.startsWith('/dashboard/analytics') && (
  <>
    <NavSubItem
      href="/dashboard/analytics"
      label="Vue d'ensemble"
      active={pathname === '/dashboard/analytics'}
    />
    <NavSubItem
      href="/dashboard/analytics/report"
      label="Rapport ventes"
      active={pathname === '/dashboard/analytics/report'}
    />
  </>
)}
```

If the sidebar uses a static list rather than components, add the equivalent `<a>` or `<Link>` elements following the same pattern as existing items.

### Step 4.3 — Verify navigation

- [ ] Run the dev server and verify:
  - Analytics link appears in sidebar
  - Active state highlights correctly on both sub-pages
  - Sub-nav collapses when not on an analytics page

**Test commands:**
```bash
npm run dev
# Manual: click each nav item, verify active states
npx tsc --noEmit
```

**Commit:**
```bash
git add src/app/dashboard/_components/
git commit -m "feat: add Analytics nav with sub-links to dashboard sidebar (Sprint 7)"
```

---

## Final verification

```bash
# Type check entire project
npx tsc --noEmit

# Lint
npm run lint

# Build check
npm run build
```

Ensure:
- [ ] `/dashboard/analytics` loads without error for all 4 period pills
- [ ] `/dashboard/analytics/report` table sorts correctly and shows empty state
- [ ] CSV export downloads a valid `.csv` file
- [ ] TVA breakdown sums match total TTC
- [ ] Sidebar shows Analytics with active sub-item highlight
- [ ] No console errors in browser
