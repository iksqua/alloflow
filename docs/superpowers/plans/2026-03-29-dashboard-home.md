# Dashboard Home Page — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Créer la page d'accueil `/dashboard/` manquante avec KPIs du jour, activité horaire, alertes stock, top produits et activité récente.

**Architecture:** SSR pur — `page.tsx` appelle `/api/dashboard/summary` côté serveur, passe les données en props à `dashboard-page-client.tsx`. Pas de fetch client, pas de skeletons. La route API parallélise 5 requêtes Supabase indépendantes.

**Tech Stack:** Next.js 16 App Router, TypeScript, Tailwind CSS, Supabase (server client), `@supabase/supabase-js`

---

## File Map

| Fichier | Action | Responsabilité |
|---------|--------|----------------|
| `src/app/dashboard/page.tsx` | **Créer** | SSR : auth + fetch + props |
| `src/app/dashboard/dashboard-page-client.tsx` | **Créer** | Client shell : compose les sections |
| `src/app/dashboard/_components/kpi-cards.tsx` | **Créer** | 4 stat cards avec delta |
| `src/app/dashboard/_components/hourly-chart.tsx` | **Créer** | Barres activité horaire 8h–20h |
| `src/app/dashboard/_components/alerts-panel.tsx` | **Créer** | Alertes stock + livraisons en attente |
| `src/app/dashboard/_components/top-products.tsx` | **Créer** | Top 5 produits du jour par CA |
| `src/app/dashboard/_components/recent-orders.tsx` | **Créer** | Feed 8 dernières transactions |
| `src/app/api/dashboard/summary/route.ts` | **Créer** | GET — 5 requêtes parallèles |

---

## Notes importantes avant de commencer

**Les vues `v_daily_ca`, `v_hourly_tx`, `v_top_products` agrègent sur 30–90 jours** — elles ne filtrent pas par jour. Pour les données du jour uniquement, faire des requêtes directes sur `orders` / `order_items`.

**Timezone :** Les ordres sont créés en UTC. Filtrer "aujourd'hui" avec :
```sql
date_trunc('day', created_at at time zone 'Europe/Paris') = date_trunc('day', now() at time zone 'Europe/Paris')
```

**Pattern d'auth dans les routes API** (copier depuis `/src/app/api/customers/route.ts`) :
```ts
const supabase = await createClient()
const { data: { user } } = await supabase.auth.getUser()
if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
const { data: profile } = await supabase.from('profiles').select('establishment_id').eq('id', user.id).single()
const establishmentId = profile?.establishment_id
if (!establishmentId) return NextResponse.json({ error: 'No establishment' }, { status: 400 })
```

**Pattern auth dans page.tsx SSR** (copier depuis `/src/app/dashboard/settings/equipe/page.tsx`) :
```ts
const supabase = await createClient()
const { data: { user } } = await supabase.auth.getUser()
if (!user) redirect('/login')
const { data: profile } = await supabase.from('profiles').select('establishment_id').eq('id', user.id).single()
if (!profile?.establishment_id) redirect('/login')
```

---

## Task 1 : Route API `/api/dashboard/summary`

**Files:**
- Create: `src/app/api/dashboard/summary/route.ts`

- [ ] **Step 1 : Créer le fichier et le type de réponse**

```ts
// src/app/api/dashboard/summary/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export type DashboardSummary = {
  kpis: {
    caToday: number
    caYesterday: number
    ordersToday: number
    ordersYesterday: number
    avgTicketToday: number
    avgTicketYesterday: number
    loyalCustomersToday: number
  }
  hourlyActivity: { hour: number; count: number }[]
  stockAlerts: {
    id: string
    name: string
    quantity: number
    alertThreshold: number
    level: 'critical' | 'low'
  }[]
  pendingDeliveries: { id: string; supplierName: string; receivedAt: string }[]
  topProducts: {
    rank: number
    name: string
    category: string
    revenue: number
    quantity: number
  }[]
  recentOrders: {
    id: string
    orderNumber: number
    customerName: string | null
    customerTier: 'standard' | 'silver' | 'gold' | null
    totalAmount: number
    itemsSummary: string
    createdAt: string
  }[]
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles').select('establishment_id').eq('id', user.id).single()
  const estId = profile?.establishment_id
  if (!estId) return NextResponse.json({ error: 'No establishment' }, { status: 400 })

  // À compléter dans les steps suivants
  return NextResponse.json({} as DashboardSummary)
}
```

- [ ] **Step 2 : Implémenter les 5 requêtes en parallèle**

Remplacer le corps de `GET` après la vérification `estId` par :

```ts
  const todayFilter = `date_trunc('day', created_at::timestamptz at time zone 'Europe/Paris') = date_trunc('day', now() at time zone 'Europe/Paris')`
  const yesterdayFilter = `date_trunc('day', created_at::timestamptz at time zone 'Europe/Paris') = date_trunc('day', (now() - interval '1 day') at time zone 'Europe/Paris')`

  const [
    { data: ordersToday },
    { data: ordersYesterday },
    { data: hourlyRaw },
    { data: stockItems },
    { data: deliveries },
    { data: topItems },
    { data: recentRaw },
    { data: loyaltyTx },
  ] = await Promise.all([
    // 1. Commandes aujourd'hui
    supabase
      .from('orders')
      .select('id, total_ttc')
      .eq('establishment_id', estId)
      .eq('status', 'paid')
      .filter('created_at', 'gte', new Date(new Date().setHours(0,0,0,0)).toISOString())
      .filter('created_at', 'lt', new Date(new Date().setHours(24,0,0,0)).toISOString()),

    // 2. Commandes hier
    supabase
      .from('orders')
      .select('id, total_ttc')
      .eq('establishment_id', estId)
      .eq('status', 'paid')
      .filter('created_at', 'gte', new Date(new Date().setDate(new Date().getDate()-1)).toISOString().slice(0,10) + 'T00:00:00.000Z')
      .filter('created_at', 'lt', new Date(new Date().setHours(0,0,0,0)).toISOString()),

    // 3. Activité horaire aujourd'hui
    supabase
      .from('orders')
      .select('created_at')
      .eq('establishment_id', estId)
      .eq('status', 'paid')
      .filter('created_at', 'gte', new Date(new Date().setHours(0,0,0,0)).toISOString())
      .filter('created_at', 'lt', new Date(new Date().setHours(24,0,0,0)).toISOString()),

    // 4. Alertes stock — filtre colonne-à-colonne impossible en Supabase JS, on récupère tous les items
    //    avec alert_threshold > 0 et on filtre côté JS après (voir Step 3)
    supabase
      .from('stock_items')
      .select('id, name, quantity, alert_threshold')
      .eq('establishment_id', estId)
      .gt('alert_threshold', 0),

    // 5. Livraisons reçues non validées
    supabase
      .from('purchase_orders')
      .select('id, supplier_name, updated_at')
      .eq('establishment_id', estId)
      .eq('status', 'received'),

    // 6. Top produits aujourd'hui
    supabase
      .from('order_items')
      .select('product_name, quantity, line_total, orders!inner(establishment_id, status, created_at)')
      .eq('orders.establishment_id', estId)
      .eq('orders.status', 'paid')
      .filter('orders.created_at', 'gte', new Date(new Date().setHours(0,0,0,0)).toISOString())
      .filter('orders.created_at', 'lt', new Date(new Date().setHours(24,0,0,0)).toISOString()),

    // 7. Commandes récentes (payées uniquement)
    supabase
      .from('orders')
      .select('id, order_number, total_ttc, created_at, customer_id, customers(first_name, last_name, tier), order_items(product_name, quantity)')
      .eq('establishment_id', estId)
      .eq('status', 'paid')
      .order('created_at', { ascending: false })
      .limit(8),

    // 8. Clients fidèles aujourd'hui — COUNT DISTINCT sur loyalty_transactions
    supabase
      .from('loyalty_transactions')
      .select('customer_id')
      .eq('establishment_id', estId)
      .filter('created_at', 'gte', new Date(new Date().setHours(0,0,0,0)).toISOString())
      .filter('created_at', 'lt', new Date(new Date().setHours(24,0,0,0)).toISOString()),
  ])
```

> **Note :** La requête 4 (stock alerts) ne peut pas utiliser `.lte('quantity', 'alert_threshold')` avec Supabase JS (pas de comparaison colonne-à-colonne). Utiliser `.filter()` avec une requête filtrée :

Remplacer la requête 4 par :
```ts
    supabase
      .from('stock_items')
      .select('id, name, quantity, alert_threshold')
      .eq('establishment_id', estId)
      .gt('alert_threshold', 0),
```
Puis filtrer côté JS après réception :
```ts
const alerts = (stockItems ?? []).filter((s: { quantity: number; alert_threshold: number }) => s.quantity <= s.alert_threshold)
```

- [ ] **Step 3 : Construire et retourner le payload**

```ts
  // KPIs
  const caToday = (ordersToday ?? []).reduce((s: number, o: { total_ttc: number }) => s + (o.total_ttc ?? 0), 0)
  const caYesterday = (ordersYesterday ?? []).reduce((s: number, o: { total_ttc: number }) => s + (o.total_ttc ?? 0), 0)
  const countToday = (ordersToday ?? []).length
  const countYesterday = (ordersYesterday ?? []).length

  // Hourly (0–23 buckets, on retourne 8–20)
  const hourBuckets: Record<number, number> = {}
  for (const o of hourlyRaw ?? []) {
    const h = new Date(o.created_at).getHours()
    hourBuckets[h] = (hourBuckets[h] ?? 0) + 1
  }
  const hourlyActivity = Array.from({ length: 13 }, (_, i) => ({
    hour: 8 + i,
    count: hourBuckets[8 + i] ?? 0,
  }))

  // Stock alerts
  const stockAlerts = ((stockItems ?? []) as { id: string; name: string; quantity: number; alert_threshold: number }[])
    .filter(s => s.quantity <= s.alert_threshold)
    .map(s => ({
      id: s.id,
      name: s.name,
      quantity: s.quantity,
      alertThreshold: s.alert_threshold,
      level: s.quantity <= s.alert_threshold * 0.4 ? 'critical' as const : 'low' as const,
    }))

  // Pending deliveries
  const pendingDeliveries = (deliveries ?? []).map((d: { id: string; supplier_name: string; updated_at: string }) => ({
    id: d.id,
    supplierName: d.supplier_name,
    receivedAt: d.updated_at,
  }))

  // Top products — agréger par product_name
  const productMap: Record<string, { revenue: number; quantity: number }> = {}
  for (const item of topItems ?? []) {
    const n = item.product_name
    if (!productMap[n]) productMap[n] = { revenue: 0, quantity: 0 }
    productMap[n].revenue += item.line_total ?? 0
    productMap[n].quantity += item.quantity ?? 0
  }
  const topProducts = Object.entries(productMap)
    .sort(([, a], [, b]) => b.revenue - a.revenue)
    .slice(0, 5)
    .map(([name, stats], i) => ({
      rank: i + 1,
      name,
      category: '',   // order_items ne stocke pas la catégorie — laisser vide
      revenue: stats.revenue,
      quantity: stats.quantity,
    }))

  // Recent orders
  const recentOrders = (recentRaw ?? []).map((o: {
    id: string
    order_number: number
    total_ttc: number
    created_at: string
    customers: { first_name: string; last_name: string; tier: string } | null
    order_items: { product_name: string; quantity: number }[]
  }) => {
    const itemsSummary = (o.order_items ?? [])
      .slice(0, 3)
      .map((i) => `${i.product_name}${i.quantity > 1 ? ` ×${i.quantity}` : ''}`)
      .join(', ') + ((o.order_items ?? []).length > 3 ? '…' : '')

    return {
      id: o.id,
      orderNumber: o.order_number,
      customerName: o.customers ? `${o.customers.first_name} ${o.customers.last_name.charAt(0)}.` : null,
      customerTier: o.customers?.tier as 'standard' | 'silver' | 'gold' | null ?? null,
      totalAmount: o.total_ttc,
      itemsSummary,
      createdAt: o.created_at,
    }
  })

  // Clients fidèles aujourd'hui — COUNT DISTINCT sur loyalty_transactions (pas limité aux 8 dernières commandes)
  const loyalCustomersToday = new Set((loyaltyTx ?? []).map((t: { customer_id: string }) => t.customer_id)).size

  const summary: DashboardSummary = {
    kpis: {
      caToday,
      caYesterday,
      ordersToday: countToday,
      ordersYesterday: countYesterday,
      avgTicketToday: countToday > 0 ? caToday / countToday : 0,
      avgTicketYesterday: countYesterday > 0 ? caYesterday / countYesterday : 0,
      loyalCustomersToday,
    },
    hourlyActivity,
    stockAlerts,
    pendingDeliveries,
    topProducts,
    recentOrders,
  }

  return NextResponse.json(summary)
```

- [ ] **Step 4 : Vérifier TypeScript**

```bash
cd "/Users/anthony/Super pouvoir/Alloflow" && npx tsc --noEmit 2>&1 | head -30
```
Corriger toute erreur avant de continuer.

- [ ] **Step 5 : Commit**

```bash
git add src/app/api/dashboard/summary/route.ts
git commit -m "feat(dashboard): add GET /api/dashboard/summary route"
```

---

## Task 2 : Composants UI

**Files:**
- Create: `src/app/dashboard/_components/kpi-cards.tsx`
- Create: `src/app/dashboard/_components/hourly-chart.tsx`
- Create: `src/app/dashboard/_components/alerts-panel.tsx`
- Create: `src/app/dashboard/_components/top-products.tsx`
- Create: `src/app/dashboard/_components/recent-orders.tsx`

### 2a — KPI Cards

- [ ] **Step 1 : Créer `kpi-cards.tsx`**

```tsx
// src/app/dashboard/_components/kpi-cards.tsx
'use client'
import type { DashboardSummary } from '@/app/api/dashboard/summary/route'

function delta(today: number, yesterday: number) {
  if (yesterday === 0) return null
  const pct = ((today - yesterday) / yesterday) * 100
  return { value: pct, positive: pct >= 0 }
}

function DeltaBadge({ today, yesterday, suffix = '%' }: { today: number; yesterday: number; suffix?: string }) {
  const d = delta(today, yesterday)
  if (!d) return <span className="text-[var(--text3)] text-xs">—</span>
  return (
    <span className={d.positive ? 'text-[var(--green)] text-xs' : 'text-[var(--red)] text-xs'}>
      {d.positive ? '↑' : '↓'} {Math.abs(d.value).toFixed(1)}{suffix} vs hier
    </span>
  )
}

interface KpiCardsProps {
  kpis: DashboardSummary['kpis']
}

export function KpiCards({ kpis }: KpiCardsProps) {
  const cards = [
    {
      label: 'CA du jour',
      value: `${kpis.caToday.toFixed(2).replace('.', ',')} €`,
      color: 'var(--blue)',
      delta: <DeltaBadge today={kpis.caToday} yesterday={kpis.caYesterday} />,
    },
    {
      label: 'Commandes',
      value: String(kpis.ordersToday),
      color: 'var(--green)',
      delta: <DeltaBadge today={kpis.ordersToday} yesterday={kpis.ordersYesterday} suffix=" cmd" />,
    },
    {
      label: 'Ticket moyen',
      value: `${kpis.avgTicketToday.toFixed(2).replace('.', ',')} €`,
      color: 'var(--amber)',
      delta: <DeltaBadge today={kpis.avgTicketToday} yesterday={kpis.avgTicketYesterday} />,
    },
    {
      label: 'Clients fidèles',
      value: String(kpis.loyalCustomersToday),
      color: '#a855f7',
      delta: <span className="text-[var(--text3)] text-xs">pointés aujourd'hui</span>,
    },
  ]

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      {cards.map((c) => (
        <div
          key={c.label}
          className="rounded-xl p-5 border border-[var(--border)]"
          style={{ background: 'var(--surface)', borderTop: `2px solid ${c.color}` }}
        >
          <div className="text-[10px] font-bold uppercase tracking-widest text-[var(--text4)] mb-2.5">{c.label}</div>
          <div className="text-3xl font-extrabold tracking-tight text-[var(--text1)] mb-2">{c.value}</div>
          {c.delta}
        </div>
      ))}
    </div>
  )
}
```

### 2b — Hourly Chart

- [ ] **Step 2 : Créer `hourly-chart.tsx`**

```tsx
// src/app/dashboard/_components/hourly-chart.tsx
'use client'
import type { DashboardSummary } from '@/app/api/dashboard/summary/route'

interface HourlyChartProps {
  data: DashboardSummary['hourlyActivity']
}

export function HourlyChart({ data }: HourlyChartProps) {
  const now = new Date().getHours()
  const max = Math.max(...data.map(d => d.count), 1)

  return (
    <div className="rounded-xl border border-[var(--border)] p-5" style={{ background: 'var(--surface)' }}>
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="text-sm font-bold text-[var(--text1)]">Activité par heure</div>
          <div className="text-xs text-[var(--text3)] mt-0.5">Transactions aujourd'hui</div>
        </div>
        <span className="text-[10px] px-2 py-1 rounded-full font-semibold" style={{ background: 'rgba(16,185,129,0.12)', color: 'var(--green)' }}>
          ● En direct
        </span>
      </div>
      <div className="flex items-end gap-1.5 h-28 pt-2">
        {data.map(({ hour, count }) => {
          const heightPct = count === 0 ? 3 : Math.max(8, (count / max) * 100)
          const isNow = hour === now
          const isPast = hour < now
          const bg = isNow
            ? 'var(--blue)'
            : isPast
            ? 'rgba(29,78,216,0.45)'
            : 'rgba(29,78,216,0.12)'
          return (
            <div key={hour} className="flex-1 flex flex-col items-center gap-1 h-full justify-end">
              <div
                className="w-full rounded-t"
                style={{ height: `${heightPct}%`, background: bg, minHeight: '3px' }}
              />
              <div className="text-[9px] text-[var(--text4)]">{hour}h</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
```

### 2c — Alerts Panel

- [ ] **Step 3 : Créer `alerts-panel.tsx`**

```tsx
// src/app/dashboard/_components/alerts-panel.tsx
'use client'
import Link from 'next/link'
import type { DashboardSummary } from '@/app/api/dashboard/summary/route'

interface AlertsPanelProps {
  stockAlerts: DashboardSummary['stockAlerts']
  pendingDeliveries: DashboardSummary['pendingDeliveries']
}

export function AlertsPanel({ stockAlerts, pendingDeliveries }: AlertsPanelProps) {
  const total = stockAlerts.length + pendingDeliveries.length

  return (
    <div className="rounded-xl border border-[var(--border)] p-5" style={{ background: 'var(--surface)' }}>
      <div className="mb-3">
        <div className="text-sm font-bold text-[var(--text1)]">Alertes</div>
        <div className="text-xs text-[var(--text3)] mt-0.5">
          {total === 0 ? 'Tout est en ordre ✓' : `${total} élément${total > 1 ? 's' : ''} à traiter`}
        </div>
      </div>

      {total === 0 && (
        <div className="text-sm text-[var(--text3)] py-4 text-center">Aucune alerte active</div>
      )}

      <div className="flex flex-col divide-y divide-[var(--border)]/30">
        {stockAlerts.map((alert) => (
          <div key={alert.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
            <div
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ background: alert.level === 'critical' ? 'var(--red)' : 'var(--amber)' }}
            />
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium text-[var(--text1)] truncate">{alert.name}</div>
              <div className="text-[11px] text-[var(--text3)]">
                {alert.quantity} · seuil {alert.alertThreshold}
              </div>
            </div>
            <Link
              href="/dashboard/stocks"
              className="text-[10px] px-2 py-1 rounded border border-[var(--border)] text-[var(--text2)] hover:bg-[var(--surface2)] transition-colors flex-shrink-0"
            >
              Stocks →
            </Link>
          </div>
        ))}

        {pendingDeliveries.map((d) => (
          <div key={d.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
            <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: 'var(--blue)' }} />
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium text-[var(--text1)] truncate">Livraison reçue</div>
              <div className="text-[11px] text-[var(--text3)] truncate">{d.supplierName}</div>
            </div>
            <Link
              href="/dashboard/stocks"
              className="text-[10px] px-2 py-1 rounded border border-[var(--border)] text-[var(--text2)] hover:bg-[var(--surface2)] transition-colors flex-shrink-0"
            >
              Valider →
            </Link>
          </div>
        ))}
      </div>
    </div>
  )
}
```

### 2d — Top Products

- [ ] **Step 4 : Créer `top-products.tsx`**

```tsx
// src/app/dashboard/_components/top-products.tsx
'use client'
import type { DashboardSummary } from '@/app/api/dashboard/summary/route'

interface TopProductsProps {
  products: DashboardSummary['topProducts']
}

export function TopProducts({ products }: TopProductsProps) {
  const maxRevenue = products[0]?.revenue ?? 1

  return (
    <div className="rounded-xl border border-[var(--border)] p-5" style={{ background: 'var(--surface)' }}>
      <div className="mb-4">
        <div className="text-sm font-bold text-[var(--text1)]">Top produits du jour</div>
        <div className="text-xs text-[var(--text3)] mt-0.5">Par chiffre d'affaires</div>
      </div>

      {products.length === 0 && (
        <div className="text-sm text-[var(--text3)] py-4 text-center">Aucune vente pour le moment</div>
      )}

      <div className="flex flex-col divide-y divide-[var(--border)]/30">
        {products.map((p) => (
          <div key={p.rank} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
            <div className="w-5 text-[11px] font-bold text-[var(--text4)] text-center">#{p.rank}</div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-[var(--text1)] truncate">{p.name}</div>
              {p.category && <div className="text-[11px] text-[var(--text3)]">{p.category}</div>}
            </div>
            <div className="text-right">
              <div className="text-sm font-bold text-[var(--text1)]">{p.revenue.toFixed(2).replace('.', ',')} €</div>
              <div className="text-[11px] text-[var(--text3)]">{p.quantity} vendus</div>
              <div className="w-14 h-0.5 rounded mt-1 ml-auto" style={{ background: 'var(--surface2)' }}>
                <div
                  className="h-0.5 rounded"
                  style={{ width: `${(p.revenue / maxRevenue) * 100}%`, background: 'var(--blue)' }}
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
```

### 2e — Recent Orders

- [ ] **Step 5 : Créer `recent-orders.tsx`**

```tsx
// src/app/dashboard/_components/recent-orders.tsx
'use client'
import type { DashboardSummary } from '@/app/api/dashboard/summary/route'

function timeAgo(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (diff < 60) return `${diff}s`
  if (diff < 3600) return `${Math.floor(diff / 60)} min`
  return `${Math.floor(diff / 3600)}h`
}

const TIER_STYLE: Record<string, { bg: string; color: string }> = {
  gold:     { bg: 'rgba(245,158,11,0.15)',   color: '#fbbf24' },
  silver:   { bg: 'rgba(148,163,184,0.15)',  color: '#cbd5e1' },
  standard: { bg: 'var(--surface2)',          color: 'var(--text2)' },
}

interface RecentOrdersProps {
  orders: DashboardSummary['recentOrders']
}

export function RecentOrders({ orders }: RecentOrdersProps) {
  return (
    <div className="rounded-xl border border-[var(--border)] p-5" style={{ background: 'var(--surface)' }}>
      <div className="mb-4">
        <div className="text-sm font-bold text-[var(--text1)]">Activité récente</div>
        <div className="text-xs text-[var(--text3)] mt-0.5">Dernières transactions</div>
      </div>

      {orders.length === 0 && (
        <div className="text-sm text-[var(--text3)] py-4 text-center">Aucune commande pour le moment</div>
      )}

      <div className="flex flex-col divide-y divide-[var(--border)]/30">
        {orders.map((o) => {
          const initials = o.customerName
            ? o.customerName.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
            : '—'
          const tierStyle = o.customerTier ? TIER_STYLE[o.customerTier] : TIER_STYLE['standard']

          return (
            <div key={o.id} className="flex items-start gap-2.5 py-2.5 first:pt-0 last:pb-0">
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0"
                style={{ background: tierStyle.bg, color: tierStyle.color }}
              >
                {initials}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium text-[var(--text1)]">
                  {o.customerName ?? 'Anonyme'} · #{o.orderNumber}
                </div>
                <div className="text-[11px] text-[var(--text3)] truncate mt-0.5">
                  {o.itemsSummary || '—'} · {o.totalAmount.toFixed(2).replace('.', ',')} €
                </div>
              </div>
              <div className="text-[11px] text-[var(--text4)] flex-shrink-0">{timeAgo(o.createdAt)}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
```

- [ ] **Step 6 : Vérifier TypeScript**

```bash
cd "/Users/anthony/Super pouvoir/Alloflow" && npx tsc --noEmit 2>&1 | head -30
```

- [ ] **Step 7 : Commit**

```bash
git add src/app/dashboard/_components/kpi-cards.tsx \
        src/app/dashboard/_components/hourly-chart.tsx \
        src/app/dashboard/_components/alerts-panel.tsx \
        src/app/dashboard/_components/top-products.tsx \
        src/app/dashboard/_components/recent-orders.tsx
git commit -m "feat(dashboard): add home page UI components"
```

---

## Task 3 : Client Shell et Page SSR

**Files:**
- Create: `src/app/dashboard/dashboard-page-client.tsx`
- Create: `src/app/dashboard/page.tsx`

- [ ] **Step 1 : Créer `dashboard-page-client.tsx`**

```tsx
// src/app/dashboard/dashboard-page-client.tsx
'use client'
import type { DashboardSummary } from '@/app/api/dashboard/summary/route'
import { KpiCards } from './_components/kpi-cards'
import { HourlyChart } from './_components/hourly-chart'
import { AlertsPanel } from './_components/alerts-panel'
import { TopProducts } from './_components/top-products'
import { RecentOrders } from './_components/recent-orders'

interface DashboardPageClientProps {
  summary: DashboardSummary
  establishmentName: string
}

export function DashboardPageClient({ summary, establishmentName }: DashboardPageClientProps) {
  const today = new Date().toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-[var(--text1)]">Vue d'ensemble</h1>
        <p className="text-sm text-[var(--text3)] mt-0.5 capitalize">{today}</p>
      </div>

      <KpiCards kpis={summary.kpis} />

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4 mb-4">
        <HourlyChart data={summary.hourlyActivity} />
        <AlertsPanel
          stockAlerts={summary.stockAlerts}
          pendingDeliveries={summary.pendingDeliveries}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <TopProducts products={summary.topProducts} />
        <RecentOrders orders={summary.recentOrders} />
      </div>
    </div>
  )
}
```

- [ ] **Step 2 : Créer `page.tsx`**

```tsx
// src/app/dashboard/page.tsx
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { DashboardPageClient } from './dashboard-page-client'
import type { DashboardSummary } from '@/app/api/dashboard/summary/route'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('establishment_id, role')
    .eq('id', user.id)
    .single()

  if (!profile?.establishment_id) redirect('/login')

  // Récupérer le nom de l'établissement
  const { data: establishment } = await supabase
    .from('establishments')
    .select('name')
    .eq('id', profile.establishment_id)
    .single()

  // Fetch du summary via la route API (appel interne SSR)
  const { cookies } = await import('next/headers')
  const cookieStore = await cookies()
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const res = await fetch(`${baseUrl}/api/dashboard/summary`, {
    headers: { cookie: cookieStore.toString() },
    cache: 'no-store',
  })

  let summary: DashboardSummary
  if (res.ok) {
    summary = await res.json()
  } else {
    // État dégradé : données vides
    summary = {
      kpis: { caToday: 0, caYesterday: 0, ordersToday: 0, ordersYesterday: 0, avgTicketToday: 0, avgTicketYesterday: 0, loyalCustomersToday: 0 },
      hourlyActivity: Array.from({ length: 13 }, (_, i) => ({ hour: 8 + i, count: 0 })),
      stockAlerts: [],
      pendingDeliveries: [],
      topProducts: [],
      recentOrders: [],
    }
  }

  return (
    <DashboardPageClient
      summary={summary}
      establishmentName={establishment?.name ?? 'Alloflow'}
    />
  )
}
```

> **Note sur le fetch SSR :** Appeler sa propre API route via `fetch` est le pattern recommandé Next.js pour garder la route API testable indépendamment. Utiliser `cache: 'no-store'` pour des données temps réel. Les cookies de session sont forwarded manuellement pour l'auth.

- [ ] **Step 3 : Vérifier TypeScript**

```bash
cd "/Users/anthony/Super pouvoir/Alloflow" && npx tsc --noEmit 2>&1 | head -30
```

- [ ] **Step 4 : Lancer le dev server et vérifier visuellement**

```bash
cd "/Users/anthony/Super pouvoir/Alloflow" && npm run dev
```

Ouvrir http://localhost:3000/dashboard — la page doit s'afficher avec les 4 sections. Vérifier :
- KPIs affichent des valeurs (0 si pas de commandes aujourd'hui, c'est normal)
- Graphique horaire affiche 13 barres (8h–20h)
- Pas d'erreur console TypeScript / runtime

- [ ] **Step 5 : Commit**

```bash
git add src/app/dashboard/page.tsx src/app/dashboard/dashboard-page-client.tsx
git commit -m "feat(dashboard): add dashboard home page with SSR summary"
```

---

## Task 4 : Vérification finale

- [ ] **Step 1 : TypeScript clean**

```bash
cd "/Users/anthony/Super pouvoir/Alloflow" && npx tsc --noEmit 2>&1
```
Expected : aucune erreur.

- [ ] **Step 2 : Vérifier la sidebar pointe bien sur `/dashboard`**

Dans `src/app/dashboard/_components/sidebar.tsx`, l'item Dashboard a déjà `href: '/dashboard'` et `exact: true` — il sera actif sur la nouvelle page. Rien à modifier.

- [ ] **Step 3 : Vérifier le layout dashboard**

Dans `src/app/dashboard/layout.tsx`, confirmer qu'il n'y a pas de redirection forcée depuis `/dashboard` vers une sous-page. Si oui, supprimer la redirection.

- [ ] **Step 4 : Commit final**

```bash
git add -p
git commit -m "feat(dashboard): complete home page sprint 12"
```
