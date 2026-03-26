# Sprint 3b — Caisse UI (Composants POS)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implémenter l'interface POS complète : layout 3 colonnes, sélection produits, ticket de commande, modales paiement/reçu/remise/plan de salle/session.

**Architecture:** `PosShell` est un Client Component racine gérant l'état POS local (ticket courant, session active). Les 3 colonnes (200px catégories / flex produits / 360px ticket) sont des composants isolés communiquant via props/callbacks. Les modales (paiement, reçu, remise, plan de salle, session) sont montées dans PosShell et contrôlées par état local. L'ordre n'est persisté en DB qu'au paiement.

**Tech Stack:** Next.js 16 App Router, React (état local), Tailwind CSS v4, Sonner toasts, `window.print()` pour reçus thermiques, Vitest + Testing Library.

**Prérequis :** Sprint 3a (Backend POS) complété — toutes les APIs doivent être fonctionnelles.

---

## Fichiers créés / modifiés

| Action | Fichier | Responsabilité |
|--------|---------|----------------|
| Modify | `src/app/caisse/pos/page.tsx` | Server Component — charge données init |
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
