# Sprint 3a — Caisse Backend (APIs & DB)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implémenter la couche de données et les APIs du système caisse : migration DB complète, 7 endpoints REST (sessions, commandes, remises, paiements, reçus, tables), types TypeScript POS.

**Architecture:** Toutes les mutations POS passent par les API routes Next.js avec isolation `establishment_id`. Les sessions caisse (`cash_sessions`) ouvrent et ferment la journée. Calcul des totaux centralisé dans `computeOrderTotals`. RLS Supabase sur chaque table caisse.

**Tech Stack:** Next.js 16 App Router, Supabase (RLS + PostgreSQL), TypeScript, Vitest.

**Prérequis :** Sprint 1 (Design System) et Sprint 2 (Dashboard Produits) complétés.

**Suite :** Sprint 3b (UI POS) dépend de ce sprint.

---

## Fichiers créés / modifiés

| Action | Fichier | Responsabilité |
|--------|---------|----------------|
| Create | `supabase/migrations/20260326000010_caisse.sql` | Tables caisse complètes |
| Create | `src/app/api/cash-sessions/route.ts` | GET sessions ouvertes, POST ouvrir session |
| Create | `src/app/api/cash-sessions/[id]/route.ts` | PATCH clôturer session |
| Create | `src/app/api/cash-sessions/[id]/report.pdf/route.ts` | GET rapport Z PDF |
| Create | `src/app/api/orders/route.ts` | POST créer commande |
| Create | `src/app/api/orders/[id]/route.ts` | GET commande, PATCH statut |
| Create | `src/app/api/orders/[id]/items/route.ts` | POST/DELETE lignes de commande |
| Create | `src/app/api/orders/[id]/discounts/route.ts` | POST remise |
| Create | `src/app/api/orders/[id]/pay/route.ts` | POST paiement (CB/espèces/split) |
| Create | `src/app/api/receipts/[orderId]/email/route.ts` | POST envoyer reçu email |
| Create | `src/app/api/receipts/[orderId]/sms/route.ts` | POST envoyer reçu SMS |
| Create | `src/app/api/receipts/z-report/route.ts` | POST imprimer rapport Z |
| Create | `src/app/api/tables/route.ts` | GET tables par salle |
| Create | `src/app/api/tables/[id]/route.ts` | PATCH statut table |
| Create | `src/app/caisse/pos/page.tsx` | Server Component — charge données init |
| Create | `src/app/caisse/pos/_components/pos-shell.tsx` | Client Component racine POS |
| Create | `src/app/caisse/pos/_components/categories-panel.tsx` | Colonne gauche 200px |
| Create | `src/app/caisse/pos/_components/products-panel.tsx` | Colonne centre flex |
| Create | `src/app/caisse/pos/_components/ticket-panel.tsx` | Colonne droite 360px |
| Create | `src/app/caisse/pos/_components/payment-modal.tsx` | Modale paiement (CB/espèces/split) |
| Create | `src/app/caisse/pos/_components/receipt-modal.tsx` | Reçu + actions print/email/SMS |
| Create | `src/app/caisse/pos/_components/discount-modal.tsx` | Modale remise |
| Create | `src/app/caisse/pos/_components/floor-plan-modal.tsx` | Plan de salle |
| Create | `src/app/caisse/pos/_components/session-modal.tsx` | Ouverture/clôture session |
| Create | `src/app/caisse/pos/_components/print-receipt.css` | CSS @media print reçu thermique |
| Create | `src/app/caisse/pos/types.ts` | Types POS (Order, OrderItem, Payment…) |
| Create | `src/app/api/orders/route.test.ts` | Tests API orders |
| Create | `src/app/api/orders/[id]/pay/route.test.ts` | Tests paiement |

---

## Tâche 1 : Migration DB — Caisse complète

**Fichiers :**
- Create: `supabase/migrations/20260326000010_caisse.sql`

- [ ] **Étape 1 : Écrire la migration**

```sql
-- supabase/migrations/20260326000010_caisse.sql

-- ===== SESSIONS CAISSE =====
CREATE TABLE cash_sessions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id UUID NOT NULL REFERENCES establishments(id) ON DELETE CASCADE,
  opened_by        UUID NOT NULL REFERENCES profiles(id),
  opened_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_by        UUID REFERENCES profiles(id),
  closed_at        TIMESTAMPTZ,
  opening_float    NUMERIC(10,2) NOT NULL DEFAULT 0,
  closing_float    NUMERIC(10,2),
  total_cash       NUMERIC(10,2),
  total_card       NUMERIC(10,2),
  total_sales      NUMERIC(10,2),
  status           VARCHAR(10) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed'))
);

CREATE INDEX idx_sessions_establishment ON cash_sessions(establishment_id, status);

ALTER TABLE cash_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sessions_by_establishment" ON cash_sessions
  FOR ALL USING (
    establishment_id IN (
      SELECT establishment_id FROM profiles WHERE id = auth.uid()
    )
  );

-- ===== SALLES ET TABLES =====
CREATE TABLE rooms (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id UUID NOT NULL REFERENCES establishments(id) ON DELETE CASCADE,
  name             VARCHAR(50) NOT NULL,
  sort_order       INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE restaurant_tables (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id UUID NOT NULL REFERENCES establishments(id) ON DELETE CASCADE,
  room_id          UUID REFERENCES rooms(id) ON DELETE SET NULL,
  name             VARCHAR(20) NOT NULL,  -- "Table 1", "Bar 3", etc.
  seats            INTEGER NOT NULL DEFAULT 4,
  status           VARCHAR(15) NOT NULL DEFAULT 'free' CHECK (status IN ('free', 'occupied', 'reserved')),
  current_order_id UUID,  -- FK circulaire — ajouté après orders
  x_pos            INTEGER NOT NULL DEFAULT 0,  -- position dans plan salle
  y_pos            INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_tables_establishment ON restaurant_tables(establishment_id);

ALTER TABLE restaurant_tables ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tables_by_establishment" ON restaurant_tables
  FOR ALL USING (
    establishment_id IN (
      SELECT establishment_id FROM profiles WHERE id = auth.uid()
    )
  );

-- ===== COMMANDES (version caisse) =====
-- Supprimer et recréer orders avec le bon schéma
DROP TABLE IF EXISTS transactions CASCADE;
DROP TABLE IF EXISTS order_items CASCADE;
DROP TABLE IF EXISTS orders CASCADE;

CREATE TABLE orders (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id UUID NOT NULL REFERENCES establishments(id) ON DELETE CASCADE,
  session_id       UUID REFERENCES cash_sessions(id),
  table_id         UUID REFERENCES restaurant_tables(id) ON DELETE SET NULL,
  cashier_id       UUID NOT NULL REFERENCES profiles(id),
  status           VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'paying', 'paid', 'cancelled', 'refunded')),
  subtotal_ht      NUMERIC(10,2) NOT NULL DEFAULT 0,
  tax_5_5          NUMERIC(10,2) NOT NULL DEFAULT 0,
  tax_10           NUMERIC(10,2) NOT NULL DEFAULT 0,
  tax_20           NUMERIC(10,2) NOT NULL DEFAULT 0,
  discount_type    VARCHAR(10) CHECK (discount_type IN ('percent', 'amount')),
  discount_value   NUMERIC(10,2),
  discount_amount  NUMERIC(10,2) NOT NULL DEFAULT 0,
  total_ttc        NUMERIC(10,2) NOT NULL DEFAULT 0,
  note             TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_orders_session ON orders(session_id);
CREATE INDEX idx_orders_establishment ON orders(establishment_id, status);

ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "orders_by_establishment" ON orders
  FOR ALL USING (
    establishment_id IN (
      SELECT establishment_id FROM profiles WHERE id = auth.uid()
    )
  );

-- ===== LIGNES DE COMMANDE =====
CREATE TABLE order_items (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id     UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id   UUID NOT NULL REFERENCES products(id),
  product_name VARCHAR(100) NOT NULL,  -- snapshot au moment de la commande
  emoji        VARCHAR(10),
  unit_price   NUMERIC(10,2) NOT NULL,  -- prix HT au moment de la commande
  tva_rate     NUMERIC(4,2) NOT NULL,
  quantity     INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  discount_pct NUMERIC(5,2) DEFAULT 0,
  line_total   NUMERIC(10,2) NOT NULL,  -- (unit_price * qty) * (1 + tva/100)
  note         TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_items_order ON order_items(order_id);

ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "items_via_orders" ON order_items
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM orders o
      JOIN profiles p ON p.id = auth.uid()
      WHERE o.id = order_items.order_id
        AND o.establishment_id = p.establishment_id
    )
  );

-- ===== PAIEMENTS =====
CREATE TABLE payments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id     UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  method       VARCHAR(10) NOT NULL CHECK (method IN ('card', 'cash', 'ticket_resto')),
  amount       NUMERIC(10,2) NOT NULL,
  cash_given   NUMERIC(10,2),  -- pour espèces seulement
  change_due   NUMERIC(10,2),
  tpe_ref      VARCHAR(50),    -- référence terminal CB
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_payments_order ON payments(order_id);

ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "payments_via_orders" ON payments
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM orders o
      JOIN profiles p ON p.id = auth.uid()
      WHERE o.id = payments.order_id
        AND o.establishment_id = p.establishment_id
    )
  );

-- ===== FK circulaire tables ↔ orders =====
ALTER TABLE restaurant_tables
  ADD CONSTRAINT fk_table_current_order
  FOREIGN KEY (current_order_id) REFERENCES orders(id) ON DELETE SET NULL;
```

- [ ] **Étape 2 : Appliquer**
```bash
npx supabase db push
```

- [ ] **Étape 3 : Commit**
```bash
git add supabase/migrations/20260326000010_caisse.sql
git commit -m "feat(db): migration caisse — sessions, tables, orders v2, items, payments"
```

---

## Tâche 2 : Types TypeScript POS

**Fichiers :**
- Create: `src/app/caisse/pos/types.ts`

- [ ] **Étape 1 : Créer les types**

```typescript
// src/app/caisse/pos/types.ts

export interface CashSession {
  id: string
  establishment_id: string
  opened_by: string
  opened_at: string
  closed_at: string | null
  opening_float: number
  status: 'open' | 'closed'
}

export interface Room {
  id: string
  name: string
  sort_order: number
}

export interface RestaurantTable {
  id: string
  room_id: string | null
  name: string
  seats: number
  status: 'free' | 'occupied' | 'reserved'
  current_order_id: string | null
}

export interface OrderItem {
  id: string
  product_id: string
  product_name: string
  emoji: string | null
  unit_price: number   // HT
  tva_rate: number
  quantity: number
  discount_pct: number
  line_total: number   // TTC
  note: string | null
}

export interface Order {
  id: string
  session_id: string | null
  table_id: string | null
  cashier_id: string
  status: 'open' | 'paying' | 'paid' | 'cancelled' | 'refunded'
  subtotal_ht: number
  tax_5_5: number
  tax_10: number
  tax_20: number
  discount_type: 'percent' | 'amount' | null
  discount_value: number | null
  discount_amount: number
  total_ttc: number
  items: OrderItem[]
  created_at: string
}

export interface Payment {
  id: string
  method: 'card' | 'cash' | 'ticket_resto'
  amount: number
  cash_given: number | null
  change_due: number | null
}

// État local POS (non sauvegardé avant paiement)
export interface LocalTicket {
  items: LocalItem[]
  discount: { type: 'percent' | 'amount'; value: number } | null
  tableId: string | null
  note: string
}

export interface LocalItem {
  productId: string
  productName: string
  emoji: string | null
  unitPriceHt: number
  tvaRate: number
  quantity: number
}

export type PaymentMode = 'card' | 'cash' | 'split'
```

- [ ] **Étape 2 : Commit**
```bash
git add src/app/caisse/pos/types.ts
git commit -m "feat(caisse): types TypeScript POS"
```

---

## Tâche 3 : API Cash Sessions

**Fichiers :**
- Create: `src/app/api/cash-sessions/route.ts`
- Create: `src/app/api/cash-sessions/[id]/route.ts`

- [ ] **Étape 1 : GET/POST sessions**

```typescript
// src/app/api/cash-sessions/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(_req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles').select('establishment_id').eq('id', user.id).single()

  const { data, error } = await supabase
    .from('cash_sessions')
    .select('*')
    .eq('establishment_id', profile?.establishment_id)
    .eq('status', 'open')
    .order('opened_at', { ascending: false })
    .limit(1)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ session: data?.[0] ?? null })
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles').select('establishment_id, role').eq('id', user.id).single()

  if (profile?.role === 'caissier') {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  const body = await req.json()
  const { opening_float = 0 } = body

  const { data, error } = await supabase
    .from('cash_sessions')
    .insert({
      establishment_id: profile?.establishment_id,
      opened_by: user.id,
      opening_float,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ session: data }, { status: 201 })
}
```

- [ ] **Étape 2 : PATCH (clôturer session)**

```typescript
// src/app/api/cash-sessions/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await req.json()
  const { closing_float } = body

  // Calculer les totaux de la session
  const { data: sessionPayments } = await supabase
    .from('payments')
    .select('method, amount, orders!inner(session_id)')
    .eq('orders.session_id', id)

  const totalCash = sessionPayments
    ?.filter((p) => p.method === 'cash')
    .reduce((sum, p) => sum + p.amount, 0) ?? 0

  const totalCard = sessionPayments
    ?.filter((p) => p.method === 'card')
    .reduce((sum, p) => sum + p.amount, 0) ?? 0

  const { data, error } = await supabase
    .from('cash_sessions')
    .update({
      status: 'closed',
      closed_by: user.id,
      closed_at: new Date().toISOString(),
      closing_float,
      total_cash: totalCash,
      total_card: totalCard,
      total_sales: totalCash + totalCard,
    })
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ session: data })
}
```

- [ ] **Étape 3 : Commit**
```bash
git add src/app/api/cash-sessions/
git commit -m "feat(api): cash-sessions GET/POST/PATCH (ouverture/clôture)"
```

---

## Tâche 4 : API Orders

**Fichiers :**
- Create: `src/app/api/orders/route.ts`
- Create: `src/app/api/orders/[id]/route.ts`
- Create: `src/app/api/orders/[id]/items/route.ts`
- Create: `src/app/api/orders/route.test.ts`

- [ ] **Étape 1 : Écrire les tests orders**

```typescript
// src/app/api/orders/route.test.ts
import { describe, it, expect, vi } from 'vitest'
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
import { createClient } from '@/lib/supabase/server'
import { POST } from './route'
import { NextRequest } from 'next/server'

const mockInsert = vi.fn()

describe('POST /api/orders', () => {
  it('crée une commande avec les lignes fournies', async () => {
    ;(createClient as ReturnType<typeof vi.fn>).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } } }) },
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: { establishment_id: 'e1', role: 'admin' },
        }),
        insert: vi.fn().mockReturnThis(),
        ...mockInsert(),
      }),
    })
    mockInsert.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: { id: 'order1', status: 'open', total_ttc: 12.50 },
        error: null,
      }),
    })

    const req = new NextRequest('http://localhost/api/orders', {
      method: 'POST',
      body: JSON.stringify({
        items: [
          { product_id: 'p1', product_name: 'Café', unit_price: 2.0, tva_rate: 10, quantity: 2, emoji: '☕' }
        ],
        session_id: 's1',
      }),
    })
    const res = await POST(req)
    expect(res.status).toBe(201)
  })

  it('retourne 400 si items est vide', async () => {
    ;(createClient as ReturnType<typeof vi.fn>).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } } }) },
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: { establishment_id: 'e1' } }),
      }),
    })
    const req = new NextRequest('http://localhost/api/orders', {
      method: 'POST',
      body: JSON.stringify({ items: [] }),
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })
})
```

- [ ] **Étape 2 : Lancer — doit échouer**
```bash
npx vitest run src/app/api/orders/route.test.ts
```

- [ ] **Étape 3 : Implémenter POST orders**

```typescript
// src/app/api/orders/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { z } from 'zod'

const createOrderSchema = z.object({
  session_id: z.string().uuid().optional(),
  table_id: z.string().uuid().optional(),
  items: z.array(z.object({
    product_id: z.string().uuid(),
    product_name: z.string(),
    emoji: z.string().nullable().optional(),
    unit_price: z.number().positive(),   // HT
    tva_rate: z.union([z.literal(5.5), z.literal(10), z.literal(20)]),
    quantity: z.number().int().positive(),
    note: z.string().optional(),
  })).min(1, 'Au moins un article requis'),
})

function computeOrderTotals(items: z.infer<typeof createOrderSchema>['items']) {
  let subtotalHt = 0
  let tax55 = 0
  let tax10 = 0
  let tax20 = 0

  const processedItems = items.map((item) => {
    const lineHt = item.unit_price * item.quantity
    const lineTax = lineHt * (item.tva_rate / 100)
    const lineTtc = lineHt + lineTax

    subtotalHt += lineHt
    if (item.tva_rate === 5.5) tax55 += lineTax
    else if (item.tva_rate === 10) tax10 += lineTax
    else tax20 += lineTax

    return { ...item, line_total: lineTtc }
  })

  const totalTtc = subtotalHt + tax55 + tax10 + tax20
  return { processedItems, subtotalHt, tax55, tax10, tax20, totalTtc }
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles').select('establishment_id').eq('id', user.id).single()

  const body = await req.json()
  const parsed = createOrderSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const { items, session_id, table_id } = parsed.data
  const { processedItems, subtotalHt, tax55, tax10, tax20, totalTtc } = computeOrderTotals(items)

  // Créer la commande
  const { data: order, error: orderError } = await supabase
    .from('orders')
    .insert({
      establishment_id: profile?.establishment_id,
      session_id: session_id ?? null,
      table_id: table_id ?? null,
      cashier_id: user.id,
      subtotal_ht: subtotalHt,
      tax_5_5: tax55,
      tax_10: tax10,
      tax_20: tax20,
      total_ttc: totalTtc,
    })
    .select()
    .single()

  if (orderError) return NextResponse.json({ error: orderError.message }, { status: 500 })

  // Créer les lignes
  const { error: itemsError } = await supabase.from('order_items').insert(
    processedItems.map((item) => ({
      order_id: order.id,
      product_id: item.product_id,
      product_name: item.product_name,
      emoji: item.emoji ?? null,
      unit_price: item.unit_price,
      tva_rate: item.tva_rate,
      quantity: item.quantity,
      line_total: item.line_total,
      note: item.note ?? null,
    }))
  )

  if (itemsError) {
    await supabase.from('orders').delete().eq('id', order.id)
    return NextResponse.json({ error: itemsError.message }, { status: 500 })
  }

  // Marquer la table comme occupée
  if (table_id) {
    await supabase
      .from('restaurant_tables')
      .update({ status: 'occupied', current_order_id: order.id })
      .eq('id', table_id)
  }

  return NextResponse.json({ order: { ...order, items: processedItems } }, { status: 201 })
}
```

- [ ] **Étape 4 : Implémenter GET order + PATCH statut**

```typescript
// src/app/api/orders/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const { data, error } = await supabase
    .from('orders')
    .select('*, items:order_items(*), payments(*)')
    .eq('id', id)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 404 })
  return NextResponse.json({ order: data })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await req.json()

  const { data, error } = await supabase
    .from('orders')
    .update({ ...body, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ order: data })
}
```

- [ ] **Étape 5 : Lancer les tests — doivent passer**
```bash
npx vitest run src/app/api/orders/
```

- [ ] **Étape 6 : Commit**
```bash
git add src/app/api/orders/
git commit -m "feat(api): orders POST (avec calcul totaux) + GET + PATCH"
```

---

## Tâche 5 : API Remises

**Fichiers :**
- Create: `src/app/api/orders/[id]/discounts/route.ts`

- [ ] **Étape 1 : Implémenter**

```typescript
// src/app/api/orders/[id]/discounts/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { z } from 'zod'

const discountSchema = z.object({
  type: z.enum(['percent', 'amount']),
  value: z.number().positive(),
})

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await req.json()
  const parsed = discountSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const { data: order } = await supabase
    .from('orders')
    .select('subtotal_ht, tax_5_5, tax_10, tax_20, total_ttc, status')
    .eq('id', id)
    .single()

  if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })
  if (order.status !== 'open') return NextResponse.json({ error: 'order_closed' }, { status: 400 })

  const { type, value } = parsed.data

  // Calcul selon l'ordre de cascade défini dans la spec :
  // 1. Remise sur sous-total HT
  // 2. TVA recalculée sur les montants remisés
  // 3. total_ttc = HT remisé + TVA
  const subtotalHt = order.subtotal_ht
  const discountAmount = type === 'percent'
    ? subtotalHt * (value / 100)
    : Math.min(value, subtotalHt)

  if (type === 'percent' && value > 100) {
    return NextResponse.json({ error: 'discount_value_invalid' }, { status: 400 })
  }
  if (type === 'amount' && value > order.total_ttc) {
    return NextResponse.json({ error: 'discount_value_invalid' }, { status: 400 })
  }

  const discountedHt = subtotalHt - discountAmount
  const ratio = discountedHt / subtotalHt  // facteur de réduction
  const newTax55 = order.tax_5_5 * ratio
  const newTax10 = order.tax_10 * ratio
  const newTax20 = order.tax_20 * ratio
  const newTotal = discountedHt + newTax55 + newTax10 + newTax20

  const { data, error } = await supabase
    .from('orders')
    .update({
      discount_type: type,
      discount_value: value,
      discount_amount: discountAmount,
      tax_5_5: newTax55,
      tax_10: newTax10,
      tax_20: newTax20,
      total_ttc: newTotal,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ order: data })
}
```

- [ ] **Étape 2 : Commit**
```bash
git add src/app/api/orders/[id]/discounts/
git commit -m "feat(api): remises avec cascade HT → TVA → TTC"
```

---

## Tâche 6 : API Paiement

**Fichiers :**
- Create: `src/app/api/orders/[id]/pay/route.ts`
- Create: `src/app/api/orders/[id]/pay/route.test.ts`

- [ ] **Étape 1 : Écrire les tests paiement**

```typescript
// src/app/api/orders/[id]/pay/route.test.ts
import { describe, it, expect, vi } from 'vitest'
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
import { createClient } from '@/lib/supabase/server'
import { POST } from './route'
import { NextRequest } from 'next/server'

describe('POST /api/orders/:id/pay', () => {
  it('enregistre un paiement CB complet', async () => {
    const mockSingle = vi.fn()
    mockSingle
      .mockResolvedValueOnce({ data: { id: 'u1' } })     // getUser
      .mockResolvedValueOnce({ data: { establishment_id: 'e1' } }) // profile
      .mockResolvedValueOnce({ data: { id: 'o1', status: 'open', total_ttc: 25.00, table_id: null } }) // order
      .mockResolvedValueOnce({ data: { id: 'o1', status: 'paid' }, error: null }) // update order
      .mockResolvedValueOnce({ data: { id: 'pay1' }, error: null }) // payment insert

    ;(createClient as ReturnType<typeof vi.fn>).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } } }) },
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        update: vi.fn().mockReturnThis(),
        insert: vi.fn().mockReturnThis(),
        single: mockSingle,
      }),
    })

    const req = new NextRequest('http://localhost/api/orders/o1/pay', {
      method: 'POST',
      body: JSON.stringify({ method: 'card', amount: 25.00 }),
    })
    const res = await POST(req, { params: Promise.resolve({ id: 'o1' }) })
    expect(res.status).toBe(200)
  })

  it('retourne 400 si montant insuffisant (split incomplet)', async () => {
    ;(createClient as ReturnType<typeof vi.fn>).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } } }) },
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn()
          .mockResolvedValueOnce({ data: { id: 'u1' } })
          .mockResolvedValueOnce({ data: { establishment_id: 'e1' } })
          .mockResolvedValueOnce({ data: { id: 'o1', status: 'open', total_ttc: 50.00, table_id: null } }),
      }),
    })

    const req = new NextRequest('http://localhost/api/orders/o1/pay', {
      method: 'POST',
      body: JSON.stringify({ method: 'card', amount: 30.00 }),  // insuffisant
    })
    const res = await POST(req, { params: Promise.resolve({ id: 'o1' }) })
    expect(res.status).toBe(400)
  })
})
```

- [ ] **Étape 2 : Lancer — doit échouer**
```bash
npx vitest run "src/app/api/orders/[id]/pay/route.test.ts"
```

- [ ] **Étape 3 : Implémenter**

```typescript
// src/app/api/orders/[id]/pay/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { z } from 'zod'

const paySchema = z.object({
  method: z.enum(['card', 'cash', 'split']),
  amount: z.number().positive(),
  cash_given: z.number().optional(),    // pour espèces
  split_payments: z.array(z.object({   // pour split
    method: z.enum(['card', 'cash']),
    amount: z.number().positive(),
    cash_given: z.number().optional(),
  })).optional(),
})

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await req.json()
  const parsed = paySchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const { data: order } = await supabase
    .from('orders')
    .select('total_ttc, status, table_id')
    .eq('id', id)
    .single()

  if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })
  if (order.status !== 'open' && order.status !== 'paying') {
    return NextResponse.json({ error: 'order_already_closed' }, { status: 409 })
  }

  const { method, amount, cash_given, split_payments } = parsed.data

  // Vérifier que le montant couvre la commande
  const totalPaid = method === 'split'
    ? (split_payments ?? []).reduce((s, p) => s + p.amount, 0)
    : amount

  if (Math.abs(totalPaid - order.total_ttc) > 0.01) {
    return NextResponse.json({ error: 'payment_amount_mismatch', total_ttc: order.total_ttc }, { status: 400 })
  }

  // Marquer la commande payée
  await supabase
    .from('orders')
    .update({ status: 'paid', updated_at: new Date().toISOString() })
    .eq('id', id)

  // Enregistrer le(s) paiement(s)
  const paymentsToInsert = method === 'split' && split_payments
    ? split_payments.map((p) => ({
        order_id: id,
        method: p.method,
        amount: p.amount,
        cash_given: p.cash_given ?? null,
        change_due: p.cash_given != null ? p.cash_given - p.amount : null,
      }))
    : [{
        order_id: id,
        method,
        amount,
        cash_given: cash_given ?? null,
        change_due: cash_given != null ? cash_given - amount : null,
      }]

  const { data: payments } = await supabase
    .from('payments')
    .insert(paymentsToInsert)
    .select()

  // Libérer la table
  if (order.table_id) {
    await supabase
      .from('restaurant_tables')
      .update({ status: 'free', current_order_id: null })
      .eq('id', order.table_id)
  }

  return NextResponse.json({ success: true, payments })
}
```

- [ ] **Étape 4 : Lancer les tests — doivent passer**
```bash
npx vitest run "src/app/api/orders/[id]/pay/"
```

- [ ] **Étape 5 : Commit**
```bash
git add "src/app/api/orders/[id]/pay/"
git commit -m "feat(api): paiement CB/espèces/split avec libération table"
```

---

## Tâche 7 : API Reçus (email + SMS)

**Fichiers :**
- Create: `src/app/api/receipts/[orderId]/email/route.ts`
- Create: `src/app/api/receipts/[orderId]/sms/route.ts`
- Create: `src/app/api/receipts/z-report/route.ts`

- [ ] **Étape 1 : Email reçu**

```typescript
// src/app/api/receipts/[orderId]/email/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { z } from 'zod'

const emailSchema = z.object({
  email: z.string().email(),
})

export async function POST(req: NextRequest, { params }: { params: Promise<{ orderId: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { orderId } = await params
  const body = await req.json()
  const parsed = emailSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'invalid_email' }, { status: 400 })

  // Vérifier que la commande est payée
  const { data: order } = await supabase
    .from('orders')
    .select('status')
    .eq('id', orderId)
    .single()

  if (!order) return NextResponse.json({ error: 'order_not_found' }, { status: 404 })
  if (order.status !== 'paid') return NextResponse.json({ error: 'order_not_paid' }, { status: 422 })

  // TODO V2 : intégration Resend ou Postmark
  // Pour V1, on simule le succès (front utilise window.print() + mailto: fallback)
  console.log(`[Reçu email] Commande ${orderId} → ${parsed.data.email}`)

  return NextResponse.json({ success: true, email: parsed.data.email })
}
```

- [ ] **Étape 2 : SMS reçu**

```typescript
// src/app/api/receipts/[orderId]/sms/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { z } from 'zod'

const smsSchema = z.object({
  phone: z.string().min(10).max(20),
})

export async function POST(req: NextRequest, { params }: { params: Promise<{ orderId: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { orderId } = await params
  const body = await req.json()
  const parsed = smsSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'invalid_phone' }, { status: 400 })

  const { data: order } = await supabase
    .from('orders').select('status').eq('id', orderId).single()

  if (!order) return NextResponse.json({ error: 'order_not_found' }, { status: 404 })
  if (order.status !== 'paid') return NextResponse.json({ error: 'order_not_paid' }, { status: 422 })

  // TODO V2 : intégration Twilio ou OVH SMS
  console.log(`[Reçu SMS] Commande ${orderId} → ${parsed.data.phone}`)

  return NextResponse.json({ success: true, phone: parsed.data.phone })
}
```

- [ ] **Étape 3 : Z-report**

```typescript
// src/app/api/receipts/z-report/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()

  if (profile?.role === 'caissier') {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  const { session_id } = await req.json()

  const { data: session } = await supabase
    .from('cash_sessions').select('*').eq('id', session_id).single()

  if (!session) return NextResponse.json({ error: 'session_not_found' }, { status: 404 })

  // Le rapport Z est généré côté client via window.print()
  // Cet endpoint confirme juste que l'impression peut commencer
  return NextResponse.json({ job_id: crypto.randomUUID(), session })
}
```

- [ ] **Étape 4 : Commit**
```bash
git add src/app/api/receipts/
git commit -m "feat(api): reçus email/SMS/Z-report endpoints"
```

---

## Tâche 8 : API Tables

**Fichiers :**
- Create: `src/app/api/tables/route.ts`
- Create: `src/app/api/tables/[id]/route.ts`

- [ ] **Étape 1 : Implémenter**

```typescript
// src/app/api/tables/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(_req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles').select('establishment_id').eq('id', user.id).single()

  const { data } = await supabase
    .from('restaurant_tables')
    .select('*, room:rooms(*)')
    .eq('establishment_id', profile?.establishment_id)
    .order('name')

  return NextResponse.json({ tables: data ?? [] })
}
```

```typescript
// src/app/api/tables/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await req.json()

  const { data, error } = await supabase
    .from('restaurant_tables')
    .update(body)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ table: data })
}
```

- [ ] **Étape 2 : Commit**
```bash
git add src/app/api/tables/
git commit -m "feat(api): tables GET + PATCH statut"
```

---

