# Système Caisse — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implémenter l'intégralité du système caisse (POS) : interface 3 colonnes, prise de commande, panier, 3 modes de paiement (CB/espèces/split), reçu (impression/email/SMS), plan de salle, remises, clôture de session — 10 écrans du mockup.

**Architecture:** La route `/caisse/pos` est un Client Component lourd (état POS local). Les données produits/tables sont chargées au montage via Server Component parent. Toutes les mutations (créer commande, ajouter ligne, payer) passent par les API routes Next.js avec isolation `establishment_id`. Les sessions caisse (`cash_sessions`) ouvrent et ferment la journée. La colonne ticket React est un état local optimiste — l'ordre n'est sauvegardé en DB qu'au moment du paiement.

**Tech Stack:** Next.js 16 App Router, Supabase (RLS), React (état local POS), Tailwind CSS v4, Sonner toasts, `window.print()` pour reçus thermiques.

**Prérequis :** Sprint 1 (Design System) et Sprint 2 (Dashboard Produits) complétés.

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

## Tâche 9 : POS Shell — Structure 3 colonnes

**Fichiers :**
- Modify: `src/app/caisse/pos/page.tsx`
- Create: `src/app/caisse/pos/_components/pos-shell.tsx`

- [ ] **Étape 1 : Server Component — charger les données init**

```typescript
// src/app/caisse/pos/page.tsx
import { createClient } from '@/lib/supabase/server'
import { PosShell } from './_components/pos-shell'
import { redirect } from 'next/navigation'

export default async function PosPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('establishment_id, role').eq('id', user.id).single()

  const [{ data: products }, { data: categories }, { data: session }, { data: tables }] = await Promise.all([
    supabase
      .from('products')
      .select('id, name, emoji, price, tva_rate, category_id, is_active')
      .eq('establishment_id', profile?.establishment_id)
      .eq('is_active', true)
      .is('deleted_at', null)
      .order('sort_order'),
    supabase
      .from('categories')
      .select('id, name, icon, color_hex, sort_order')
      .eq('establishment_id', profile?.establishment_id)
      .order('sort_order'),
    supabase
      .from('cash_sessions')
      .select('*')
      .eq('establishment_id', profile?.establishment_id)
      .eq('status', 'open')
      .order('opened_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('restaurant_tables')
      .select('*, room:rooms(id, name, sort_order)')
      .eq('establishment_id', profile?.establishment_id)
      .order('name'),
  ])

  return (
    <PosShell
      initialProducts={products ?? []}
      initialCategories={categories ?? []}
      initialSession={session}
      initialTables={tables ?? []}
      cashierId={user.id}
      cashierName={user.email?.split('@')[0] ?? 'Caissier'}
      userRole={profile?.role ?? 'caissier'}
    />
  )
}
```

- [ ] **Étape 2 : Client Component racine POS**

```typescript
// src/app/caisse/pos/_components/pos-shell.tsx
'use client'
import { useState } from 'react'
import { CategoriesPanel } from './categories-panel'
import { ProductsPanel } from './products-panel'
import { TicketPanel } from './ticket-panel'
import { PaymentModal } from './payment-modal'
import { ReceiptModal } from './receipt-modal'
import { DiscountModal } from './discount-modal'
import { FloorPlanModal } from './floor-plan-modal'
import { SessionModal } from './session-modal'
import type { LocalTicket, LocalItem, CashSession, Order } from '../types'

interface PosShellProps {
  initialProducts: Array<{
    id: string; name: string; emoji: string | null
    price: number; tva_rate: number; category_id: string | null; is_active: boolean
  }>
  initialCategories: Array<{ id: string; name: string; icon: string | null; color_hex: string }>
  initialSession: CashSession | null
  initialTables: Array<{ id: string; name: string; status: string; current_order_id: string | null }>
  cashierId: string
  cashierName: string
  userRole: string
}

const EMPTY_TICKET: LocalTicket = { items: [], discount: null, tableId: null, note: '' }

export function PosShell({
  initialProducts,
  initialCategories,
  initialSession,
  initialTables,
  cashierId,
  cashierName,
  userRole,
}: PosShellProps) {
  const [session, setSession] = useState<CashSession | null>(initialSession)
  const [ticket, setTicket] = useState<LocalTicket>(EMPTY_TICKET)
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null)
  const [completedOrder, setCompletedOrder] = useState<Order | null>(null)

  // Modals
  const [showPayment, setShowPayment] = useState(false)
  const [showReceipt, setShowReceipt] = useState(false)
  const [showDiscount, setShowDiscount] = useState(false)
  const [showFloorPlan, setShowFloorPlan] = useState(false)
  const [showSession, setShowSession] = useState(!session)

  const addItem = (product: typeof initialProducts[0]) => {
    setTicket((prev) => {
      const existing = prev.items.find((i) => i.productId === product.id)
      if (existing) {
        return {
          ...prev,
          items: prev.items.map((i) =>
            i.productId === product.id ? { ...i, quantity: i.quantity + 1 } : i
          ),
        }
      }
      const newItem: LocalItem = {
        productId: product.id,
        productName: product.name,
        emoji: product.emoji,
        unitPriceHt: product.price,
        tvaRate: product.tva_rate,
        quantity: 1,
      }
      return { ...prev, items: [...prev.items, newItem] }
    })
  }

  const updateQuantity = (productId: string, delta: number) => {
    setTicket((prev) => {
      const items = prev.items
        .map((i) => i.productId === productId ? { ...i, quantity: i.quantity + delta } : i)
        .filter((i) => i.quantity > 0)
      return { ...prev, items }
    })
  }

  const removeItem = (productId: string) => {
    setTicket((prev) => ({ ...prev, items: prev.items.filter((i) => i.productId !== productId) }))
  }

  const clearTicket = () => setTicket(EMPTY_TICKET)

  const filteredProducts = selectedCategoryId
    ? initialProducts.filter((p) => p.category_id === selectedCategoryId)
    : initialProducts

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Barre de navigation caisse */}
      <div
        className="flex items-center justify-between px-4 h-12 flex-shrink-0 border-b border-[var(--border)]"
        style={{
          position: 'absolute', top: 0, left: 0, right: 0,
          background: 'var(--bg-tabs)', zIndex: 10,
        }}
      >
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-lg bg-[var(--blue)] flex items-center justify-center text-xs font-bold text-white">A</div>
          <span className="text-sm font-semibold text-[var(--text1)]">Caisse</span>
          {session && (
            <span className="text-xs text-[var(--green)] bg-[var(--green-bg)] px-2 py-0.5 rounded-full">Session ouverte</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowFloorPlan(true)}
            className="h-8 px-3 rounded-lg text-xs text-[var(--text2)] hover:bg-[var(--surface2)] transition-colors"
          >
            🗺 Plan de salle
          </button>
          {userRole !== 'caissier' && (
            <a
              href="/dashboard/products"
              className="h-8 px-3 rounded-lg text-xs text-[var(--text2)] hover:bg-[var(--surface2)] transition-colors"
            >
              ← Dashboard admin
            </a>
          )}
          <button
            onClick={() => setShowSession(true)}
            className="h-8 px-3 rounded-lg text-xs font-medium text-[var(--text2)] border border-[var(--border)] hover:bg-[var(--surface2)] transition-colors"
          >
            {cashierName}
          </button>
        </div>
      </div>

      {/* 3 colonnes POS (offset topbar 48px) */}
      <div className="flex flex-1 overflow-hidden" style={{ marginTop: '48px' }}>
        {/* Colonne gauche — Catégories 200px */}
        <CategoriesPanel
          categories={initialCategories}
          selectedId={selectedCategoryId}
          onSelect={setSelectedCategoryId}
          allCount={initialProducts.length}
        />

        {/* Colonne centre — Produits flex */}
        <ProductsPanel
          products={filteredProducts}
          onAdd={addItem}
        />

        {/* Colonne droite — Ticket 360px */}
        <TicketPanel
          ticket={ticket}
          onUpdateQuantity={updateQuantity}
          onRemove={removeItem}
          onClear={clearTicket}
          onDiscount={() => setShowDiscount(true)}
          onPay={() => session ? setShowPayment(true) : setShowSession(true)}
          sessionOpen={!!session}
        />
      </div>

      {/* Modales */}
      {showPayment && (
        <PaymentModal
          ticket={ticket}
          session={session}
          cashierId={cashierId}
          onClose={() => setShowPayment(false)}
          onSuccess={(order) => {
            setCompletedOrder(order)
            setShowPayment(false)
            setShowReceipt(true)
            clearTicket()
          }}
        />
      )}

      {showReceipt && completedOrder && (
        <ReceiptModal
          order={completedOrder}
          onClose={() => { setShowReceipt(false); setCompletedOrder(null) }}
          onNewOrder={() => { setShowReceipt(false); setCompletedOrder(null) }}
        />
      )}

      {showDiscount && (
        <DiscountModal
          ticket={ticket}
          onApply={(discount) => {
            setTicket((prev) => ({ ...prev, discount }))
            setShowDiscount(false)
          }}
          onClose={() => setShowDiscount(false)}
        />
      )}

      {showFloorPlan && (
        <FloorPlanModal
          tables={initialTables}
          onSelectTable={(tableId) => {
            setTicket((prev) => ({ ...prev, tableId }))
            setShowFloorPlan(false)
          }}
          onClose={() => setShowFloorPlan(false)}
        />
      )}

      {showSession && (
        <SessionModal
          session={session}
          onOpen={(newSession) => { setSession(newSession); setShowSession(false) }}
          onClose={(closedSession) => { setSession(closedSession); setShowSession(false) }}
          onDismiss={() => setShowSession(false)}
          userRole={userRole}
        />
      )}
    </div>
  )
}
```

- [ ] **Étape 3 : Commit**
```bash
git add src/app/caisse/pos/
git commit -m "feat(caisse): POS shell 3 colonnes + topbar + navigation"
```

---

## Tâche 10 : Categories Panel & Products Panel

**Fichiers :**
- Create: `src/app/caisse/pos/_components/categories-panel.tsx`
- Create: `src/app/caisse/pos/_components/products-panel.tsx`

- [ ] **Étape 1 : CategoriesPanel**

```typescript
// src/app/caisse/pos/_components/categories-panel.tsx
'use client'

interface CategoriesPanelProps {
  categories: Array<{ id: string; name: string; icon: string | null; color_hex: string }>
  selectedId: string | null
  onSelect: (id: string | null) => void
  allCount: number
}

export function CategoriesPanel({ categories, selectedId, onSelect, allCount }: CategoriesPanelProps) {
  return (
    <div
      className="flex flex-col flex-shrink-0 overflow-y-auto border-r border-[var(--border)]"
      style={{ width: '200px', background: '#0c1a2e' }}
    >
      {/* Tout */}
      <button
        onClick={() => onSelect(null)}
        className={[
          'flex items-center gap-2.5 px-4 py-3.5 text-sm transition-colors border-b border-[var(--border)]',
          selectedId === null
            ? 'bg-[var(--blue-light)] text-[var(--text1)] border-l-2 border-[var(--blue)] pl-[14px]'
            : 'text-[var(--text2)] hover:bg-[var(--surface2)]',
        ].join(' ')}
      >
        <span>🍽️</span>
        <span className="font-medium">Tout</span>
        <span className="ml-auto text-xs text-[var(--text4)]">{allCount}</span>
      </button>

      {/* Catégories */}
      {categories.map((cat) => (
        <button
          key={cat.id}
          onClick={() => onSelect(cat.id)}
          className={[
            'flex items-center gap-2.5 px-4 py-3.5 text-sm transition-colors border-b border-[var(--border)]',
            selectedId === cat.id
              ? 'bg-[var(--blue-light)] text-[var(--text1)] border-l-2 border-[var(--blue)] pl-[14px]'
              : 'text-[var(--text2)] hover:bg-[var(--surface2)]',
          ].join(' ')}
        >
          {cat.icon && <span>{cat.icon}</span>}
          <span className="font-medium truncate">{cat.name}</span>
        </button>
      ))}
    </div>
  )
}
```

- [ ] **Étape 2 : ProductsPanel**

```typescript
// src/app/caisse/pos/_components/products-panel.tsx
'use client'

interface Product {
  id: string; name: string; emoji: string | null
  price: number; tva_rate: number; category_id: string | null; is_active: boolean
}

interface ProductsPanelProps {
  products: Product[]
  onAdd: (product: Product) => void
}

export function ProductsPanel({ products, onAdd }: ProductsPanelProps) {
  return (
    <div
      className="flex-1 overflow-y-auto p-4"
      style={{ background: 'var(--bg-caisse)' }}
    >
      {products.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-full text-center">
          <span className="text-4xl mb-3 opacity-30">🍽️</span>
          <p className="text-sm text-[var(--text4)]">Aucun produit dans cette catégorie</p>
        </div>
      ) : (
        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))' }}>
          {products.map((product) => (
            <button
              key={product.id}
              onClick={() => onAdd(product)}
              className="flex flex-col items-center justify-center gap-2 rounded-xl p-4 text-left transition-all hover:scale-[1.02] active:scale-95"
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                minHeight: '90px',
              }}
            >
              {product.emoji && (
                <span className="text-3xl">{product.emoji}</span>
              )}
              <span className="text-sm font-medium text-[var(--text1)] text-center leading-tight">
                {product.name}
              </span>
              <span className="text-sm font-semibold tabular-nums" style={{ color: 'var(--blue)' }}>
                {(product.price * (1 + product.tva_rate / 100)).toFixed(2).replace('.', ',')} €
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Étape 3 : Commit**
```bash
git add src/app/caisse/pos/_components/categories-panel.tsx src/app/caisse/pos/_components/products-panel.tsx
git commit -m "feat(caisse): colonnes catégories et produits"
```

---

## Tâche 11 : Ticket Panel

**Fichiers :**
- Create: `src/app/caisse/pos/_components/ticket-panel.tsx`

- [ ] **Étape 1 : Implémenter le ticket (colonne droite)**

```typescript
// src/app/caisse/pos/_components/ticket-panel.tsx
'use client'
import type { LocalTicket } from '../types'

interface TicketPanelProps {
  ticket: LocalTicket
  onUpdateQuantity: (productId: string, delta: number) => void
  onRemove: (productId: string) => void
  onClear: () => void
  onDiscount: () => void
  onPay: () => void
  sessionOpen: boolean
}

function computeTicketTotals(ticket: LocalTicket) {
  let subtotalHt = 0
  let totalTax = 0

  for (const item of ticket.items) {
    const lineHt = item.unitPriceHt * item.quantity
    const lineTax = lineHt * (item.tvaRate / 100)
    subtotalHt += lineHt
    totalTax += lineTax
  }

  let discountAmount = 0
  if (ticket.discount) {
    discountAmount = ticket.discount.type === 'percent'
      ? subtotalHt * (ticket.discount.value / 100)
      : ticket.discount.value
  }

  const discountedHt = subtotalHt - discountAmount
  const ratio = subtotalHt > 0 ? discountedHt / subtotalHt : 1
  const adjustedTax = totalTax * ratio
  const total = discountedHt + adjustedTax

  return { subtotalHt, discountAmount, total }
}

export function TicketPanel({
  ticket,
  onUpdateQuantity,
  onRemove,
  onClear,
  onDiscount,
  onPay,
  sessionOpen,
}: TicketPanelProps) {
  const { subtotalHt, discountAmount, total } = computeTicketTotals(ticket)
  const isEmpty = ticket.items.length === 0

  return (
    <div
      className="flex flex-col flex-shrink-0 border-l border-[var(--border)]"
      style={{ width: '360px', background: 'var(--surface)' }}
    >
      {/* Header ticket */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
        <span className="text-sm font-semibold text-[var(--text1)]">
          Ticket {ticket.tableId ? `· Table` : ''}
        </span>
        {!isEmpty && (
          <button
            onClick={onClear}
            className="text-xs text-[var(--text4)] hover:text-[var(--red)] transition-colors"
          >
            Effacer
          </button>
        )}
      </div>

      {/* Liste articles */}
      <div className="flex-1 overflow-y-auto">
        {isEmpty ? (
          <div className="flex flex-col items-center justify-center h-full text-center py-12">
            <span className="text-4xl mb-3 opacity-20">🛒</span>
            <p className="text-sm text-[var(--text4)]">Sélectionnez des produits</p>
          </div>
        ) : (
          <div className="divide-y divide-[var(--border)]">
            {ticket.items.map((item) => {
              const lineTtc = item.unitPriceHt * item.quantity * (1 + item.tvaRate / 100)
              return (
                <div key={item.productId} className="flex items-center gap-3 px-4 py-3">
                  {item.emoji && <span className="text-lg flex-shrink-0">{item.emoji}</span>}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[var(--text1)] truncate">{item.productName}</p>
                    <p className="text-xs text-[var(--text4)]">
                      {item.unitPriceHt.toFixed(2).replace('.', ',')} € HT · TVA {item.tvaRate}%
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <button
                      onClick={() => onUpdateQuantity(item.productId, -1)}
                      className="w-6 h-6 rounded flex items-center justify-center text-sm text-[var(--text3)] hover:bg-[var(--surface2)] transition-colors"
                    >
                      −
                    </button>
                    <span className="w-6 text-center text-sm font-semibold text-[var(--text1)] tabular-nums">
                      {item.quantity}
                    </span>
                    <button
                      onClick={() => onUpdateQuantity(item.productId, 1)}
                      className="w-6 h-6 rounded flex items-center justify-center text-sm text-[var(--text3)] hover:bg-[var(--surface2)] transition-colors"
                    >
                      +
                    </button>
                  </div>
                  <div className="w-16 text-right flex-shrink-0">
                    <span className="text-sm font-semibold text-[var(--text1)] tabular-nums">
                      {lineTtc.toFixed(2).replace('.', ',')} €
                    </span>
                  </div>
                  <button
                    onClick={() => onRemove(item.productId)}
                    className="w-6 h-6 rounded flex items-center justify-center text-xs text-[var(--text4)] hover:text-[var(--red)] hover:bg-[var(--red-bg)] transition-colors"
                  >
                    ×
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Totaux + Actions */}
      <div className="border-t border-[var(--border)] p-4 space-y-3">
        {!isEmpty && (
          <>
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between text-[var(--text3)]">
                <span>Sous-total HT</span>
                <span className="tabular-nums">{subtotalHt.toFixed(2).replace('.', ',')} €</span>
              </div>
              {discountAmount > 0 && (
                <div className="flex justify-between text-[var(--green)]">
                  <span>Remise {ticket.discount?.type === 'percent' ? `−${ticket.discount.value}%` : ''}</span>
                  <span className="tabular-nums">−{discountAmount.toFixed(2).replace('.', ',')} €</span>
                </div>
              )}
              <div className="flex justify-between text-[var(--text1)] font-bold text-base pt-1 border-t border-[var(--border)]">
                <span>Total TTC</span>
                <span className="tabular-nums">{total.toFixed(2).replace('.', ',')} €</span>
              </div>
            </div>

            <button
              onClick={onDiscount}
              className="w-full h-9 rounded-lg text-sm font-medium text-[var(--text2)] border border-[var(--border)] hover:bg-[var(--surface2)] transition-colors"
            >
              Appliquer une remise
            </button>
          </>
        )}

        <button
          onClick={onPay}
          disabled={isEmpty}
          className="w-full h-12 rounded-xl text-base font-bold text-white transition-all disabled:opacity-30 hover:opacity-90"
          style={{ background: isEmpty ? 'var(--border)' : 'var(--green)' }}
        >
          {!sessionOpen ? 'Ouvrir la session' : isEmpty ? 'Ticket vide' : `Encaisser ${total.toFixed(2).replace('.', ',')} €`}
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Étape 2 : Commit**
```bash
git add src/app/caisse/pos/_components/ticket-panel.tsx
git commit -m "feat(caisse): TicketPanel avec quantités, totaux et bouton encaisser"
```

---

## Tâche 12 : Modal Paiement (CB / Espèces / Split)

**Fichiers :**
- Create: `src/app/caisse/pos/_components/payment-modal.tsx`

- [ ] **Étape 1 : Implémenter**

```typescript
// src/app/caisse/pos/_components/payment-modal.tsx
'use client'
import { useState } from 'react'
import { toast } from 'sonner'
import type { LocalTicket, CashSession, Order, PaymentMode } from '../types'

interface PaymentModalProps {
  ticket: LocalTicket
  session: CashSession | null
  cashierId: string
  onClose: () => void
  onSuccess: (order: Order) => void
}

function computeTotal(ticket: LocalTicket): number {
  let subtotalHt = 0
  let totalTax = 0
  for (const item of ticket.items) {
    const lineHt = item.unitPriceHt * item.quantity
    subtotalHt += lineHt
    totalTax += lineHt * (item.tvaRate / 100)
  }
  let discount = 0
  if (ticket.discount) {
    discount = ticket.discount.type === 'percent'
      ? subtotalHt * (ticket.discount.value / 100)
      : ticket.discount.value
  }
  const discountedHt = subtotalHt - discount
  const ratio = subtotalHt > 0 ? discountedHt / subtotalHt : 1
  return discountedHt + totalTax * ratio
}

export function PaymentModal({ ticket, session, cashierId, onClose, onSuccess }: PaymentModalProps) {
  const total = computeTotal(ticket)
  const [mode, setMode] = useState<PaymentMode>('card')
  const [cashGiven, setCashGiven] = useState('')
  const [splitCard, setSplitCard] = useState('')
  const [isPaying, setIsPaying] = useState(false)

  const cashChange = mode === 'cash' && cashGiven
    ? parseFloat(cashGiven.replace(',', '.')) - total
    : 0

  const handlePay = async () => {
    setIsPaying(true)
    try {
      // 1. Créer la commande
      const orderRes = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: session?.id,
          table_id: ticket.tableId,
          items: ticket.items.map((i) => ({
            product_id: i.productId,
            product_name: i.productName,
            emoji: i.emoji,
            unit_price: i.unitPriceHt,
            tva_rate: i.tvaRate,
            quantity: i.quantity,
          })),
        }),
      })

      if (!orderRes.ok) throw new Error('Order creation failed')
      const { order } = await orderRes.json()

      // 2. Appliquer remise si besoin
      if (ticket.discount) {
        await fetch(`/api/orders/${order.id}/discounts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(ticket.discount),
        })
      }

      // 3. Payer
      let payBody: Record<string, unknown>
      if (mode === 'card') {
        payBody = { method: 'card', amount: total }
      } else if (mode === 'cash') {
        payBody = { method: 'cash', amount: total, cash_given: parseFloat(cashGiven.replace(',', '.')) }
      } else {
        const cardAmount = parseFloat(splitCard.replace(',', '.'))
        const cashAmount = total - cardAmount
        payBody = {
          method: 'split',
          amount: total,
          split_payments: [
            { method: 'card', amount: cardAmount },
            { method: 'cash', amount: cashAmount, cash_given: cashAmount },
          ],
        }
      }

      const payRes = await fetch(`/api/orders/${order.id}/pay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payBody),
      })

      if (!payRes.ok) throw new Error('Payment failed')
      onSuccess({ ...order, total_ttc: total })
    } catch (e) {
      toast.error('Erreur lors du paiement')
    } finally {
      setIsPaying(false)
    }
  }

  const canPay =
    mode === 'card' ||
    (mode === 'cash' && parseFloat(cashGiven.replace(',', '.') || '0') >= total) ||
    (mode === 'split' && parseFloat(splitCard.replace(',', '.') || '0') > 0 && parseFloat(splitCard.replace(',', '.') || '0') < total)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div
        className="relative w-full max-w-md rounded-2xl p-6 shadow-2xl"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-bold text-[var(--text1)]">Encaissement</h2>
          <button onClick={onClose} className="text-[var(--text4)] hover:text-[var(--text2)] text-xl">×</button>
        </div>

        {/* Total */}
        <div className="text-center mb-6">
          <div className="text-4xl font-bold text-[var(--text1)] tabular-nums">
            {total.toFixed(2).replace('.', ',')} €
          </div>
          <p className="text-sm text-[var(--text3)] mt-1">Total TTC à encaisser</p>
        </div>

        {/* Mode de paiement */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          {(['card', 'cash', 'split'] as PaymentMode[]).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={[
                'flex flex-col items-center gap-2 py-4 rounded-xl border-2 text-sm font-semibold transition-all',
                mode === m
                  ? 'border-[var(--blue)] bg-[var(--blue-light)] text-[var(--text1)]'
                  : 'border-[var(--border)] text-[var(--text3)] hover:border-[var(--border-active)]',
              ].join(' ')}
            >
              <span className="text-2xl">{m === 'card' ? '💳' : m === 'cash' ? '💶' : '⚡'}</span>
              <span>{m === 'card' ? 'CB' : m === 'cash' ? 'Espèces' : 'Split'}</span>
            </button>
          ))}
        </div>

        {/* Champs contextuels */}
        {mode === 'cash' && (
          <div className="mb-6">
            <label className="text-xs text-[var(--text3)] uppercase tracking-wider mb-2 block">
              Somme remise par le client
            </label>
            <input
              type="number"
              step="0.01"
              value={cashGiven}
              onChange={(e) => setCashGiven(e.target.value)}
              placeholder="Ex: 50,00"
              className="w-full h-12 px-4 rounded-xl text-lg text-center bg-[var(--surface2)] border border-[var(--border)] text-[var(--text1)] focus:outline-none focus:border-[var(--blue)]"
              autoFocus
            />
            {cashChange > 0 && (
              <div className="mt-3 text-center">
                <span className="text-2xl font-bold text-[var(--green)]">
                  Rendu : {cashChange.toFixed(2).replace('.', ',')} €
                </span>
              </div>
            )}
          </div>
        )}

        {mode === 'split' && (
          <div className="mb-6">
            <label className="text-xs text-[var(--text3)] uppercase tracking-wider mb-2 block">
              Montant CB
            </label>
            <input
              type="number"
              step="0.01"
              value={splitCard}
              onChange={(e) => setSplitCard(e.target.value)}
              placeholder="0,00"
              className="w-full h-12 px-4 rounded-xl text-lg text-center bg-[var(--surface2)] border border-[var(--border)] text-[var(--text1)] focus:outline-none focus:border-[var(--blue)]"
              autoFocus
            />
            {splitCard && parseFloat(splitCard.replace(',', '.')) < total && (
              <p className="mt-2 text-center text-sm text-[var(--text3)]">
                Espèces : {(total - parseFloat(splitCard.replace(',', '.'))).toFixed(2).replace('.', ',')} €
              </p>
            )}
          </div>
        )}

        {/* Ticket Resto désactivé V1 */}
        <p className="text-xs text-center text-[var(--text4)] mb-4">
          Ticket Restaurant — disponible prochainement
        </p>

        <button
          onClick={handlePay}
          disabled={!canPay || isPaying}
          className="w-full h-14 rounded-xl text-lg font-bold text-white transition-all disabled:opacity-40 hover:opacity-90"
          style={{ background: 'var(--green)' }}
        >
          {isPaying ? 'Traitement…' : '✓ Valider le paiement'}
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Étape 2 : Commit**
```bash
git add src/app/caisse/pos/_components/payment-modal.tsx
git commit -m "feat(caisse): modal paiement CB/espèces/split"
```

---

## Tâche 13 : Modal Reçu + Print CSS

**Fichiers :**
- Create: `src/app/caisse/pos/_components/receipt-modal.tsx`
- Create: `src/app/caisse/pos/_components/print-receipt.css`

- [ ] **Étape 1 : CSS print thermique**

```css
/* src/app/caisse/pos/_components/print-receipt.css */
@media print {
  body * { visibility: hidden; }
  .receipt-printable,
  .receipt-printable * { visibility: visible; }

  .receipt-printable {
    position: fixed;
    top: 0;
    left: 0;
    width: 80mm;  /* Largeur thermique standard */
    font-family: 'Courier New', monospace;
    font-size: 11px;
    color: #000;
    background: #fff;
    padding: 8mm;
  }

  .receipt-divider { border-top: 1px dashed #000; margin: 4px 0; }
  .receipt-center { text-align: center; }
  .receipt-bold { font-weight: bold; }
  .receipt-row { display: flex; justify-content: space-between; }
}
```

- [ ] **Étape 2 : Modal reçu**

```typescript
// src/app/caisse/pos/_components/receipt-modal.tsx
'use client'
import { useState } from 'react'
import { toast } from 'sonner'
import './print-receipt.css'
import type { Order } from '../types'

interface ReceiptModalProps {
  order: Order
  onClose: () => void
  onNewOrder: () => void
}

export function ReceiptModal({ order, onClose, onNewOrder }: ReceiptModalProps) {
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [sending, setSending] = useState<'email' | 'sms' | null>(null)

  const handlePrint = () => window.print()

  const handleEmail = async () => {
    if (!email) return
    setSending('email')
    try {
      const res = await fetch(`/api/receipts/${order.id}/email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      if (!res.ok) throw new Error()
      toast.success(`Reçu envoyé à ${email}`)
      setEmail('')
    } catch {
      toast.error('Erreur envoi email')
    } finally {
      setSending(null)
    }
  }

  const handleSms = async () => {
    if (!phone) return
    setSending('sms')
    try {
      const res = await fetch(`/api/receipts/${order.id}/sms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      })
      if (!res.ok) throw new Error()
      toast.success(`Reçu envoyé par SMS`)
      setPhone('')
    } catch {
      toast.error('Erreur envoi SMS')
    } finally {
      setSending(null)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70" />
      <div
        className="relative w-full max-w-md rounded-2xl overflow-hidden shadow-2xl"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
      >
        {/* Reçu printable (caché à l'écran, visible à l'impression) */}
        <div className="receipt-printable hidden print:block">
          <div className="receipt-center receipt-bold" style={{ fontSize: '14px' }}>ALLOFLOW</div>
          <div className="receipt-center" style={{ marginBottom: '8px' }}>
            {new Date(order.created_at).toLocaleDateString('fr-FR', {
              day: '2-digit', month: '2-digit', year: 'numeric',
              hour: '2-digit', minute: '2-digit',
            })}
          </div>
          <div className="receipt-divider" />
          {order.items?.map((item) => (
            <div key={item.id} className="receipt-row">
              <span>{item.quantity}× {item.product_name}</span>
              <span>{item.line_total.toFixed(2)} €</span>
            </div>
          ))}
          <div className="receipt-divider" />
          {order.discount_amount > 0 && (
            <div className="receipt-row">
              <span>Remise</span>
              <span>-{order.discount_amount.toFixed(2)} €</span>
            </div>
          )}
          <div className="receipt-row receipt-bold" style={{ fontSize: '13px' }}>
            <span>TOTAL TTC</span>
            <span>{order.total_ttc.toFixed(2)} €</span>
          </div>
          <div className="receipt-divider" />
          <div className="receipt-center" style={{ marginTop: '8px', fontSize: '10px' }}>
            Merci de votre visite !
          </div>
        </div>

        {/* Interface écran */}
        <div className="p-6 print:hidden">
          <div className="text-center mb-6">
            <div className="w-14 h-14 rounded-full bg-[var(--green-bg)] flex items-center justify-center text-3xl mx-auto mb-3">
              ✓
            </div>
            <h2 className="text-lg font-bold text-[var(--text1)]">Paiement validé</h2>
            <p className="text-2xl font-bold text-[var(--green)] mt-1">
              {order.total_ttc.toFixed(2).replace('.', ',')} €
            </p>
          </div>

          {/* Actions reçu */}
          <div className="space-y-3 mb-6">
            <button
              onClick={handlePrint}
              className="w-full h-10 rounded-lg text-sm font-medium border border-[var(--border)] text-[var(--text2)] hover:bg-[var(--surface2)] transition-colors flex items-center justify-center gap-2"
            >
              🖨 Imprimer le reçu
            </button>

            <div className="flex gap-2">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email@client.fr"
                className="flex-1 h-10 px-3 rounded-lg text-sm bg-[var(--surface2)] border border-[var(--border)] text-[var(--text1)] placeholder:text-[var(--text4)] focus:outline-none focus:border-[var(--blue)]"
              />
              <button
                onClick={handleEmail}
                disabled={!email || sending === 'email'}
                className="h-10 px-4 rounded-lg text-sm font-medium bg-[var(--blue-light)] text-[var(--blue)] border border-[var(--blue)] hover:bg-[var(--blue)] hover:text-white transition-colors disabled:opacity-40"
              >
                {sending === 'email' ? '…' : '✉ Email'}
              </button>
            </div>

            <div className="flex gap-2">
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+33 6 12 34 56 78"
                className="flex-1 h-10 px-3 rounded-lg text-sm bg-[var(--surface2)] border border-[var(--border)] text-[var(--text1)] placeholder:text-[var(--text4)] focus:outline-none focus:border-[var(--blue)]"
              />
              <button
                onClick={handleSms}
                disabled={!phone || sending === 'sms'}
                className="h-10 px-4 rounded-lg text-sm font-medium bg-[var(--amber-bg)] text-[var(--amber)] border border-[var(--amber)] hover:bg-[var(--amber)] hover:text-white transition-colors disabled:opacity-40"
              >
                {sending === 'sms' ? '…' : '💬 SMS'}
              </button>
            </div>
          </div>

          <button
            onClick={onNewOrder}
            className="w-full h-12 rounded-xl text-base font-bold text-white hover:opacity-90 transition-colors"
            style={{ background: 'var(--blue)' }}
          >
            Nouvelle commande →
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Étape 3 : Commit**
```bash
git add src/app/caisse/pos/_components/receipt-modal.tsx src/app/caisse/pos/_components/print-receipt.css
git commit -m "feat(caisse): modal reçu + impression thermique + email + SMS"
```

---

## Tâche 14 : Modal Remise

**Fichiers :**
- Create: `src/app/caisse/pos/_components/discount-modal.tsx`

- [ ] **Étape 1 : Implémenter**

```typescript
// src/app/caisse/pos/_components/discount-modal.tsx
'use client'
import { useState } from 'react'
import type { LocalTicket } from '../types'

interface DiscountModalProps {
  ticket: LocalTicket
  onApply: (discount: { type: 'percent' | 'amount'; value: number }) => void
  onClose: () => void
}

const QUICK_DISCOUNTS = [5, 10, 15, 20]

export function DiscountModal({ ticket, onApply, onClose }: DiscountModalProps) {
  const [type, setType] = useState<'percent' | 'amount'>('percent')
  const [value, setValue] = useState('')

  const handleApply = () => {
    const v = parseFloat(value.replace(',', '.'))
    if (!v || v <= 0) return
    onApply({ type, value: v })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div
        className="relative w-full max-w-sm rounded-2xl p-6 shadow-2xl"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
      >
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-base font-semibold text-[var(--text1)]">Appliquer une remise</h3>
          <button onClick={onClose} className="text-[var(--text4)] hover:text-[var(--text2)] text-xl">×</button>
        </div>

        {/* Type */}
        <div className="flex gap-2 mb-4">
          {(['percent', 'amount'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setType(t)}
              className={[
                'flex-1 h-10 rounded-lg text-sm font-medium border transition-colors',
                type === t
                  ? 'border-[var(--blue)] bg-[var(--blue-light)] text-[var(--text1)]'
                  : 'border-[var(--border)] text-[var(--text3)] hover:bg-[var(--surface2)]',
              ].join(' ')}
            >
              {t === 'percent' ? 'En %' : 'En €'}
            </button>
          ))}
        </div>

        {/* Raccourcis % */}
        {type === 'percent' && (
          <div className="flex gap-2 mb-4">
            {QUICK_DISCOUNTS.map((pct) => (
              <button
                key={pct}
                onClick={() => setValue(String(pct))}
                className="flex-1 h-9 rounded-lg text-sm font-medium border border-[var(--border)] text-[var(--text2)] hover:bg-[var(--surface2)] hover:border-[var(--blue)] transition-colors"
              >
                {pct}%
              </button>
            ))}
          </div>
        )}

        {/* Input valeur */}
        <input
          type="number"
          step={type === 'percent' ? '1' : '0.01'}
          min="0"
          max={type === 'percent' ? '100' : undefined}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={type === 'percent' ? 'Ex: 10' : 'Ex: 5,00'}
          className="w-full h-12 px-4 rounded-xl text-lg text-center bg-[var(--surface2)] border border-[var(--border)] text-[var(--text1)] focus:outline-none focus:border-[var(--blue)] mb-4"
          autoFocus
        />

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 h-10 rounded-lg text-sm border border-[var(--border)] text-[var(--text2)] hover:bg-[var(--surface2)]"
          >
            Annuler
          </button>
          <button
            onClick={handleApply}
            disabled={!value || parseFloat(value) <= 0}
            className="flex-1 h-10 rounded-lg text-sm font-semibold text-white disabled:opacity-40 hover:opacity-90"
            style={{ background: 'var(--blue)' }}
          >
            Appliquer
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Étape 2 : Commit**
```bash
git add src/app/caisse/pos/_components/discount-modal.tsx
git commit -m "feat(caisse): modal remise % et €"
```

---

## Tâche 15 : Modal Plan de Salle

**Fichiers :**
- Create: `src/app/caisse/pos/_components/floor-plan-modal.tsx`

- [ ] **Étape 1 : Implémenter**

```typescript
// src/app/caisse/pos/_components/floor-plan-modal.tsx
'use client'

interface Table {
  id: string; name: string; seats: number
  status: 'free' | 'occupied' | 'reserved'
  current_order_id: string | null
}

interface FloorPlanModalProps {
  tables: Table[]
  onSelectTable: (tableId: string) => void
  onClose: () => void
}

export function FloorPlanModal({ tables, onSelectTable, onClose }: FloorPlanModalProps) {
  const STATUS_STYLES = {
    free: { bg: 'var(--green-bg)', border: 'var(--green)', text: 'var(--green)', label: 'Libre' },
    occupied: { bg: 'var(--amber-bg)', border: 'var(--amber)', text: 'var(--amber)', label: 'Occupée' },
    reserved: { bg: 'var(--blue-light)', border: 'var(--blue)', text: 'var(--blue)', label: 'Réservée' },
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div
        className="relative w-full max-w-2xl rounded-2xl p-6 shadow-2xl"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)', maxHeight: '80vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
      >
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-base font-semibold text-[var(--text1)]">Plan de salle</h3>
          <button onClick={onClose} className="text-[var(--text4)] hover:text-[var(--text2)] text-xl">×</button>
        </div>

        {/* Légende */}
        <div className="flex gap-4 mb-4 flex-shrink-0">
          {Object.entries(STATUS_STYLES).map(([status, style]) => (
            <div key={status} className="flex items-center gap-1.5 text-xs text-[var(--text3)]">
              <div className="w-3 h-3 rounded-sm" style={{ background: style.bg, border: `1px solid ${style.border}` }} />
              {style.label}
            </div>
          ))}
        </div>

        {/* Grille tables */}
        <div className="flex-1 overflow-y-auto">
          {tables.length === 0 ? (
            <div className="text-center py-12">
              <span className="text-4xl mb-3 block opacity-30">🪑</span>
              <p className="text-sm text-[var(--text4)]">Aucune table configurée</p>
            </div>
          ) : (
            <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))' }}>
              {tables.map((table) => {
                const style = STATUS_STYLES[table.status]
                const isFree = table.status === 'free'
                return (
                  <button
                    key={table.id}
                    onClick={() => isFree && onSelectTable(table.id)}
                    disabled={!isFree}
                    className="flex flex-col items-center justify-center gap-1.5 p-4 rounded-xl border-2 transition-all disabled:cursor-not-allowed"
                    style={{
                      background: style.bg,
                      borderColor: style.border,
                      opacity: isFree ? 1 : 0.7,
                    }}
                  >
                    <span className="text-2xl">🪑</span>
                    <span className="text-sm font-bold" style={{ color: style.text }}>{table.name}</span>
                    <span className="text-xs" style={{ color: style.text }}>{table.seats} pers.</span>
                    <span className="text-xs font-medium" style={{ color: style.text }}>{style.label}</span>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Étape 2 : Commit**
```bash
git add src/app/caisse/pos/_components/floor-plan-modal.tsx
git commit -m "feat(caisse): modal plan de salle avec statut tables"
```

---

## Tâche 16 : Modal Session (ouverture / clôture)

**Fichiers :**
- Create: `src/app/caisse/pos/_components/session-modal.tsx`

- [ ] **Étape 1 : Implémenter**

```typescript
// src/app/caisse/pos/_components/session-modal.tsx
'use client'
import { useState } from 'react'
import { toast } from 'sonner'
import type { CashSession } from '../types'

interface SessionModalProps {
  session: CashSession | null
  onOpen: (session: CashSession) => void
  onClose: (session: CashSession) => void
  onDismiss: () => void
  userRole: string
}

export function SessionModal({ session, onOpen, onClose, onDismiss, userRole }: SessionModalProps) {
  const [openingFloat, setOpeningFloat] = useState('')
  const [closingFloat, setClosingFloat] = useState('')
  const [loading, setLoading] = useState(false)
  const isManager = userRole !== 'caissier'
  const hasOpenSession = !!session

  const handleOpen = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/cash-sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ opening_float: parseFloat(openingFloat || '0') }),
      })
      if (!res.ok) throw new Error()
      const { session: newSession } = await res.json()
      toast.success('Session ouverte')
      onOpen(newSession)
    } catch {
      toast.error('Erreur ouverture session')
    } finally {
      setLoading(false)
    }
  }

  const handleClose = async () => {
    if (!session) return
    setLoading(true)
    try {
      const res = await fetch(`/api/cash-sessions/${session.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ closing_float: parseFloat(closingFloat || '0') }),
      })
      if (!res.ok) throw new Error()
      const { session: closedSession } = await res.json()
      toast.success('Session clôturée')
      // Déclencher impression rapport Z
      await fetch('/api/receipts/z-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: session.id }),
      })
      window.print()
      onClose(closedSession)
    } catch {
      toast.error('Erreur clôture session')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/80" onClick={onDismiss} />
      <div
        className="relative w-full max-w-sm rounded-2xl p-6 shadow-2xl"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
      >
        {!hasOpenSession ? (
          <>
            <h3 className="text-base font-semibold text-[var(--text1)] mb-1">Ouvrir la caisse</h3>
            <p className="text-sm text-[var(--text3)] mb-5">
              Démarrez une nouvelle session de caisse pour commencer à encaisser.
            </p>
            {isManager && (
              <div className="mb-5">
                <label className="text-xs text-[var(--text3)] uppercase tracking-wider mb-2 block">
                  Fond de caisse initial (€)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={openingFloat}
                  onChange={(e) => setOpeningFloat(e.target.value)}
                  placeholder="0,00"
                  className="w-full h-10 px-3 rounded-lg text-sm bg-[var(--surface2)] border border-[var(--border)] text-[var(--text1)] focus:outline-none focus:border-[var(--blue)]"
                />
              </div>
            )}
            <div className="flex gap-3">
              <button
                onClick={onDismiss}
                className="flex-1 h-10 rounded-lg text-sm border border-[var(--border)] text-[var(--text2)] hover:bg-[var(--surface2)]"
              >
                Annuler
              </button>
              <button
                onClick={handleOpen}
                disabled={loading}
                className="flex-1 h-10 rounded-lg text-sm font-semibold text-white disabled:opacity-50 hover:opacity-90"
                style={{ background: 'var(--green)' }}
              >
                {loading ? 'Ouverture…' : 'Ouvrir la session'}
              </button>
            </div>
          </>
        ) : (
          <>
            <h3 className="text-base font-semibold text-[var(--text1)] mb-1">Session en cours</h3>
            <p className="text-sm text-[var(--text3)] mb-5">
              Ouverte le {new Date(session.opened_at).toLocaleDateString('fr-FR', {
                day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit',
              })}
            </p>
            {isManager && (
              <>
                <div className="mb-5">
                  <label className="text-xs text-[var(--text3)] uppercase tracking-wider mb-2 block">
                    Fond de caisse de clôture (€)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={closingFloat}
                    onChange={(e) => setClosingFloat(e.target.value)}
                    placeholder="0,00"
                    className="w-full h-10 px-3 rounded-lg text-sm bg-[var(--surface2)] border border-[var(--border)] text-[var(--text1)] focus:outline-none focus:border-[var(--blue)]"
                  />
                </div>
                <button
                  onClick={handleClose}
                  disabled={loading}
                  className="w-full h-10 rounded-lg text-sm font-semibold text-white disabled:opacity-50 hover:opacity-90 mb-3"
                  style={{ background: 'var(--amber)' }}
                >
                  {loading ? 'Clôture…' : 'Clôturer et imprimer le rapport Z'}
                </button>
              </>
            )}
            <button
              onClick={onDismiss}
              className="w-full h-10 rounded-lg text-sm border border-[var(--border)] text-[var(--text2)] hover:bg-[var(--surface2)]"
            >
              Fermer
            </button>
          </>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Étape 2 : Commit**
```bash
git add src/app/caisse/pos/_components/session-modal.tsx
git commit -m "feat(caisse): modal session ouverture/clôture avec rapport Z"
```

---

## Tâche 17 : Vérification finale

- [ ] **Lancer tous les tests**
```bash
npx vitest run
```
Expected: tous verts.

- [ ] **Test visuel — 10 écrans du mockup :**

| Écran | Vérification |
|-------|-------------|
| Caisse vide (S1) | Ticket vide, bouton "Ouvrir la session" |
| Ouverture session (S2 splash) | Modal session s'affiche au premier accès |
| POS principal (S3) | 3 colonnes, produits visibles, catégories |
| Panier rempli (S4) | Ajout produits, quantités +/-, total TTC |
| Mode paiement (S5) | Modal paiement 3 modes |
| Espèces (S6) | Rendu monnaie calculé |
| CB (S7) | Centré, plein écran |
| Split (S8) | Input CB + calcul espèces |
| Reçu (S9) | Modal reçu centré, impression, email, SMS |
| Plan de salle | Modal tables avec statuts colorés |
| Remise | Modal remise % et € |
| Clôture | Modal session, fond clôture, rapport Z |

- [ ] **Commit final sprint 3**
```bash
git add -A
git commit -m "feat(caisse): sprint 3 complet — système caisse POS intégral"
```

---

## Résumé Sprint 3

| Feature | Status |
|---------|--------|
| Migration DB caisse | ✅ |
| API cash-sessions | ✅ |
| API orders (create + pay) | ✅ |
| API remises | ✅ |
| API reçus (email/SMS/Z-report) | ✅ |
| API tables | ✅ |
| POS shell 3 colonnes | ✅ |
| Colonne catégories | ✅ |
| Colonne produits | ✅ |
| Ticket panel | ✅ |
| Modal paiement CB/espèces/split | ✅ |
| Modal reçu + print thermique | ✅ |
| Modal remise | ✅ |
| Modal plan de salle | ✅ |
| Modal session (ouv./clôt.) | ✅ |
