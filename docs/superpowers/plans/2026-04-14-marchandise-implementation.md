# Marchandise Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `/dashboard/stocks` + `/dashboard/recettes` with a unified `/dashboard/marchandise` page exposing 4 tabs: Marchandise · Recettes · En vente · Aperçu caisse.

**Architecture:** New route at `src/app/dashboard/marchandise/` following the `page.tsx (SSR) → *-page-client.tsx (shell) → _components/` pattern. Old routes redirect 301. Two lightweight DB migrations add `network_status` (enum string) to `stock_items` and `recipes`, plus `sop_required` (boolean) to `recipes`. The aperçu-caisse tab is a shared component also used in franchise pilotage.

**Tech Stack:** Next.js 16 App Router, TypeScript strict, Supabase (postgres_changes), Tailwind 4, CSS vars (`--bg --surface --surface2 --border --text1→--text4 --blue`)

---

## Reference files (read before coding)

| File | Why |
|------|-----|
| `src/app/dashboard/stocks/page.tsx` | SSR pattern to replicate |
| `src/app/dashboard/stocks/_components/stocks-page-client.tsx` | Existing stock UI to adapt |
| `src/app/dashboard/stocks/_components/stock-item-form.tsx` | Modal to reuse as-is |
| `src/app/dashboard/stocks/_components/types.ts` | `StockItem` type |
| `src/app/dashboard/recettes/page.tsx` | SSR pattern + Supabase join query |
| `src/app/dashboard/recettes/_components/recettes-page-client.tsx` | Existing recipe UI |
| `src/app/dashboard/recettes/_components/recipe-form.tsx` | Modal to reuse as-is |
| `src/app/dashboard/recettes/_components/types.ts` | `Recipe` type |
| `src/app/dashboard/sops/_components/sop-form.tsx` | SOP modal to reuse |
| `src/app/dashboard/sops/_components/sop-kitchen-mode.tsx` | Kitchen mode component |
| `src/app/dashboard/_components/sidebar.tsx` | `NAV_ITEMS` array to update |
| `src/app/dashboard/franchise/pilotage/[establishmentId]/_components/pilotage-detail-client.tsx` | Pilotage tabs to update |
| `src/app/dashboard/franchise/pilotage/[establishmentId]/page.tsx` | Pilotage SSR page |
| `src/lib/types/database.ts` | Supabase-generated types (read-only reference) |

---

## File Map

### New files
```
src/app/dashboard/marchandise/
  page.tsx                              # SSR: auth guard + data fetch
  loading.tsx                           # Skeleton
  _components/
    types.ts                            # MarchandiseItem, EnVenteItem, SopWithSteps
    marchandise-page-client.tsx         # Shell: KPIs + tab switcher
    network-status-select.tsx           # Shared inline dropdown for network_status
    tab-marchandise.tsx                 # Onglet 📦 Marchandise
    tab-recettes.tsx                    # Onglet 🍳 Recettes (expandable rows)
    sop-panel.tsx                       # SOP volet inside expanded recipe row
    tab-en-vente.tsx                    # Onglet 🛒 En vente
    tab-apercu-caisse.tsx               # Onglet 🖥️ Aperçu caisse (shared)
    en-vente-edit-modal.tsx             # Modal légère édition prix/TVA/catégorie
```

### Modified files
```
src/app/dashboard/stocks/page.tsx                               # → redirect 301
src/app/dashboard/recettes/page.tsx                             # → redirect 301
src/app/dashboard/_components/sidebar.tsx                       # NAV_ITEMS update
src/app/dashboard/franchise/pilotage/[establishmentId]/
  page.tsx                                                      # Add aperçu caisse data fetch
  _components/pilotage-detail-client.tsx                        # Add tab aperçu caisse, remove stocks tab
CLAUDE.md                                                       # Document new architecture
```

---

## Task 1: DB Migrations

**Files:**
- Create: `supabase/migrations/20260414000001_add_network_status_stock_items.sql`
- Create: `supabase/migrations/20260414000002_add_network_status_recipes.sql`

- [ ] **Step 1.1: Create migration for stock_items**

```sql
-- supabase/migrations/20260414000001_add_network_status_stock_items.sql
ALTER TABLE stock_items
  ADD COLUMN IF NOT EXISTS network_status text NOT NULL DEFAULT 'not_shared'
  CHECK (network_status IN ('active', 'inactive', 'coming_soon', 'not_shared'));
```

- [ ] **Step 1.2: Create migration for recipes**

```sql
-- supabase/migrations/20260414000002_add_network_status_recipes.sql
ALTER TABLE recipes
  ADD COLUMN IF NOT EXISTS network_status text NOT NULL DEFAULT 'not_shared'
  CHECK (network_status IN ('active', 'inactive', 'coming_soon', 'not_shared')),
  ADD COLUMN IF NOT EXISTS sop_required boolean NOT NULL DEFAULT false;
```

- [ ] **Step 1.3: Diff then push**

```bash
cd /path/to/alloflow
npx supabase db diff
npx supabase db push
```

Expected: both migrations apply cleanly, no errors.

- [ ] **Step 1.4: Regenerate Supabase types**

```bash
npx supabase gen types typescript --project-id vblxzfsddxhtthycsmim > src/lib/types/database.ts
```

- [ ] **Step 1.5: Commit**

```bash
git add supabase/migrations/ src/lib/types/database.ts
git commit -m "feat(db): add network_status to stock_items and recipes, sop_required to recipes"
```

---

## Task 2: Types

**Files:**
- Create: `src/app/dashboard/marchandise/_components/types.ts`

- [ ] **Step 2.1: Create types.ts**

```typescript
// src/app/dashboard/marchandise/_components/types.ts

export type NetworkStatus = 'active' | 'inactive' | 'coming_soon' | 'not_shared'

// Marchandise = stock_item enriched
export interface MarchandiseItem {
  id: string
  establishment_id: string
  name: string
  category: string | null
  unit: string
  purchase_price: number        // prix d'achat HT
  purchase_qty: number          // quantité par unité d'achat
  supplier: string | null
  supplier_ref: string | null
  is_pos: boolean               // vendu en caisse directement
  pos_price: number | null      // prix TTC caisse (si is_pos)
  pos_tva_rate: number          // TVA % (défaut 10)
  pos_category_id: string | null
  product_id: string | null
  active: boolean
  network_status: NetworkStatus
}

// Article en vente = direct ou recette
export type EnVenteOrigin = 'direct' | 'recette'

export interface EnVenteItem {
  id: string                    // product_id
  name: string
  origin: EnVenteOrigin
  source_id: string             // stock_item.id ou recipe.id
  category_id: string | null
  category_name: string | null
  price_ttc: number
  tva_rate: number
  food_cost_pct: number | null  // null pour direct, calculé pour recettes
  margin_pct: number | null
  network_status: NetworkStatus
}

export interface SopStep {
  id: string
  sop_id: string
  title: string
  description: string
  sort_order: number
  duration_seconds: number | null
  media_url: string | null
}

export interface SopWithSteps {
  id: string
  title: string
  recipe_id: string | null
  active: boolean
  steps: SopStep[]
}

// Recette enrichie pour l'onglet Recettes
export interface RecipeRow {
  id: string
  establishment_id: string
  title: string
  category: string | null
  portion: string | null
  is_internal: boolean          // false = vendu en POS
  active: boolean
  sop_required: boolean
  network_status: NetworkStatus
  ingredients: {
    id: string
    name: string
    quantity: number
    unit: string
    unit_cost: number
    sort_order: number
  }[]
  product: {
    id: string
    name: string
    price: number               // HT en DB
    tva_rate: number
    category_id: string | null
    is_active: boolean
  } | null
  sop: SopWithSteps | null
  food_cost_amount: number
  food_cost_pct: number | null
}

export interface PosCategory {
  id: string
  name: string
  color_hex: string
  icon?: string | null
}
```

- [ ] **Step 2.2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors on the new file.

- [ ] **Step 2.3: Commit**

```bash
git add src/app/dashboard/marchandise/
git commit -m "feat(marchandise): add types"
```

---

## Task 3: NetworkStatusSelect component

**Files:**
- Create: `src/app/dashboard/marchandise/_components/network-status-select.tsx`

This is a self-contained inline dropdown used on every row in the Marchandise and Recettes tabs.

- [ ] **Step 3.1: Create the component**

```tsx
// src/app/dashboard/marchandise/_components/network-status-select.tsx
'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { NetworkStatus } from './types'

const OPTIONS: { value: NetworkStatus; label: string; dot: string; style: React.CSSProperties }[] = [
  {
    value: 'active',
    label: 'Actif',
    dot: '●',
    style: { background: 'rgba(16,185,129,.1)', color: 'var(--green)', border: '1px solid rgba(16,185,129,.25)' },
  },
  {
    value: 'inactive',
    label: 'Inactif',
    dot: '○',
    style: { background: 'rgba(100,116,139,.1)', color: 'var(--text4)', border: '1px solid rgba(100,116,139,.2)' },
  },
  {
    value: 'coming_soon',
    label: 'Prochainement',
    dot: '◑',
    style: { background: 'rgba(168,85,247,.1)', color: '#d8b4fe', border: '1px solid rgba(168,85,247,.25)' },
  },
  {
    value: 'not_shared',
    label: '+ Partager',
    dot: '',
    style: { background: 'transparent', color: 'var(--text4)', border: '1px dashed var(--border)' },
  },
]

interface Props {
  value: NetworkStatus
  table: 'stock_items' | 'recipes'
  id: string
  onUpdate?: (value: NetworkStatus) => void
  readOnly?: boolean
}

export function NetworkStatusSelect({ value, table, id, onUpdate, readOnly }: Props) {
  const [current, setCurrent] = useState<NetworkStatus>(value)
  const [open, setOpen] = useState(false)

  const option = OPTIONS.find(o => o.value === current) ?? OPTIONS[3]

  async function handleSelect(next: NetworkStatus) {
    setOpen(false)
    if (next === current) return
    setCurrent(next)
    onUpdate?.(next)
    const supabase = createClient()
    await supabase.from(table).update({ network_status: next }).eq('id', id)
  }

  if (readOnly) {
    return (
      <span
        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap"
        style={option.style}
      >
        {option.dot && <span>{option.dot}</span>}
        {option.label}
      </span>
    )
  }

  return (
    <div className="relative inline-block">
      <button
        onClick={() => setOpen(v => !v)}
        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap cursor-pointer"
        style={option.style}
      >
        {option.dot && <span>{option.dot}</span>}
        {option.label}
        <span className="ml-0.5 opacity-60">▾</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div
            className="absolute left-0 top-full mt-1 z-20 rounded-xl overflow-hidden shadow-lg min-w-[160px]"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
          >
            {OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => handleSelect(opt.value)}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold hover:bg-[var(--surface2)] transition-colors text-left"
              >
                <span
                  className="w-5 h-5 rounded-full flex items-center justify-center text-[10px]"
                  style={{ background: opt.style.background as string, color: opt.style.color as string }}
                >
                  {opt.dot || '+'}
                </span>
                <span style={{ color: opt.style.color as string }}>{opt.label}</span>
                {opt.value === current && <span className="ml-auto text-[var(--blue)]">✓</span>}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 3.2: TypeScript check**

```bash
npx tsc --noEmit
```

- [ ] **Step 3.3: Commit**

```bash
git add src/app/dashboard/marchandise/_components/network-status-select.tsx
git commit -m "feat(marchandise): add NetworkStatusSelect component"
```

---

## Task 4: Page shell + SSR + loading

**Files:**
- Create: `src/app/dashboard/marchandise/page.tsx`
- Create: `src/app/dashboard/marchandise/loading.tsx`
- Create: `src/app/dashboard/marchandise/_components/marchandise-page-client.tsx`

- [ ] **Step 4.1: Create loading.tsx**

```tsx
// src/app/dashboard/marchandise/loading.tsx
export default function Loading() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="h-8 w-48 rounded-lg" style={{ background: 'var(--surface2)' }} />
      <div className="grid grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-24 rounded-xl" style={{ background: 'var(--surface)' }} />
        ))}
      </div>
      <div className="h-10 rounded-xl" style={{ background: 'var(--surface)' }} />
      <div className="h-64 rounded-xl" style={{ background: 'var(--surface)' }} />
    </div>
  )
}
```

- [ ] **Step 4.2: Create SSR page.tsx**

Read `src/app/dashboard/recettes/page.tsx` before writing — the Supabase join pattern is the same. This page fetches stock_items, recipes (with ingredients + products + sops), and categories in parallel.

```tsx
// src/app/dashboard/marchandise/page.tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { MarchandisePageClient } from './_components/marchandise-page-client'
import type { MarchandiseItem, RecipeRow, PosCategory } from './_components/types'

export default async function MarchandisePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('establishment_id')
    .eq('id', user.id)
    .single()
  if (!profile?.establishment_id) redirect('/dashboard')

  const eid = profile.establishment_id

  const [stockRes, recipesRes, categoriesRes] = await Promise.all([
    supabase
      .from('stock_items')
      .select('*')
      .eq('establishment_id', eid)
      .eq('active', true)
      .order('name'),
    supabase
      .from('recipes')
      .select(`
        *,
        ingredients:recipe_ingredients(id, name, quantity, unit, unit_cost, sort_order),
        product:products!products_recipe_id_fkey(id, name, price, tva_rate, category_id, is_active),
        sop:sops(id, title, recipe_id, active, steps:sop_steps(id, sop_id, title, description, sort_order, duration_seconds, media_url))
      `)
      .eq('establishment_id', eid)
      .eq('active', true)
      .order('title'),
    supabase
      .from('categories')
      .select('id, name, color_hex, icon')
      .eq('establishment_id', eid)
      .order('sort_order'),
  ])

  const items: MarchandiseItem[] = (stockRes.data ?? []).map(i => ({
    id: i.id,
    establishment_id: i.establishment_id,
    name: i.name,
    category: i.category,
    unit: i.unit,
    purchase_price: (i as Record<string, number>).purchase_price ?? 0,
    purchase_qty: (i as Record<string, number>).purchase_qty ?? 1,
    supplier: i.supplier,
    supplier_ref: i.supplier_ref,
    is_pos: Boolean((i as Record<string, unknown>).is_pos),
    pos_price: (i as Record<string, number | null>).pos_price ?? null,
    pos_tva_rate: (i as Record<string, number>).pos_tva_rate ?? 10,
    pos_category_id: (i as Record<string, string | null>).pos_category_id ?? null,
    product_id: (i as Record<string, string | null>).product_id ?? null,
    active: i.active,
    network_status: ((i as Record<string, string>).network_status ?? 'not_shared') as MarchandiseItem['network_status'],
  }))

  const recipes: RecipeRow[] = (recipesRes.data ?? []).map(r => {
    const ings = r.ingredients ?? []
    const foodCostAmount = ings.reduce(
      (sum: number, i: { quantity: number; unit_cost: number }) => sum + i.quantity * i.unit_cost, 0
    )
    const product = r.product?.[0] ?? null
    const foodCostPct = product?.price && product.price > 0
      ? Math.round((foodCostAmount / product.price) * 1000) / 10
      : null
    const sopRaw = r.sop?.[0] ?? null

    return {
      id: r.id,
      establishment_id: r.establishment_id,
      title: r.title,
      category: r.category,
      portion: r.portion,
      is_internal: r.is_internal,
      active: r.active,
      sop_required: Boolean((r as Record<string, unknown>).sop_required),
      network_status: ((r as Record<string, string>).network_status ?? 'not_shared') as RecipeRow['network_status'],
      ingredients: ings,
      product,
      sop: sopRaw ? { ...sopRaw, steps: sopRaw.steps ?? [] } : null,
      food_cost_amount: foodCostAmount,
      food_cost_pct: foodCostPct,
    }
  })

  const categories: PosCategory[] = (categoriesRes.data ?? [])

  const { tab } = await searchParams
  const initialTab = (['marchandise', 'recettes', 'en-vente', 'apercu-caisse'] as const)
    .includes(tab as 'marchandise') ? tab as string : 'marchandise'

  return (
    <MarchandisePageClient
      initialItems={items}
      initialRecipes={recipes}
      categories={categories}
      establishmentId={eid}
      initialTab={initialTab}
    />
  )
}
```

- [ ] **Step 4.3: Create MarchandisePageClient shell**

This component owns the tab state, KPIs, and tab switcher. The tab content components are imported separately.

```tsx
// src/app/dashboard/marchandise/_components/marchandise-page-client.tsx
'use client'
import { useState } from 'react'
import type { MarchandiseItem, RecipeRow, PosCategory } from './types'

// Tabs imported lazily to keep this file small
import { TabMarchandise } from './tab-marchandise'
import { TabRecettes } from './tab-recettes'
import { TabEnVente } from './tab-en-vente'
import { TabApercuCaisse } from './tab-apercu-caisse'

type Tab = 'marchandise' | 'recettes' | 'en-vente' | 'apercu-caisse'

interface Props {
  initialItems: MarchandiseItem[]
  initialRecipes: RecipeRow[]
  categories: PosCategory[]
  establishmentId: string
  initialTab: string
}

export function MarchandisePageClient({
  initialItems,
  initialRecipes,
  categories,
  establishmentId,
  initialTab,
}: Props) {
  const [items, setItems] = useState(initialItems)
  const [recipes, setRecipes] = useState(initialRecipes)
  const [tab, setTab] = useState<Tab>(
    (['marchandise', 'recettes', 'en-vente', 'apercu-caisse'] as const).includes(initialTab as Tab)
      ? (initialTab as Tab)
      : 'marchandise'
  )

  // KPIs
  const directCount = items.filter(i => i.is_pos).length
  const recipeProductCount = recipes.filter(r => !r.is_internal).length
  const enVenteCount = directCount + recipeProductCount
  const activeRecipesWithFC = recipes.filter(r => r.food_cost_pct !== null)
  const avgFoodCost = activeRecipesWithFC.length > 0
    ? Math.round(activeRecipesWithFC.reduce((s, r) => s + (r.food_cost_pct ?? 0), 0) / activeRecipesWithFC.length * 10) / 10
    : null
  const sharedCount = [
    ...items.filter(i => i.network_status === 'active'),
    ...recipes.filter(r => r.network_status === 'active'),
  ].length
  const comingSoonCount = [
    ...items.filter(i => i.network_status === 'coming_soon'),
    ...recipes.filter(r => r.network_status === 'coming_soon'),
  ].length

  const TABS: { id: Tab; label: string; count?: number }[] = [
    { id: 'marchandise',    label: '📦 Marchandise',    count: items.length },
    { id: 'recettes',      label: '🍳 Recettes',       count: recipes.length },
    { id: 'en-vente',      label: '🛒 En vente',       count: enVenteCount },
    { id: 'apercu-caisse', label: '🖥️ Aperçu caisse' },
  ]

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-[var(--text1)]">Marchandise</h1>
          <p className="text-xs text-[var(--text4)] mt-1">Achats · Recettes · Articles en vente</p>
        </div>
        {tab === 'marchandise' && (
          <button
            className="px-4 py-2 rounded-lg text-sm font-semibold text-white"
            style={{ background: 'var(--blue)' }}
            onClick={() => {/* handled inside TabMarchandise */}}
            id="btn-add-marchandise"
          >
            + Ajouter
          </button>
        )}
        {tab === 'recettes' && (
          <button
            className="px-4 py-2 rounded-lg text-sm font-semibold text-white"
            style={{ background: 'var(--blue)' }}
            id="btn-add-recette"
          >
            + Nouvelle recette
          </button>
        )}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <div className="rounded-xl p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <div className="text-xs font-semibold uppercase tracking-wide text-[var(--text4)] mb-2">Marchandises</div>
          <div className="text-3xl font-black text-[var(--text1)]">{items.length}</div>
          <div className="text-xs text-[var(--text4)] mt-1">matières achetées</div>
        </div>
        <div className="rounded-xl p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <div className="text-xs font-semibold uppercase tracking-wide text-[var(--text4)] mb-2">Articles en vente</div>
          <div className="text-3xl font-black" style={{ color: 'var(--blue)' }}>{enVenteCount}</div>
          <div className="text-xs text-[var(--text4)] mt-1">{directCount} directs + {recipeProductCount} recettes</div>
        </div>
        <div className="rounded-xl p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <div className="text-xs font-semibold uppercase tracking-wide text-[var(--text4)] mb-2">Food cost moyen</div>
          <div className="text-3xl font-black" style={{ color: avgFoodCost !== null && avgFoodCost < 30 ? 'var(--green)' : 'var(--orange)' }}>
            {avgFoodCost !== null ? `${avgFoodCost}%` : '—'}
          </div>
          <div className="text-xs text-[var(--text4)] mt-1">Sur recettes actives</div>
        </div>
        <div className="rounded-xl p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <div className="text-xs font-semibold uppercase tracking-wide text-[var(--text4)] mb-2">Partagés réseau</div>
          <div className="text-3xl font-black" style={{ color: '#d8b4fe' }}>{sharedCount}</div>
          <div className="text-xs text-[var(--text4)] mt-1">{comingSoonCount > 0 ? `${comingSoonCount} prochainement` : 'actifs'}</div>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 p-1 rounded-xl mb-5" style={{ background: 'var(--surface)' }}>
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={[
              'flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap',
              tab === t.id ? 'text-[var(--text1)]' : 'text-[var(--text4)] hover:text-[var(--text2)]',
            ].join(' ')}
            style={tab === t.id ? { background: 'var(--bg)', boxShadow: '0 1px 3px rgba(0,0,0,.2)' } : undefined}
          >
            {t.label}
            {t.count !== undefined && (
              <span className="ml-1.5 opacity-50 text-[11px]">({t.count})</span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'marchandise' && (
        <TabMarchandise
          items={items}
          categories={categories}
          establishmentId={establishmentId}
          onItemsChange={setItems}
        />
      )}
      {tab === 'recettes' && (
        <TabRecettes
          recipes={recipes}
          categories={categories}
          establishmentId={establishmentId}
          onRecipesChange={setRecipes}
        />
      )}
      {tab === 'en-vente' && (
        <TabEnVente
          items={items}
          recipes={recipes}
          categories={categories}
          establishmentId={establishmentId}
        />
      )}
      {tab === 'apercu-caisse' && (
        <TabApercuCaisse
          items={items}
          recipes={recipes}
          categories={categories}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 4.4: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: errors for missing tab components (normal — they don't exist yet). Ignore those. Fix any other errors.

- [ ] **Step 4.5: Commit**

```bash
git add src/app/dashboard/marchandise/
git commit -m "feat(marchandise): add page shell, SSR data fetch, KPIs, tab switcher"
```

---

## Task 5: Tab Marchandise

**Files:**
- Create: `src/app/dashboard/marchandise/_components/tab-marchandise.tsx`

**Before coding:** Read `src/app/dashboard/stocks/_components/stocks-page-client.tsx` and `stock-item-form.tsx` to understand the existing CRUD modal pattern. The modal is reused from stocks — do NOT copy-paste it; import it from its original location.

- [ ] **Step 5.1: Create tab-marchandise.tsx**

```tsx
// src/app/dashboard/marchandise/_components/tab-marchandise.tsx
'use client'
import { useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { MarchandiseItem, PosCategory, NetworkStatus } from './types'
import { NetworkStatusSelect } from './network-status-select'
// Reuse existing form from stocks — do not duplicate
import { StockItemForm } from '@/app/dashboard/stocks/_components/stock-item-form'
import type { StockItem } from '@/app/dashboard/stocks/_components/types'

interface Props {
  items: MarchandiseItem[]
  categories: PosCategory[]
  establishmentId: string
  onItemsChange: (items: MarchandiseItem[]) => void
}

type UsageFilter = 'all' | 'direct' | 'recipe'

export function TabMarchandise({ items, categories, establishmentId, onItemsChange }: Props) {
  const [usageFilter, setUsageFilter] = useState<UsageFilter>('all')
  const [catFilter, setCatFilter] = useState<string | null>(null)
  const [editItem, setEditItem] = useState<StockItem | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const filtered = useMemo(() => {
    let list = items
    if (usageFilter === 'direct') list = list.filter(i => i.is_pos)
    if (usageFilter === 'recipe') list = list.filter(i => !i.is_pos)
    if (catFilter) list = list.filter(i => i.category === catFilter)
    return list
  }, [items, usageFilter, catFilter])

  const uniqueCategories = useMemo(
    () => [...new Set(items.map(i => i.category).filter(Boolean))] as string[],
    [items]
  )

  function toStockItem(m: MarchandiseItem): StockItem {
    return {
      ...m,
      quantity: 0,
      alert_threshold: 0,
      order_quantity: 0,
      unit_price: m.purchase_price,
      status: 'ok',
    }
  }

  function handleNetworkUpdate(id: string, value: NetworkStatus) {
    onItemsChange(items.map(i => i.id === id ? { ...i, network_status: value } : i))
  }

  async function handleDelete(id: string) {
    const supabase = createClient()
    await supabase.from('stock_items').update({ active: false }).eq('id', id)
    onItemsChange(items.filter(i => i.id !== id))
    setDeleteId(null)
  }

  async function handleDuplicate(item: MarchandiseItem) {
    const supabase = createClient()
    const { data } = await supabase
      .from('stock_items')
      .insert({
        establishment_id: establishmentId,
        name: `Copie de ${item.name}`,
        category: item.category,
        unit: item.unit,
        purchase_price: item.purchase_price,
        purchase_qty: item.purchase_qty,
        supplier: item.supplier,
        supplier_ref: item.supplier_ref,
        is_pos: item.is_pos,
        pos_price: item.pos_price,
        pos_tva_rate: item.pos_tva_rate,
        pos_category_id: item.pos_category_id,
        alert_threshold: 0,
        active: true,
        network_status: 'not_shared',
      })
      .select('*')
      .single()
    if (data) {
      onItemsChange([
        ...items,
        {
          ...item,
          id: data.id,
          name: data.name,
          network_status: 'not_shared',
        },
      ])
    }
  }

  return (
    <div>
      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-3">
        <span className="text-xs font-semibold text-[var(--text4)] self-center">Filtrer :</span>
        {(['all', 'direct', 'recipe'] as UsageFilter[]).map(f => (
          <button
            key={f}
            onClick={() => setUsageFilter(f)}
            className={[
              'px-3 py-1 rounded-lg text-xs font-medium border transition-colors',
              usageFilter === f
                ? 'text-[var(--text1)] border-[var(--text4)]'
                : 'text-[var(--text4)] border-[var(--border)] hover:border-[var(--text4)]',
            ].join(' ')}
            style={usageFilter === f ? { background: 'var(--surface2)' } : undefined}
          >
            {f === 'all' ? `Tout (${items.length})` : f === 'direct' ? `🛒 Vendu direct (${items.filter(i => i.is_pos).length})` : `🍳 En recette`}
          </button>
        ))}
      </div>
      {uniqueCategories.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          <span className="text-xs font-semibold text-[var(--text4)] self-center">Catégorie :</span>
          <button
            onClick={() => setCatFilter(null)}
            className={['px-3 py-1 rounded-2xl text-xs font-semibold border', !catFilter ? 'text-[var(--text1)] border-[var(--text4)]' : 'text-[var(--text4)] border-[var(--border)]'].join(' ')}
          >
            Tout
          </button>
          {uniqueCategories.map(cat => (
            <button
              key={cat}
              onClick={() => setCatFilter(catFilter === cat ? null : cat)}
              className={['px-3 py-1 rounded-2xl text-xs font-semibold border', catFilter === cat ? 'text-[var(--text1)] border-[var(--text4)]' : 'text-[var(--text4)] border-[var(--border)]'].join(' ')}
            >
              {cat}
            </button>
          ))}
        </div>
      )}

      {/* Table */}
      <div className="rounded-xl overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        {/* Head */}
        <div
          className="grid gap-3 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-[var(--text4)] border-b border-[var(--border)]"
          style={{ gridTemplateColumns: '1.8fr 110px 90px 130px 140px 80px' }}
        >
          <span>Article</span>
          <span className="hidden lg:block">Catégorie</span>
          <span>Coût achat</span>
          <span>Vente directe</span>
          <span className="hidden md:block">Statut réseau</span>
          <span>Actions</span>
        </div>

        {filtered.length === 0 && (
          <div className="px-4 py-12 text-center text-sm text-[var(--text4)]">Aucun article</div>
        )}

        {filtered.map(item => {
          const unitCost = item.purchase_qty > 0 ? item.purchase_price / item.purchase_qty : item.purchase_price
          const priceTTC = item.pos_price !== null ? item.pos_price * (1 + item.pos_tva_rate / 100) : null
          const marginPct = priceTTC && unitCost > 0 ? Math.round((1 - unitCost / priceTTC) * 1000) / 10 : null

          return (
            <div
              key={item.id}
              className="grid gap-3 px-4 py-3 items-center border-t border-[var(--border)] hover:bg-[var(--surface2)] transition-colors"
              style={{ gridTemplateColumns: '1.8fr 110px 90px 130px 140px 80px' }}
            >
              {/* Article */}
              <div>
                <div className="text-sm font-semibold text-[var(--text1)]">{item.name}</div>
                {item.supplier && <div className="text-xs text-[var(--text4)] mt-0.5">{item.supplier}{item.supplier_ref ? ` · ${item.supplier_ref}` : ''}</div>}
              </div>

              {/* Catégorie */}
              <span className="hidden lg:block text-xs text-[var(--text3)]">{item.category ?? '—'}</span>

              {/* Coût achat */}
              <span className="text-sm text-[var(--text2)] tabular-nums">
                {item.purchase_price.toFixed(2)} €/{item.unit}
              </span>

              {/* Vente directe */}
              {item.is_pos && priceTTC !== null ? (
                <div>
                  <div className="text-sm font-bold text-[var(--text1)]">{priceTTC.toFixed(2)} €</div>
                  {marginPct !== null && (
                    <div className="text-xs text-[var(--text4)]">Marge <strong style={{ color: marginPct > 50 ? 'var(--green)' : 'var(--orange)' }}>{marginPct}%</strong></div>
                  )}
                </div>
              ) : (
                <button
                  onClick={() => { setEditItem(toStockItem(item)); setShowForm(true) }}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold text-[var(--text4)] border border-[var(--border)] hover:border-[var(--text3)] transition-colors"
                >
                  + Vendre direct
                </button>
              )}

              {/* Statut réseau */}
              <div className="hidden md:block">
                <NetworkStatusSelect
                  value={item.network_status}
                  table="stock_items"
                  id={item.id}
                  onUpdate={v => handleNetworkUpdate(item.id, v)}
                />
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1">
                <button
                  onClick={() => { setEditItem(toStockItem(item)); setShowForm(true) }}
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-sm hover:bg-[var(--surface2)] transition-colors"
                  title="Modifier"
                >✏️</button>
                <button
                  onClick={() => handleDuplicate(item)}
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-sm hover:bg-[var(--surface2)] transition-colors"
                  title="Dupliquer"
                >⧉</button>
                <button
                  onClick={() => setDeleteId(item.id)}
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-sm hover:bg-[var(--surface2)] transition-colors"
                  title="Supprimer"
                >🗑</button>
              </div>
            </div>
          )
        })}
      </div>

      {/* Add button row */}
      <button
        onClick={() => { setEditItem(null); setShowForm(true) }}
        className="mt-3 w-full py-2.5 rounded-xl text-sm font-semibold text-[var(--text4)] border border-dashed border-[var(--border)] hover:border-[var(--text3)] hover:text-[var(--text2)] transition-colors"
      >
        + Ajouter une marchandise
      </button>

      {/* Existing StockItemForm modal — onSave receives no arg; refetch after save */}
      <StockItemForm
        open={showForm}
        item={editItem}
        categories={categories}
        onClose={() => { setShowForm(false); setEditItem(null) }}
        onSave={async () => {
          // Modal does its own Supabase write. Re-fetch after save.
          const supabase = createClient()
          const { data } = await supabase
            .from('stock_items')
            .select('*')
            .eq('establishment_id', establishmentId)
            .eq('active', true)
            .order('name')
          if (data) {
            onItemsChange(data.map(i => ({
              id: i.id,
              establishment_id: i.establishment_id,
              name: i.name,
              category: i.category,
              unit: i.unit,
              purchase_price: (i as Record<string, number>).purchase_price ?? 0,
              purchase_qty: (i as Record<string, number>).purchase_qty ?? 1,
              supplier: i.supplier,
              supplier_ref: i.supplier_ref,
              is_pos: Boolean((i as Record<string, unknown>).is_pos),
              pos_price: (i as Record<string, number | null>).pos_price ?? null,
              pos_tva_rate: (i as Record<string, number>).pos_tva_rate ?? 10,
              pos_category_id: (i as Record<string, string | null>).pos_category_id ?? null,
              product_id: (i as Record<string, string | null>).product_id ?? null,
              active: i.active,
              network_status: ((i as Record<string, string>).network_status ?? 'not_shared') as MarchandiseItem['network_status'],
            })))
          }
          setShowForm(false)
          setEditItem(null)
        }}
      />

      {/* Delete confirm */}
      {deleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'var(--overlay-bg)' }}>
          <div className="rounded-xl p-6 max-w-sm w-full mx-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <h3 className="text-base font-bold text-[var(--text1)] mb-2">Supprimer cet article ?</h3>
            <p className="text-sm text-[var(--text3)] mb-5">Cette action est irréversible.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteId(null)} className="flex-1 py-2 rounded-lg text-sm font-semibold text-[var(--text2)] border border-[var(--border)]">Annuler</button>
              <button onClick={() => handleDelete(deleteId)} className="flex-1 py-2 rounded-lg text-sm font-semibold text-white" style={{ background: 'var(--red)' }}>Supprimer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 5.2: TypeScript check**

```bash
npx tsc --noEmit
```

Fix any type errors before continuing.

- [ ] **Step 5.3: Commit**

```bash
git add src/app/dashboard/marchandise/_components/tab-marchandise.tsx
git commit -m "feat(marchandise): add Tab Marchandise with filters, network status, CRUD"
```

---

## Task 6: SOP Panel

**Files:**
- Create: `src/app/dashboard/marchandise/_components/sop-panel.tsx`

**Before coding:** Read `src/app/dashboard/sops/_components/sop-form.tsx` and `sop-kitchen-mode.tsx` to understand the existing SOP components. Import them rather than rewriting.

- [ ] **Step 6.1: Create sop-panel.tsx**

This component renders inside the expanded row of a recipe. It shows the 2 sub-tabs: 🧪 Ingrédients and 📋 Guide SOP.

```tsx
// src/app/dashboard/marchandise/_components/sop-panel.tsx
'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { RecipeRow, SopWithSteps } from './types'

// Import existing SOP components
import { SopForm } from '@/app/dashboard/sops/_components/sop-form'
import { SopKitchenMode } from '@/app/dashboard/sops/_components/sop-kitchen-mode'

type PanelTab = 'ingredients' | 'sop'

interface Props {
  recipe: RecipeRow
  establishmentId: string
  onRecipeUpdate: (recipe: RecipeRow) => void
}

export function SopPanel({ recipe, establishmentId, onRecipeUpdate }: Props) {
  const [activeTab, setActiveTab] = useState<PanelTab>('ingredients')
  const [showSopForm, setShowSopForm] = useState(false)
  const [showKitchenMode, setShowKitchenMode] = useState(false)

  async function toggleSopRequired() {
    const next = !recipe.sop_required
    const supabase = createClient()
    await supabase.from('recipes').update({ sop_required: next }).eq('id', recipe.id)
    onRecipeUpdate({ ...recipe, sop_required: next })
  }

  async function handleDuplicateSop() {
    if (!recipe.sop) return
    const supabase = createClient()
    const { data: newSop } = await supabase
      .from('sops')
      .insert({
        establishment_id: establishmentId,
        title: `Copie de ${recipe.sop.title}`,
        recipe_id: null, // detached copy
        active: true,
      })
      .select('id, title, recipe_id, active')
      .single()
    if (!newSop) return

    // Copy steps
    const stepInserts = recipe.sop.steps.map(s => ({
      sop_id: newSop.id,
      title: s.title,
      description: s.description,
      sort_order: s.sort_order,
      duration_seconds: s.duration_seconds,
      media_url: s.media_url,
    }))
    if (stepInserts.length > 0) {
      await supabase.from('sop_steps').insert(stepInserts)
    }
    // Note: duplicated SOP is detached (recipe_id = null), visible in /dashboard/sops
  }

  const totalCost = recipe.ingredients.reduce((s, i) => s + i.quantity * i.unit_cost, 0)
  const productPriceTTC = recipe.product
    ? recipe.product.price * (1 + recipe.product.tva_rate / 100)
    : null

  return (
    <div
      className="border-t border-[var(--border)] px-4 py-3"
      style={{ background: 'var(--bg)' }}
    >
      {/* Sub-tab bar */}
      <div className="flex gap-1 mb-3">
        {(['ingredients', 'sop'] as PanelTab[]).map(t => (
          <button
            key={t}
            onClick={() => setActiveTab(t)}
            className={[
              'px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors',
              activeTab === t
                ? 'text-[var(--text1)]'
                : 'text-[var(--text4)] hover:text-[var(--text2)]',
            ].join(' ')}
            style={activeTab === t ? { background: 'var(--surface)', border: '1px solid var(--border)' } : undefined}
          >
            {t === 'ingredients' ? '🧪 Ingrédients' : '📋 Guide SOP'}
          </button>
        ))}
      </div>

      {/* Ingrédients */}
      {activeTab === 'ingredients' && (
        <div>
          <div className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--border)' }}>
            <div
              className="grid gap-3 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--text4)]"
              style={{ gridTemplateColumns: '1fr 80px 60px 80px 80px', background: 'var(--surface)' }}
            >
              <span>Ingrédient</span><span>Qté</span><span>Unité</span><span>Coût/u.</span><span>Total</span>
            </div>
            {recipe.ingredients.length === 0 && (
              <div className="px-3 py-4 text-xs text-[var(--text4)] text-center">Aucun ingrédient</div>
            )}
            {recipe.ingredients.map(ing => (
              <div
                key={ing.id}
                className="grid gap-3 px-3 py-2.5 text-xs border-t border-[var(--border)]"
                style={{ gridTemplateColumns: '1fr 80px 60px 80px 80px' }}
              >
                <span className="text-[var(--text2)] font-medium">{ing.name}</span>
                <span className="text-[var(--text3)] tabular-nums">{ing.quantity}</span>
                <span className="text-[var(--text4)]">{ing.unit}</span>
                <span className="text-[var(--text3)] tabular-nums">{ing.unit_cost.toFixed(3)} €</span>
                <span className="text-[var(--text2)] tabular-nums font-semibold">{(ing.quantity * ing.unit_cost).toFixed(2)} €</span>
              </div>
            ))}
          </div>
          {/* Footer */}
          <div className="flex items-center justify-between mt-2 px-1">
            <span className="text-xs text-[var(--text4)]">Coût matières</span>
            <span className="text-sm font-bold text-[var(--text1)] tabular-nums">{totalCost.toFixed(2)} €</span>
          </div>
          {productPriceTTC !== null && (
            <div className="flex items-center justify-between px-1">
              <span className="text-xs text-[var(--text4)]">Food cost</span>
              <span
                className="text-sm font-bold tabular-nums"
                style={{ color: recipe.food_cost_pct !== null && recipe.food_cost_pct < 30 ? 'var(--green)' : 'var(--orange)' }}
              >
                {recipe.food_cost_pct !== null ? `${recipe.food_cost_pct}%` : '—'}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Guide SOP */}
      {activeTab === 'sop' && (
        <div>
          {recipe.sop ? (
            <div>
              {/* Steps list */}
              <div className="space-y-2 mb-3">
                {recipe.sop.steps.length === 0 && (
                  <p className="text-xs text-[var(--text4)]">Aucune étape dans ce guide.</p>
                )}
                {recipe.sop.steps.map((step, idx) => (
                  <div
                    key={step.id}
                    className="flex gap-3 p-3 rounded-lg"
                    style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
                  >
                    <div
                      className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5"
                      style={{ background: 'var(--blue)', color: 'white' }}
                    >
                      {idx + 1}
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-[var(--text1)]">{step.title}</div>
                      {step.description && <div className="text-xs text-[var(--text3)] mt-0.5">{step.description}</div>}
                    </div>
                  </div>
                ))}
              </div>
              {/* SOP Actions */}
              <div className="flex gap-2">
                <button
                  onClick={() => setShowSopForm(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-[var(--border)] text-[var(--text2)] hover:bg-[var(--surface2)] transition-colors"
                >
                  ✏️ Modifier
                </button>
                <button
                  onClick={handleDuplicateSop}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-[var(--border)] text-[var(--text2)] hover:bg-[var(--surface2)] transition-colors"
                >
                  ⧉ Dupliquer guide
                </button>
                <button
                  onClick={() => setShowKitchenMode(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white"
                  style={{ background: 'var(--blue)' }}
                >
                  ▶ Mode cuisine
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {/* sop_required toggle */}
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold text-[var(--text1)]">Guide requis pour cette recette ?</div>
                  <div className="text-xs text-[var(--text4)] mt-0.5">
                    Activez pour déclencher une alerte si le guide est manquant.
                  </div>
                </div>
                <button
                  onClick={toggleSopRequired}
                  className="w-11 h-6 rounded-full transition-colors flex-shrink-0"
                  style={{ background: recipe.sop_required ? 'var(--blue)' : 'var(--border)' }}
                >
                  <span
                    className="block w-5 h-5 rounded-full bg-white shadow transition-transform"
                    style={{ transform: recipe.sop_required ? 'translateX(21px)' : 'translateX(2px)', margin: '2px 0' }}
                  />
                </button>
              </div>
              <button
                onClick={() => setShowSopForm(true)}
                className="w-full py-2.5 rounded-lg text-sm font-semibold text-white"
                style={{ background: 'var(--blue)' }}
              >
                + Créer le guide SOP
              </button>
            </div>
          )}
        </div>
      )}

      {/* SOP Form Modal
          Props: open, sop, categories: SopCategory[], recipes: {id,title}[], onClose, onSave: () => Promise<void>
          onSave receives NO argument — refetch the sop after save.
          Pass empty arrays for categories and recipes (minimal required).
          Read sops/_components/types.ts for SopCategory and SopWithSteps shapes before coding. */}
      {showSopForm && (
        <SopForm
          open={showSopForm}
          sop={recipe.sop ? {
            id: recipe.sop.id,
            title: recipe.sop.title,
            recipe_id: recipe.sop.recipe_id,
            active: recipe.sop.active,
            category_id: null,
            content: null,
            establishment_id: establishmentId,
            media_urls: null,
            version: 1,
            steps: recipe.sop.steps,
          } : null}
          categories={[]}
          recipes={[{ id: recipe.id, title: recipe.title }]}
          onClose={() => setShowSopForm(false)}
          onSave={async () => {
            // Modal does its own write. Re-fetch the SOP for this recipe.
            const supabase = createClient()
            const { data } = await supabase
              .from('sops')
              .select('id, title, recipe_id, active, steps:sop_steps(id, sop_id, title, description, sort_order, duration_seconds, media_url)')
              .eq('recipe_id', recipe.id)
              .single()
            const freshSop = data ? { ...data, steps: data.steps ?? [] } : null
            onRecipeUpdate({ ...recipe, sop: freshSop as SopWithSteps | null })
            setShowSopForm(false)
          }}
        />
      )}

      {/* Kitchen mode */}
      {showKitchenMode && recipe.sop && (
        <SopKitchenMode
          sop={recipe.sop}
          onClose={() => setShowKitchenMode(false)}
        />
      )}
    </div>
  )
}
```

> **Note:** The `SopForm` and `SopKitchenMode` interfaces may differ from what's shown above. Read the actual component files before coding and adjust the prop names accordingly.

- [ ] **Step 6.2: TypeScript check**

```bash
npx tsc --noEmit
```

Fix any mismatches between the SopForm/SopKitchenMode prop interfaces and how you're calling them. Read the component source if needed.

- [ ] **Step 6.3: Commit**

```bash
git add src/app/dashboard/marchandise/_components/sop-panel.tsx
git commit -m "feat(marchandise): add SopPanel with ingredients sub-tab and SOP sub-tab"
```

---

## Task 7: Tab Recettes

**Files:**
- Create: `src/app/dashboard/marchandise/_components/tab-recettes.tsx`

**Before coding:** Read `src/app/dashboard/recettes/_components/recettes-page-client.tsx` and `recipe-form.tsx`.

- [ ] **Step 7.1: Create tab-recettes.tsx**

```tsx
// src/app/dashboard/marchandise/_components/tab-recettes.tsx
'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { RecipeRow, PosCategory, NetworkStatus } from './types'
import { NetworkStatusSelect } from './network-status-select'
import { SopPanel } from './sop-panel'
// Reuse existing recipe form
import { RecipeForm } from '@/app/dashboard/recettes/_components/recipe-form'
import type { Recipe } from '@/app/dashboard/recettes/_components/types'

interface Props {
  recipes: RecipeRow[]
  categories: PosCategory[]
  establishmentId: string
  onRecipesChange: (recipes: RecipeRow[]) => void
}

export function TabRecettes({ recipes, categories, establishmentId, onRecipesChange }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [editRecipe, setEditRecipe] = useState<Recipe | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  function toRecipeType(r: RecipeRow): Recipe {
    return {
      id: r.id,
      establishment_id: r.establishment_id,
      title: r.title,
      description: null,
      category: r.category,
      portion: r.portion,
      is_internal: r.is_internal,
      active: r.active,
      created_at: '',
      ingredients: r.ingredients,
      product: r.product ? [r.product] : null,
      food_cost_amount: r.food_cost_amount,
      food_cost_pct: r.food_cost_pct,
    }
  }

  function handleNetworkUpdate(id: string, value: NetworkStatus) {
    onRecipesChange(recipes.map(r => r.id === id ? { ...r, network_status: value } : r))
  }

  async function handleDelete(id: string) {
    const supabase = createClient()
    await supabase.from('recipes').update({ active: false }).eq('id', id)
    onRecipesChange(recipes.filter(r => r.id !== id))
    setDeleteId(null)
  }

  async function handleDuplicate(recipe: RecipeRow) {
    const supabase = createClient()
    const { data: newRecipe } = await supabase
      .from('recipes')
      .insert({
        establishment_id: establishmentId,
        title: `Copie de ${recipe.title}`,
        category: recipe.category,
        portion: recipe.portion,
        is_internal: true, // copy starts as internal, user can publish
        active: true,
        sop_required: false,
        network_status: 'not_shared',
      })
      .select('id')
      .single()
    if (!newRecipe) return

    // Copy ingredients
    if (recipe.ingredients.length > 0) {
      await supabase.from('recipe_ingredients').insert(
        recipe.ingredients.map(i => ({
          recipe_id: newRecipe.id,
          name: i.name,
          quantity: i.quantity,
          unit: i.unit,
          unit_cost: i.unit_cost,
          sort_order: i.sort_order,
        }))
      )
    }

    // Copy SOP if exists
    let newSop = null
    if (recipe.sop) {
      const { data: sopData } = await supabase
        .from('sops')
        .insert({
          establishment_id: establishmentId,
          title: recipe.sop.title,
          recipe_id: newRecipe.id,
          active: true,
        })
        .select('id, title, recipe_id, active')
        .single()
      if (sopData && recipe.sop.steps.length > 0) {
        const { data: stepsData } = await supabase
          .from('sop_steps')
          .insert(
            recipe.sop.steps.map(s => ({
              sop_id: sopData.id,
              title: s.title,
              description: s.description,
              sort_order: s.sort_order,
              duration_seconds: s.duration_seconds,
              media_url: s.media_url,
            }))
          )
          .select('*')
        newSop = { ...sopData, steps: stepsData ?? [] }
      } else if (sopData) {
        newSop = { ...sopData, steps: [] }
      }
    }

    const copy: RecipeRow = {
      ...recipe,
      id: newRecipe.id,
      title: `Copie de ${recipe.title}`,
      is_internal: true,
      sop_required: false,
      network_status: 'not_shared',
      product: null,
      sop: newSop,
    }
    onRecipesChange([...recipes, copy])
  }

  function getFoodCostColor(pct: number | null) {
    if (pct === null) return 'var(--text4)'
    if (pct < 25) return 'var(--green)'
    if (pct < 35) return 'var(--orange)'
    return 'var(--red)'
  }

  function getSopStatus(recipe: RecipeRow) {
    if (recipe.sop) return { label: '📋 Guide ✓', color: 'var(--green)' }
    if (recipe.sop_required) return { label: '⚠ Manquant', color: 'var(--red)' }
    return { label: '— Sans guide', color: 'var(--text4)' }
  }

  return (
    <div>
      {/* Table */}
      <div className="rounded-xl overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        {/* Head */}
        <div
          className="grid gap-3 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-[var(--text4)] border-b border-[var(--border)]"
          style={{ gridTemplateColumns: '28px 1.6fr 90px 80px 90px 140px 80px' }}
        >
          <span />
          <span>Recette</span>
          <span>Food cost</span>
          <span className="hidden md:block">Prix TTC</span>
          <span className="hidden md:block">Guide SOP</span>
          <span className="hidden lg:block">Statut réseau</span>
          <span>Actions</span>
        </div>

        {recipes.length === 0 && (
          <div className="px-4 py-12 text-center text-sm text-[var(--text4)]">Aucune recette</div>
        )}

        {recipes.map(recipe => {
          const isOpen = expandedId === recipe.id
          const sop = getSopStatus(recipe)
          const priceTTC = recipe.product
            ? recipe.product.price * (1 + recipe.product.tva_rate / 100)
            : null

          return (
            <div key={recipe.id} className="border-t border-[var(--border)]">
              {/* Row */}
              <div
                className="grid gap-3 px-4 py-3 items-center hover:bg-[var(--surface2)] transition-colors cursor-pointer"
                style={{ gridTemplateColumns: '28px 1.6fr 90px 80px 90px 140px 80px' }}
                onClick={() => setExpandedId(isOpen ? null : recipe.id)}
              >
                {/* Chevron */}
                <span
                  className="text-sm transition-transform duration-200"
                  style={{
                    color: isOpen ? 'var(--blue)' : 'var(--text4)',
                    transform: isOpen ? 'rotate(90deg)' : 'none',
                    display: 'inline-block',
                  }}
                >
                  ▶
                </span>

                {/* Recette */}
                <div onClick={e => e.stopPropagation()}>
                  <div className="text-sm font-semibold text-[var(--text1)]">{recipe.title}</div>
                  {recipe.category && <div className="text-xs text-[var(--text4)] mt-0.5">{recipe.category}</div>}
                </div>

                {/* Food cost */}
                <div>
                  <div
                    className="text-sm font-bold tabular-nums"
                    style={{ color: getFoodCostColor(recipe.food_cost_pct) }}
                  >
                    {recipe.food_cost_pct !== null ? `${recipe.food_cost_pct}%` : '—'}
                  </div>
                  {recipe.food_cost_pct !== null && (
                    <div className="h-1 w-12 rounded-full mt-1 overflow-hidden" style={{ background: 'var(--border)' }}>
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${Math.min(recipe.food_cost_pct, 100)}%`,
                          background: getFoodCostColor(recipe.food_cost_pct),
                        }}
                      />
                    </div>
                  )}
                </div>

                {/* Prix TTC */}
                <span className="hidden md:block text-sm text-[var(--text2)] tabular-nums">
                  {priceTTC !== null ? `${priceTTC.toFixed(2)} €` : '—'}
                </span>

                {/* Guide SOP */}
                <span
                  className="hidden md:block text-xs font-semibold"
                  style={{ color: sop.color }}
                >
                  {sop.label}
                </span>

                {/* Statut réseau */}
                <div className="hidden lg:block" onClick={e => e.stopPropagation()}>
                  <NetworkStatusSelect
                    value={recipe.network_status}
                    table="recipes"
                    id={recipe.id}
                    onUpdate={v => handleNetworkUpdate(recipe.id, v)}
                  />
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                  <button
                    onClick={() => { setEditRecipe(toRecipeType(recipe)); setShowForm(true) }}
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-sm hover:bg-[var(--surface2)] transition-colors"
                    title="Modifier"
                  >✏️</button>
                  <button
                    onClick={() => handleDuplicate(recipe)}
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-sm hover:bg-[var(--surface2)] transition-colors"
                    title="Dupliquer"
                  >⧉</button>
                  <button
                    onClick={() => setDeleteId(recipe.id)}
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-sm hover:bg-[var(--surface2)] transition-colors"
                    title="Supprimer"
                  >🗑</button>
                </div>
              </div>

              {/* Expanded SOP panel */}
              {isOpen && (
                <SopPanel
                  recipe={recipe}
                  establishmentId={establishmentId}
                  onRecipeUpdate={updated =>
                    onRecipesChange(recipes.map(r => r.id === updated.id ? updated : r))
                  }
                />
              )}
            </div>
          )
        })}
      </div>

      {/* Add row */}
      <button
        onClick={() => { setEditRecipe(null); setShowForm(true) }}
        className="mt-3 w-full py-2.5 rounded-xl text-sm font-semibold text-[var(--text4)] border border-dashed border-[var(--border)] hover:border-[var(--text3)] hover:text-[var(--text2)] transition-colors"
      >
        + Nouvelle recette
      </button>

      {/* Recipe form — onSave receives NO arg; refetch after save */}
      <RecipeForm
        open={showForm}
        recipe={editRecipe}
        categories={categories}
        onClose={() => { setShowForm(false); setEditRecipe(null) }}
        onSave={async () => {
          // Modal does its own Supabase write. Re-fetch all recipes after save.
          const supabase = createClient()
          const { data } = await supabase
            .from('recipes')
            .select(`
              *,
              ingredients:recipe_ingredients(id, name, quantity, unit, unit_cost, sort_order),
              product:products!products_recipe_id_fkey(id, name, price, tva_rate, category_id, is_active),
              sop:sops(id, title, recipe_id, active, steps:sop_steps(id, sop_id, title, description, sort_order, duration_seconds, media_url))
            `)
            .eq('establishment_id', establishmentId)
            .eq('active', true)
            .order('title')
          if (data) {
            onRecipesChange(data.map(r => {
              const ings = r.ingredients ?? []
              const foodCostAmount = ings.reduce((s: number, i: { quantity: number; unit_cost: number }) => s + i.quantity * i.unit_cost, 0)
              const product = r.product?.[0] ?? null
              const foodCostPct = product?.price && product.price > 0
                ? Math.round((foodCostAmount / product.price) * 1000) / 10
                : null
              const existing = recipes.find(ex => ex.id === r.id)
              return {
                id: r.id,
                establishment_id: r.establishment_id,
                title: r.title,
                category: r.category,
                portion: r.portion,
                is_internal: r.is_internal,
                active: r.active,
                sop_required: Boolean((r as Record<string, unknown>).sop_required),
                network_status: existing?.network_status ?? (((r as Record<string, string>).network_status ?? 'not_shared') as RecipeRow['network_status']),
                ingredients: ings,
                product,
                sop: r.sop?.[0] ? { ...r.sop[0], steps: r.sop[0].steps ?? [] } : null,
                food_cost_amount: foodCostAmount,
                food_cost_pct: foodCostPct,
              }
            }))
          }
          setShowForm(false)
          setEditRecipe(null)
        }}
      />

      {/* Delete confirm */}
      {deleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'var(--overlay-bg)' }}>
          <div className="rounded-xl p-6 max-w-sm w-full mx-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <h3 className="text-base font-bold text-[var(--text1)] mb-2">Supprimer cette recette ?</h3>
            <p className="text-sm text-[var(--text3)] mb-5">Cette action est irréversible.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteId(null)} className="flex-1 py-2 rounded-lg text-sm font-semibold text-[var(--text2)] border border-[var(--border)]">Annuler</button>
              <button onClick={() => handleDelete(deleteId)} className="flex-1 py-2 rounded-lg text-sm font-semibold text-white" style={{ background: 'var(--red)' }}>Supprimer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 7.2: TypeScript check**

```bash
npx tsc --noEmit
```

- [ ] **Step 7.3: Commit**

```bash
git add src/app/dashboard/marchandise/_components/tab-recettes.tsx
git commit -m "feat(marchandise): add Tab Recettes with expandable rows and SOP panel"
```

---

## Task 8: En-Vente Edit Modal + Tab En vente

**Files:**
- Create: `src/app/dashboard/marchandise/_components/en-vente-edit-modal.tsx`
- Create: `src/app/dashboard/marchandise/_components/tab-en-vente.tsx`

- [ ] **Step 8.1: Create en-vente-edit-modal.tsx**

```tsx
// src/app/dashboard/marchandise/_components/en-vente-edit-modal.tsx
'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { EnVenteItem, PosCategory } from './types'

interface Props {
  item: EnVenteItem
  categories: PosCategory[]
  onClose: () => void
  onSave: (updated: EnVenteItem) => void
}

export function EnVenteEditModal({ item, categories, onClose, onSave }: Props) {
  const [priceTTC, setPriceTTC] = useState(item.price_ttc.toString())
  const [tvaRate, setTvaRate] = useState(item.tva_rate.toString())
  const [categoryId, setCategoryId] = useState(item.category_id ?? '')
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    setSaving(true)
    const supabase = createClient()
    const ttcVal = parseFloat(priceTTC)
    const tvaVal = parseFloat(tvaRate)
    const priceHT = ttcVal / (1 + tvaVal / 100)

    if (item.origin === 'direct') {
      await supabase
        .from('stock_items')
        .update({
          pos_price: priceHT,
          pos_tva_rate: tvaVal,
          pos_category_id: categoryId || null,
        })
        .eq('id', item.source_id)
    } else {
      // Recette → update the product record
      await supabase
        .from('products')
        .update({
          price: priceHT,
          tva_rate: tvaVal,
          category_id: categoryId || null,
        })
        .eq('id', item.id)
    }

    const cat = categories.find(c => c.id === categoryId)
    onSave({
      ...item,
      price_ttc: ttcVal,
      tva_rate: tvaVal,
      category_id: categoryId || null,
      category_name: cat?.name ?? null,
    })
    setSaving(false)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'var(--overlay-bg)' }}>
      <div className="rounded-xl w-full max-w-sm mx-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <div className="p-5 border-b border-[var(--border)]">
          <h2 className="text-base font-bold text-[var(--text1)]">Modifier l'article</h2>
          <p className="text-xs text-[var(--text4)] mt-0.5">{item.name}</p>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="text-xs font-semibold text-[var(--text4)] uppercase tracking-wide mb-1.5 block">Prix TTC (€)</label>
            <input
              type="number"
              step="0.01"
              value={priceTTC}
              onChange={e => setPriceTTC(e.target.value)}
              className="w-full px-3 py-2 rounded-lg text-sm text-[var(--text1)] border border-[var(--border)] outline-none focus:border-[var(--blue)]"
              style={{ background: 'var(--surface2)' }}
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-[var(--text4)] uppercase tracking-wide mb-1.5 block">TVA (%)</label>
            <select
              value={tvaRate}
              onChange={e => setTvaRate(e.target.value)}
              className="w-full px-3 py-2 rounded-lg text-sm text-[var(--text1)] border border-[var(--border)] outline-none"
              style={{ background: 'var(--surface2)' }}
            >
              <option value="0">0%</option>
              <option value="5.5">5.5%</option>
              <option value="10">10%</option>
              <option value="20">20%</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-[var(--text4)] uppercase tracking-wide mb-1.5 block">Catégorie caisse</label>
            <select
              value={categoryId}
              onChange={e => setCategoryId(e.target.value)}
              className="w-full px-3 py-2 rounded-lg text-sm text-[var(--text1)] border border-[var(--border)] outline-none"
              style={{ background: 'var(--surface2)' }}
            >
              <option value="">Sans catégorie</option>
              {categories.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="p-5 flex gap-3 border-t border-[var(--border)]">
          <button onClick={onClose} className="flex-1 py-2 rounded-lg text-sm font-semibold text-[var(--text2)] border border-[var(--border)]">Annuler</button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 py-2 rounded-lg text-sm font-semibold text-white"
            style={{ background: 'var(--blue)', opacity: saving ? 0.7 : 1 }}
          >
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 8.2: Create tab-en-vente.tsx**

```tsx
// src/app/dashboard/marchandise/_components/tab-en-vente.tsx
'use client'
import { useState, useMemo } from 'react'
import type { MarchandiseItem, RecipeRow, EnVenteItem, PosCategory } from './types'
import { NetworkStatusSelect } from './network-status-select'
import { EnVenteEditModal } from './en-vente-edit-modal'

interface Props {
  items: MarchandiseItem[]
  recipes: RecipeRow[]
  categories: PosCategory[]
  establishmentId: string
}

function buildEnVenteList(items: MarchandiseItem[], recipes: RecipeRow[], categories: PosCategory[]): EnVenteItem[] {
  const catMap = new Map(categories.map(c => [c.id, c.name]))

  const directs: EnVenteItem[] = items
    .filter(i => i.is_pos && i.pos_price !== null)
    .map(i => {
      const priceTTC = i.pos_price! * (1 + i.pos_tva_rate / 100)
      const unitCost = i.purchase_qty > 0 ? i.purchase_price / i.purchase_qty : i.purchase_price
      const marginPct = priceTTC > 0 ? Math.round((1 - unitCost / priceTTC) * 1000) / 10 : null
      return {
        id: i.product_id ?? i.id,
        name: i.name,
        origin: 'direct' as const,
        source_id: i.id,
        category_id: i.pos_category_id,
        category_name: i.pos_category_id ? (catMap.get(i.pos_category_id) ?? null) : null,
        price_ttc: priceTTC,
        tva_rate: i.pos_tva_rate,
        food_cost_pct: null,
        margin_pct: marginPct,
        network_status: i.network_status,
      }
    })

  const recipeProducts: EnVenteItem[] = recipes
    .filter(r => !r.is_internal && r.product !== null)
    .map(r => {
      const p = r.product!
      const priceTTC = p.price * (1 + p.tva_rate / 100)
      const marginPct = r.food_cost_pct !== null ? Math.round((100 - r.food_cost_pct) * 10) / 10 : null
      return {
        id: p.id,
        name: r.title,
        origin: 'recette' as const,
        source_id: r.id,
        category_id: p.category_id,
        category_name: p.category_id ? (catMap.get(p.category_id) ?? null) : null,
        price_ttc: priceTTC,
        tva_rate: p.tva_rate,
        food_cost_pct: r.food_cost_pct,
        margin_pct: marginPct,
        network_status: r.network_status,
      }
    })

  return [...directs, ...recipeProducts].sort((a, b) => a.name.localeCompare(b.name))
}

export function TabEnVente({ items, recipes, categories }: Props) {
  const [editItem, setEditItem] = useState<EnVenteItem | null>(null)
  const [enVente, setEnVente] = useState<EnVenteItem[]>(() =>
    buildEnVenteList(items, recipes, categories)
  )

  // Rebuild when items/recipes change
  useMemo(() => {
    setEnVente(buildEnVenteList(items, recipes, categories))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, recipes])

  function getMarginColor(pct: number | null) {
    if (pct === null) return 'var(--text4)'
    if (pct > 65) return 'var(--green)'
    if (pct > 50) return 'var(--orange)'
    return 'var(--red)'
  }

  return (
    <div>
      <div className="rounded-xl overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        {/* Head */}
        <div
          className="grid gap-3 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-[var(--text4)] border-b border-[var(--border)]"
          style={{ gridTemplateColumns: '1.8fr 80px 80px 80px 80px 140px 60px' }}
        >
          <span>Article</span>
          <span>Origine</span>
          <span>Prix TTC</span>
          <span className="hidden md:block">TVA</span>
          <span>Marge</span>
          <span className="hidden lg:block">Statut réseau</span>
          <span>Actions</span>
        </div>

        {enVente.length === 0 && (
          <div className="px-4 py-12 text-center text-sm text-[var(--text4)]">
            Aucun article en vente. Activez la vente directe sur vos marchandises ou publiez des recettes.
          </div>
        )}

        {enVente.map(ev => (
          <div
            key={ev.id}
            className="grid gap-3 px-4 py-3 items-center border-t border-[var(--border)] hover:bg-[var(--surface2)] transition-colors"
            style={{ gridTemplateColumns: '1.8fr 80px 80px 80px 80px 140px 60px' }}
          >
            {/* Article */}
            <div>
              <div className="text-sm font-semibold text-[var(--text1)]">{ev.name}</div>
              {ev.category_name && <div className="text-xs text-[var(--text4)] mt-0.5">{ev.category_name}</div>}
            </div>

            {/* Origine */}
            <span
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold"
              style={
                ev.origin === 'direct'
                  ? { background: 'rgba(37,99,235,.1)', color: 'var(--blue)' }
                  : { background: 'rgba(16,185,129,.1)', color: 'var(--green)' }
              }
            >
              {ev.origin === 'direct' ? '🛒 Direct' : '🍳 Recette'}
            </span>

            {/* Prix TTC */}
            <span className="text-sm font-bold text-[var(--text1)] tabular-nums">{ev.price_ttc.toFixed(2)} €</span>

            {/* TVA */}
            <span className="hidden md:block text-xs text-[var(--text3)]">{ev.tva_rate}%</span>

            {/* Marge */}
            <span
              className="text-sm font-bold tabular-nums"
              style={{ color: getMarginColor(ev.margin_pct) }}
            >
              {ev.margin_pct !== null ? `${ev.margin_pct}%` : '—'}
            </span>

            {/* Statut réseau */}
            <div className="hidden lg:block">
              <NetworkStatusSelect
                value={ev.network_status}
                table={ev.origin === 'direct' ? 'stock_items' : 'recipes'}
                id={ev.source_id}
                onUpdate={v =>
                  setEnVente(prev => prev.map(i => i.id === ev.id ? { ...i, network_status: v } : i))
                }
              />
            </div>

            {/* Actions */}
            <button
              onClick={() => setEditItem(ev)}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-sm hover:bg-[var(--surface2)] transition-colors"
              title="Modifier prix/TVA/catégorie"
            >
              ✏️
            </button>
          </div>
        ))}
      </div>

      {editItem && (
        <EnVenteEditModal
          item={editItem}
          categories={categories}
          onClose={() => setEditItem(null)}
          onSave={updated => {
            setEnVente(prev => prev.map(i => i.id === updated.id ? updated : i))
            setEditItem(null)
          }}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 8.3: TypeScript check**

```bash
npx tsc --noEmit
```

- [ ] **Step 8.4: Commit**

```bash
git add src/app/dashboard/marchandise/_components/en-vente-edit-modal.tsx \
        src/app/dashboard/marchandise/_components/tab-en-vente.tsx
git commit -m "feat(marchandise): add Tab En vente with unified product list and price edit modal"
```

---

## Task 9: Tab Aperçu caisse

**Files:**
- Create: `src/app/dashboard/marchandise/_components/tab-apercu-caisse.tsx`

- [ ] **Step 9.1: Create tab-apercu-caisse.tsx**

```tsx
// src/app/dashboard/marchandise/_components/tab-apercu-caisse.tsx
'use client'
import { useMemo } from 'react'
import type { MarchandiseItem, RecipeRow, PosCategory } from './types'

interface PosProduct {
  id: string
  name: string
  price_ttc: number
  category_id: string | null
  category_name: string | null
  network_status: string
  origin: 'direct' | 'recette'
}

interface Props {
  items: MarchandiseItem[]
  recipes: RecipeRow[]
  categories: PosCategory[]
}

export function TabApercuCaisse({ items, recipes, categories }: Props) {
  const catMap = useMemo(() => new Map(categories.map(c => [c.id, c])), [categories])

  // Show ALL items (direct + recipe), not just active ones.
  // The aperçu caisse is a read-only preview — network_status is shown as an indicator, not a filter.
  const products = useMemo<PosProduct[]>(() => {
    const directs: PosProduct[] = items
      .filter(i => i.is_pos && i.pos_price !== null)
      .map(i => ({
        id: i.product_id ?? i.id,
        name: i.name,
        price_ttc: i.pos_price! * (1 + i.pos_tva_rate / 100),
        category_id: i.pos_category_id,
        category_name: i.pos_category_id ? (catMap.get(i.pos_category_id)?.name ?? null) : null,
        network_status: i.network_status,
        origin: 'direct' as const,
      }))

    const recipeProds: PosProduct[] = recipes
      .filter(r => !r.is_internal && r.product !== null)
      .map(r => ({
        id: r.product!.id,
        name: r.title,
        price_ttc: r.product!.price * (1 + r.product!.tva_rate / 100),
        category_id: r.product!.category_id,
        category_name: r.product!.category_id ? (catMap.get(r.product!.category_id)?.name ?? null) : null,
        network_status: r.network_status,
        origin: 'recette' as const,
      }))

    return [...directs, ...recipeProds]
  }, [items, recipes, catMap])

  // Group by category
  const grouped = useMemo(() => {
    const map = new Map<string, { label: string; color: string; items: PosProduct[] }>()
    const noCat: PosProduct[] = []

    for (const p of products) {
      if (!p.category_id) {
        noCat.push(p)
      } else {
        if (!map.has(p.category_id)) {
          const cat = catMap.get(p.category_id)
          map.set(p.category_id, {
            label: cat?.name ?? p.category_id,
            color: cat?.color_hex ?? '#475569',
            items: [],
          })
        }
        map.get(p.category_id)!.items.push(p)
      }
    }

    const groups = [...map.values()]
    if (noCat.length > 0) groups.push({ label: 'Sans catégorie', color: '#475569', items: noCat })
    return groups
  }, [products, catMap])

  if (products.length === 0) {
    return (
      <div className="py-16 text-center">
        <div className="text-3xl mb-3">🖥️</div>
        <div className="text-sm font-semibold text-[var(--text2)] mb-1">Aucun article en vente</div>
        <div className="text-xs text-[var(--text4)]">
          Activez la vente directe sur une marchandise ou publiez une recette pour la voir apparaître ici.
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <p className="text-xs text-[var(--text4)]">
        Aperçu en lecture seule · {products.length} article{products.length > 1 ? 's' : ''} actif{products.length > 1 ? 's' : ''}
      </p>
      {grouped.map(group => (
        <div key={group.label}>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-2.5 h-2.5 rounded-full" style={{ background: group.color }} />
            <span className="text-xs font-bold uppercase tracking-wide text-[var(--text3)]">{group.label}</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            {group.items.map(p => (
              <div
                key={p.id}
                className="rounded-xl p-3 flex flex-col gap-1"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
              >
                <div className="text-sm font-semibold text-[var(--text1)] leading-tight">{p.name}</div>
                <div className="text-lg font-black tabular-nums" style={{ color: 'var(--green)' }}>
                  {p.price_ttc.toFixed(2)} €
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-xs text-[var(--text4)]">
                    {p.origin === 'direct' ? '🛒 Direct' : '🍳 Recette'}
                  </span>
                  {p.network_status !== 'not_shared' && (
                    <span
                      className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
                      style={
                        p.network_status === 'active'
                          ? { background: 'rgba(16,185,129,.1)', color: 'var(--green)' }
                          : p.network_status === 'coming_soon'
                          ? { background: 'rgba(168,85,247,.1)', color: '#d8b4fe' }
                          : { background: 'rgba(100,116,139,.1)', color: 'var(--text4)' }
                      }
                    >
                      {p.network_status === 'active' ? '● Actif' : p.network_status === 'coming_soon' ? '◑ Bientôt' : '○ Inactif'}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 9.2: TypeScript check**

```bash
npx tsc --noEmit
```

- [ ] **Step 9.3: Commit**

```bash
git add src/app/dashboard/marchandise/_components/tab-apercu-caisse.tsx
git commit -m "feat(marchandise): add Tab Aperçu caisse read-only POS preview"
```

---

## Task 10: Sidebar + route redirects

**Files:**
- Modify: `src/app/dashboard/_components/sidebar.tsx`
- Modify: `src/app/dashboard/stocks/page.tsx`
- Modify: `src/app/dashboard/recettes/page.tsx`

- [ ] **Step 10.1: Update sidebar NAV_ITEMS**

Read `sidebar.tsx` fully before editing. Then make these changes:

1. In `NAV_ITEMS`, replace the entry with `href: '/dashboard/stocks'` → change href to `/dashboard/marchandise`, label to `Marchandise`, icon to `📦`.
2. Remove the entry with `href: '/dashboard/recettes'` entirely.
3. Find the badge logic that checks `item.href === '/dashboard/stocks'` (variable name may differ). Update that check to use `/dashboard/marchandise` — or simply remove it entirely if there are no more stock alerts to display.
4. Remove the `useEffect` that subscribes to `stock_items` to count `stockAlerts`. Verify that the `stockAlerts` state variable is not used elsewhere in the component before removing the `useState` declaration. Remove the `stockAlerts` state too.

- [ ] **Step 10.2: Redirect /dashboard/stocks**

```tsx
// src/app/dashboard/stocks/page.tsx
import { redirect } from 'next/navigation'
export default function StocksPage() {
  redirect('/dashboard/marchandise')
}
```

- [ ] **Step 10.3: Redirect /dashboard/recettes**

```tsx
// src/app/dashboard/recettes/page.tsx
import { redirect } from 'next/navigation'
export default function RecettesPage() {
  redirect('/dashboard/marchandise?tab=recettes')
}
```

- [ ] **Step 10.4: TypeScript check**

```bash
npx tsc --noEmit
```

- [ ] **Step 10.5: Commit**

```bash
git add src/app/dashboard/_components/sidebar.tsx \
        src/app/dashboard/stocks/page.tsx \
        src/app/dashboard/recettes/page.tsx
git commit -m "feat(marchandise): update sidebar nav, redirect old stock and recettes routes"
```

---

## Task 11: Franchise Pilotage — Aperçu caisse tab

**Files:**
- Modify: `src/app/dashboard/franchise/pilotage/[establishmentId]/page.tsx`
- Modify: `src/app/dashboard/franchise/pilotage/[establishmentId]/_components/pilotage-detail-client.tsx`

**Before coding:** Read the existing `pilotage-detail-client.tsx` and `page.tsx` fully. The current tabs are `'produits' | 'stocks' | 'recettes'`. We remove `stocks` and add `apercu-caisse`.

- [ ] **Step 11.1: Update pilotage-detail-client.tsx**

- Change the `Tab` type from `'produits' | 'stocks' | 'recettes'` to `'produits' | 'recettes' | 'apercu-caisse'`
- Remove the `stocks` tab and all its UI
- Remove `initialItems` and `initialOrders` props and all related code
- Add `initialPosItems: MarchandiseItem[]` and `initialPosRecipes: RecipeRow[]` props
- Add a new tab `{ id: 'apercu-caisse', label: '🖥️ Aperçu caisse' }`
- Render `<TabApercuCaisse>` when `tab === 'apercu-caisse'`, passing the items and recipes in read-only mode

Import `TabApercuCaisse` from `@/app/dashboard/marchandise/_components/tab-apercu-caisse`.

- [ ] **Step 11.2: Update pilotage page.tsx**

Read the existing `page.tsx` to understand what it fetches. Replace the `stock_items` query with a query for `stock_items` filtered by the establishment (for the aperçu caisse `is_pos = true` items) and similarly fetch recipes for that establishment. Remove the purchase orders query as it's no longer displayed.

- [ ] **Step 11.3: TypeScript check**

```bash
npx tsc --noEmit
```

- [ ] **Step 11.4: Commit**

```bash
git add src/app/dashboard/franchise/pilotage/
git commit -m "feat(pilotage): replace stocks tab with aperçu caisse in franchise pilotage"
```

---

## Task 12: Full TypeScript + manual verification

- [ ] **Step 12.1: Full TypeScript check**

```bash
npx tsc --noEmit
```

Expected: zero errors. Fix any remaining issues.

- [ ] **Step 12.2: Start dev server and verify**

```bash
npm run dev
```

Open each of these URLs and verify manually:
- `http://localhost:3000/dashboard/marchandise` → Tab Marchandise loads with items
- `http://localhost:3000/dashboard/marchandise?tab=recettes` → Tab Recettes loads with expandable rows
- `http://localhost:3000/dashboard/marchandise?tab=en-vente` → Tab En vente loads unified list
- `http://localhost:3000/dashboard/marchandise?tab=apercu-caisse` → POS preview loads
- `http://localhost:3000/dashboard/stocks` → redirects to `/dashboard/marchandise`
- `http://localhost:3000/dashboard/recettes` → redirects to `/dashboard/marchandise?tab=recettes`
- Sidebar shows "Marchandise" and no longer shows "Stocks" or "Recettes"
- NetworkStatusSelect dropdown opens, changes status inline without page reload
- Chevron on recette row opens/closes the SOP panel
- SOP required toggle persists after page refresh

- [ ] **Step 12.3: Update CLAUDE.md**

Add section 9 to `CLAUDE.md`:

```markdown
## 9. Architecture Marchandise

Page `/dashboard/marchandise` (4 onglets) remplace `/dashboard/stocks` + `/dashboard/recettes`.

| Onglet | Composant | Table(s) principale(s) |
|--------|-----------|------------------------|
| 📦 Marchandise | `tab-marchandise.tsx` | `stock_items` |
| 🍳 Recettes | `tab-recettes.tsx` | `recipes`, `recipe_ingredients`, `sops` |
| 🛒 En vente | `tab-en-vente.tsx` | `stock_items (is_pos)`, `products` |
| 🖥️ Aperçu caisse | `tab-apercu-caisse.tsx` | partagé avec pilotage franchise |

Colonnes `network_status` (enum: active/inactive/coming_soon/not_shared, défaut not_shared) sur `stock_items` et `recipes`.
Colonne `sop_required` (boolean, défaut false) sur `recipes`.
Routes `/dashboard/stocks` et `/dashboard/recettes` redirigent vers `/dashboard/marchandise`.
```

- [ ] **Step 12.4: Final commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md with marchandise architecture"
```

---

## Notes for implementer

- **CSS vars:** Never hardcode colors. Use `var(--green)`, `var(--red)`, `var(--orange)`, `var(--blue)` — check that these vars exist in the global CSS before using them; if not, use the rgba values seen in the mockups.
- **StockItemForm interface:** The existing `StockItemForm` in `stocks/_components/stock-item-form.tsx` may have a different `onSave` signature. Read it before Task 5.
- **RecipeForm interface:** Same caveat — read `recettes/_components/recipe-form.tsx` before Task 7.
- **SopForm interface:** Read `sops/_components/sop-form.tsx` before Task 6. The `onSave` callback shape may differ.
- **`products` table:** Check that a `recipe_id` column exists on `products` and that the FK name `products_recipe_id_fkey` is correct. Verify in `src/lib/types/database.ts`.
- **No layout padding:** `layout.tsx` already applies `marginLeft: 220px + paddingTop: 48px + p-6`. Do not add compensating padding in any component.
