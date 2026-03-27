# Sprint 4 — Stocks & Approvisionnements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the complete Stocks & Approvisionnements module: inventory dashboard with alerts, article CRUD, purchase order creation and delivery reception.

**Architecture:** Follow the established dashboard pattern (`page.tsx` SSR → `*-page-client.tsx` client shell → focused `_components/`). API routes use `createClient()` server Supabase client, resolve `establishment_id` from the authenticated user's profile, validate with Zod, return `NextResponse.json`. State management is local `useState` — no external state library.

**Tech Stack:** Next.js 16 App Router, Supabase PostgreSQL, TypeScript, Tailwind CSS, Zod, Vitest + Testing Library

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `supabase/migrations/20260327000001_stocks_v2.sql` | Extend stock_items + add purchase_orders + purchase_order_items + RLS |
| Create | `src/lib/validations/stock.ts` | Zod schemas for stock CRUD |
| Create | `src/app/api/stock-items/route.ts` | GET list + POST create |
| Create | `src/app/api/stock-items/[id]/route.ts` | PATCH update + DELETE soft-delete |
| Create | `src/app/api/purchase-orders/route.ts` | GET list + POST create (auto-ref BC-YYYY-XXXX) |
| Create | `src/app/api/purchase-orders/[id]/route.ts` | GET detail + PATCH status (implemented in Task 4, Step 2) |
| Create | `src/app/api/purchase-orders/[id]/receive/route.ts` | POST: record received quantities, update stock |
| Create | `src/app/dashboard/stocks/page.tsx` | SSR page — fetches stock_items + purchase_orders |
| Create | `src/app/dashboard/stocks/_components/types.ts` | Local TS types for stocks module |
| Create | `src/app/dashboard/stocks/_components/stocks-page-client.tsx` | Client shell — tabs: Inventaire / Commandes |
| Create | `src/app/dashboard/stocks/_components/stock-items-table.tsx` | Table with KPI row, filters, level bars, alert badges |
| Create | `src/app/dashboard/stocks/_components/stock-item-form.tsx` | Create/edit modal |
| Create | `src/app/dashboard/stocks/_components/purchase-order-form.tsx` | New purchase order form |
| Create | `src/app/dashboard/stocks/_components/receive-delivery-modal.tsx` | Delivery reception with ecart detection |
| Modify | `src/app/dashboard/_components/sidebar.tsx` | Enable Stocks nav item (remove disabled) |

---

## Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/20260327000001_stocks_v2.sql`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/20260327000001_stocks_v2.sql

-- 1. Extend stock_items
alter table public.stock_items rename column ingredient to name;

alter table public.stock_items
  add column category        text,
  add column supplier        text,
  add column supplier_ref    text,
  add column unit_price      numeric not null default 0,
  add column order_quantity  numeric not null default 0,
  add column active          boolean not null default true;

-- 2. Purchase orders
create table public.purchase_orders (
  id                      uuid primary key default gen_random_uuid(),
  establishment_id        uuid not null references public.establishments(id) on delete cascade,
  order_ref               text not null,              -- BC-YYYY-XXXX
  supplier                text not null,
  supplier_email          text,
  requested_delivery_date date,
  status                  text not null default 'draft', -- draft | sent | received | partial
  total_ht                numeric not null default 0,
  notes                   text,
  created_by              uuid references auth.users(id),
  created_at              timestamptz not null default now()
);

-- 3. Purchase order items
create table public.purchase_order_items (
  id                  uuid primary key default gen_random_uuid(),
  purchase_order_id   uuid not null references public.purchase_orders(id) on delete cascade,
  stock_item_id       uuid not null references public.stock_items(id),
  quantity_ordered    numeric not null,
  unit_price          numeric not null,
  quantity_received   numeric,                        -- null until received
  sort_order          int not null default 0
);

-- 4. RLS
alter table public.purchase_orders enable row level security;
alter table public.purchase_order_items enable row level security;

-- stock_items RLS (already enabled, add policy)
create policy "establishment members can manage stock_items"
  on public.stock_items for all
  using (
    establishment_id in (
      select establishment_id from public.profiles where id = auth.uid()
    )
  );

create policy "establishment members can manage purchase_orders"
  on public.purchase_orders for all
  using (
    establishment_id in (
      select establishment_id from public.profiles where id = auth.uid()
    )
  );

create policy "establishment members can manage purchase_order_items"
  on public.purchase_order_items for all
  using (
    purchase_order_id in (
      select id from public.purchase_orders
      where establishment_id in (
        select establishment_id from public.profiles where id = auth.uid()
      )
    )
  );
```

- [ ] **Step 2: Apply migration**

```bash
cd "/Users/anthony/Super pouvoir/Alloflow"
npx supabase db push
```

Expected: Migration applied successfully, no errors.

- [ ] **Step 3: Regenerate TypeScript types**

```bash
npx supabase gen types typescript --local > src/lib/types/database.ts
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260327000001_stocks_v2.sql src/lib/types/database.ts
git commit -m "feat(db): add stocks v2 migration — purchase_orders + extend stock_items"
```

---

## Task 2: Zod Validation Schemas

**Files:**
- Create: `src/lib/validations/stock.ts`

- [ ] **Step 1: Write schemas**

```typescript
// src/lib/validations/stock.ts
import { z } from 'zod'

export const createStockItemSchema = z.object({
  name:           z.string().min(1, 'Le nom est requis').max(100),
  category:       z.string().max(50).nullable().optional(),
  unit:           z.string().min(1, 'L\'unité est requise').max(20),
  quantity:       z.number().min(0).default(0),
  alert_threshold:z.number().min(0).default(0),
  unit_price:     z.number().min(0).default(0),
  order_quantity: z.number().min(0).default(0),
  supplier:       z.string().max(100).nullable().optional(),
  supplier_ref:   z.string().max(100).nullable().optional(),
})

export const updateStockItemSchema = createStockItemSchema.partial().extend({
  active: z.boolean().optional(),
})

export const createPurchaseOrderSchema = z.object({
  supplier:                z.string().min(1).max(100),
  supplier_email:          z.string().email().nullable().optional(),
  requested_delivery_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  notes:                   z.string().max(500).nullable().optional(),
  items: z.array(z.object({
    stock_item_id:   z.string().uuid(),
    quantity_ordered:z.number().min(0.001),
    unit_price:      z.number().min(0),
  })).min(1, 'Au moins un article requis'),
})

export const receiveDeliverySchema = z.object({
  items: z.array(z.object({
    purchase_order_item_id: z.string().uuid(),
    quantity_received:      z.number().min(0),
  })),
})

export type CreateStockItemInput  = z.infer<typeof createStockItemSchema>
export type UpdateStockItemInput  = z.infer<typeof updateStockItemSchema>
export type CreatePurchaseOrderInput = z.infer<typeof createPurchaseOrderSchema>
export type ReceiveDeliveryInput  = z.infer<typeof receiveDeliverySchema>
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/validations/stock.ts
git commit -m "feat(stocks): add Zod validation schemas"
```

---

## Task 3: API — Stock Items CRUD

**Files:**
- Create: `src/app/api/stock-items/route.ts`
- Create: `src/app/api/stock-items/[id]/route.ts`

- [ ] **Step 1: Write GET + POST route**

```typescript
// src/app/api/stock-items/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createStockItemSchema } from '@/lib/validations/stock'

async function getEstablishmentId(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data } = await supabase
    .from('profiles')
    .select('establishment_id')
    .eq('id', userId)
    .single()
  return data?.establishment_id ?? null
}

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const establishmentId = await getEstablishmentId(supabase, user.id)
  if (!establishmentId) return NextResponse.json({ error: 'Établissement non trouvé' }, { status: 400 })

  const { searchParams } = new URL(req.url)
  const status  = searchParams.get('status')  // 'alert' | 'out_of_stock' | 'ok'
  const search  = searchParams.get('search')
  const category = searchParams.get('category')

  let query = supabase
    .from('stock_items')
    .select('*')
    .eq('establishment_id', establishmentId)
    .eq('active', true)
    .order('name')

  if (search)   query = query.ilike('name', `%${search}%`)
  if (category) query = query.eq('category', category)
  if (status === 'out_of_stock') query = query.lte('quantity', 0)
  if (status === 'alert') query = query.gt('quantity', 0).lt('quantity', supabase.rpc as never) // filtered client-side

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Compute status client-side (avoids raw SQL in filter)
  const items = (data ?? []).map(item => ({
    ...item,
    status: item.quantity <= 0
      ? 'out_of_stock'
      : item.quantity < item.alert_threshold
      ? 'alert'
      : 'ok',
  }))

  const filtered = status && status !== 'all'
    ? items.filter(i => i.status === status)
    : items

  return NextResponse.json({ items: filtered })
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const establishmentId = await getEstablishmentId(supabase, user.id)
  if (!establishmentId) return NextResponse.json({ error: 'Établissement non trouvé' }, { status: 400 })

  const body = await req.json()
  const result = createStockItemSchema.safeParse(body)
  if (!result.success) return NextResponse.json({ error: result.error.flatten() }, { status: 400 })

  const { data, error } = await supabase
    .from('stock_items')
    .insert({ ...result.data, establishment_id: establishmentId })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
```

- [ ] **Step 2: Write PATCH + DELETE route**

```typescript
// src/app/api/stock-items/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { updateStockItemSchema } from '@/lib/validations/stock'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const result = updateStockItemSchema.safeParse(body)
  if (!result.success) return NextResponse.json({ error: result.error.flatten() }, { status: 400 })

  const { data, error } = await supabase
    .from('stock_items')
    .update(result.data)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { error } = await supabase
    .from('stock_items')
    .update({ active: false })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
```

- [ ] **Step 3: Verify routes compile**

```bash
cd "/Users/anthony/Super pouvoir/Alloflow"
npx tsc --noEmit
```

Expected: No errors on the new files.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/stock-items/
git commit -m "feat(stocks): add stock-items API routes (GET, POST, PATCH, DELETE)"
```

---

## Task 4: API — Purchase Orders

**Files:**
- Create: `src/app/api/purchase-orders/route.ts`
- Create: `src/app/api/purchase-orders/[id]/route.ts`
- Create: `src/app/api/purchase-orders/[id]/receive/route.ts`

- [ ] **Step 1: Write GET + POST (with auto-ref)**

```typescript
// src/app/api/purchase-orders/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createPurchaseOrderSchema } from '@/lib/validations/stock'

async function getEstablishmentId(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data } = await supabase
    .from('profiles')
    .select('establishment_id')
    .eq('id', userId)
    .single()
  return data?.establishment_id ?? null
}

function generateOrderRef(year: number, count: number) {
  return `BC-${year}-${String(count + 1).padStart(4, '0')}`
}

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const establishmentId = await getEstablishmentId(supabase, user.id)
  if (!establishmentId) return NextResponse.json({ error: 'Établissement non trouvé' }, { status: 400 })

  const { data, error } = await supabase
    .from('purchase_orders')
    .select('*, items:purchase_order_items(*, stock_item:stock_items(id, name, unit))')
    .eq('establishment_id', establishmentId)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ orders: data ?? [] })
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const establishmentId = await getEstablishmentId(supabase, user.id)
  if (!establishmentId) return NextResponse.json({ error: 'Établissement non trouvé' }, { status: 400 })

  const body = await req.json()
  const result = createPurchaseOrderSchema.safeParse(body)
  if (!result.success) return NextResponse.json({ error: result.error.flatten() }, { status: 400 })

  // Count existing orders this year for ref generation
  const year = new Date().getFullYear()
  const { count } = await supabase
    .from('purchase_orders')
    .select('*', { count: 'exact', head: true })
    .eq('establishment_id', establishmentId)
    .gte('created_at', `${year}-01-01`)

  const orderRef = generateOrderRef(year, count ?? 0)
  const totalHt = result.data.items.reduce((sum, i) => sum + i.quantity_ordered * i.unit_price, 0)

  const { data: order, error: orderError } = await supabase
    .from('purchase_orders')
    .insert({
      establishment_id:        establishmentId,
      order_ref:               orderRef,
      supplier:                result.data.supplier,
      supplier_email:          result.data.supplier_email ?? null,
      requested_delivery_date: result.data.requested_delivery_date ?? null,
      notes:                   result.data.notes ?? null,
      total_ht:                totalHt,
      created_by:              user.id,
    })
    .select()
    .single()

  if (orderError) return NextResponse.json({ error: orderError.message }, { status: 500 })

  const { error: itemsError } = await supabase
    .from('purchase_order_items')
    .insert(result.data.items.map((item, idx) => ({
      purchase_order_id: order.id,
      stock_item_id:     item.stock_item_id,
      quantity_ordered:  item.quantity_ordered,
      unit_price:        item.unit_price,
      sort_order:        idx,
    })))

  if (itemsError) return NextResponse.json({ error: itemsError.message }, { status: 500 })

  return NextResponse.json(order, { status: 201 })
}
```

- [ ] **Step 2: Write GET detail + PATCH status route**

```typescript
// src/app/api/purchase-orders/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { z } from 'zod'

const patchStatusSchema = z.object({
  status: z.enum(['draft', 'sent', 'received', 'partial']),
})

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('purchase_orders')
    .select('*, items:purchase_order_items(*, stock_item:stock_items(id, name, unit))')
    .eq('id', id)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 404 })
  return NextResponse.json(data)
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const result = patchStatusSchema.safeParse(body)
  if (!result.success) return NextResponse.json({ error: result.error.flatten() }, { status: 400 })

  const { data, error } = await supabase
    .from('purchase_orders')
    .update({ status: result.data.status })
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
```

- [ ] **Step 3: Write receive delivery route**

```typescript
// src/app/api/purchase-orders/[id]/receive/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { receiveDeliverySchema } from '@/lib/validations/stock'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const result = receiveDeliverySchema.safeParse(body)
  if (!result.success) return NextResponse.json({ error: result.error.flatten() }, { status: 400 })

  // Fetch order items to know which stock_items to update
  const { data: orderItems, error: fetchError } = await supabase
    .from('purchase_order_items')
    .select('id, stock_item_id, quantity_ordered')
    .eq('purchase_order_id', id)

  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 })

  const receivedMap = new Map(result.data.items.map(i => [i.purchase_order_item_id, i.quantity_received]))

  // Update each order item's quantity_received and increment stock
  for (const orderItem of orderItems ?? []) {
    const received = receivedMap.get(orderItem.id)
    if (received === undefined) continue

    // Update order item
    await supabase
      .from('purchase_order_items')
      .update({ quantity_received: received })
      .eq('id', orderItem.id)

    // Increment stock quantity
    if (received > 0) {
      const { data: stock } = await supabase
        .from('stock_items')
        .select('quantity')
        .eq('id', orderItem.stock_item_id)
        .single()

      await supabase
        .from('stock_items')
        .update({ quantity: (stock?.quantity ?? 0) + received })
        .eq('id', orderItem.stock_item_id)
    }
  }

  // Determine new order status
  const allReceived = (orderItems ?? []).every(oi => {
    const received = receivedMap.get(oi.id) ?? 0
    return received >= oi.quantity_ordered
  })

  await supabase
    .from('purchase_orders')
    .update({ status: allReceived ? 'received' : 'partial' })
    .eq('id', id)

  return NextResponse.json({ success: true, status: allReceived ? 'received' : 'partial' })
}
```

- [ ] **Step 4: Verify compile**

```bash
npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add src/app/api/purchase-orders/
git commit -m "feat(stocks): add purchase-orders API — create, list, detail, PATCH status, receive delivery"
```

---

## Task 5: Enable Stocks in Sidebar

**Files:**
- Modify: `src/app/dashboard/_components/sidebar.tsx`

- [ ] **Step 1: Update nav items**

In `sidebar.tsx`, change the Stocks entry from:
```typescript
{ href: '/dashboard/stock', label: 'Stocks', icon: '📦', disabled: true },
```
to:
```typescript
{ href: '/dashboard/stocks', label: 'Stocks', icon: '📦' },
```
(Remove `disabled: true`, fix path to `/dashboard/stocks` with an `s`)

- [ ] **Step 2: Commit**

```bash
git add src/app/dashboard/_components/sidebar.tsx
git commit -m "feat(stocks): enable Stocks nav item in sidebar"
```

---

## Task 6: Types + SSR Page

**Files:**
- Create: `src/app/dashboard/stocks/_components/types.ts`
- Create: `src/app/dashboard/stocks/page.tsx`

- [ ] **Step 1: Write local types**

```typescript
// src/app/dashboard/stocks/_components/types.ts
export type StockStatus = 'ok' | 'alert' | 'out_of_stock'

export interface StockItem {
  id: string
  establishment_id: string
  name: string
  category: string | null
  unit: string
  quantity: number
  alert_threshold: number
  unit_price: number
  order_quantity: number
  supplier: string | null
  supplier_ref: string | null
  active: boolean
  status: StockStatus
}

export interface PurchaseOrderItem {
  id: string
  purchase_order_id: string
  stock_item_id: string
  quantity_ordered: number
  unit_price: number
  quantity_received: number | null
  sort_order: number
  stock_item?: Pick<StockItem, 'id' | 'name' | 'unit'>
}

export interface PurchaseOrder {
  id: string
  establishment_id: string
  order_ref: string
  supplier: string
  supplier_email: string | null
  requested_delivery_date: string | null
  status: 'draft' | 'sent' | 'received' | 'partial'
  total_ht: number
  notes: string | null
  created_at: string
  items?: PurchaseOrderItem[]
}
```

- [ ] **Step 2: Write SSR page**

```typescript
// src/app/dashboard/stocks/page.tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { StocksPageClient } from './_components/stocks-page-client'
import type { StockItem, PurchaseOrder } from './_components/types'

export default async function StocksPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('establishment_id')
    .eq('id', user.id)
    .single()

  if (!profile?.establishment_id) redirect('/onboarding')

  const [stockRes, ordersRes] = await Promise.all([
    supabase
      .from('stock_items')
      .select('*')
      .eq('establishment_id', profile.establishment_id)
      .eq('active', true)
      .order('name'),
    supabase
      .from('purchase_orders')
      .select('*, items:purchase_order_items(*, stock_item:stock_items(id, name, unit))')
      .eq('establishment_id', profile.establishment_id)
      .order('created_at', { ascending: false })
      .limit(20),
  ])

  const items: StockItem[] = (stockRes.data ?? []).map(i => ({
    ...i,
    status: i.quantity <= 0
      ? 'out_of_stock'
      : i.quantity < i.alert_threshold
      ? 'alert'
      : 'ok',
  }))

  return (
    <StocksPageClient
      initialItems={items}
      initialOrders={(ordersRes.data ?? []) as PurchaseOrder[]}
    />
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/dashboard/stocks/
git commit -m "feat(stocks): add types + SSR page"
```

---

## Task 7: StocksPageClient + StockItemsTable

**Files:**
- Create: `src/app/dashboard/stocks/_components/stocks-page-client.tsx`
- Create: `src/app/dashboard/stocks/_components/stock-items-table.tsx`

- [ ] **Step 1: Write stocks-page-client.tsx**

```tsx
// src/app/dashboard/stocks/_components/stocks-page-client.tsx
'use client'
import { useState } from 'react'
import { StockItemsTable } from './stock-items-table'
import { StockItemForm } from './stock-item-form'
import { PurchaseOrderForm } from './purchase-order-form'
import type { StockItem, PurchaseOrder } from './types'

interface Props {
  initialItems: StockItem[]
  initialOrders: PurchaseOrder[]
}

export function StocksPageClient({ initialItems, initialOrders }: Props) {
  const [items, setItems] = useState(initialItems)
  const [orders, setOrders] = useState(initialOrders)
  const [tab, setTab] = useState<'inventory' | 'orders'>('inventory')
  const [showItemForm, setShowItemForm] = useState(false)
  const [showOrderForm, setShowOrderForm] = useState(false)
  const [editingItem, setEditingItem] = useState<StockItem | null>(null)

  const alerts    = items.filter(i => i.status === 'alert').length
  const outOfStock = items.filter(i => i.status === 'out_of_stock').length
  const pendingOrders = orders.filter(o => o.status === 'sent').length

  async function reloadItems() {
    const res = await fetch('/api/stock-items')
    const json = await res.json()
    setItems(json.items ?? [])
  }

  async function reloadOrders() {
    const res = await fetch('/api/purchase-orders')
    const json = await res.json()
    setOrders(json.orders ?? [])
  }

  return (
    <div style={{ paddingLeft: '220px', minHeight: '100vh', background: 'var(--bg)' }}>
      <div className="max-w-6xl mx-auto p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-[var(--text1)]">Stocks & Approvisionnement</h1>
            {(alerts > 0 || outOfStock > 0) && (
              <p className="text-sm text-amber-400 mt-0.5">
                {outOfStock > 0 && `${outOfStock} rupture${outOfStock > 1 ? 's' : ''} · `}
                {alerts > 0 && `${alerts} alerte${alerts > 1 ? 's' : ''}`}
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => { setShowOrderForm(true) }}
              className="px-3 py-1.5 rounded-lg text-sm font-medium border border-[var(--border)] text-[var(--text3)] hover:bg-[var(--surface)]"
            >
              📥 Commander
            </button>
            <button
              onClick={() => { setEditingItem(null); setShowItemForm(true) }}
              className="px-3 py-1.5 rounded-lg text-sm font-semibold text-white"
              style={{ background: 'var(--blue)' }}
            >
              + Nouvel article
            </button>
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          {[
            { label: 'Articles', value: items.length, color: 'text-[var(--text1)]' },
            { label: 'Alertes', value: alerts, color: 'text-amber-400' },
            { label: 'Ruptures', value: outOfStock, color: 'text-red-400' },
            { label: 'Commandes en cours', value: pendingOrders, color: 'text-[var(--text1)]' },
          ].map(kpi => (
            <div key={kpi.label} className="rounded-xl p-4 border border-[var(--border)]" style={{ background: 'var(--surface)' }}>
              <div className={`text-2xl font-bold ${kpi.color}`}>{kpi.value}</div>
              <div className="text-xs text-[var(--text3)] uppercase tracking-wide mt-1">{kpi.label}</div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-4 border-b border-[var(--border)]">
          {(['inventory', 'orders'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm font-medium rounded-t-lg border-b-2 transition-colors ${
                tab === t
                  ? 'border-[var(--blue)] text-white'
                  : 'border-transparent text-[var(--text3)] hover:text-[var(--text2)]'
              }`}
            >
              {t === 'inventory' ? `Inventaire (${items.length})` : `Commandes (${orders.length})`}
            </button>
          ))}
        </div>

        {tab === 'inventory' && (
          <StockItemsTable
            items={items}
            onEdit={item => { setEditingItem(item); setShowItemForm(true) }}
            onDelete={async id => {
              await fetch(`/api/stock-items/${id}`, { method: 'DELETE' })
              await reloadItems()
            }}
          />
        )}

        {tab === 'orders' && (
          <div className="space-y-3">
            {orders.length === 0 && (
              <div className="text-center py-16 text-[var(--text4)]">
                <div className="text-4xl mb-3">📥</div>
                <div className="font-semibold">Aucune commande fournisseur</div>
                <div className="text-sm mt-1">Créez votre premier bon de commande</div>
              </div>
            )}
            {orders.map(order => (
              <div key={order.id} className="rounded-xl p-4 border border-[var(--border)]" style={{ background: 'var(--surface)' }}>
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-semibold text-[var(--text1)]">{order.order_ref}</span>
                    <span className="mx-2 text-[var(--text4)]">·</span>
                    <span className="text-[var(--text3)]">{order.supplier}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-bold text-[var(--text1)]">{order.total_ht.toFixed(2)} €</span>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded ${
                      order.status === 'received' ? 'bg-green-900/30 text-green-400' :
                      order.status === 'sent' ? 'bg-blue-900/30 text-blue-400' :
                      order.status === 'partial' ? 'bg-amber-900/30 text-amber-400' :
                      'bg-[var(--surface2)] text-[var(--text4)]'
                    }`}>
                      {order.status === 'draft' ? 'Brouillon' : order.status === 'sent' ? 'Envoyé' : order.status === 'received' ? 'Reçu' : 'Partiel'}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <StockItemForm
        open={showItemForm}
        item={editingItem}
        onClose={() => setShowItemForm(false)}
        onSave={async () => { setShowItemForm(false); await reloadItems() }}
      />
      <PurchaseOrderForm
        open={showOrderForm}
        items={items}
        onClose={() => setShowOrderForm(false)}
        onSave={async () => { setShowOrderForm(false); await reloadOrders() }}
      />
    </div>
  )
}
```

- [ ] **Step 2: Write StockItemsTable**

```tsx
// src/app/dashboard/stocks/_components/stock-items-table.tsx
'use client'
import { useState } from 'react'
import type { StockItem, StockStatus } from './types'

const STATUS_LABELS: Record<StockStatus, string> = {
  ok: '✓ OK',
  alert: '⚠ Bas',
  out_of_stock: '✕ Rupture',
}
const STATUS_CLASSES: Record<StockStatus, string> = {
  ok: 'bg-green-900/20 text-green-400',
  alert: 'bg-amber-900/20 text-amber-400',
  out_of_stock: 'bg-red-900/20 text-red-400',
}

interface Props {
  items: StockItem[]
  onEdit: (item: StockItem) => void
  onDelete: (id: string) => Promise<void>
}

export function StockItemsTable({ items, onEdit, onDelete }: Props) {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | StockStatus>('all')

  const filtered = items
    .filter(i => !search || i.name.toLowerCase().includes(search.toLowerCase()))
    .filter(i => statusFilter === 'all' || i.status === statusFilter)

  return (
    <div>
      {/* Filters */}
      <div className="flex items-center gap-3 mb-4">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Rechercher..."
          className="px-3 py-1.5 rounded-lg text-sm border border-[var(--border)] bg-[var(--surface)] text-[var(--text2)] w-52"
        />
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value as typeof statusFilter)}
          className="px-3 py-1.5 rounded-lg text-sm border border-[var(--border)] bg-[var(--surface)] text-[var(--text3)]"
        >
          <option value="all">Tous les statuts</option>
          <option value="out_of_stock">Rupture</option>
          <option value="alert">Alerte</option>
          <option value="ok">OK</option>
        </select>
        <span className="ml-auto text-xs text-[var(--text4)]">{filtered.length} article{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-12 text-[var(--text4)]">Aucun article trouvé</div>
      ) : (
        <div className="rounded-xl border border-[var(--border)] overflow-hidden" style={{ background: 'var(--surface)' }}>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)]">
                {['Article', 'Catégorie', 'Stock', 'Seuil', 'Niveau', 'Fournisseur', 'Statut', ''].map(h => (
                  <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold text-[var(--text4)] uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(item => {
                const pct = item.alert_threshold > 0
                  ? Math.min(100, (item.quantity / (item.alert_threshold * 2)) * 100)
                  : item.quantity > 0 ? 80 : 0
                return (
                  <tr key={item.id} className="border-b border-[var(--border)]/50 last:border-0 hover:bg-[var(--surface2)]/30">
                    <td className="px-4 py-2.5 font-semibold text-[var(--text1)]">{item.name}</td>
                    <td className="px-4 py-2.5 text-[var(--text3)]">{item.category ?? '—'}</td>
                    <td className="px-4 py-2.5 font-bold text-[var(--text1)]">
                      {item.quantity} <span className="text-xs text-[var(--text4)] font-normal">{item.unit}</span>
                    </td>
                    <td className="px-4 py-2.5 text-[var(--text4)] text-xs">{item.alert_threshold} {item.unit}</td>
                    <td className="px-4 py-2.5">
                      <div className="w-20 h-1.5 rounded-full bg-[var(--border)]">
                        <div
                          className={`h-1.5 rounded-full ${item.status === 'ok' ? 'bg-green-500' : item.status === 'alert' ? 'bg-amber-500' : 'bg-red-500'}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-[var(--text3)]">{item.supplier ?? '—'}</td>
                    <td className="px-4 py-2.5">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded ${STATUS_CLASSES[item.status]}`}>
                        {STATUS_LABELS[item.status]}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex gap-2">
                        <button onClick={() => onEdit(item)} className="text-xs text-[var(--text4)] hover:text-[var(--text2)]">Modifier</button>
                        <button onClick={() => onDelete(item.id)} className="text-xs text-red-500/60 hover:text-red-400">Suppr.</button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Compile check**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add src/app/dashboard/stocks/_components/stocks-page-client.tsx \
        src/app/dashboard/stocks/_components/stock-items-table.tsx
git commit -m "feat(stocks): add StocksPageClient + StockItemsTable"
```

---

## Task 8: StockItemForm Modal

**Files:**
- Create: `src/app/dashboard/stocks/_components/stock-item-form.tsx`

- [ ] **Step 1: Write form**

```tsx
// src/app/dashboard/stocks/_components/stock-item-form.tsx
'use client'
import { useState, useEffect } from 'react'
import type { StockItem } from './types'

const UNITS = ['kg', 'g', 'L', 'cL', 'mL', 'u.', 'boîte', 'sac', 'carton']

interface Props {
  open: boolean
  item: StockItem | null
  onClose: () => void
  onSave: () => Promise<void>
}

export function StockItemForm({ open, item, onClose, onSave }: Props) {
  const [name, setName] = useState('')
  const [category, setCategory] = useState('')
  const [unit, setUnit] = useState('kg')
  const [quantity, setQuantity] = useState('0')
  const [alertThreshold, setAlertThreshold] = useState('0')
  const [unitPrice, setUnitPrice] = useState('0')
  const [orderQuantity, setOrderQuantity] = useState('0')
  const [supplier, setSupplier] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setName(item?.name ?? '')
      setCategory(item?.category ?? '')
      setUnit(item?.unit ?? 'kg')
      setQuantity(String(item?.quantity ?? 0))
      setAlertThreshold(String(item?.alert_threshold ?? 0))
      setUnitPrice(String(item?.unit_price ?? 0))
      setOrderQuantity(String(item?.order_quantity ?? 0))
      setSupplier(item?.supplier ?? '')
      setError(null)
    }
  }, [open, item])

  if (!open) return null

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) { setError('Le nom est requis'); return }
    setLoading(true); setError(null)
    try {
      const payload = {
        name: name.trim(),
        category: category.trim() || null,
        unit,
        quantity: parseFloat(quantity) || 0,
        alert_threshold: parseFloat(alertThreshold) || 0,
        unit_price: parseFloat(unitPrice) || 0,
        order_quantity: parseFloat(orderQuantity) || 0,
        supplier: supplier.trim() || null,
      }
      const url  = item ? `/api/stock-items/${item.id}` : '/api/stock-items'
      const method = item ? 'PATCH' : 'POST'
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      if (!res.ok) { const j = await res.json(); throw new Error(j.error ?? 'Erreur serveur'); }
      await onSave()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-[520px] rounded-2xl border border-[var(--border)] p-6" style={{ background: 'var(--surface)' }}>
        <h2 className="text-base font-bold text-[var(--text1)] mb-5">{item ? 'Modifier l\'article' : 'Nouvel article'}</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-[var(--text4)] uppercase tracking-wide">Nom de l'article *</label>
            <input value={name} onChange={e => setName(e.target.value)}
              className="mt-1 w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-[var(--text1)] text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-[var(--text4)] uppercase tracking-wide">Catégorie</label>
              <input value={category} onChange={e => setCategory(e.target.value)} placeholder="Épicerie sèche"
                className="mt-1 w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-[var(--text1)] text-sm" />
            </div>
            <div>
              <label className="text-xs font-semibold text-[var(--text4)] uppercase tracking-wide">Fournisseur</label>
              <input value={supplier} onChange={e => setSupplier(e.target.value)} placeholder="Métro"
                className="mt-1 w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-[var(--text1)] text-sm" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-semibold text-[var(--text4)] uppercase tracking-wide">Unité</label>
              <select value={unit} onChange={e => setUnit(e.target.value)}
                className="mt-1 w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-[var(--text1)] text-sm">
                {UNITS.map(u => <option key={u}>{u}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-[var(--text4)] uppercase tracking-wide">Stock actuel</label>
              <input type="number" step="0.001" value={quantity} onChange={e => setQuantity(e.target.value)}
                className="mt-1 w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-[var(--text1)] text-sm" />
            </div>
            <div>
              <label className="text-xs font-semibold text-[var(--text4)] uppercase tracking-wide">Seuil d'alerte</label>
              <input type="number" step="0.001" value={alertThreshold} onChange={e => setAlertThreshold(e.target.value)}
                className="mt-1 w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-[var(--text1)] text-sm" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-[var(--text4)] uppercase tracking-wide">Prix unitaire (€)</label>
              <input type="number" step="0.001" value={unitPrice} onChange={e => setUnitPrice(e.target.value)}
                className="mt-1 w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-[var(--text1)] text-sm" />
            </div>
            <div>
              <label className="text-xs font-semibold text-[var(--text4)] uppercase tracking-wide">Qté à commander</label>
              <input type="number" step="0.001" value={orderQuantity} onChange={e => setOrderQuantity(e.target.value)}
                className="mt-1 w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-[var(--text1)] text-sm" />
            </div>
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 py-2 rounded-lg border border-[var(--border)] text-sm text-[var(--text3)]">Annuler</button>
            <button type="submit" disabled={loading}
              className="flex-2 px-6 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
              style={{ background: 'var(--blue)' }}>
              {loading ? 'Enregistrement...' : 'Enregistrer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/dashboard/stocks/_components/stock-item-form.tsx
git commit -m "feat(stocks): add StockItemForm modal"
```

---

## Task 9: PurchaseOrderForm

**Files:**
- Create: `src/app/dashboard/stocks/_components/purchase-order-form.tsx`

- [ ] **Step 1: Write form**

```tsx
// src/app/dashboard/stocks/_components/purchase-order-form.tsx
'use client'
import { useState } from 'react'
import type { StockItem } from './types'

interface OrderLine { stockItemId: string; quantityOrdered: number; unitPrice: number }

interface Props {
  open: boolean
  items: StockItem[]
  onClose: () => void
  onSave: () => Promise<void>
}

export function PurchaseOrderForm({ open, items, onClose, onSave }: Props) {
  const alertItems = items.filter(i => i.status !== 'ok')

  const [supplier, setSupplier] = useState('')
  const [deliveryDate, setDeliveryDate] = useState('')
  const [lines, setLines] = useState<OrderLine[]>(() =>
    alertItems.map(i => ({ stockItemId: i.id, quantityOrdered: i.order_quantity || 1, unitPrice: i.unit_price }))
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!open) return null

  const totalHt = lines.reduce((s, l) => s + l.quantityOrdered * l.unitPrice, 0)

  function addLine() {
    setLines(prev => [...prev, { stockItemId: '', quantityOrdered: 1, unitPrice: 0 }])
  }

  function updateLine(idx: number, field: keyof OrderLine, value: string | number) {
    setLines(prev => prev.map((l, i) => i === idx ? { ...l, [field]: value } : l))
  }

  function removeLine(idx: number) {
    setLines(prev => prev.filter((_, i) => i !== idx))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!supplier.trim()) { setError('Le fournisseur est requis'); return }
    const validLines = lines.filter(l => l.stockItemId && l.quantityOrdered > 0)
    if (validLines.length === 0) { setError('Ajoutez au moins un article'); return }
    setLoading(true); setError(null)
    try {
      const res = await fetch('/api/purchase-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplier: supplier.trim(),
          requested_delivery_date: deliveryDate || null,
          items: validLines.map(l => ({
            stock_item_id:    l.stockItemId,
            quantity_ordered: l.quantityOrdered,
            unit_price:       l.unitPrice,
          })),
        }),
      })
      if (!res.ok) { const j = await res.json(); throw new Error(j.error ?? 'Erreur') }
      await onSave()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-[680px] max-h-[90vh] overflow-y-auto rounded-2xl border border-[var(--border)] p-6" style={{ background: 'var(--surface)' }}>
        <h2 className="text-base font-bold text-[var(--text1)] mb-5">Nouveau bon de commande</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-[var(--text4)] uppercase tracking-wide">Fournisseur *</label>
              <input value={supplier} onChange={e => setSupplier(e.target.value)} placeholder="Métro, Transgourmet..."
                className="mt-1 w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-[var(--text1)] text-sm" />
            </div>
            <div>
              <label className="text-xs font-semibold text-[var(--text4)] uppercase tracking-wide">Date de livraison souhaitée</label>
              <input type="date" value={deliveryDate} onChange={e => setDeliveryDate(e.target.value)}
                className="mt-1 w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-[var(--text1)] text-sm" />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-[var(--text4)] uppercase tracking-wide">Articles</label>
              <button type="button" onClick={addLine} className="text-xs text-[var(--blue)] hover:underline">+ Ajouter</button>
            </div>
            <div className="rounded-lg border border-[var(--border)] overflow-hidden">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-[var(--border)]">
                  <th className="text-left px-3 py-2 text-xs text-[var(--text4)]">Article</th>
                  <th className="text-left px-3 py-2 text-xs text-[var(--text4)]">Qté</th>
                  <th className="text-left px-3 py-2 text-xs text-[var(--text4)]">Prix unit.</th>
                  <th className="px-3 py-2 text-xs text-[var(--text4)]">Total</th>
                  <th />
                </tr></thead>
                <tbody>
                  {lines.map((line, idx) => {
                    const si = items.find(i => i.id === line.stockItemId)
                    return (
                      <tr key={idx} className="border-b border-[var(--border)]/50 last:border-0">
                        <td className="px-3 py-2">
                          <select value={line.stockItemId} onChange={e => {
                            const found = items.find(i => i.id === e.target.value)
                            updateLine(idx, 'stockItemId', e.target.value)
                            if (found) updateLine(idx, 'unitPrice', found.unit_price)
                          }} className="w-full px-2 py-1 rounded border border-[var(--border)] bg-[var(--bg)] text-[var(--text2)] text-xs">
                            <option value="">— Choisir —</option>
                            {items.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
                          </select>
                        </td>
                        <td className="px-3 py-2">
                          <input type="number" step="0.001" value={line.quantityOrdered}
                            onChange={e => updateLine(idx, 'quantityOrdered', parseFloat(e.target.value) || 0)}
                            className="w-20 px-2 py-1 rounded border border-[var(--border)] bg-[var(--bg)] text-[var(--text2)] text-xs" />
                          {si && <span className="ml-1 text-xs text-[var(--text4)]">{si.unit}</span>}
                        </td>
                        <td className="px-3 py-2">
                          <input type="number" step="0.001" value={line.unitPrice}
                            onChange={e => updateLine(idx, 'unitPrice', parseFloat(e.target.value) || 0)}
                            className="w-20 px-2 py-1 rounded border border-[var(--border)] bg-[var(--bg)] text-[var(--text2)] text-xs" />
                        </td>
                        <td className="px-3 py-2 text-right font-semibold text-[var(--text2)] text-xs">
                          {(line.quantityOrdered * line.unitPrice).toFixed(2)} €
                        </td>
                        <td className="px-3 py-2">
                          <button type="button" onClick={() => removeLine(idx)} className="text-xs text-red-500/60 hover:text-red-400">✕</button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex justify-between items-center py-2 border-t border-[var(--border)]">
            <span className="text-sm text-[var(--text3)]">Total HT</span>
            <span className="text-lg font-bold text-[var(--text1)]">{totalHt.toFixed(2)} €</span>
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}
          <div className="flex gap-2">
            <button type="button" onClick={onClose}
              className="flex-1 py-2 rounded-lg border border-[var(--border)] text-sm text-[var(--text3)]">Annuler</button>
            <button type="submit" disabled={loading}
              className="flex-2 px-6 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
              style={{ background: 'var(--blue)' }}>
              {loading ? 'Création...' : '📤 Créer le bon de commande'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/dashboard/stocks/_components/purchase-order-form.tsx
git commit -m "feat(stocks): add PurchaseOrderForm"
```

---

## Task 10a: ReceiveDeliveryModal + wire-up in StocksPageClient

**Files:**
- Create: `src/app/dashboard/stocks/_components/receive-delivery-modal.tsx`
- Modify: `src/app/dashboard/stocks/_components/stocks-page-client.tsx`

- [ ] **Step 1: Write ReceiveDeliveryModal**

```tsx
// src/app/dashboard/stocks/_components/receive-delivery-modal.tsx
'use client'
import { useState, useEffect } from 'react'
import type { PurchaseOrder, PurchaseOrderItem } from './types'

interface Props {
  open: boolean
  order: PurchaseOrder | null
  onClose: () => void
  onSave: () => Promise<void>
}

export function ReceiveDeliveryModal({ open, order, onClose, onSave }: Props) {
  const [quantities, setQuantities] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open && order?.items) {
      const init: Record<string, string> = {}
      order.items.forEach(item => {
        init[item.id] = String(item.quantity_ordered)
      })
      setQuantities(init)
      setError(null)
    }
  }, [open, order])

  if (!open || !order) return null

  const items: PurchaseOrderItem[] = order.items ?? []

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setError(null)
    try {
      const payload = {
        items: items.map(item => ({
          purchase_order_item_id: item.id,
          quantity_received: parseFloat(quantities[item.id] ?? '0') || 0,
        })),
      }
      const res = await fetch(`/api/purchase-orders/${order!.id}/receive`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) { const j = await res.json(); throw new Error(j.error ?? 'Erreur') }
      await onSave()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-[600px] max-h-[90vh] overflow-y-auto rounded-2xl border border-[var(--border)] p-6" style={{ background: 'var(--surface)' }}>
        <h2 className="text-base font-bold text-[var(--text1)] mb-1">Réception livraison</h2>
        <p className="text-xs text-[var(--text4)] mb-5">{order.order_ref} · {order.supplier}</p>
        <form onSubmit={handleSubmit}>
          <div className="rounded-lg border border-[var(--border)] overflow-hidden mb-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)]">
                  <th className="text-left px-3 py-2 text-xs text-[var(--text4)]">Article</th>
                  <th className="text-right px-3 py-2 text-xs text-[var(--text4)]">Commandé</th>
                  <th className="text-right px-3 py-2 text-xs text-[var(--text4)]">Reçu</th>
                  <th className="text-right px-3 py-2 text-xs text-[var(--text4)]">Écart</th>
                </tr>
              </thead>
              <tbody>
                {items.map(item => {
                  const received = parseFloat(quantities[item.id] ?? '0') || 0
                  const ecart = received - item.quantity_ordered
                  return (
                    <tr key={item.id} className="border-b border-[var(--border)]/50 last:border-0">
                      <td className="px-3 py-2 text-[var(--text2)]">
                        {item.stock_item?.name ?? '—'}
                        <span className="ml-1 text-xs text-[var(--text4)]">{item.stock_item?.unit}</span>
                      </td>
                      <td className="px-3 py-2 text-right text-[var(--text3)]">{item.quantity_ordered}</td>
                      <td className="px-3 py-2 text-right">
                        <input
                          type="number"
                          step="0.001"
                          min="0"
                          value={quantities[item.id] ?? ''}
                          onChange={e => setQuantities(prev => ({ ...prev, [item.id]: e.target.value }))}
                          className="w-20 px-2 py-1 rounded border border-[var(--border)] bg-[var(--bg)] text-[var(--text1)] text-xs text-right"
                        />
                      </td>
                      <td className={`px-3 py-2 text-right text-xs font-semibold ${
                        ecart < 0 ? 'text-red-400' : ecart > 0 ? 'text-amber-400' : 'text-green-400'
                      }`}>
                        {ecart > 0 ? '+' : ''}{ecart !== 0 ? ecart.toFixed(2) : '✓'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {error && <p className="text-sm text-red-400 mb-3">{error}</p>}
          <div className="flex gap-2">
            <button type="button" onClick={onClose}
              className="flex-1 py-2 rounded-lg border border-[var(--border)] text-sm text-[var(--text3)]">Annuler</button>
            <button type="submit" disabled={loading}
              className="flex-2 px-6 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
              style={{ background: 'var(--blue)' }}>
              {loading ? 'Enregistrement...' : '✓ Confirmer réception'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Wire up ReceiveDeliveryModal in StocksPageClient**

In `src/app/dashboard/stocks/_components/stocks-page-client.tsx`:

a) Add import at top:
```tsx
import { ReceiveDeliveryModal } from './receive-delivery-modal'
```

b) Add state after existing state declarations:
```tsx
const [receivingOrder, setReceivingOrder] = useState<PurchaseOrder | null>(null)
```

c) Add "Réceptionner" button on orders with `status === 'sent'` in the orders list. Replace the order row's `<div className="flex items-center gap-3">` block with:
```tsx
<div className="flex items-center gap-3">
  <span className="text-sm font-bold text-[var(--text1)]">{order.total_ht.toFixed(2)} €</span>
  <span className={`text-xs font-bold px-2 py-0.5 rounded ${
    order.status === 'received' ? 'bg-green-900/30 text-green-400' :
    order.status === 'sent' ? 'bg-blue-900/30 text-blue-400' :
    order.status === 'partial' ? 'bg-amber-900/30 text-amber-400' :
    'bg-[var(--surface2)] text-[var(--text4)]'
  }`}>
    {order.status === 'draft' ? 'Brouillon' : order.status === 'sent' ? 'Envoyé' : order.status === 'received' ? 'Reçu' : 'Partiel'}
  </span>
  {(order.status === 'sent' || order.status === 'partial') && (
    <button
      onClick={async () => {
        const res = await fetch(`/api/purchase-orders/${order.id}`)
        const detail = await res.json()
        setReceivingOrder(detail)
      }}
      className="text-xs px-2 py-1 rounded-lg font-semibold text-white"
      style={{ background: 'var(--blue)' }}
    >
      Réceptionner
    </button>
  )}
</div>
```

d) Add `<ReceiveDeliveryModal>` alongside the other modals at the bottom of the JSX (before the closing `</div>`):
```tsx
<ReceiveDeliveryModal
  open={receivingOrder !== null}
  order={receivingOrder}
  onClose={() => setReceivingOrder(null)}
  onSave={async () => { setReceivingOrder(null); await Promise.all([reloadItems(), reloadOrders()]) }}
/>
```

- [ ] **Step 3: Compile check**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/dashboard/stocks/_components/receive-delivery-modal.tsx \
        src/app/dashboard/stocks/_components/stocks-page-client.tsx
git commit -m "feat(stocks): add ReceiveDeliveryModal with écart detection"
```

---

## Task 11: End-to-End Smoke Test

- [ ] **Step 1: Start dev server**

```bash
npm run dev
```

- [ ] **Step 2: Manual verification checklist**

Visit `http://localhost:3000/dashboard/stocks` and verify:
- [ ] Sidebar shows "Stocks" as an active link (not disabled)
- [ ] KPI cards show correct counts
- [ ] Stock table displays items with level bars and status badges
- [ ] "+ Nouvel article" opens form, saves, table refreshes
- [ ] "Modifier" on a row pre-fills form, saves changes
- [ ] "📥 Commander" opens purchase order form, pre-fills alert items
- [ ] Creating a purchase order appears in the Commandes tab with correct ref (BC-YYYY-XXXX)
- [ ] "Réceptionner" button appears on orders with status `sent` or `partial`
- [ ] Clicking "Réceptionner" opens the modal with pre-filled ordered quantities
- [ ] Écart column shows red/amber/green based on difference
- [ ] Confirming reception increments stock quantities and updates order status

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "feat(stocks): complete Stocks & Approvisionnements module — Sprint 4"
```
