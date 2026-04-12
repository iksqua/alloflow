# Purchase Orders Refonte — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the broken Commandes fournisseurs feature with a fully functional purchase order system: dedicated page, multi-step creation form with category tabs, slide-in detail panel, multiple partial receptions, auto-calculated status, edit/cancel.

**Architecture:** New route `/dashboard/stocks/commandes` with a server component for initial fetch and a client shell managing state. Six new UI components. Three API route changes/additions. One DB migration.

**Tech Stack:** Next.js 15 App Router, Supabase, TypeScript, Zod, Tailwind + CSS vars (`var(--bg/surface/border/text1-4/blue/green/red)`), `sonner` for toasts.

---

## File Map

**New files:**
- `supabase/migrations/20260412000001_purchase_order_receptions.sql`
- `src/app/dashboard/stocks/commandes/page.tsx`
- `src/app/dashboard/stocks/commandes/_components/types.ts`
- `src/app/dashboard/stocks/commandes/_components/purchase-orders-page-client.tsx`
- `src/app/dashboard/stocks/commandes/_components/purchase-orders-list.tsx`
- `src/app/dashboard/stocks/commandes/_components/purchase-order-detail-panel.tsx`
- `src/app/dashboard/stocks/commandes/_components/purchase-order-form/index.tsx`
- `src/app/dashboard/stocks/commandes/_components/purchase-order-form/step-items.tsx`
- `src/app/dashboard/stocks/commandes/_components/purchase-order-form/step-info.tsx`
- `src/app/dashboard/stocks/commandes/_components/receive-modal.tsx`
- `src/app/dashboard/stocks/commandes/_components/edit-modal.tsx`
- `src/app/dashboard/stocks/commandes/_components/cancel-modal.tsx`
- `src/app/api/purchase-orders/[id]/cancel/route.ts`
- `src/app/api/purchase-orders/[id]/route.test.ts`
- `src/app/api/purchase-orders/[id]/receive/route.test.ts`

**Modified files:**
- `src/app/api/purchase-orders/route.ts` — update GET to include `receptions` in the response
- `src/app/api/purchase-orders/[id]/route.ts` — extend PATCH for full edit
- `src/app/api/purchase-orders/[id]/receive/route.ts` — increment qty, record reception, recalc status from DB
- `src/lib/validations/stock.ts` — new Zod schemas
- `src/app/dashboard/stocks/_components/stocks-page-client.tsx` — remove orders tab, add link to /commandes
- `src/app/dashboard/stocks/page.tsx` — remove orders fetch

---

## Task 1: DB Migration

**Files:**
- Create: `supabase/migrations/20260412000001_purchase_order_receptions.sql`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/20260412000001_purchase_order_receptions.sql

-- Rename statuses: 'draft' and 'sent' → 'pending', keep 'partial'/'received', add 'cancelled'
update public.purchase_orders set status = 'pending' where status in ('draft', 'sent');

-- Create reception history table
create table public.purchase_order_receptions (
  id                uuid primary key default gen_random_uuid(),
  purchase_order_id uuid not null references public.purchase_orders(id) on delete cascade,
  received_at       timestamptz not null default now(),
  notes             text,
  lines             jsonb not null default '[]'
  -- lines = [{ purchase_order_item_id, quantity_received }]
);

alter table public.purchase_order_receptions enable row level security;

create policy "establishment members can manage purchase_order_receptions"
  on public.purchase_order_receptions for all
  using (
    purchase_order_id in (
      select id from public.purchase_orders
      where establishment_id in (
        select establishment_id from public.profiles where id = auth.uid()
      )
    )
  );
```

- [ ] **Step 2: Apply migration via Supabase CLI**

```bash
npx supabase db push
```

Expected: migration applied without errors.

- [ ] **Step 3: Verify the table exists**

```bash
npx supabase db diff
```

Expected: no pending changes (migration is in sync).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260412000001_purchase_order_receptions.sql
git commit -m "feat: add purchase_order_receptions table and rename statuses to pending/cancelled"
```

---

## Task 2: Types and Validation Schemas

**Files:**
- Create: `src/app/dashboard/stocks/commandes/_components/types.ts`
- Modify: `src/lib/validations/stock.ts`

- [ ] **Step 1: Create the new types file**

```typescript
// src/app/dashboard/stocks/commandes/_components/types.ts

export type PurchaseOrderStatus = 'pending' | 'partial' | 'received' | 'cancelled'

export interface PurchaseOrderItem {
  id: string
  purchase_order_id: string
  stock_item_id: string
  quantity_ordered: number
  unit_price: number
  quantity_received: number | null  // null = never received, treat as 0
  sort_order: number
  stock_item?: { id: string; name: string; unit: string }
}

export interface PurchaseOrderReceptionLine {
  purchase_order_item_id: string
  quantity_received: number
}

export interface PurchaseOrderReception {
  id: string
  purchase_order_id: string
  received_at: string
  notes: string | null
  lines: PurchaseOrderReceptionLine[]
}

export interface PurchaseOrder {
  id: string
  establishment_id: string
  order_ref: string
  supplier: string
  supplier_email: string | null
  requested_delivery_date: string | null
  status: PurchaseOrderStatus
  total_ht: number
  notes: string | null
  created_at: string
  created_by: string | null
  items?: PurchaseOrderItem[]
  receptions?: PurchaseOrderReception[]
}

/** Computed per-item remaining quantity (quantity_received may be null → treat as 0) */
export function remaining(item: PurchaseOrderItem): number {
  return item.quantity_ordered - (item.quantity_received ?? 0)
}

/** Human-readable status label */
export function statusLabel(status: PurchaseOrderStatus): string {
  const labels: Record<PurchaseOrderStatus, string> = {
    pending: 'En cours', partial: 'Partielle', received: 'Reçue', cancelled: 'Annulée',
  }
  return labels[status]
}

/** CSS classes for status badge */
export function statusBadgeClass(status: PurchaseOrderStatus): string {
  const classes: Record<PurchaseOrderStatus, string> = {
    pending:   'bg-blue-900/30 text-blue-400',
    partial:   'bg-amber-900/30 text-amber-400',
    received:  'bg-green-900/30 text-green-400',
    cancelled: 'bg-[var(--surface2)] text-[var(--text4)]',
  }
  return classes[status]
}

/** True if the order's delivery date is overdue */
export function isLate(order: PurchaseOrder): boolean {
  if (!order.requested_delivery_date) return false
  if (order.status !== 'pending' && order.status !== 'partial') return false
  return new Date(order.requested_delivery_date) < new Date(new Date().toDateString())
}
```

- [ ] **Step 2: Add new Zod schemas to validations/stock.ts**

Add at the end of `src/lib/validations/stock.ts` (after existing exports):

```typescript
export const patchPurchaseOrderSchema = z.object({
  supplier:                z.string().min(1).max(100).optional(),
  requested_delivery_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  notes:                   z.string().max(500).nullable().optional(),
  // Lines to upsert (only those with quantity_received == 0 or new lines)
  upsert_items: z.array(z.object({
    id:               uuidStr.optional(),  // omit for new lines
    stock_item_id:    uuidStr,
    quantity_ordered: z.number().min(0.001),
    unit_price:       z.number().min(0),
  })).optional(),
  // IDs of lines to delete (only allowed if quantity_received is null/0)
  delete_item_ids: z.array(uuidStr).optional(),
})

export const receiveOrderSchema = z.object({
  notes: z.string().max(500).nullable().optional(),
  items: z.array(z.object({
    purchase_order_item_id: uuidStr,
    quantity_received:      z.number().min(0),
  })).min(1),
})

export type PatchPurchaseOrderInput = z.infer<typeof patchPurchaseOrderSchema>
export type ReceiveOrderInput       = z.infer<typeof receiveOrderSchema>
```

- [ ] **Step 3: Commit**

```bash
git add src/app/dashboard/stocks/commandes/_components/types.ts src/lib/validations/stock.ts
git commit -m "feat: add purchase order types and new validation schemas"
```

---

## Task 3: API — Extend PATCH /[id] for Full Edit

**Files:**
- Modify: `src/app/api/purchase-orders/[id]/route.ts`
- Create: `src/app/api/purchase-orders/[id]/route.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// src/app/api/purchase-orders/[id]/route.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('next/headers', () => ({ cookies: vi.fn(() => ({ getAll: () => [], set: vi.fn() })) }))

import { PATCH } from './route'
import { createClient } from '@/lib/supabase/server'

function makeSupabase(overrides = {}) {
  const chain = {
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: { id: 'ord-1', status: 'pending' }, error: null }),
    ...overrides,
  }
  return chain
}

describe('PATCH /api/purchase-orders/[id]', () => {
  beforeEach(() => vi.clearAllMocks())

  it('updates supplier and notes', async () => {
    const supabase = makeSupabase()
    vi.mocked(createClient).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } } }) },
      ...supabase,
    } as never)

    const req = new NextRequest('http://localhost/api/purchase-orders/ord-1', {
      method: 'PATCH',
      body: JSON.stringify({ supplier: 'Nouveau Fournisseur', notes: 'test' }),
    })
    const res = await PATCH(req, { params: Promise.resolve({ id: 'ord-1' }) })
    expect(res.status).not.toBe(400)
  })

  it('rejects update on received order', async () => {
    const supabase = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn()
        .mockResolvedValueOnce({ data: { establishment_id: 'est-1' }, error: null }) // profiles
        .mockResolvedValueOnce({ data: { id: 'ord-1', status: 'received' }, error: null }), // order
    }
    vi.mocked(createClient).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } } }) },
      ...supabase,
    } as never)

    const req = new NextRequest('http://localhost/api/purchase-orders/ord-1', {
      method: 'PATCH',
      body: JSON.stringify({ supplier: 'Test' }),
    })
    const res = await PATCH(req, { params: Promise.resolve({ id: 'ord-1' }) })
    expect(res.status).toBe(409)
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run src/app/api/purchase-orders/[id]/route.test.ts
```

Expected: FAIL (PATCH currently only accepts `status` field).

- [ ] **Step 3: Rewrite PATCH handler in route.ts**

Replace the entire file:

```typescript
// src/app/api/purchase-orders/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { patchPurchaseOrderSchema } from '@/lib/validations/stock'

async function getEstablishmentId(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data } = await supabase.from('profiles').select('establishment_id').eq('id', userId).single()
  return data?.establishment_id ?? null
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const establishmentId = await getEstablishmentId(supabase, user.id)
  if (!establishmentId) return NextResponse.json({ error: 'Establishment not found' }, { status: 400 })

  const { data, error } = await supabase
    .from('purchase_orders')
    .select(`
      *,
      items:purchase_order_items(*, stock_item:stock_items(id, name, unit)),
      receptions:purchase_order_receptions(id, received_at, notes, lines)
    `)
    .eq('id', id)
    .eq('establishment_id', establishmentId)
    .order('received_at', { foreignTable: 'purchase_order_receptions', ascending: true })
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 404 })
  return NextResponse.json(data)
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const establishmentId = await getEstablishmentId(supabase, user.id)
  if (!establishmentId) return NextResponse.json({ error: 'Establishment not found' }, { status: 400 })

  // Verify order belongs to this establishment and is editable
  const { data: order, error: orderError } = await supabase
    .from('purchase_orders')
    .select('id, status')
    .eq('id', id)
    .eq('establishment_id', establishmentId)
    .single()

  if (orderError || !order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })
  if (order.status === 'received' || order.status === 'cancelled') {
    return NextResponse.json({ error: 'Cannot edit a received or cancelled order' }, { status: 409 })
  }

  const body = await req.json()
  const result = patchPurchaseOrderSchema.safeParse(body)
  if (!result.success) return NextResponse.json({ error: result.error.flatten() }, { status: 400 })

  const { supplier, requested_delivery_date, notes, upsert_items, delete_item_ids } = result.data

  // Update order header fields
  const headerUpdate: Record<string, unknown> = {}
  if (supplier !== undefined)                headerUpdate.supplier = supplier
  if (requested_delivery_date !== undefined) headerUpdate.requested_delivery_date = requested_delivery_date
  if (notes !== undefined)                   headerUpdate.notes = notes

  if (Object.keys(headerUpdate).length > 0) {
    await supabase.from('purchase_orders').update(headerUpdate).eq('id', id)
  }

  // Delete lines (only those with quantity_received null or 0)
  if (delete_item_ids && delete_item_ids.length > 0) {
    const { data: safeToDelete } = await supabase
      .from('purchase_order_items')
      .select('id')
      .eq('purchase_order_id', id)
      .in('id', delete_item_ids)
      .or('quantity_received.is.null,quantity_received.eq.0')

    if (safeToDelete && safeToDelete.length > 0) {
      await supabase.from('purchase_order_items').delete().in('id', safeToDelete.map(r => r.id))
    }
  }

  // Upsert lines
  if (upsert_items && upsert_items.length > 0) {
    const toUpsert = upsert_items.map((item, idx) => ({
      ...(item.id ? { id: item.id } : {}),
      purchase_order_id: id,
      stock_item_id:     item.stock_item_id,
      quantity_ordered:  item.quantity_ordered,
      unit_price:        item.unit_price,
      sort_order:        idx,
    }))
    await supabase.from('purchase_order_items').upsert(toUpsert)
  }

  // Recalculate total_ht
  const { data: allItems } = await supabase
    .from('purchase_order_items')
    .select('quantity_ordered, unit_price')
    .eq('purchase_order_id', id)

  const totalHt = (allItems ?? []).reduce((s, i) => s + i.quantity_ordered * i.unit_price, 0)
  const { data: updated, error: finalError } = await supabase
    .from('purchase_orders')
    .update({ total_ht: totalHt })
    .eq('id', id)
    .select()
    .single()

  if (finalError) return NextResponse.json({ error: finalError.message }, { status: 500 })
  return NextResponse.json(updated)
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx vitest run src/app/api/purchase-orders/[id]/route.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/api/purchase-orders/[id]/route.ts src/app/api/purchase-orders/[id]/route.test.ts
git commit -m "feat: extend PATCH /purchase-orders/[id] for full edit (supplier, date, notes, items)"
```

---

## Task 3b: API — Update GET /api/purchase-orders to Include Receptions

The collection endpoint is used by `reload()` in the client shell and by the server-side initial fetch. It must include `receptions` so the detail panel works correctly after any data reload.

**Files:**
- Modify: `src/app/api/purchase-orders/route.ts`

- [ ] **Step 1: Update the GET query in route.ts**

Change the `GET` handler's select query from:

```typescript
.select('*, items:purchase_order_items(*, stock_item:stock_items(id, name, unit))')
```

to:

```typescript
.select(`
  *,
  items:purchase_order_items(*, stock_item:stock_items(id, name, unit)),
  receptions:purchase_order_receptions(id, received_at, notes, lines)
`)
```

The full updated GET handler:

```typescript
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const establishmentId = await getEstablishmentId(supabase, user.id)
  if (!establishmentId) return NextResponse.json({ error: 'Établissement non trouvé' }, { status: 400 })

  const { data, error } = await supabase
    .from('purchase_orders')
    .select(`
      *,
      items:purchase_order_items(*, stock_item:stock_items(id, name, unit)),
      receptions:purchase_order_receptions(id, received_at, notes, lines)
    `)
    .eq('establishment_id', establishmentId)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ orders: data ?? [] })
}
```

Note: limit increased from 20 to 50 as per spec.

- [ ] **Step 2: Commit**

```bash
git add src/app/api/purchase-orders/route.ts
git commit -m "feat: include receptions in GET /api/purchase-orders response, increase limit to 50"
```

---

## Task 4: API — Add PATCH /[id]/cancel

**Files:**
- Create: `src/app/api/purchase-orders/[id]/cancel/route.ts`

- [ ] **Step 1: Create the cancel route**

```typescript
// src/app/api/purchase-orders/[id]/cancel/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function PATCH(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('establishment_id').eq('id', user.id).single()
  if (!profile?.establishment_id) return NextResponse.json({ error: 'Establishment not found' }, { status: 400 })

  // Verify order is cancellable
  const { data: order, error: orderError } = await supabase
    .from('purchase_orders')
    .select('id, status')
    .eq('id', id)
    .eq('establishment_id', profile.establishment_id)
    .single()

  if (orderError || !order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })
  if (order.status === 'received') {
    return NextResponse.json({ error: 'Cannot cancel a received order' }, { status: 409 })
  }
  if (order.status === 'cancelled') {
    return NextResponse.json({ error: 'Order is already cancelled' }, { status: 409 })
  }

  const { data, error } = await supabase
    .from('purchase_orders')
    .update({ status: 'cancelled' })
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/purchase-orders/[id]/cancel/route.ts
git commit -m "feat: add PATCH /purchase-orders/[id]/cancel endpoint"
```

---

## Task 5: API — Fix POST /[id]/receive

The existing receive route has a bug: it **sets** `quantity_received` to the new value instead of **incrementing** it, and it doesn't record to `purchase_order_receptions`. Fix both.

**Files:**
- Modify: `src/app/api/purchase-orders/[id]/receive/route.ts`
- Create: `src/app/api/purchase-orders/[id]/receive/route.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// src/app/api/purchase-orders/[id]/receive/route.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('next/headers', () => ({ cookies: vi.fn(() => ({ getAll: () => [], set: vi.fn() })) }))

import { POST } from './route'
import { createClient } from '@/lib/supabase/server'

describe('POST /api/purchase-orders/[id]/receive', () => {
  beforeEach(() => vi.clearAllMocks())

  it('requires at least one item', async () => {
    vi.mocked(createClient).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } } }) },
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: { establishment_id: 'est-1' }, error: null }),
      }),
    } as never)

    const req = new NextRequest('http://localhost/', {
      method: 'POST',
      body: JSON.stringify({ items: [] }),
    })
    const res = await POST(req, { params: Promise.resolve({ id: 'ord-1' }) })
    expect(res.status).toBe(400)
  })

  it('rejects negative quantities', async () => {
    vi.mocked(createClient).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } } }) },
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: { establishment_id: 'est-1' }, error: null }),
      }),
    } as never)

    const req = new NextRequest('http://localhost/', {
      method: 'POST',
      body: JSON.stringify({ items: [{ purchase_order_item_id: 'item-1', quantity_received: -1 }] }),
    })
    const res = await POST(req, { params: Promise.resolve({ id: 'ord-1' }) })
    expect(res.status).toBe(400)
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run src/app/api/purchase-orders/[id]/receive/route.test.ts
```

Expected: FAIL (receiveDeliverySchema allows empty array).

- [ ] **Step 3: Rewrite the receive route**

```typescript
// src/app/api/purchase-orders/[id]/receive/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { receiveOrderSchema } from '@/lib/validations/stock'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('establishment_id').eq('id', user.id).single()
  if (!profile?.establishment_id) return NextResponse.json({ error: 'Establishment not found' }, { status: 400 })

  // Verify order belongs to this establishment and is receivable
  const { data: order, error: orderError } = await supabase
    .from('purchase_orders')
    .select('id, status')
    .eq('id', id)
    .eq('establishment_id', profile.establishment_id)
    .single()

  if (orderError || !order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })
  if (order.status === 'received' || order.status === 'cancelled') {
    return NextResponse.json({ error: 'Order cannot receive deliveries in its current status' }, { status: 409 })
  }

  const body = await req.json()
  const result = receiveOrderSchema.safeParse(body)
  if (!result.success) return NextResponse.json({ error: result.error.flatten() }, { status: 400 })

  const { notes, items } = result.data

  // Fetch all order items for this order
  const { data: orderItems, error: fetchError } = await supabase
    .from('purchase_order_items')
    .select('id, stock_item_id, quantity_ordered, quantity_received')
    .eq('purchase_order_id', id)

  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 })

  const receivedMap = new Map(items.map(i => [i.purchase_order_item_id, i.quantity_received]))

  // Increment each item's quantity_received and update stock
  const receptionLines: { purchase_order_item_id: string; quantity_received: number }[] = []

  for (const orderItem of orderItems ?? []) {
    const delta = receivedMap.get(orderItem.id)
    if (delta === undefined || delta <= 0) continue

    const currentReceived = orderItem.quantity_received ?? 0
    const newReceived = currentReceived + delta

    // Increment order item quantity_received
    await supabase
      .from('purchase_order_items')
      .update({ quantity_received: newReceived })
      .eq('id', orderItem.id)

    // Increment stock
    const { data: stock } = await supabase
      .from('stock_items')
      .select('quantity, alert_threshold')
      .eq('id', orderItem.stock_item_id)
      .single()

    if (stock) {
      const newQty = stock.quantity + delta
      const newStatus = newQty <= 0
        ? 'out_of_stock'
        : newQty < stock.alert_threshold
        ? 'alert'
        : 'ok'
      await supabase
        .from('stock_items')
        .update({ quantity: newQty, status: newStatus })
        .eq('id', orderItem.stock_item_id)
    }

    receptionLines.push({ purchase_order_item_id: orderItem.id, quantity_received: delta })
  }

  // Record reception
  await supabase.from('purchase_order_receptions').insert({
    purchase_order_id: id,
    notes: notes ?? null,
    lines: receptionLines,
  })

  // Recalculate status from DB state
  const { data: updatedItems } = await supabase
    .from('purchase_order_items')
    .select('quantity_ordered, quantity_received')
    .eq('purchase_order_id', id)

  const totalOrdered  = (updatedItems ?? []).reduce((s, i) => s + i.quantity_ordered, 0)
  const totalReceived = (updatedItems ?? []).reduce((s, i) => s + (i.quantity_received ?? 0), 0)

  const newStatus = totalReceived === 0
    ? 'pending'
    : totalReceived >= totalOrdered
    ? 'received'
    : 'partial'

  await supabase.from('purchase_orders').update({ status: newStatus }).eq('id', id)

  return NextResponse.json({ success: true, status: newStatus })
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run src/app/api/purchase-orders/[id]/receive/route.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/api/purchase-orders/[id]/receive/route.ts src/app/api/purchase-orders/[id]/receive/route.test.ts
git commit -m "fix: receive route now increments quantity, records reception history, recalcs status from DB"
```

---

## Task 6: New Page Shell `/dashboard/stocks/commandes`

**Files:**
- Create: `src/app/dashboard/stocks/commandes/page.tsx`
- Create: `src/app/dashboard/stocks/commandes/_components/purchase-orders-page-client.tsx`

- [ ] **Step 1: Create the server component (page.tsx)**

```typescript
// src/app/dashboard/stocks/commandes/page.tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { PurchaseOrdersPageClient } from './_components/purchase-orders-page-client'
import type { PurchaseOrder } from './_components/types'
import type { StockItem } from '../_components/types'

export default async function CommandesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('establishment_id')
    .eq('id', user.id)
    .single()

  if (!profile?.establishment_id) redirect('/onboarding')
  const estId = profile.establishment_id

  const [ordersRes, stockRes, categoriesRes] = await Promise.all([
    supabase
      .from('purchase_orders')
      .select(`
        *,
        items:purchase_order_items(*, stock_item:stock_items(id, name, unit)),
        receptions:purchase_order_receptions(id, received_at, notes, lines)
      `)
      .eq('establishment_id', estId)
      .order('created_at', { ascending: false })
      .limit(50),
    supabase
      .from('stock_items')
      .select('*')
      .eq('establishment_id', estId)
      .eq('active', true)
      .order('name'),
    supabase
      .from('categories')
      .select('id, name, color_hex')
      .eq('establishment_id', estId)
      .order('sort_order'),
  ])

  const stockItems: StockItem[] = (stockRes.data ?? []).map(i => ({
    ...i,
    status: i.quantity <= 0 ? 'out_of_stock' : i.quantity < i.alert_threshold ? 'alert' : 'ok',
    purchase_price:  (i as Record<string, number>).purchase_price  ?? 0,
    purchase_qty:    (i as Record<string, number>).purchase_qty    ?? 0,
    is_pos:          Boolean((i as Record<string, unknown>).is_pos),
    pos_price:       (i as Record<string, number | null>).pos_price ?? null,
    pos_tva_rate:    (i as Record<string, number>).pos_tva_rate    ?? 10,
    pos_category_id: (i as Record<string, string | null>).pos_category_id ?? null,
    product_id:      (i as Record<string, string | null>).product_id      ?? null,
  }))

  return (
    <PurchaseOrdersPageClient
      initialOrders={(ordersRes.data ?? []) as PurchaseOrder[]}
      stockItems={stockItems}
      categories={(categoriesRes.data ?? []) as { id: string; name: string; color_hex: string }[]}
      totalCount={ordersRes.data?.length ?? 0}
    />
  )
}
```

- [ ] **Step 2: Create the client shell**

```typescript
// src/app/dashboard/stocks/commandes/_components/purchase-orders-page-client.tsx
'use client'
import { useState } from 'react'
import { toast } from 'sonner'
import type { PurchaseOrder, PurchaseOrderStatus } from './types'
import type { StockItem } from '../../_components/types'
import { PurchaseOrdersList } from './purchase-orders-list'
import { PurchaseOrderDetailPanel } from './purchase-order-detail-panel'
import { PurchaseOrderForm } from './purchase-order-form'
import { ReceiveModal } from './receive-modal'
import { EditModal } from './edit-modal'
import { CancelModal } from './cancel-modal'

interface Category { id: string; name: string; color_hex: string }

interface Props {
  initialOrders: PurchaseOrder[]
  stockItems: StockItem[]
  categories: Category[]
  totalCount: number
}

export type ModalState =
  | { type: 'none' }
  | { type: 'create' }
  | { type: 'receive'; order: PurchaseOrder }
  | { type: 'edit';    order: PurchaseOrder }
  | { type: 'cancel';  order: PurchaseOrder }

export function PurchaseOrdersPageClient({ initialOrders, stockItems, categories, totalCount }: Props) {
  const [orders, setOrders] = useState(initialOrders)
  const [statusFilter, setStatusFilter] = useState<PurchaseOrderStatus | 'all'>('all')
  const [selectedOrder, setSelectedOrder] = useState<PurchaseOrder | null>(null)
  const [modal, setModal] = useState<ModalState>({ type: 'none' })

  // Counts for tab badges
  const counts = {
    all:       orders.length,
    pending:   orders.filter(o => o.status === 'pending').length,
    partial:   orders.filter(o => o.status === 'partial').length,
    received:  orders.filter(o => o.status === 'received').length,
    cancelled: orders.filter(o => o.status === 'cancelled').length,
  }

  // KPI: total engagé = pending + partial
  const totalEngaged = orders
    .filter(o => o.status === 'pending' || o.status === 'partial')
    .reduce((s, o) => s + o.total_ht, 0)

  const filtered = statusFilter === 'all' ? orders : orders.filter(o => o.status === statusFilter)

  async function reload() {
    const res = await fetch('/api/purchase-orders')
    if (!res.ok) { toast.error('Erreur de chargement'); return }
    const json = await res.json()
    setOrders(json.orders ?? [])
    // Refresh selected order if open
    if (selectedOrder) {
      const updated = (json.orders ?? []).find((o: PurchaseOrder) => o.id === selectedOrder.id)
      setSelectedOrder(updated ?? null)
    }
  }

  return (
    <div className="max-w-6xl mx-auto p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-[var(--text1)]">Commandes fournisseurs</h1>
          <p className="text-sm text-[var(--text3)] mt-0.5">
            Montant engagé : <span className="font-semibold text-[var(--text1)]">{totalEngaged.toFixed(2)} €</span>
          </p>
        </div>
        <button
          onClick={() => setModal({ type: 'create' })}
          className="px-3 py-1.5 rounded-lg text-sm font-semibold text-white"
          style={{ background: 'var(--blue)' }}
        >
          📥 Nouvelle commande
        </button>
      </div>

      {/* Status tabs */}
      <div className="flex gap-1 mb-4 border-b border-[var(--border)]">
        {([
          ['all', 'Toutes', counts.all],
          ['pending', 'En cours', counts.pending],
          ['partial', 'Partielles', counts.partial],
          ['received', 'Reçues', counts.received],
          ['cancelled', 'Annulées', counts.cancelled],
        ] as const).map(([key, label, count]) => (
          <button
            key={key}
            onClick={() => setStatusFilter(key)}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg border-b-2 transition-colors ${
              statusFilter === key
                ? 'border-[var(--blue)] text-white'
                : 'border-transparent text-[var(--text3)] hover:text-[var(--text2)]'
            }`}
          >
            {label}{count > 0 ? ` (${count})` : ''}
          </button>
        ))}
      </div>

      {/* List */}
      <PurchaseOrdersList
        orders={filtered}
        onSelectOrder={setSelectedOrder}
        onReceive={order => setModal({ type: 'receive', order })}
        onEdit={order => setModal({ type: 'edit', order })}
        onCancel={order => setModal({ type: 'cancel', order })}
      />

      {/* Detail panel */}
      {selectedOrder && (
        <PurchaseOrderDetailPanel
          order={selectedOrder}
          onClose={() => setSelectedOrder(null)}
          onReceive={() => setModal({ type: 'receive', order: selectedOrder })}
          onEdit={() => setModal({ type: 'edit', order: selectedOrder })}
          onCancel={() => setModal({ type: 'cancel', order: selectedOrder })}
        />
      )}

      {/* Modals */}
      {modal.type === 'create' && (
        <PurchaseOrderForm
          stockItems={stockItems}
          categories={categories}
          onClose={() => setModal({ type: 'none' })}
          onSave={async () => { setModal({ type: 'none' }); await reload() }}
        />
      )}
      {modal.type === 'receive' && (
        <ReceiveModal
          order={modal.order}
          onClose={() => setModal({ type: 'none' })}
          onSave={async () => { setModal({ type: 'none' }); await reload() }}
        />
      )}
      {modal.type === 'edit' && (
        <EditModal
          order={modal.order}
          stockItems={stockItems}
          onClose={() => setModal({ type: 'none' })}
          onSave={async () => { setModal({ type: 'none' }); await reload() }}
        />
      )}
      {modal.type === 'cancel' && (
        <CancelModal
          order={modal.order}
          onClose={() => setModal({ type: 'none' })}
          onConfirm={async () => { setModal({ type: 'none' }); await reload() }}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 3: Verify it compiles**

```bash
npx tsc --noEmit
```

Expected: No errors in the new files.

- [ ] **Step 4: Commit**

```bash
git add src/app/dashboard/stocks/commandes/
git commit -m "feat: add /dashboard/stocks/commandes page shell with server component and client state"
```

---

## Task 7: Purchase Orders List Component

**Files:**
- Create: `src/app/dashboard/stocks/commandes/_components/purchase-orders-list.tsx`

- [ ] **Step 1: Create the list component**

```typescript
// src/app/dashboard/stocks/commandes/_components/purchase-orders-list.tsx
import type { PurchaseOrder } from './types'
import { statusLabel, statusBadgeClass, isLate } from './types'

interface Props {
  orders: PurchaseOrder[]
  onSelectOrder: (order: PurchaseOrder) => void
  onReceive: (order: PurchaseOrder) => void
  onEdit: (order: PurchaseOrder) => void
  onCancel: (order: PurchaseOrder) => void
}

export function PurchaseOrdersList({ orders, onSelectOrder, onReceive, onEdit, onCancel }: Props) {
  if (orders.length === 0) {
    return (
      <div className="text-center py-16 text-[var(--text4)]">
        <div className="text-4xl mb-3">📥</div>
        <div className="font-semibold text-[var(--text2)]">Aucune commande</div>
        <div className="text-sm mt-1">Créez votre premier bon de commande</div>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-[var(--border)] overflow-hidden" style={{ background: 'var(--surface)' }}>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--border)]" style={{ background: 'var(--surface2)' }}>
            <th className="text-left px-4 py-2.5 text-xs font-semibold text-[var(--text3)] uppercase tracking-wide">Réf</th>
            <th className="text-left px-4 py-2.5 text-xs font-semibold text-[var(--text3)] uppercase tracking-wide">Fournisseur</th>
            <th className="text-right px-4 py-2.5 text-xs font-semibold text-[var(--text3)] uppercase tracking-wide hidden sm:table-cell">Articles</th>
            <th className="text-right px-4 py-2.5 text-xs font-semibold text-[var(--text3)] uppercase tracking-wide">Montant HT</th>
            <th className="text-left px-4 py-2.5 text-xs font-semibold text-[var(--text3)] uppercase tracking-wide hidden md:table-cell">Livraison</th>
            <th className="text-left px-4 py-2.5 text-xs font-semibold text-[var(--text3)] uppercase tracking-wide">Statut</th>
            <th className="px-4 py-2.5"></th>
          </tr>
        </thead>
        <tbody>
          {orders.map(order => (
            <tr
              key={order.id}
              onClick={() => onSelectOrder(order)}
              className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--surface2)] cursor-pointer transition-colors"
            >
              <td className="px-4 py-3 font-mono text-[var(--text2)] font-medium text-xs">{order.order_ref}</td>
              <td className="px-4 py-3 text-[var(--text1)] font-medium">{order.supplier}</td>
              <td className="px-4 py-3 text-right text-[var(--text3)] hidden sm:table-cell">{order.items?.length ?? '—'}</td>
              <td className="px-4 py-3 text-right font-semibold text-[var(--text1)]">{order.total_ht.toFixed(2)} €</td>
              <td className="px-4 py-3 hidden md:table-cell">
                {order.requested_delivery_date ? (
                  <span className="flex items-center gap-1.5">
                    <span className="text-[var(--text3)]">
                      {new Date(order.requested_delivery_date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}
                    </span>
                    {isLate(order) && (
                      <span className="text-xs font-semibold text-red-400 bg-red-900/20 px-1.5 py-0.5 rounded">En retard</span>
                    )}
                  </span>
                ) : (
                  <span className="text-[var(--text4)]">—</span>
                )}
              </td>
              <td className="px-4 py-3">
                <span className={`text-xs font-bold px-2 py-0.5 rounded ${statusBadgeClass(order.status)}`}>
                  {statusLabel(order.status)}
                </span>
              </td>
              <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                <div className="flex items-center gap-2 justify-end">
                  {(order.status === 'pending' || order.status === 'partial') && (
                    <button
                      onClick={() => onReceive(order)}
                      className="text-xs px-2 py-1 rounded-lg font-semibold text-white"
                      style={{ background: 'var(--blue)' }}
                    >
                      Réceptionner
                    </button>
                  )}
                  {order.status !== 'received' && order.status !== 'cancelled' && (
                    <div className="relative group">
                      <button className="text-[var(--text3)] hover:text-[var(--text1)] px-1 py-0.5 rounded hover:bg-[var(--surface2)] text-lg leading-none">
                        •••
                      </button>
                      <div className="absolute right-0 top-full mt-1 w-32 rounded-lg shadow-lg border border-[var(--border)] z-10 hidden group-hover:block"
                           style={{ background: 'var(--surface)' }}>
                        <button
                          onClick={() => onEdit(order)}
                          className="w-full text-left px-3 py-2 text-sm text-[var(--text2)] hover:bg-[var(--surface2)] rounded-t-lg"
                        >
                          Modifier
                        </button>
                        <button
                          onClick={() => onCancel(order)}
                          className="w-full text-left px-3 py-2 text-sm text-red-400 hover:bg-red-900/10 rounded-b-lg"
                        >
                          Annuler
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/dashboard/stocks/commandes/_components/purchase-orders-list.tsx
git commit -m "feat: add purchase orders list table with status tabs and actions"
```

---

## Task 8: Creation Form (2 steps)

**Files:**
- Create: `src/app/dashboard/stocks/commandes/_components/purchase-order-form/index.tsx`
- Create: `src/app/dashboard/stocks/commandes/_components/purchase-order-form/step-items.tsx`
- Create: `src/app/dashboard/stocks/commandes/_components/purchase-order-form/step-info.tsx`

- [ ] **Step 1: Create step-items.tsx**

```typescript
// src/app/dashboard/stocks/commandes/_components/purchase-order-form/step-items.tsx
'use client'
import { useState, useMemo } from 'react'
import type { StockItem } from '../../../_components/types'

export interface OrderLine {
  stockItemId: string
  stockItem: StockItem
  quantityOrdered: number
  unitPrice: number
}

interface Category { id: string; name: string; color_hex: string }

interface Props {
  stockItems: StockItem[]
  categories: Category[]
  initialLines: OrderLine[]
  onNext: (lines: OrderLine[]) => void
}

export function StepItems({ stockItems, categories, initialLines, onNext }: Props) {
  // Build selection map: stockItemId → OrderLine
  const [selection, setSelection] = useState<Map<string, OrderLine>>(() => {
    const m = new Map<string, OrderLine>()
    initialLines.forEach(l => m.set(l.stockItemId, l))
    return m
  })
  const [activeTab, setActiveTab] = useState<string>('alerts')
  const [search, setSearch] = useState('')

  const alertItems = useMemo(() => stockItems.filter(i => i.status === 'alert' || i.status === 'out_of_stock'), [stockItems])
  const tabs = useMemo(() => [
    { key: 'alerts', label: `⚠ Alertes (${alertItems.length})`, items: alertItems },
    ...categories.map(c => ({
      key: c.id,
      label: c.name,
      items: stockItems.filter(i => i.category === c.name || (i as unknown as { pos_category_id?: string }).pos_category_id === c.id),
    })),
    { key: 'all', label: 'Tous', items: stockItems },
  ], [stockItems, categories, alertItems])

  const currentItems = useMemo(() => {
    const tab = tabs.find(t => t.key === activeTab)
    const items = tab?.items ?? []
    if (activeTab === 'all' && search) {
      return items.filter(i => i.name.toLowerCase().includes(search.toLowerCase()))
    }
    return items
  }, [tabs, activeTab, search])

  function toggleItem(item: StockItem) {
    setSelection(prev => {
      const next = new Map(prev)
      if (next.has(item.id)) {
        next.delete(item.id)
      } else {
        next.set(item.id, {
          stockItemId: item.id,
          stockItem: item,
          quantityOrdered: item.order_quantity || 1,
          unitPrice: item.unit_price,
        })
      }
      return next
    })
  }

  function updateQty(itemId: string, qty: number) {
    setSelection(prev => {
      const next = new Map(prev)
      const line = next.get(itemId)
      if (line) next.set(itemId, { ...line, quantityOrdered: qty })
      return next
    })
  }

  const selectedLines = Array.from(selection.values())
  const totalEstimated = selectedLines.reduce((s, l) => s + l.quantityOrdered * l.unitPrice, 0)

  function stockColor(status: string): string {
    if (status === 'out_of_stock') return 'text-red-400'
    if (status === 'alert') return 'text-amber-400'
    return 'text-green-400'
  }

  function stockLabel(item: StockItem): string {
    if (item.status === 'out_of_stock') return `✕ Rupture`
    if (item.status === 'alert') return `⚠ ${item.quantity} ${item.unit}`
    return `${item.quantity} ${item.unit}`
  }

  return (
    <div className="flex flex-col h-full">
      {/* Category tabs */}
      <div className="flex gap-0 border-b border-[var(--border)] overflow-x-auto flex-shrink-0">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-3 py-2 text-xs font-medium whitespace-nowrap border-b-2 transition-colors ${
              activeTab === tab.key
                ? 'border-[var(--blue)] text-white'
                : 'border-transparent text-[var(--text3)] hover:text-[var(--text2)]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Search (only on "Tous" tab) */}
      {activeTab === 'all' && (
        <div className="p-3 flex-shrink-0">
          <input
            type="text"
            placeholder="Rechercher un article…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full rounded-lg px-3 py-2 text-sm bg-[var(--surface2)] border border-[var(--border)] text-[var(--text1)] placeholder:text-[var(--text4)] outline-none focus:border-[var(--blue)]"
          />
        </div>
      )}

      {/* Items grid */}
      <div className="flex-1 overflow-y-auto p-3">
        {currentItems.length === 0 && (
          <div className="text-center py-8 text-[var(--text4)] text-sm">Aucun article dans cette catégorie</div>
        )}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {currentItems.map(item => {
            const checked = selection.has(item.id)
            const line = selection.get(item.id)
            const borderColor = item.status === 'out_of_stock' ? 'border-red-800/50' : item.status === 'alert' ? 'border-amber-800/50' : 'border-[var(--border)]'
            const bgColor = item.status === 'out_of_stock' ? 'bg-red-900/10' : item.status === 'alert' ? 'bg-amber-900/10' : ''
            return (
              <div
                key={item.id}
                className={`rounded-lg p-2 border ${borderColor} ${bgColor} cursor-pointer transition-colors hover:border-[var(--blue)]`}
                onClick={() => toggleItem(item)}
              >
                <div className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    checked={checked}
                    readOnly
                    className="mt-0.5 flex-shrink-0"
                    style={{ accentColor: 'var(--blue)' }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold text-[var(--text1)] truncate">{item.name}</div>
                    <div className={`text-xs ${stockColor(item.status)}`}>{stockLabel(item)}</div>
                  </div>
                  {checked && (
                    <input
                      type="number"
                      value={line?.quantityOrdered ?? 1}
                      min={0.001}
                      step={0.1}
                      onClick={e => e.stopPropagation()}
                      onChange={e => updateQty(item.id, parseFloat(e.target.value) || 0)}
                      className="w-12 text-xs text-center bg-[var(--surface2)] border border-[var(--border)] rounded px-1 py-0.5 text-[var(--text1)]"
                    />
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Footer bar */}
      <div className="flex-shrink-0 border-t border-[var(--border)] px-4 py-3 flex items-center justify-between"
           style={{ background: 'var(--surface2)' }}>
        <span className="text-sm text-[var(--text3)]">
          {selectedLines.length} article{selectedLines.length !== 1 ? 's' : ''} sélectionné{selectedLines.length !== 1 ? 's' : ''}
          {' · '}
          Total estimé <span className="font-semibold text-[var(--text1)]">{totalEstimated.toFixed(2)} €</span>
        </span>
        <button
          onClick={() => onNext(selectedLines)}
          disabled={selectedLines.length === 0}
          className="px-4 py-1.5 rounded-lg text-sm font-semibold text-white disabled:opacity-40"
          style={{ background: 'var(--blue)' }}
        >
          Suivant →
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create step-info.tsx**

```typescript
// src/app/dashboard/stocks/commandes/_components/purchase-order-form/step-info.tsx
'use client'
import { useEffect, useState } from 'react'
import type { OrderLine } from './step-items'

interface Props {
  lines: OrderLine[]
  onBack: () => void
  onSubmit: (data: { supplier: string; deliveryDate: string; notes: string }) => Promise<void>
  loading: boolean
}

export function StepInfo({ lines, onBack, onSubmit, loading }: Props) {
  const [supplier, setSupplier] = useState('')
  const [deliveryDate, setDeliveryDate] = useState('')
  const [notes, setNotes] = useState('')
  const [supplierSuggestions, setSupplierSuggestions] = useState<string[]>([])

  useEffect(() => {
    fetch('/api/purchase-orders/suppliers')
      .then(r => r.json())
      .then(json => setSupplierSuggestions(json.suppliers ?? []))
      .catch(() => {})
  }, [])

  const totalHt = lines.reduce((s, l) => s + l.quantityOrdered * l.unitPrice, 0)

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="p-5 space-y-4">
        {/* Supplier */}
        <div>
          <label className="block text-xs font-semibold text-[var(--text3)] uppercase tracking-wide mb-1">
            Fournisseur <span className="text-red-400">*</span>
          </label>
          <input
            list="supplier-suggestions"
            type="text"
            value={supplier}
            onChange={e => setSupplier(e.target.value)}
            placeholder="Nom du fournisseur"
            className="w-full rounded-lg px-3 py-2 text-sm bg-[var(--surface2)] border border-[var(--border)] text-[var(--text1)] placeholder:text-[var(--text4)] outline-none focus:border-[var(--blue)]"
          />
          <datalist id="supplier-suggestions">
            {supplierSuggestions.map(s => <option key={s} value={s} />)}
          </datalist>
        </div>

        {/* Delivery date */}
        <div>
          <label className="block text-xs font-semibold text-[var(--text3)] uppercase tracking-wide mb-1">Date de livraison souhaitée</label>
          <input
            type="date"
            value={deliveryDate}
            onChange={e => setDeliveryDate(e.target.value)}
            className="w-full rounded-lg px-3 py-2 text-sm bg-[var(--surface2)] border border-[var(--border)] text-[var(--text1)] outline-none focus:border-[var(--blue)]"
          />
        </div>

        {/* Notes */}
        <div>
          <label className="block text-xs font-semibold text-[var(--text3)] uppercase tracking-wide mb-1">Notes</label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={2}
            placeholder="Instructions particulières, références…"
            className="w-full rounded-lg px-3 py-2 text-sm bg-[var(--surface2)] border border-[var(--border)] text-[var(--text1)] placeholder:text-[var(--text4)] outline-none focus:border-[var(--blue)] resize-none"
          />
        </div>

        {/* Summary */}
        <div>
          <div className="text-xs font-semibold text-[var(--text3)] uppercase tracking-wide mb-2">Récapitulatif</div>
          <div className="rounded-lg border border-[var(--border)] overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr style={{ background: 'var(--surface2)' }} className="border-b border-[var(--border)]">
                  <th className="text-left px-3 py-2 text-[var(--text3)]">Article</th>
                  <th className="text-right px-3 py-2 text-[var(--text3)]">Qté</th>
                  <th className="text-right px-3 py-2 text-[var(--text3)]">PU HT</th>
                  <th className="text-right px-3 py-2 text-[var(--text3)]">Total</th>
                </tr>
              </thead>
              <tbody>
                {lines.map(l => (
                  <tr key={l.stockItemId} className="border-b border-[var(--border)] last:border-0">
                    <td className="px-3 py-2 text-[var(--text1)]">{l.stockItem.name}</td>
                    <td className="px-3 py-2 text-right text-[var(--text2)]">{l.quantityOrdered} {l.stockItem.unit}</td>
                    <td className="px-3 py-2 text-right text-[var(--text2)]">{l.unitPrice.toFixed(2)} €</td>
                    <td className="px-3 py-2 text-right font-semibold text-[var(--text1)]">{(l.quantityOrdered * l.unitPrice).toFixed(2)} €</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: 'var(--surface2)' }}>
                  <td colSpan={3} className="px-3 py-2 text-right text-xs font-semibold text-[var(--text2)]">Total HT</td>
                  <td className="px-3 py-2 text-right font-bold text-[var(--text1)]">{totalHt.toFixed(2)} €</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="flex-shrink-0 border-t border-[var(--border)] px-5 py-3 flex gap-3 justify-between"
           style={{ background: 'var(--surface2)' }}>
        <button
          onClick={onBack}
          className="px-4 py-1.5 rounded-lg text-sm text-[var(--text2)] hover:bg-[var(--surface)] border border-[var(--border)]"
        >
          ← Retour
        </button>
        <button
          onClick={() => onSubmit({ supplier, deliveryDate, notes })}
          disabled={!supplier.trim() || loading}
          className="px-4 py-1.5 rounded-lg text-sm font-semibold text-white disabled:opacity-40"
          style={{ background: 'var(--blue)' }}
        >
          {loading ? 'Création…' : 'Créer le bon de commande'}
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Create index.tsx (modal orchestrator)**

```typescript
// src/app/dashboard/stocks/commandes/_components/purchase-order-form/index.tsx
'use client'
import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import type { StockItem } from '../../../_components/types'
import { StepItems, type OrderLine } from './step-items'
import { StepInfo } from './step-info'

interface Category { id: string; name: string; color_hex: string }

interface Props {
  stockItems: StockItem[]
  categories: Category[]
  onClose: () => void
  onSave: () => Promise<void>
}

export function PurchaseOrderForm({ stockItems, categories, onClose, onSave }: Props) {
  const [step, setStep] = useState<1 | 2>(1)
  const [lines, setLines] = useState<OrderLine[]>([])
  const [loading, setLoading] = useState(false)

  // Pre-select alert items on mount
  useEffect(() => {
    const alertLines: OrderLine[] = stockItems
      .filter(i => i.status === 'alert' || i.status === 'out_of_stock')
      .map(i => ({
        stockItemId: i.id,
        stockItem: i,
        quantityOrdered: i.order_quantity || 1,
        unitPrice: i.unit_price,
      }))
    setLines(alertLines)
  }, [])

  async function handleSubmit({ supplier, deliveryDate, notes }: { supplier: string; deliveryDate: string; notes: string }) {
    setLoading(true)
    try {
      const res = await fetch('/api/purchase-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplier,
          requested_delivery_date: deliveryDate || null,
          notes: notes || null,
          items: lines.map(l => ({
            stock_item_id:    l.stockItemId,
            quantity_ordered: l.quantityOrdered,
            unit_price:       l.unitPrice,
          })),
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        toast.error(err.error ?? 'Erreur lors de la création')
        return
      }
      toast.success('Bon de commande créé')
      await onSave()
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-stretch sm:items-center justify-center"
         style={{ background: 'rgba(0,0,0,0.6)' }}>
      <div className="w-full sm:w-[640px] sm:max-h-[85vh] flex flex-col rounded-none sm:rounded-2xl shadow-2xl overflow-hidden"
           style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        {/* Modal header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)] flex-shrink-0">
          <div>
            <h2 className="font-bold text-[var(--text1)]">Nouveau bon de commande</h2>
            <p className="text-xs text-[var(--text3)] mt-0.5">
              Étape {step}/2 — {step === 1 ? 'Sélection des articles' : 'Informations commande'}
            </p>
          </div>
          <button onClick={onClose} className="text-[var(--text3)] hover:text-[var(--text1)] text-xl leading-none">×</button>
        </div>

        {/* Step content */}
        <div className="flex-1 overflow-hidden flex flex-col min-h-0">
          {step === 1 && (
            <StepItems
              stockItems={stockItems}
              categories={categories}
              initialLines={lines}
              onNext={selectedLines => { setLines(selectedLines); setStep(2) }}
            />
          )}
          {step === 2 && (
            <StepInfo
              lines={lines}
              onBack={() => setStep(1)}
              onSubmit={handleSubmit}
              loading={loading}
            />
          )}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Add the suppliers autocomplete endpoint**

Create `src/app/api/purchase-orders/suppliers/route.ts`:

```typescript
// src/app/api/purchase-orders/suppliers/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('establishment_id').eq('id', user.id).single()
  if (!profile?.establishment_id) return NextResponse.json({ suppliers: [] })

  const { data } = await supabase
    .from('purchase_orders')
    .select('supplier')
    .eq('establishment_id', profile.establishment_id)
    .order('supplier')

  const suppliers = [...new Set((data ?? []).map(r => r.supplier).filter(Boolean))]
  return NextResponse.json({ suppliers })
}
```

- [ ] **Step 5: Verify TypeScript**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add src/app/dashboard/stocks/commandes/_components/purchase-order-form/ src/app/api/purchase-orders/suppliers/
git commit -m "feat: add 2-step purchase order creation form with category tabs and alert pre-selection"
```

---

## Task 9: Detail Panel (Slide-in)

**Files:**
- Create: `src/app/dashboard/stocks/commandes/_components/purchase-order-detail-panel.tsx`

- [ ] **Step 1: Create the detail panel**

```typescript
// src/app/dashboard/stocks/commandes/_components/purchase-order-detail-panel.tsx
import type { PurchaseOrder, PurchaseOrderStatus } from './types'
import { statusLabel, statusBadgeClass, isLate, remaining } from './types'

interface Props {
  order: PurchaseOrder
  onClose: () => void
  onReceive: () => void
  onEdit: () => void
  onCancel: () => void
}

export function PurchaseOrderDetailPanel({ order, onClose, onReceive, onEdit, onCancel }: Props) {
  const canReceive = order.status === 'pending' || order.status === 'partial'
  const canEdit    = order.status === 'pending' || order.status === 'partial'
  const canCancel  = order.status !== 'received' && order.status !== 'cancelled'

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40" onClick={onClose} />

      {/* Panel */}
      <aside
        className="fixed top-0 right-0 bottom-0 z-50 w-full sm:w-[420px] flex flex-col shadow-2xl"
        style={{ background: 'var(--surface)', borderLeft: '1px solid var(--border)' }}
      >
        {/* Panel header */}
        <div className="px-5 py-4 border-b border-[var(--border)] flex-shrink-0">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm font-bold text-[var(--text1)]">{order.order_ref}</span>
                <span className="text-[var(--text3)] text-sm">{order.supplier}</span>
              </div>
              <div className="text-xs text-[var(--text4)] mt-0.5">
                Créée le {new Date(order.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}
                {order.requested_delivery_date && (
                  <> · Livraison : {new Date(order.requested_delivery_date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long' })}</>
                )}
              </div>
            </div>
            <button onClick={onClose} className="text-[var(--text3)] hover:text-[var(--text1)] text-xl leading-none ml-4">×</button>
          </div>
          <div className="flex items-center gap-2 mt-2">
            <span className={`text-xs font-bold px-2 py-0.5 rounded ${statusBadgeClass(order.status)}`}>
              {statusLabel(order.status)}
            </span>
            {isLate(order) && (
              <span className="text-xs font-semibold text-red-400 bg-red-900/20 px-1.5 py-0.5 rounded">En retard</span>
            )}
          </div>
          {/* Actions */}
          {(canReceive || canEdit || canCancel) && (
            <div className="flex gap-2 mt-3">
              {canReceive && (
                <button
                  onClick={onReceive}
                  className="px-3 py-1.5 text-xs font-semibold text-white rounded-lg"
                  style={{ background: 'var(--blue)' }}
                >
                  Réceptionner
                </button>
              )}
              {canEdit && (
                <button
                  onClick={onEdit}
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-[var(--border)] text-[var(--text2)] hover:bg-[var(--surface2)]"
                >
                  Modifier
                </button>
              )}
              {canCancel && (
                <button
                  onClick={onCancel}
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg text-red-400 border border-red-900/30 hover:bg-red-900/10"
                >
                  Annuler
                </button>
              )}
            </div>
          )}
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Lines table */}
          <div>
            <div className="text-xs font-semibold text-[var(--text3)] uppercase tracking-wide mb-2">Articles</div>
            <div className="rounded-lg border border-[var(--border)] overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr style={{ background: 'var(--surface2)' }} className="border-b border-[var(--border)]">
                    <th className="text-left px-3 py-2 text-[var(--text3)]">Article</th>
                    <th className="text-right px-3 py-2 text-[var(--text3)]">Commandé</th>
                    <th className="text-right px-3 py-2 text-[var(--text3)]">Reçu</th>
                    <th className="text-right px-3 py-2 text-[var(--text3)]">Restant</th>
                  </tr>
                </thead>
                <tbody>
                  {(order.items ?? []).map(item => {
                    const rem = remaining(item)
                    return (
                      <tr key={item.id} className="border-b border-[var(--border)] last:border-0">
                        <td className="px-3 py-2 text-[var(--text1)]">{item.stock_item?.name ?? '—'}</td>
                        <td className="px-3 py-2 text-right text-[var(--text2)]">
                          {item.quantity_ordered} {item.stock_item?.unit}
                        </td>
                        <td className="px-3 py-2 text-right text-[var(--text2)]">
                          {(item.quantity_received ?? 0)} {item.stock_item?.unit}
                        </td>
                        <td className={`px-3 py-2 text-right font-semibold ${rem > 0 ? 'text-amber-400' : 'text-green-400'}`}>
                          {rem > 0 ? `${rem} ${item.stock_item?.unit}` : '✓'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div className="text-right text-xs text-[var(--text3)] mt-1 pr-1">
              Total HT : <span className="font-semibold text-[var(--text1)]">{order.total_ht.toFixed(2)} €</span>
            </div>
          </div>

          {/* Notes */}
          {order.notes && (
            <div>
              <div className="text-xs font-semibold text-[var(--text3)] uppercase tracking-wide mb-1">Notes</div>
              <p className="text-sm text-[var(--text2)] bg-[var(--surface2)] rounded-lg px-3 py-2 border border-[var(--border)]">{order.notes}</p>
            </div>
          )}

          {/* Reception history */}
          {(order.receptions ?? []).length > 0 && (
            <div>
              <div className="text-xs font-semibold text-[var(--text3)] uppercase tracking-wide mb-3">Historique des réceptions</div>
              <div className="space-y-0">
                {(order.receptions ?? []).map((reception, idx) => {
                  const isLast = idx === (order.receptions ?? []).length - 1
                  return (
                    <div key={reception.id} className="flex gap-3">
                      <div className="flex flex-col items-center flex-shrink-0">
                        <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white"
                             style={{ background: isLast && order.status === 'received' ? 'var(--green)' : '#f59e0b' }}>
                          ●
                        </div>
                        {!isLast && <div className="w-0.5 flex-1 bg-[var(--border)] my-1" />}
                      </div>
                      <div className="flex-1 pb-4">
                        <div className="text-xs font-semibold text-[var(--text1)] mb-1">
                          {new Date(reception.received_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}
                          {' — '}
                          {isLast && order.status === 'received' ? 'Réception complète' : 'Réception partielle'}
                        </div>
                        <div className="text-xs text-[var(--text3)]">
                          {(reception.lines as { purchase_order_item_id: string; quantity_received: number }[]).map(line => {
                            const item = (order.items ?? []).find(i => i.id === line.purchase_order_item_id)
                            if (!item) return null
                            return (
                              <span key={line.purchase_order_item_id} className="mr-3">
                                {item.stock_item?.name} : {line.quantity_received} {item.stock_item?.unit}
                              </span>
                            )
                          })}
                        </div>
                        {reception.notes && (
                          <div className="text-xs text-[var(--text4)] mt-0.5 italic">{reception.notes}</div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </aside>
    </>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/dashboard/stocks/commandes/_components/purchase-order-detail-panel.tsx
git commit -m "feat: add purchase order detail slide-in panel with lines table and reception history"
```

---

## Task 10: Receive Modal

**Files:**
- Create: `src/app/dashboard/stocks/commandes/_components/receive-modal.tsx`

- [ ] **Step 1: Create the receive modal**

```typescript
// src/app/dashboard/stocks/commandes/_components/receive-modal.tsx
'use client'
import { useState } from 'react'
import { toast } from 'sonner'
import type { PurchaseOrder } from './types'
import { remaining } from './types'

interface Props {
  order: PurchaseOrder
  onClose: () => void
  onSave: () => Promise<void>
}

export function ReceiveModal({ order, onClose, onSave }: Props) {
  const pendingItems = (order.items ?? []).filter(item => remaining(item) > 0)

  // Initialize each item with its remaining quantity (user can reduce for partial)
  const [quantities, setQuantities] = useState<Record<string, number>>(
    Object.fromEntries(pendingItems.map(item => [item.id, remaining(item)]))
  )
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)

  function updateQty(itemId: string, val: number) {
    setQuantities(prev => ({ ...prev, [itemId]: Math.max(0, val) }))
  }

  async function handleConfirm() {
    const itemsToSend = pendingItems
      .map(item => ({ purchase_order_item_id: item.id, quantity_received: quantities[item.id] ?? 0 }))
      .filter(i => i.quantity_received > 0)

    if (itemsToSend.length === 0) {
      toast.error('Saisissez au moins une quantité reçue')
      return
    }

    setLoading(true)
    try {
      const res = await fetch(`/api/purchase-orders/${order.id}/receive`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: notes || null, items: itemsToSend }),
      })
      if (!res.ok) {
        const err = await res.json()
        toast.error(err.error ?? 'Erreur lors de la réception')
        return
      }
      toast.success('Réception enregistrée')
      await onSave()
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)' }}>
      <div className="w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden"
           style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        {/* Header */}
        <div className="px-5 py-4 border-b border-[var(--border)] flex items-center justify-between">
          <div>
            <h2 className="font-bold text-[var(--text1)]">Réception</h2>
            <p className="text-xs text-[var(--text3)] mt-0.5">{order.order_ref} · {order.supplier}</p>
          </div>
          <button onClick={onClose} className="text-[var(--text3)] hover:text-[var(--text1)] text-xl">×</button>
        </div>

        {/* Table */}
        <div className="p-5">
          <table className="w-full text-xs mb-4">
            <thead>
              <tr className="border-b border-[var(--border)]">
                <th className="text-left pb-2 text-[var(--text3)]">Article</th>
                <th className="text-right pb-2 text-[var(--text3)]">Commandé</th>
                <th className="text-right pb-2 text-[var(--text3)]">Déjà reçu</th>
                <th className="text-right pb-2 text-[var(--text3)]">Restant</th>
                <th className="text-right pb-2 text-[var(--text3)]">Reçu aujourd'hui</th>
              </tr>
            </thead>
            <tbody>
              {pendingItems.map(item => {
                const rem = remaining(item)
                return (
                  <tr key={item.id} className="border-b border-[var(--border)] last:border-0">
                    <td className="py-2 text-[var(--text1)]">{item.stock_item?.name}</td>
                    <td className="py-2 text-right text-[var(--text2)]">{item.quantity_ordered} {item.stock_item?.unit}</td>
                    <td className="py-2 text-right text-[var(--text2)]">{item.quantity_received ?? 0} {item.stock_item?.unit}</td>
                    <td className="py-2 text-right text-amber-400 font-semibold">{rem} {item.stock_item?.unit}</td>
                    <td className="py-2 text-right">
                      <input
                        type="number"
                        min={0}
                        max={rem}
                        step={0.1}
                        value={quantities[item.id] ?? rem}
                        onChange={e => updateQty(item.id, parseFloat(e.target.value) || 0)}
                        className="w-16 text-right text-sm bg-[var(--surface2)] border border-[var(--border)] rounded px-1.5 py-0.5 text-[var(--text1)]"
                      />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          {/* Notes */}
          <div className="mb-4">
            <label className="block text-xs font-semibold text-[var(--text3)] uppercase tracking-wide mb-1">Notes (optionnel)</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              placeholder="Observations sur cette livraison…"
              className="w-full rounded-lg px-3 py-2 text-sm bg-[var(--surface2)] border border-[var(--border)] text-[var(--text1)] placeholder:text-[var(--text4)] outline-none focus:border-[var(--blue)] resize-none"
            />
          </div>

          {/* Footer */}
          <div className="flex gap-3 justify-end">
            <button
              onClick={onClose}
              className="px-4 py-1.5 rounded-lg text-sm text-[var(--text2)] hover:bg-[var(--surface2)] border border-[var(--border)]"
            >
              Annuler
            </button>
            <button
              onClick={handleConfirm}
              disabled={loading}
              className="px-4 py-1.5 rounded-lg text-sm font-semibold text-white disabled:opacity-40"
              style={{ background: 'var(--blue)' }}
            >
              {loading ? 'Enregistrement…' : 'Confirmer la réception'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/dashboard/stocks/commandes/_components/receive-modal.tsx
git commit -m "feat: add receive modal with per-item quantity inputs and notes"
```

---

## Task 11: Edit Modal

**Files:**
- Create: `src/app/dashboard/stocks/commandes/_components/edit-modal.tsx`

- [ ] **Step 1: Create the edit modal**

```typescript
// src/app/dashboard/stocks/commandes/_components/edit-modal.tsx
'use client'
import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import type { PurchaseOrder, PurchaseOrderItem } from './types'
import type { StockItem } from '../../_components/types'

interface Props {
  order: PurchaseOrder
  stockItems: StockItem[]
  onClose: () => void
  onSave: () => Promise<void>
}

interface EditLine {
  id?: string  // undefined = new line
  stockItemId: string
  name: string
  unit: string
  quantityOrdered: number
  unitPrice: number
  isLocked: boolean  // true if quantity_received > 0
}

export function EditModal({ order, stockItems, onClose, onSave }: Props) {
  const [supplier, setSupplier] = useState(order.supplier)
  const [deliveryDate, setDeliveryDate] = useState(order.requested_delivery_date ?? '')
  const [notes, setNotes] = useState(order.notes ?? '')
  const [lines, setLines] = useState<EditLine[]>(() =>
    (order.items ?? []).map(item => ({
      id:              item.id,
      stockItemId:     item.stock_item_id,
      name:            item.stock_item?.name ?? '',
      unit:            item.stock_item?.unit ?? '',
      quantityOrdered: item.quantity_ordered,
      unitPrice:       item.unit_price,
      isLocked:        (item.quantity_received ?? 0) > 0,
    }))
  )
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)

  // Articles not yet in the order (for adding new lines)
  const existingStockIds = new Set(lines.map(l => l.stockItemId))
  const availableItems = stockItems.filter(i =>
    !existingStockIds.has(i.id) &&
    (search === '' || i.name.toLowerCase().includes(search.toLowerCase()))
  )

  function addItem(item: StockItem) {
    setLines(prev => [...prev, {
      stockItemId:     item.id,
      name:            item.name,
      unit:            item.unit,
      quantityOrdered: item.order_quantity || 1,
      unitPrice:       item.unit_price,
      isLocked:        false,
    }])
    setSearch('')
  }

  function removeLine(idx: number) {
    setLines(prev => prev.filter((_, i) => i !== idx))
  }

  function updateLine(idx: number, field: 'quantityOrdered' | 'unitPrice', val: number) {
    setLines(prev => prev.map((l, i) => i === idx ? { ...l, [field]: val } : l))
  }

  async function handleSave() {
    if (!supplier.trim()) { toast.error('Le fournisseur est requis'); return }

    const editableLines = lines.filter(l => !l.isLocked)
    const lockedLines = lines.filter(l => l.isLocked)

    setLoading(true)
    try {
      const upsert_items = editableLines.map(l => ({
        ...(l.id ? { id: l.id } : {}),
        stock_item_id:    l.stockItemId,
        quantity_ordered: l.quantityOrdered,
        unit_price:       l.unitPrice,
      }))

      // New lines (no id) are mixed in with edited unlocked lines
      const res = await fetch(`/api/purchase-orders/${order.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplier,
          requested_delivery_date: deliveryDate || null,
          notes: notes || null,
          upsert_items,
          // Delete lines that were in the original order but are no longer in editableLines and have no id
          // (only delete unlocked lines with an id that are no longer present)
          delete_item_ids: (order.items ?? [])
            .filter(orig => (orig.quantity_received ?? 0) === 0)
            .filter(orig => !editableLines.some(l => l.id === orig.id))
            .map(orig => orig.id),
        }),
      })

      if (!res.ok) {
        const err = await res.json()
        toast.error(err.error ?? 'Erreur lors de la modification')
        return
      }
      toast.success('Commande modifiée')
      await onSave()
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)' }}>
      <div className="w-full max-w-lg max-h-[85vh] flex flex-col rounded-2xl shadow-2xl overflow-hidden"
           style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        {/* Header */}
        <div className="px-5 py-4 border-b border-[var(--border)] flex items-center justify-between flex-shrink-0">
          <h2 className="font-bold text-[var(--text1)]">Modifier — {order.order_ref}</h2>
          <button onClick={onClose} className="text-[var(--text3)] hover:text-[var(--text1)] text-xl">×</button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Header fields */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-[var(--text3)] uppercase tracking-wide mb-1">Fournisseur *</label>
              <input
                type="text"
                value={supplier}
                onChange={e => setSupplier(e.target.value)}
                className="w-full rounded-lg px-3 py-2 text-sm bg-[var(--surface2)] border border-[var(--border)] text-[var(--text1)] outline-none focus:border-[var(--blue)]"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[var(--text3)] uppercase tracking-wide mb-1">Date livraison</label>
              <input
                type="date"
                value={deliveryDate}
                onChange={e => setDeliveryDate(e.target.value)}
                className="w-full rounded-lg px-3 py-2 text-sm bg-[var(--surface2)] border border-[var(--border)] text-[var(--text1)] outline-none focus:border-[var(--blue)]"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-[var(--text3)] uppercase tracking-wide mb-1">Notes</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              className="w-full rounded-lg px-3 py-2 text-sm bg-[var(--surface2)] border border-[var(--border)] text-[var(--text1)] outline-none focus:border-[var(--blue)] resize-none"
            />
          </div>

          {/* Lines */}
          <div>
            <div className="text-xs font-semibold text-[var(--text3)] uppercase tracking-wide mb-2">Articles</div>
            <div className="space-y-1.5">
              {lines.map((line, idx) => (
                <div key={line.id ?? line.stockItemId}
                     className={`flex items-center gap-2 rounded-lg px-3 py-2 border ${line.isLocked ? 'border-[var(--border)] opacity-60' : 'border-[var(--border)]'}`}
                     style={{ background: 'var(--surface2)' }}>
                  {line.isLocked && <span title="Ligne verrouillée (déjà reçue)">🔒</span>}
                  <span className="flex-1 text-sm text-[var(--text1)] truncate">{line.name}</span>
                  <input
                    type="number"
                    value={line.quantityOrdered}
                    disabled={line.isLocked}
                    min={0.001}
                    step={0.1}
                    onChange={e => updateLine(idx, 'quantityOrdered', parseFloat(e.target.value) || 0)}
                    className="w-16 text-xs text-right bg-[var(--surface)] border border-[var(--border)] rounded px-1.5 py-0.5 text-[var(--text1)] disabled:opacity-50"
                  />
                  <span className="text-xs text-[var(--text4)]">{line.unit}</span>
                  <input
                    type="number"
                    value={line.unitPrice}
                    disabled={line.isLocked}
                    min={0}
                    step={0.01}
                    onChange={e => updateLine(idx, 'unitPrice', parseFloat(e.target.value) || 0)}
                    className="w-16 text-xs text-right bg-[var(--surface)] border border-[var(--border)] rounded px-1.5 py-0.5 text-[var(--text1)] disabled:opacity-50"
                  />
                  <span className="text-xs text-[var(--text4)]">€</span>
                  {!line.isLocked && (
                    <button
                      onClick={() => removeLine(idx)}
                      className="text-red-400 hover:text-red-300 text-sm ml-1"
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
            </div>

            {/* Add new line */}
            <div className="mt-3">
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Ajouter un article…"
                className="w-full rounded-lg px-3 py-2 text-sm bg-[var(--surface2)] border border-[var(--border)] text-[var(--text1)] placeholder:text-[var(--text4)] outline-none focus:border-[var(--blue)]"
              />
              {search && availableItems.length > 0 && (
                <div className="mt-1 rounded-lg border border-[var(--border)] overflow-hidden max-h-40 overflow-y-auto"
                     style={{ background: 'var(--surface)' }}>
                  {availableItems.slice(0, 10).map(item => (
                    <button
                      key={item.id}
                      onClick={() => addItem(item)}
                      className="w-full text-left px-3 py-2 text-sm text-[var(--text1)] hover:bg-[var(--surface2)] flex justify-between"
                    >
                      <span>{item.name}</span>
                      <span className="text-[var(--text4)] text-xs">{item.quantity} {item.unit}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 border-t border-[var(--border)] px-5 py-3 flex gap-3 justify-end"
             style={{ background: 'var(--surface2)' }}>
          <button onClick={onClose} className="px-4 py-1.5 rounded-lg text-sm text-[var(--text2)] hover:bg-[var(--surface)] border border-[var(--border)]">
            Annuler
          </button>
          <button
            onClick={handleSave}
            disabled={loading}
            className="px-4 py-1.5 rounded-lg text-sm font-semibold text-white disabled:opacity-40"
            style={{ background: 'var(--blue)' }}
          >
            {loading ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/dashboard/stocks/commandes/_components/edit-modal.tsx
git commit -m "feat: add edit modal with locked lines for partially received orders"
```

---

## Task 12: Cancel Modal

**Files:**
- Create: `src/app/dashboard/stocks/commandes/_components/cancel-modal.tsx`

- [ ] **Step 1: Create the cancel confirmation modal**

```typescript
// src/app/dashboard/stocks/commandes/_components/cancel-modal.tsx
'use client'
import { useState } from 'react'
import { toast } from 'sonner'
import type { PurchaseOrder } from './types'

interface Props {
  order: PurchaseOrder
  onClose: () => void
  onConfirm: () => Promise<void>
}

export function CancelModal({ order, onClose, onConfirm }: Props) {
  const [loading, setLoading] = useState(false)

  async function handleConfirm() {
    setLoading(true)
    try {
      const res = await fetch(`/api/purchase-orders/${order.id}/cancel`, { method: 'PATCH' })
      if (!res.ok) {
        const err = await res.json()
        toast.error(err.error ?? 'Erreur lors de l\'annulation')
        return
      }
      toast.success('Commande annulée')
      await onConfirm()
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)' }}>
      <div className="w-80 rounded-2xl p-6 shadow-2xl" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <h3 className="font-bold text-[var(--text1)] mb-1">Annuler la commande {order.order_ref} ?</h3>
        <p className="text-sm text-[var(--text3)] mb-2">Les stocks ne seront pas affectés.</p>
        <p className="text-sm text-[var(--text3)] mb-5">Les quantités déjà réceptionnées restent en stock.</p>
        <div className="flex gap-3 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg text-sm text-[var(--text2)] hover:bg-[var(--surface2)] border border-[var(--border)]"
          >
            Retour
          </button>
          <button
            onClick={handleConfirm}
            disabled={loading}
            className="px-4 py-1.5 rounded-lg text-sm font-semibold text-white disabled:opacity-40"
            style={{ background: 'var(--red)' }}
          >
            {loading ? 'Annulation…' : 'Confirmer l\'annulation'}
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/dashboard/stocks/commandes/_components/cancel-modal.tsx
git commit -m "feat: add cancel confirmation modal"
```

---

## Task 13: Update Stocks Page

Remove the orders tab from `stocks-page-client.tsx` (orders now live at `/commandes`) and add a link.

**Files:**
- Modify: `src/app/dashboard/stocks/_components/stocks-page-client.tsx`
- Modify: `src/app/dashboard/stocks/page.tsx`

- [ ] **Step 1: Remove orders tab and data from page.tsx**

In `src/app/dashboard/stocks/page.tsx`, remove the `ordersRes` fetch from `Promise.all` and the `initialOrders` prop:

```typescript
// src/app/dashboard/stocks/page.tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { StocksPageClient } from './_components/stocks-page-client'
import type { StockItem } from './_components/types'

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

  const [stockRes, categoriesRes] = await Promise.all([
    supabase
      .from('stock_items')
      .select('*')
      .eq('establishment_id', profile.establishment_id)
      .eq('active', true)
      .order('name'),
    supabase
      .from('categories')
      .select('id, name, color_hex')
      .eq('establishment_id', profile.establishment_id)
      .order('sort_order'),
  ])

  const items: StockItem[] = (stockRes.data ?? []).map(i => ({
    ...i,
    status: i.quantity <= 0
      ? 'out_of_stock'
      : i.quantity < i.alert_threshold
      ? 'alert'
      : 'ok',
    purchase_price:  (i as unknown as Record<string, number>).purchase_price  ?? 0,
    purchase_qty:    (i as unknown as Record<string, number>).purchase_qty    ?? 0,
    is_pos:          Boolean((i as unknown as Record<string, unknown>).is_pos),
    pos_price:       (i as unknown as Record<string, number | null>).pos_price ?? null,
    pos_tva_rate:    (i as unknown as Record<string, number>).pos_tva_rate    ?? 10,
    pos_category_id: (i as unknown as Record<string, string | null>).pos_category_id ?? null,
    product_id:      (i as unknown as Record<string, string | null>).product_id      ?? null,
  }))

  return (
    <StocksPageClient
      initialItems={items}
      categories={(categoriesRes.data ?? []) as { id: string; name: string; color_hex: string }[]}
    />
  )
}
```

- [ ] **Step 2: Update stocks-page-client.tsx**

Remove the orders tab, `initialOrders` prop, order-related state, and add a link to `/commandes`.

Key changes:
- Remove `initialOrders`, `orders`, `showOrderForm`, `receivingOrder`, `reloadOrders` state
- Remove `PurchaseOrderForm` and `ReceiveDeliveryModal` imports
- Remove the `orders` tab and its render
- Update the header to show a link button "📥 Commandes" pointing to `/dashboard/stocks/commandes`
- Update KPI "Commandes en cours" to link to `/commandes` rather than showing count (or remove it)

```typescript
// src/app/dashboard/stocks/_components/stocks-page-client.tsx
'use client'
import { useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { StockItemsTable } from './stock-items-table'
import { StockItemForm } from './stock-item-form'
import type { StockItem } from './types'

interface Category { id: string; name: string; color_hex: string }

interface Props {
  initialItems: StockItem[]
  categories: Category[]
}

export function StocksPageClient({ initialItems, categories }: Props) {
  const [items, setItems] = useState(initialItems)
  const [showItemForm, setShowItemForm] = useState(false)
  const [editingItem, setEditingItem] = useState<StockItem | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  const alerts     = items.filter(i => i.status === 'alert').length
  const outOfStock = items.filter(i => i.status === 'out_of_stock').length

  async function reloadItems() {
    const res = await fetch('/api/stock-items')
    if (!res.ok) { toast.error('Erreur lors du chargement des articles'); return }
    const json = await res.json()
    setItems(json.items ?? [])
  }

  return (
    <div>
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
            <Link
              href="/dashboard/stocks/commandes"
              className="px-3 py-1.5 rounded-lg text-sm font-medium border border-[var(--border)] text-[var(--text3)] hover:bg-[var(--surface)]"
            >
              📥 Commandes
            </Link>
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
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-6">
          {[
            { label: 'Articles', value: items.length, color: 'text-[var(--text1)]' },
            { label: 'Alertes', value: alerts, color: 'text-amber-400' },
            { label: 'Ruptures', value: outOfStock, color: 'text-red-400' },
          ].map(kpi => (
            <div key={kpi.label} className="rounded-xl p-4 border border-[var(--border)]" style={{ background: 'var(--surface)' }}>
              <div className={`text-2xl font-bold ${kpi.color}`}>{kpi.value}</div>
              <div className="text-xs text-[var(--text3)] uppercase tracking-wide mt-1">{kpi.label}</div>
            </div>
          ))}
        </div>

        {/* Inventory */}
        {items.length === 0 && (
          <div className="text-center py-20 text-[var(--text4)]">
            <div className="text-5xl mb-4">📦</div>
            <div className="text-base font-semibold text-[var(--text2)] mb-1">Aucun article en stock</div>
            <div className="text-sm mb-5">Commencez par ajouter vos premiers ingrédients ou matières premières.</div>
            <button
              onClick={() => { setEditingItem(null); setShowItemForm(true) }}
              className="px-4 py-2 rounded-lg text-sm font-semibold text-white"
              style={{ background: 'var(--blue)' }}
            >
              + Ajouter un article
            </button>
          </div>
        )}

        {items.length > 0 && (
          <>
            <StockItemsTable
              items={items}
              onEdit={item => { setEditingItem(item); setShowItemForm(true) }}
              onDelete={async id => { setConfirmDeleteId(id) }}
            />
            {confirmDeleteId && (
              <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)' }}>
                <div className="rounded-2xl p-6 w-80 shadow-2xl" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                  <p className="text-sm font-semibold text-[var(--text1)] mb-1">Supprimer cet article ?</p>
                  <p className="text-xs text-[var(--text4)] mb-5">Cette action est irréversible.</p>
                  <div className="flex gap-3 justify-end">
                    <button onClick={() => setConfirmDeleteId(null)} className="px-4 py-2 rounded-lg text-sm text-[var(--text2)] hover:bg-[var(--surface2)] transition-colors">
                      Annuler
                    </button>
                    <button
                      onClick={async () => {
                        const res = await fetch(`/api/stock-items/${confirmDeleteId}`, { method: 'DELETE' })
                        setConfirmDeleteId(null)
                        if (res.ok) toast.success('Article supprimé')
                        else toast.error('Erreur lors de la suppression')
                        await reloadItems()
                      }}
                      className="px-4 py-2 rounded-lg text-sm font-semibold text-white"
                      style={{ background: 'var(--red)' }}
                    >
                      Supprimer
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <StockItemForm
        open={showItemForm}
        item={editingItem}
        categories={categories}
        onClose={() => setShowItemForm(false)}
        onSave={async () => { setShowItemForm(false); await reloadItems() }}
      />
    </div>
  )
}
```

- [ ] **Step 3: Run TypeScript check**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/dashboard/stocks/_components/stocks-page-client.tsx src/app/dashboard/stocks/page.tsx
git commit -m "refactor: remove orders tab from stocks page, add link to /commandes"
```

---

## Task 14: End-to-End Verification

- [ ] **Step 1: Start dev server**

```bash
npm run dev
```

- [ ] **Step 2: Walk through the full flow**

1. Navigate to `/dashboard/stocks` — verify "📥 Commandes" link is visible, no orders tab
2. Click "Commandes" → verify `/dashboard/stocks/commandes` loads
3. Click "📥 Nouvelle commande" → verify 2-step form opens with "Alertes" tab pre-selected
4. Create a test order → verify it appears in the list with status "En cours"
5. Click on the order row → verify detail slide-in opens with lines table
6. Click "Réceptionner" → verify receive modal with pre-filled remaining quantities
7. Receive partially → verify status changes to "Partielle"
8. Receive the rest → verify status changes to "Reçue"
9. Create another order → click "Modifier" → verify locked/unlocked lines
10. Create another order → click "Annuler" → verify confirmation modal and "Annulées" tab

- [ ] **Step 3: Run all tests**

```bash
npx vitest run
```

Expected: All tests pass.

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat: complete purchase orders refonte — dedicated page, multi-step form, reception history, edit/cancel"
```
