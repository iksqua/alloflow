# Système de caisse v2 — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refonte du PaymentModal en 3 étapes (méthode → exécution → confirmation), composant PaymentSplit par articles, reçus email/SMS Brevo, facture PDF pdfkit, page publique reçu.

**Architecture:** PaymentModal devient un state machine à 6 états (`'method'|'card'|'cash'|'split-assign'|'split-person'|'confirm'`). PaymentSplit est isolé avec une fonction pure `computeSplitAmounts` testable. Les routes email/SMS existantes (actuellement 501) sont complétées avec les helpers Brevo existants. La facture PDF nécessite une migration DB + `pdfkit`.

**Tech Stack:** Next.js 16 App Router, React, Supabase, Brevo REST API (`src/lib/brevo.ts` existant), pdfkit, Vitest

---

## File Structure

| Fichier | Action | Rôle |
|---------|--------|------|
| `src/app/caisse/pos/types.ts` | Modify | Ajouter type `SplitPerson` |
| `src/app/caisse/pos/_components/payment-split.tsx` | Create | UI assignation articles + méthode par personne |
| `src/app/caisse/pos/_components/payment-split.test.tsx` | Create | Tests logique `computeSplitAmounts` |
| `src/app/caisse/pos/_components/payment-modal.tsx` | Full rewrite | Orchestrateur 3 étapes |
| `src/lib/brevo.ts` | Modify | Ajouter `sendBrevoEmail()` |
| `src/app/api/receipts/[orderId]/email/route.ts` | Modify | Implémenter envoi Brevo |
| `src/app/api/receipts/[orderId]/sms/route.ts` | Modify | Implémenter envoi Brevo |
| `supabase/migrations/20260402000001_invoices.sql` | Create | Table `invoices` |
| `src/app/api/receipts/[orderId]/invoice/route.ts` | Create | Génération PDF + upload Storage |
| `src/app/receipt/[orderId]/page.tsx` | Create | Page publique reçu (no auth) |

---

## Task 1: Type SplitPerson + helper computeSplitAmounts

**Files:**
- Modify: `src/app/caisse/pos/types.ts`
- Create: `src/app/caisse/pos/_components/payment-split.test.tsx`

- [ ] **Step 1: Ajouter SplitPerson dans types.ts**

À la fin de `src/app/caisse/pos/types.ts`, ajouter :

```typescript
export interface SplitPerson {
  label: string              // "P1", "P2", ...
  amount: number             // montant final après remises (arrondi centimes)
  method: 'card' | 'cash'
}
```

- [ ] **Step 2: Écrire le test de computeSplitAmounts**

Créer `src/app/caisse/pos/_components/payment-split.test.tsx` :

```typescript
import { describe, it, expect } from 'vitest'
import { computeSplitAmounts } from './payment-split'
import type { LocalItem } from '../types'

const item = (id: string, ht: number, tva: number, qty = 1): LocalItem => ({
  productId: id, productName: 'Test', emoji: null,
  unitPriceHt: ht, tvaRate: tva, quantity: qty,
})

describe('computeSplitAmounts', () => {
  it('distribue deux articles assignés sans remise', () => {
    // P1: café 3€ HT + 10% TVA = 3.30 TTC
    // P2: croissant 2€ HT + 5.5% TVA = 2.11 TTC
    const items = [item('a', 3, 10), item('b', 2, 5.5)]
    const assignments = new Map([['a', 'P1'], ['b', 'P2']])
    const methods = new Map<string, 'card' | 'cash'>([['P1', 'cash'], ['P2', 'card']])
    const result = computeSplitAmounts(items, null, 0, assignments, ['P1', 'P2'], methods)
    expect(result[0]).toEqual({ label: 'P1', amount: 3.30, method: 'cash' })
    expect(result[1]).toEqual({ label: 'P2', amount: 2.11, method: 'card' })
    // somme = total
    expect(result[0].amount + result[1].amount).toBeCloseTo(5.41, 2)
  })

  it('absorbe l\'arrondi sur la dernière personne', () => {
    // 3 articles identiques 1€ HT +20% = 1.20 TTC chacun → total 3.60
    // Répartis entre 2 personnes (1.5 chacun → arrondi)
    const items = [item('a', 1, 20), item('b', 1, 20), item('c', 1, 20)]
    const assignments = new Map([['a', 'P1'], ['b', 'P1'], ['c', 'P2']])
    const methods = new Map<string, 'card' | 'cash'>([['P1', 'card'], ['P2', 'card']])
    const result = computeSplitAmounts(items, null, 0, assignments, ['P1', 'P2'], methods)
    expect(result[0].amount + result[1].amount).toBeCloseTo(3.60, 2)
  })

  it('distribue les articles non assignés équitablement', () => {
    // P1 a 1 article, P2 a 0 → l'article non assigné est partagé
    const items = [item('a', 10, 10), item('b', 10, 10)]  // 11€ chacun → 22€ total
    const assignments = new Map([['a', 'P1']])  // 'b' non assigné
    const methods = new Map<string, 'card' | 'cash'>([['P1', 'card'], ['P2', 'card']])
    const result = computeSplitAmounts(items, null, 0, assignments, ['P1', 'P2'], methods)
    // P1: 11 + 11/2 = 16.50, P2: 11/2 = 5.50
    expect(result[0].amount).toBeCloseTo(16.50, 2)
    expect(result[1].amount).toBeCloseTo(5.50, 2)
  })

  it('applique une remise pro-rata', () => {
    // 2 articles 10€ HT + 20% TVA = 12€ chacun → total 24€
    // Remise 4€ → total final 20€
    const items = [item('a', 10, 20), item('b', 10, 20)]
    const assignments = new Map([['a', 'P1'], ['b', 'P2']])
    const methods = new Map<string, 'card' | 'cash'>([['P1', 'card'], ['P2', 'card']])
    const result = computeSplitAmounts(items, { type: 'amount', value: 4 }, 0, assignments, ['P1', 'P2'], methods)
    expect(result[0].amount).toBeCloseTo(10, 2)
    expect(result[1].amount).toBeCloseTo(10, 2)
    expect(result[0].amount + result[1].amount).toBeCloseTo(20, 2)
  })

  it('cas dégénéré : 1 seule personne reçoit le total', () => {
    const items = [item('a', 10, 20), item('b', 5, 10)]
    const assignments = new Map([['a', 'P1'], ['b', 'P1']])
    const methods = new Map<string, 'card' | 'cash'>([['P1', 'card']])
    const result = computeSplitAmounts(items, null, 0, assignments, ['P1'], methods)
    // 10*1.2 + 5*1.1 = 12 + 5.5 = 17.5
    expect(result[0].amount).toBeCloseTo(17.5, 2)
  })
})
```

- [ ] **Step 3: Lancer les tests (doivent échouer — computeSplitAmounts n'existe pas encore)**

```bash
cd "/Users/anthony/Super pouvoir/Alloflow"
npx vitest run src/app/caisse/pos/_components/payment-split.test.tsx
```

Expected: FAIL "Cannot find module './payment-split'"

- [ ] **Step 4: Commit types**

```bash
cd "/Users/anthony/Super pouvoir/Alloflow"
git add src/app/caisse/pos/types.ts src/app/caisse/pos/_components/payment-split.test.tsx
git commit -m "test: add computeSplitAmounts tests (failing)"
```

---

## Task 2: Composant PaymentSplit

**Files:**
- Create: `src/app/caisse/pos/_components/payment-split.tsx`

- [ ] **Step 1: Créer payment-split.tsx avec computeSplitAmounts**

```tsx
'use client'
// src/app/caisse/pos/_components/payment-split.tsx
import { useState } from 'react'
import type { LocalItem, SplitPerson } from '../types'

// ─── Helper pur (exporté pour tests) ───────────────────────────────────────

/** Calcule le montant TTC d'une ligne */
function lineTtc(item: LocalItem): number {
  return item.unitPriceHt * (1 + item.tvaRate / 100) * item.quantity
}

/**
 * Répartit le total final entre les personnes selon leurs articles assignés.
 * - Articles non assignés : distribués équitablement
 * - Arrondi : absorbé par la dernière personne
 * @param totalFinal - Total TTC après toutes remises (calculé par le parent)
 */
export function computeSplitAmounts(
  items: LocalItem[],
  discount: { type: 'percent' | 'amount'; value: number } | null,
  loyaltyDiscount: number,
  assignments: Map<string, string | null>,  // productId → personLabel | null
  personLabels: string[],
  personMethods: Map<string, 'card' | 'cash'>
): SplitPerson[] {
  if (personLabels.length === 0) return []

  // Calcul du total brut TTC
  const totalBrut = items.reduce((s, i) => s + lineTtc(i), 0)

  // Remise commerciale en €
  const subtotalHt = items.reduce((s, i) => s + i.unitPriceHt * i.quantity, 0)
  let discountEur = 0
  if (discount) {
    discountEur = discount.type === 'percent'
      ? totalBrut * (discount.value / 100)  // pro-rata sur TTC (approximation raisonnable)
      : discount.value
  }
  const totalFinal = Math.max(0, totalBrut - discountEur - loyaltyDiscount)

  // Montant brut par personne
  const personBrut = new Map<string, number>()
  for (const label of personLabels) personBrut.set(label, 0)

  let unassignedBrut = 0
  for (const item of items) {
    const ttc = lineTtc(item)
    const assignedTo = assignments.get(item.productId) ?? null
    if (assignedTo && personLabels.includes(assignedTo)) {
      personBrut.set(assignedTo, (personBrut.get(assignedTo) ?? 0) + ttc)
    } else {
      unassignedBrut += ttc
    }
  }

  // Distribuer les non-assignés équitablement
  if (unassignedBrut > 0) {
    const share = unassignedBrut / personLabels.length
    for (const label of personLabels) {
      personBrut.set(label, (personBrut.get(label) ?? 0) + share)
    }
  }

  // Pro-rata sur totalFinal, arrondi, dernière personne absorbe écart
  const results: SplitPerson[] = []
  let sumSoFar = 0
  for (let i = 0; i < personLabels.length; i++) {
    const label = personLabels[i]
    const brut = personBrut.get(label) ?? 0
    const ratio = totalBrut > 0 ? brut / totalBrut : 1 / personLabels.length
    const isLast = i === personLabels.length - 1
    let amount: number
    if (isLast) {
      amount = Math.round((totalFinal - sumSoFar) * 100) / 100
    } else {
      amount = Math.round(totalFinal * ratio * 100) / 100
      sumSoFar += amount
    }
    results.push({ label, amount: Math.max(0, amount), method: personMethods.get(label) ?? 'card' })
  }
  return results
}

// ─── Composant ─────────────────────────────────────────────────────────────

interface PaymentSplitProps {
  items: LocalItem[]
  discount: { type: 'percent' | 'amount'; value: number } | null
  loyaltyDiscount: number       // montant remise fidélité en €
  totalFinal: number            // total TTC après toutes remises (pour affichage)
  onConfirm: (persons: SplitPerson[]) => void
  onBack: () => void
}

const PERSON_COLORS: Record<string, string> = {
  P1: '#1d4ed8', P2: '#7c3aed', P3: '#0891b2',
  P4: '#d97706', P5: '#dc2626', P6: '#059669',
}

export function PaymentSplit({ items, discount, loyaltyDiscount, totalFinal, onConfirm, onBack }: PaymentSplitProps) {
  const [persons, setPersons] = useState<string[]>(['P1', 'P2'])
  // productId → personLabel | null
  const [assignments, setAssignments] = useState<Map<string, string | null>>(
    () => new Map(items.map(i => [i.productId, null]))
  )
  const [methods, setMethods] = useState<Map<string, 'card' | 'cash'>>(
    () => new Map(persons.map(p => [p, 'card' as const]))
  )

  function addPerson() {
    if (persons.length >= 10) return
    const label = `P${persons.length + 1}`
    setPersons(prev => [...prev, label])
    setMethods(prev => new Map([...prev, [label, 'card']]))
  }

  function cycleAssignment(productId: string) {
    setAssignments(prev => {
      const current = prev.get(productId) ?? null
      const idx = current === null ? 0 : persons.indexOf(current) + 1
      const next = idx >= persons.length ? null : persons[idx]
      return new Map([...prev, [productId, next]])
    })
  }

  function toggleMethod(label: string) {
    setMethods(prev => new Map([...prev, [label, prev.get(label) === 'card' ? 'cash' : 'card']]))
  }

  const splitPersons = computeSplitAmounts(items, discount, loyaltyDiscount, assignments, persons, methods)

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text4)' }}>
          Assigner les articles
        </span>
        <button
          onClick={addPerson}
          disabled={persons.length >= 10}
          className="text-xs font-semibold px-3 py-1 rounded-lg"
          style={{ background: 'rgba(29,78,216,0.15)', color: '#93c5fd', border: '1px solid rgba(29,78,216,0.4)' }}
        >
          + Personne
        </button>
      </div>

      {/* Articles */}
      <div className="flex flex-col gap-2">
        {items.map(item => {
          const assignedTo = assignments.get(item.productId) ?? null
          const color = assignedTo ? (PERSON_COLORS[assignedTo] ?? '#64748b') : '#334155'
          return (
            <button
              key={item.productId}
              onClick={() => cycleAssignment(item.productId)}
              className="flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-colors"
              style={{ background: 'var(--surface2)' }}
            >
              <span className="text-base">{item.emoji ?? '📦'}</span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate" style={{ color: 'var(--text1)' }}>{item.productName}</div>
                <div className="text-xs" style={{ color: 'var(--text4)' }}>
                  ×{item.quantity} · {(item.unitPriceHt * (1 + item.tvaRate / 100) * item.quantity).toFixed(2)} €
                </div>
              </div>
              <span
                className="flex-shrink-0 text-xs font-bold px-2.5 py-1 rounded-full"
                style={{ background: color, color: assignedTo ? 'white' : '#94a3b8' }}
              >
                {assignedTo ?? '—'}
              </span>
            </button>
          )
        })}
      </div>

      {/* Récap par personne */}
      <div className="flex flex-col gap-2">
        {splitPersons.map(p => (
          <div
            key={p.label}
            className="flex items-center gap-3 px-4 py-3 rounded-xl"
            style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}
          >
            <span
              className="text-xs font-bold px-2.5 py-1 rounded-full flex-shrink-0"
              style={{ background: PERSON_COLORS[p.label] ?? '#334155', color: 'white' }}
            >
              {p.label}
            </span>
            <span className="flex-1 text-base font-bold" style={{ color: 'var(--text1)' }}>
              {p.amount.toFixed(2).replace('.', ',')} €
            </span>
            <div className="flex gap-1">
              <button
                onClick={() => p.method === 'cash' && toggleMethod(p.label)}
                className="text-xs font-semibold px-2.5 py-1 rounded-lg transition-all"
                style={p.method === 'card'
                  ? { background: '#1d4ed8', color: 'white' }
                  : { background: 'var(--surface)', color: 'var(--text4)', border: '1px solid var(--border)' }}
              >
                💳 CB
              </button>
              <button
                onClick={() => p.method === 'card' && toggleMethod(p.label)}
                className="text-xs font-semibold px-2.5 py-1 rounded-lg transition-all"
                style={p.method === 'cash'
                  ? { background: '#166534', color: '#4ade80' }
                  : { background: 'var(--surface)', color: 'var(--text4)', border: '1px solid var(--border)' }}
              >
                💵 Espèces
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Actions */}
      <button
        onClick={() => onConfirm(splitPersons)}
        disabled={splitPersons.some(p => p.amount <= 0)}
        className="w-full py-4 rounded-xl text-base font-bold text-white disabled:opacity-40"
        style={{ background: 'var(--green)' }}
      >
        Encaisser {splitPersons.map(p => p.label).join(' + ')} →
      </button>
      <button
        onClick={onBack}
        className="w-full py-2 text-sm"
        style={{ color: 'var(--text4)' }}
      >
        ← Retour
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Lancer les tests (doivent passer)**

```bash
cd "/Users/anthony/Super pouvoir/Alloflow"
npx vitest run src/app/caisse/pos/_components/payment-split.test.tsx
```

Expected: 5 tests PASS

- [ ] **Step 3: Commit**

```bash
git add src/app/caisse/pos/_components/payment-split.tsx
git commit -m "feat: add PaymentSplit component with computeSplitAmounts"
```

---

## Task 3: Refonte PaymentModal (3 étapes)

**Files:**
- Modify: `src/app/caisse/pos/_components/payment-modal.tsx` (full rewrite)

Le modal actuel (403 lignes) est remplacé entièrement. Lire le fichier actuel avant de le modifier pour comprendre `computeTotalBeforeLoyalty`, `computeTotal`, et le pattern de création de commande (`handlePay`).

- [ ] **Step 1: Réécrire payment-modal.tsx**

```tsx
'use client'
// src/app/caisse/pos/_components/payment-modal.tsx
import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import { PaymentSplit } from './payment-split'
import type { LocalTicket, CashSession, Order, LoyaltyCustomer, LoyaltyReward, SplitPerson } from '../types'

type ModalStep = 'method' | 'card' | 'cash' | 'split-assign' | 'split-person' | 'confirm'

interface PaymentModalProps {
  ticket: LocalTicket
  session: CashSession | null
  cashierId: string
  isOffline: boolean
  linkedCustomer: LoyaltyCustomer | null
  linkedReward: LoyaltyReward | null
  onClose: () => void
  onSuccess: (order: Order) => void
}

// ─── Pure helpers ────────────────────────────────────────────────────────────

export function computeTotalBeforeLoyalty(ticket: LocalTicket): number {
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

export function computeTotal(ticket: LocalTicket, reward: LoyaltyReward | null): number {
  const base = computeTotalBeforeLoyalty(ticket)
  if (!reward) return base
  const loyaltyDiscount = (reward.type === 'percent' || reward.type === 'reduction_pct')
    ? Math.round(base * (reward.value / 100) * 100) / 100
    : reward.value
  return Math.max(0, base - loyaltyDiscount)
}

function loyaltyDiscountEur(ticket: LocalTicket, reward: LoyaltyReward | null): number {
  if (!reward) return 0
  const base = computeTotalBeforeLoyalty(ticket)
  return (reward.type === 'percent' || reward.type === 'reduction_pct')
    ? Math.round(base * (reward.value / 100) * 100) / 100
    : reward.value
}

// ─── Order creation helper ────────────────────────────────────────────────────

async function createOrder(
  ticket: LocalTicket,
  session: CashSession | null,
  linkedCustomer: LoyaltyCustomer | null,
  linkedReward: LoyaltyReward | null,
  loyaltyAmt: number,
): Promise<{ id: string; total_ttc: number }> {
  const orderRes = await fetch('/api/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      session_id:             session?.id ?? undefined,
      table_id:               ticket.tableId ?? undefined,
      customer_id:            linkedCustomer?.id ?? undefined,
      reward_id:              linkedReward?.id ?? undefined,
      reward_discount_amount: loyaltyAmt > 0 ? loyaltyAmt : undefined,
      items: ticket.items.map(i => ({
        product_id:   i.productId,
        product_name: i.productName,
        emoji:        i.emoji,
        unit_price:   i.unitPriceHt,
        tva_rate:     i.tvaRate,
        quantity:     i.quantity,
      })),
    }),
  })
  if (!orderRes.ok) {
    const err = await orderRes.json().catch(() => ({}))
    throw new Error(`Erreur création commande (${orderRes.status}): ${JSON.stringify(err)}`)
  }
  const { order } = await orderRes.json()

  if (ticket.discount) {
    await fetch(`/api/orders/${order.id}/discounts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(ticket.discount),
    })
  }
  return order
}

// ─── Component ────────────────────────────────────────────────────────────────

export function PaymentModal({ ticket, session, cashierId, isOffline, linkedCustomer, linkedReward, onClose, onSuccess }: PaymentModalProps) {
  const total = computeTotal(ticket, linkedReward)
  const loyaltyAmt = loyaltyDiscountEur(ticket, linkedReward)

  // If offline mid-modal, return to method step
  // Always start at 'method' — offline mode disables Carte/Split visually in that step
  const [step, setStep] = useState<ModalStep>('method')

  // Cash state
  const [cashGiven, setCashGiven] = useState('')

  // Split state
  const [splitPersons, setSplitPersons]         = useState<SplitPerson[]>([])
  const [splitIndex, setSplitIndex]             = useState(0)
  const [splitCash, setSplitCash]               = useState('')
  const [splitCashAmounts, setSplitCashAmounts] = useState<number[]>([])  // cash_given per person
  const [splitOrderId, setSplitOrderId]         = useState<string | null>(null)

  // Confirm state
  const [completedOrder, setCompletedOrder]   = useState<Order | null>(null)
  const [receiptChoice, setReceiptChoice]     = useState<'none' | 'email' | 'sms' | 'invoice'>('none')
  const [receiptContact, setReceiptContact]   = useState(linkedCustomer?.email ?? '')
  const [companyName, setCompanyName]         = useState('')
  const [companySiret, setCompanySiret]       = useState('')

  const [isSubmitting, setIsSubmitting] = useState(false)

  const cashChange = cashGiven ? parseFloat(cashGiven.replace(',', '.')) - total : 0
  const currentPerson = splitPersons[splitIndex]

  // ── Payment handlers ──────────────────────────────────────────────────────

  const handleCardConfirm = useCallback(async () => {
    setIsSubmitting(true)
    try {
      const order = await createOrder(ticket, session, linkedCustomer, linkedReward, loyaltyAmt)
      const payRes = await fetch(`/api/orders/${order.id}/pay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method: 'card', amount: order.total_ttc }),
      })
      if (!payRes.ok) throw new Error(`Erreur paiement CB (${payRes.status})`)
      setCompletedOrder({ ...order, items: [] } as Order)
      setStep('confirm')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur de paiement')
    } finally {
      setIsSubmitting(false)
    }
  }, [ticket, session, linkedCustomer, linkedReward, loyaltyAmt])

  const handleCashConfirm = useCallback(async () => {
    const given = parseFloat(cashGiven.replace(',', '.'))
    if (isNaN(given) || given < total - 0.01) {
      toast.error(`Montant insuffisant (minimum ${total.toFixed(2)} €)`)
      return
    }
    setIsSubmitting(true)
    try {
      const order = await createOrder(ticket, session, linkedCustomer, linkedReward, loyaltyAmt)
      const payRes = await fetch(`/api/orders/${order.id}/pay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method: 'cash', amount: order.total_ttc, cash_given: given }),
      })
      if (!payRes.ok) throw new Error(`Erreur paiement espèces (${payRes.status})`)
      setCompletedOrder({ ...order, items: [] } as Order)
      setStep('confirm')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur de paiement')
    } finally {
      setIsSubmitting(false)
    }
  }, [ticket, session, linkedCustomer, linkedReward, loyaltyAmt, cashGiven, total])

  const handleSplitAssignConfirm = useCallback(async (persons: SplitPerson[]) => {
    setSplitPersons(persons)
    setSplitIndex(0)
    setSplitCash('')
    setSplitCashAmounts(new Array(persons.length).fill(0))
    // Create order before sequencing through persons
    setIsSubmitting(true)
    try {
      const order = await createOrder(ticket, session, linkedCustomer, linkedReward, loyaltyAmt)
      setSplitOrderId(order.id)
      setCompletedOrder({ ...order, items: [] } as Order)
      setStep('split-person')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur création commande')
    } finally {
      setIsSubmitting(false)
    }
  }, [ticket, session, linkedCustomer, linkedReward, loyaltyAmt])

  const handleSplitPersonNext = useCallback(async (cashAmount?: number) => {
    // Record cash_given for current person
    const updatedCashAmounts = [...splitCashAmounts]
    if (cashAmount !== undefined) updatedCashAmounts[splitIndex] = cashAmount
    setSplitCashAmounts(updatedCashAmounts)

    const next = splitIndex + 1
    if (next < splitPersons.length) {
      setSplitIndex(next)
      setSplitCash('')
    } else {
      // All persons confirmed — call pay API with per-person cash amounts
      if (!splitOrderId) { toast.error('Erreur interne — réessayez'); return }
      setIsSubmitting(true)
      try {
        const payRes = await fetch(`/api/orders/${splitOrderId}/pay`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            method: 'split',
            amount: total,
            split_payments: splitPersons.map((p, i) => ({
              method: p.method,
              amount: p.amount,
              ...(p.method === 'cash' ? { cash_given: updatedCashAmounts[i] || p.amount } : {}),
            })),
          }),
        })
        if (!payRes.ok) throw new Error(`Erreur enregistrement paiement (${payRes.status})`)
        setStep('confirm')
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Erreur — réessayez')
      } finally {
        setIsSubmitting(false)
      }
    }
  }, [splitIndex, splitPersons, splitOrderId, splitCashAmounts, total])

  async function handleTerminate() {
    if (!completedOrder) { onClose(); return }

    // Send receipt (non-blocking)
    if (receiptChoice === 'email' && receiptContact) {
      fetch(`/api/receipts/${completedOrder.id}/email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: receiptContact }),
      }).then(r => r.ok ? toast.success('Reçu envoyé par email') : toast.error('Échec envoi email'))
        .catch(() => toast.error('Échec envoi email'))
    } else if (receiptChoice === 'sms' && receiptContact) {
      fetch(`/api/receipts/${completedOrder.id}/sms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: receiptContact }),
      }).then(r => r.ok ? toast.success('Reçu envoyé par SMS') : toast.error('Échec envoi SMS'))
        .catch(() => toast.error('Échec envoi SMS'))
    } else if (receiptChoice === 'invoice' && companyName) {
      fetch(`/api/receipts/${completedOrder.id}/invoice`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company_name: companyName, siret: companySiret || undefined }),
      }).then(async r => {
        if (r.ok) {
          const { pdf_url, invoice_number } = await r.json()
          window.open(pdf_url, '_blank')
          toast.success(`Facture ${invoice_number} générée`)
        } else {
          toast.error('Erreur génération facture')
        }
      }).catch(() => toast.error('Erreur génération facture'))
    }

    onSuccess(completedOrder)
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70" onClick={step === 'method' ? onClose : undefined} />
      <div
        data-testid="payment-modal"
        className="relative w-full max-w-md mx-4 sm:mx-0 rounded-2xl shadow-2xl flex flex-col max-h-[90vh]"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 flex-shrink-0">
          <h2 className="text-lg font-bold" style={{ color: 'var(--text1)' }}>
            {step === 'confirm' ? 'Paiement enregistré' : 'Encaissement'}
          </h2>
          {(step === 'method' || step === 'confirm') && (
            <button onClick={onClose} style={{ color: 'var(--text4)' }} className="text-xl hover:opacity-70">✕</button>
          )}
          {step !== 'method' && step !== 'confirm' && (
            <button
              onClick={() => setStep('method')}
              className="text-sm"
              style={{ color: 'var(--text4)' }}
            >
              ← Retour
            </button>
          )}
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-6 pb-6 flex flex-col gap-4">

          {/* ── Step 1: Method ── */}
          {step === 'method' && (
            <>
              <div className="text-center py-4">
                <div className="text-5xl font-black tabular-nums" style={{ color: 'var(--text1)' }}>
                  {total.toFixed(2).replace('.', ',')} €
                </div>
                <p className="text-sm mt-1" style={{ color: 'var(--text4)' }}>Total TTC à encaisser</p>
              </div>
              <div className="grid grid-cols-3 gap-3">
                {(['card', 'cash', 'split'] as const).map(m => {
                  const disabled = isOffline && m !== 'cash'
                  const labels = { card: 'Carte', cash: 'Espèces', split: 'Split' }
                  const icons  = { card: '💳', cash: '💵', split: '👥' }
                  return (
                    <button
                      key={m}
                      onClick={() => !disabled && setStep(m === 'split' ? 'split-assign' : m)}
                      disabled={disabled}
                      className="flex flex-col items-center gap-2 py-5 rounded-2xl border-2 font-semibold transition-all"
                      style={disabled
                        ? { opacity: 0.35, cursor: 'not-allowed', borderColor: 'var(--border)', color: 'var(--text4)' }
                        : { borderColor: 'var(--border)', color: 'var(--text2)' }}
                    >
                      <span className="text-3xl">{icons[m]}</span>
                      <span className="text-sm">{labels[m]}</span>
                      {disabled && <span className="text-[10px]" style={{ color: 'var(--text4)' }}>Hors ligne</span>}
                    </button>
                  )
                })}
              </div>
            </>
          )}

          {/* ── Step 2a: Card ── */}
          {step === 'card' && (
            <>
              <div className="flex flex-col items-center py-10 gap-3">
                <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text4)' }}>À encaisser</p>
                <div className="text-6xl font-black tabular-nums" style={{ color: 'var(--text1)', letterSpacing: '-2px' }}>
                  {total.toFixed(2).replace('.', ',')} €
                </div>
                <p className="text-sm" style={{ color: 'var(--text4)' }}>💳 Entrez le montant sur le TPE physique</p>
              </div>
              <button
                onClick={handleCardConfirm}
                disabled={isSubmitting}
                className="w-full py-5 rounded-xl text-base font-bold text-white disabled:opacity-40"
                style={{ background: 'var(--green)' }}
              >
                {isSubmitting ? 'Enregistrement…' : '✓ Paiement reçu'}
              </button>
              <button onClick={() => setStep('method')} className="w-full py-2 text-sm" style={{ color: 'var(--text4)' }}>
                Annuler
              </button>
            </>
          )}

          {/* ── Step 2b: Cash ── */}
          {step === 'cash' && (
            <>
              <div className="flex flex-col gap-3">
                <div className="flex justify-between items-center px-4 py-3 rounded-xl" style={{ background: 'var(--surface2)' }}>
                  <span className="text-sm" style={{ color: 'var(--text4)' }}>À encaisser</span>
                  <span className="text-xl font-bold" style={{ color: 'var(--text1)' }}>{total.toFixed(2).replace('.', ',')} €</span>
                </div>
                <div className="flex justify-between items-center px-4 py-3 rounded-xl" style={{ background: 'var(--surface2)' }}>
                  <span className="text-sm" style={{ color: 'var(--text4)' }}>Remis par le client</span>
                  <span className="text-xl font-bold" style={{ color: 'var(--text1)' }}>
                    {cashGiven ? `${parseFloat(cashGiven.replace(',', '.')).toFixed(2).replace('.', ',')} €` : '—'}
                  </span>
                </div>
                {cashChange > 0 && (
                  <div className="flex justify-between items-center px-4 py-3 rounded-xl" style={{ background: 'var(--surface2)' }}>
                    <span className="text-sm font-semibold" style={{ color: 'var(--text2)' }}>Rendu monnaie</span>
                    <span className="text-2xl font-black" style={{ color: '#f59e0b' }}>{cashChange.toFixed(2).replace('.', ',')} €</span>
                  </div>
                )}
              </div>
              {/* Keypad */}
              <div className="grid grid-cols-3 gap-2">
                {['1','2','3','4','5','6','7','8','9','+5','0','⌫'].map(k => (
                  <button
                    key={k}
                    onClick={() => {
                      if (k === '⌫') { setCashGiven(prev => prev.slice(0, -1)); return }
                      if (k === '+5') { setCashGiven(prev => String((parseFloat(prev || '0') + 5).toFixed(2))); return }
                      setCashGiven(prev => (prev === '0' ? k : prev + k))
                    }}
                    className="py-4 rounded-xl text-base font-bold transition-colors"
                    style={{ background: 'var(--surface2)', color: k === '⌫' ? '#f87171' : 'var(--text1)' }}
                  >
                    {k}
                  </button>
                ))}
              </div>
              <button
                onClick={handleCashConfirm}
                disabled={isSubmitting || !cashGiven || parseFloat(cashGiven.replace(',', '.')) < total - 0.01}
                className="w-full py-5 rounded-xl text-base font-bold text-white disabled:opacity-40"
                style={{ background: 'var(--green)' }}
              >
                {isSubmitting
                  ? 'Enregistrement…'
                  : cashChange > 0
                    ? `Confirmer — rendre ${cashChange.toFixed(2).replace('.', ',')} €`
                    : 'Confirmer le paiement'}
              </button>
            </>
          )}

          {/* ── Step 2c: Split assign ── */}
          {step === 'split-assign' && (
            <PaymentSplit
              items={ticket.items}
              discount={ticket.discount}
              loyaltyDiscount={loyaltyAmt}
              totalFinal={total}
              onConfirm={handleSplitAssignConfirm}
              onBack={() => setStep('method')}
            />
          )}

          {/* ── Step 2d: Split — per-person payment ── */}
          {step === 'split-person' && currentPerson && (
            <>
              <div className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium" style={{ background: 'rgba(29,78,216,0.1)', color: '#93c5fd' }}>
                Personne {splitIndex + 1}/{splitPersons.length} — {currentPerson.label}
              </div>

              {currentPerson.method === 'card' && (
                <>
                  <div className="flex flex-col items-center py-8 gap-3">
                    <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text4)' }}>{currentPerson.label} — À encaisser</p>
                    <div className="text-5xl font-black tabular-nums" style={{ color: 'var(--text1)' }}>
                      {currentPerson.amount.toFixed(2).replace('.', ',')} €
                    </div>
                    <p className="text-sm" style={{ color: 'var(--text4)' }}>💳 Entrez le montant sur le TPE physique</p>
                  </div>
                  <button
                    onClick={() => handleSplitPersonNext()}
                    disabled={isSubmitting}
                    className="w-full py-5 rounded-xl text-base font-bold text-white disabled:opacity-40"
                    style={{ background: 'var(--green)' }}
                  >
                    {isSubmitting ? 'Enregistrement…' : splitIndex < splitPersons.length - 1 ? '✓ Paiement reçu — suivant →' : '✓ Paiement reçu — terminer'}
                  </button>
                </>
              )}

              {currentPerson.method === 'cash' && (
                <>
                  <div className="flex flex-col gap-3">
                    <div className="flex justify-between items-center px-4 py-3 rounded-xl" style={{ background: 'var(--surface2)' }}>
                      <span className="text-sm" style={{ color: 'var(--text4)' }}>{currentPerson.label} — Part</span>
                      <span className="text-xl font-bold" style={{ color: 'var(--text1)' }}>{currentPerson.amount.toFixed(2).replace('.', ',')} €</span>
                    </div>
                    {splitCash && parseFloat(splitCash) - currentPerson.amount > 0 && (
                      <div className="flex justify-between items-center px-4 py-3 rounded-xl" style={{ background: 'var(--surface2)' }}>
                        <span className="text-sm" style={{ color: 'var(--text2)' }}>Rendu</span>
                        <span className="text-2xl font-black" style={{ color: '#f59e0b' }}>
                          {(parseFloat(splitCash) - currentPerson.amount).toFixed(2).replace('.', ',')} €
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {['1','2','3','4','5','6','7','8','9','+5','0','⌫'].map(k => (
                      <button
                        key={k}
                        onClick={() => {
                          if (k === '⌫') { setSplitCash(prev => prev.slice(0, -1)); return }
                          if (k === '+5') { setSplitCash(prev => String((parseFloat(prev || '0') + 5).toFixed(2))); return }
                          setSplitCash(prev => (prev === '0' ? k : prev + k))
                        }}
                        className="py-4 rounded-xl text-base font-bold"
                        style={{ background: 'var(--surface2)', color: k === '⌫' ? '#f87171' : 'var(--text1)' }}
                      >
                        {k}
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={() => handleSplitPersonNext(parseFloat(splitCash))}
                    disabled={isSubmitting || !splitCash || parseFloat(splitCash) < currentPerson.amount - 0.01}
                    className="w-full py-5 rounded-xl text-base font-bold text-white disabled:opacity-40"
                    style={{ background: 'var(--green)' }}
                  >
                    {isSubmitting ? 'Enregistrement…' : splitIndex < splitPersons.length - 1 ? 'Confirmer — suivant →' : 'Confirmer — terminer'}
                  </button>
                </>
              )}
            </>
          )}

          {/* ── Step 3: Confirm + receipt ── */}
          {step === 'confirm' && completedOrder && (
            <>
              <div className="flex items-center gap-2 px-4 py-3 rounded-xl" style={{ background: 'rgba(22,101,52,0.15)', border: '1px solid rgba(74,222,128,0.2)' }}>
                <span className="text-lg">✅</span>
                <div>
                  <p className="text-sm font-bold" style={{ color: '#4ade80' }}>Paiement enregistré</p>
                  <p className="text-xs" style={{ color: 'var(--text4)' }}>{total.toFixed(2).replace('.', ',')} € TTC</p>
                </div>
              </div>

              <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text4)' }}>Envoyer un reçu</p>

              {(['none', 'email', 'sms', 'invoice'] as const).map(choice => {
                const labels = { none: '🚫 Pas de reçu', email: '📧 Email', sms: '📱 SMS', invoice: '🧾 Facture pro' }
                const descs  = { none: 'Terminer sans envoyer', email: 'Reçu simple par email', sms: 'Lien vers le reçu par SMS', invoice: 'PDF avec SIRET et TVA détaillée' }
                return (
                  <button
                    key={choice}
                    onClick={() => setReceiptChoice(choice)}
                    className="flex items-center gap-3 px-4 py-3 rounded-xl border-2 text-left transition-all"
                    style={receiptChoice === choice
                      ? { borderColor: 'var(--blue)', background: 'rgba(29,78,216,0.08)' }
                      : { borderColor: 'var(--border)', background: 'var(--surface2)' }}
                  >
                    <span className="text-lg">{labels[choice].split(' ')[0]}</span>
                    <div className="flex-1">
                      <p className="text-sm font-semibold" style={{ color: 'var(--text1)' }}>{labels[choice].slice(3)}</p>
                      <p className="text-xs" style={{ color: 'var(--text4)' }}>{descs[choice]}</p>
                    </div>
                    <div className="w-4 h-4 rounded-full border-2 flex-shrink-0"
                      style={receiptChoice === choice ? { borderColor: 'var(--blue)', background: 'var(--blue)' } : { borderColor: 'var(--text4)' }}
                    />
                  </button>
                )
              })}

              {(receiptChoice === 'email' || receiptChoice === 'sms') && (
                <input
                  type={receiptChoice === 'email' ? 'email' : 'tel'}
                  value={receiptContact}
                  onChange={e => setReceiptContact(e.target.value)}
                  placeholder={receiptChoice === 'email' ? 'email@client.fr' : '+33 6 12 34 56 78'}
                  className="w-full px-4 py-3 rounded-xl text-sm"
                  style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text1)', outline: 'none' }}
                />
              )}

              {receiptChoice === 'invoice' && (
                <div className="flex flex-col gap-2">
                  <input
                    type="text"
                    value={companyName}
                    onChange={e => setCompanyName(e.target.value)}
                    placeholder="Nom de la société *"
                    className="w-full px-4 py-3 rounded-xl text-sm"
                    style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text1)', outline: 'none' }}
                  />
                  <input
                    type="text"
                    value={companySiret}
                    onChange={e => setCompanySiret(e.target.value)}
                    placeholder="SIRET (optionnel)"
                    className="w-full px-4 py-3 rounded-xl text-sm"
                    style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text1)', outline: 'none' }}
                  />
                </div>
              )}

              <button
                onClick={handleTerminate}
                className="w-full py-5 rounded-xl text-base font-bold text-white"
                style={{ background: 'var(--blue)' }}
              >
                ✓ Terminer &amp; nouvelle commande
              </button>
            </>
          )}

        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Vérifier que TypeScript compile sans erreur**

```bash
cd "/Users/anthony/Super pouvoir/Alloflow"
npx tsc --noEmit 2>&1 | head -30
```

Expected: 0 erreurs (ou uniquement des erreurs pre-existantes non liées)

- [ ] **Step 3: Commit**

```bash
git add src/app/caisse/pos/_components/payment-modal.tsx
git commit -m "feat: refonte PaymentModal 3 étapes (card/cash/split)"
```

---

## Task 4: sendBrevoEmail helper + route email reçu

**Files:**
- Modify: `src/lib/brevo.ts`
- Modify: `src/app/api/receipts/[orderId]/email/route.ts`

- [ ] **Step 1: Ajouter sendBrevoEmail dans src/lib/brevo.ts**

Ajouter à la fin du fichier existant (après `sendBrevoSms`) :

```typescript
const BREVO_EMAIL_URL = 'https://api.brevo.com/v3/smtp/email'

export interface BrevoEmailResult {
  messageId: string
}

/**
 * Send a transactional email via Brevo REST API.
 * htmlContent must be a complete HTML string.
 * Must only be called server-side.
 */
export async function sendBrevoEmail(params: {
  to: { email: string; name?: string }
  subject: string
  htmlContent: string
  replyTo?: { email: string }
}): Promise<BrevoEmailResult> {
  const apiKey = process.env.BREVO_API_KEY
  if (!apiKey) throw new Error('BREVO_API_KEY is not configured')

  const res = await fetch(BREVO_EMAIL_URL, {
    method: 'POST',
    headers: {
      'accept':       'application/json',
      'content-type': 'application/json',
      'api-key':      apiKey,
    },
    body: JSON.stringify({
      sender:      { name: 'Alloflow', email: 'noreply@alloflow.fr' },
      to:          [params.to],
      subject:     params.subject,
      htmlContent: params.htmlContent,
      ...(params.replyTo ? { replyTo: params.replyTo } : {}),
    }),
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { message?: string }
    throw new Error(`Brevo email error ${res.status}: ${body.message ?? 'Unknown error'}`)
  }

  return res.json() as Promise<BrevoEmailResult>
}
```

- [ ] **Step 2: Implémenter la route email**

Réécrire `src/app/api/receipts/[orderId]/email/route.ts` :

```typescript
// src/app/api/receipts/[orderId]/email/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sendBrevoEmail } from '@/lib/brevo'
import { z } from 'zod'

const emailSchema = z.object({ email: z.string().email() })

function buildReceiptHtml(order: {
  created_at: string
  total_ttc: number
  items: Array<{ product_name: string; emoji: string | null; quantity: number; unit_price: number; tva_rate: number }>
}, establishment: { name: string; address: string | null; siret: string | null; receipt_footer: string | null }): string {
  const dateStr = new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).format(new Date(order.created_at))

  const itemRows = order.items.map(i => {
    const ttcLine = i.unit_price * (1 + i.tva_rate / 100) * i.quantity
    return `<tr>
      <td style="padding:4px 8px">${i.emoji ?? ''} ${i.product_name}</td>
      <td style="padding:4px 8px;text-align:right">×${i.quantity}</td>
      <td style="padding:4px 8px;text-align:right">${ttcLine.toFixed(2)} €</td>
    </tr>`
  }).join('')

  return `<!DOCTYPE html><html lang="fr"><body style="font-family:sans-serif;background:#f8fafc;padding:24px;color:#1e293b">
  <div style="max-width:480px;margin:0 auto;background:white;border-radius:12px;padding:24px;border:1px solid #e2e8f0">
    <h1 style="font-size:20px;font-weight:700;margin-bottom:4px">${establishment.name}</h1>
    ${establishment.address ? `<p style="font-size:12px;color:#64748b;margin:0">${establishment.address}</p>` : ''}
    ${establishment.siret ? `<p style="font-size:12px;color:#64748b;margin:0">SIRET : ${establishment.siret}</p>` : ''}
    <p style="font-size:12px;color:#64748b;margin:8px 0 16px">Le ${dateStr}</p>
    <table style="width:100%;border-collapse:collapse;font-size:14px">
      <thead><tr style="border-bottom:1px solid #e2e8f0">
        <th style="padding:4px 8px;text-align:left">Article</th>
        <th style="padding:4px 8px;text-align:right">Qté</th>
        <th style="padding:4px 8px;text-align:right">Prix TTC</th>
      </tr></thead>
      <tbody>${itemRows}</tbody>
    </table>
    <div style="border-top:2px solid #e2e8f0;margin-top:12px;padding-top:12px;text-align:right">
      <span style="font-size:18px;font-weight:700">Total TTC : ${order.total_ttc.toFixed(2)} €</span>
    </div>
    <p style="font-size:11px;color:#94a3b8;text-align:center;margin-top:20px">
      ${establishment.receipt_footer ?? 'Merci de votre visite !'}
    </p>
  </div>
  </body></html>`
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ orderId: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { orderId } = await params
  const body = await req.json()
  const parsed = emailSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'invalid_email' }, { status: 400 })

  const { data: profile } = await supabase.from('profiles').select('establishment_id').eq('id', user.id).single()
  if (!profile?.establishment_id) return NextResponse.json({ error: 'Establishment not found' }, { status: 400 })

  const { data: order } = await supabase
    .from('orders')
    .select('created_at, total_ttc, status, order_items(product_name, emoji, quantity, unit_price, tva_rate)')
    .eq('id', orderId)
    .eq('establishment_id', profile.establishment_id)
    .single()

  if (!order) return NextResponse.json({ error: 'order_not_found' }, { status: 404 })
  if (order.status !== 'paid') return NextResponse.json({ error: 'order_not_paid' }, { status: 422 })

  const { data: estab } = await supabase
    .from('establishments')
    .select('name, address, siret, receipt_footer')
    .eq('id', profile.establishment_id)
    .single()

  if (!estab) return NextResponse.json({ error: 'establishment_not_found' }, { status: 500 })

  try {
    const htmlContent = buildReceiptHtml(
      { ...order, items: (order.order_items as typeof order.order_items & Array<{ product_name: string; emoji: string | null; quantity: number; unit_price: number; tva_rate: number }>) ?? [] },
      estab as { name: string; address: string | null; siret: string | null; receipt_footer: string | null }
    )
    await sendBrevoEmail({
      to:      { email: parsed.data.email },
      subject: `Votre reçu — ${estab.name}`,
      htmlContent,
    })
    return NextResponse.json({ sent: true })
  } catch (err) {
    console.error('[receipt/email]', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'send_failed' }, { status: 500 })
  }
}
```

- [ ] **Step 3: Vérifier TypeScript**

```bash
cd "/Users/anthony/Super pouvoir/Alloflow"
npx tsc --noEmit 2>&1 | grep "receipts\|brevo" | head -10
```

Expected: aucune erreur sur ces fichiers

- [ ] **Step 4: Commit**

```bash
git add src/lib/brevo.ts src/app/api/receipts/[orderId]/email/route.ts
git commit -m "feat: implement receipt email via Brevo"
```

---

## Task 5: Route SMS reçu

**Files:**
- Modify: `src/app/api/receipts/[orderId]/sms/route.ts`

- [ ] **Step 1: Réécrire la route SMS**

```typescript
// src/app/api/receipts/[orderId]/sms/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sendBrevoSms } from '@/lib/brevo'
import { z } from 'zod'

// Strip spaces and dashes, then validate E.164 format
const smsSchema = z.object({
  phone: z.string()
    .transform(v => v.replace(/[\s\-]/g, ''))
    .pipe(z.string().regex(/^\+[1-9]\d{7,14}$/, 'Format E.164 requis (+33612345678)'))
})

export async function POST(req: NextRequest, { params }: { params: Promise<{ orderId: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { orderId } = await params
  const body = await req.json()
  const parsed = smsSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'invalid_phone' }, { status: 400 })

  const { data: profile } = await supabase.from('profiles').select('establishment_id').eq('id', user.id).single()
  if (!profile?.establishment_id) return NextResponse.json({ error: 'Establishment not found' }, { status: 400 })

  const { data: order } = await supabase
    .from('orders')
    .select('status, total_ttc')
    .eq('id', orderId)
    .eq('establishment_id', profile.establishment_id)
    .single()

  if (!order) return NextResponse.json({ error: 'order_not_found' }, { status: 404 })
  if (order.status !== 'paid') return NextResponse.json({ error: 'order_not_paid' }, { status: 422 })

  const { data: estab } = await supabase
    .from('establishments')
    .select('name, brevo_sender_name')
    .eq('id', profile.establishment_id)
    .single()

  if (!estab) return NextResponse.json({ error: 'establishment_not_found' }, { status: 500 })

  const content = `${estab.name} — Votre reçu : https://alloflow.fr/receipt/${orderId} — Total : ${order.total_ttc.toFixed(2)} €`
  const sender = estab.brevo_sender_name ?? 'Alloflow'

  try {
    await sendBrevoSms({ sender, recipient: parsed.data.phone, content })
    return NextResponse.json({ sent: true })
  } catch (err) {
    console.error('[receipt/sms]', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'send_failed' }, { status: 500 })
  }
}
```

- [ ] **Step 2: Vérifier TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep "sms\|brevo" | head -10
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/receipts/[orderId]/sms/route.ts
git commit -m "feat: implement receipt SMS via Brevo"
```

---

## Task 6: Migration DB table invoices

**Files:**
- Create: `supabase/migrations/20260402000001_invoices.sql`

- [ ] **Step 1: Créer la migration**

```sql
-- supabase/migrations/20260402000001_invoices.sql
CREATE TABLE invoices (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id uuid NOT NULL REFERENCES establishments(id) ON DELETE CASCADE,
  order_id         uuid NOT NULL REFERENCES orders(id),
  invoice_year     int  NOT NULL,
  sequence_number  int  NOT NULL,
  number           text NOT NULL GENERATED ALWAYS AS ('FAC-' || invoice_year || '-' || LPAD(sequence_number::text, 4, '0')) STORED,
  company_name     text NOT NULL,
  siret            text,
  delivery_email   text,
  pdf_url          text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (establishment_id, invoice_year, sequence_number)
);

CREATE INDEX idx_invoices_estab_year ON invoices (establishment_id, invoice_year);

ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "invoices_select_own" ON invoices
  FOR SELECT USING (
    establishment_id = (SELECT establishment_id FROM profiles WHERE id = auth.uid())
  );

-- Fonction atomique pour insérer une facture sans race condition sur le numéro
-- Utilise pg_advisory_xact_lock pour sérialiser les insertions par établissement+année
CREATE OR REPLACE FUNCTION insert_invoice_atomic(
  p_establishment_id uuid,
  p_order_id         uuid,
  p_year             int,
  p_company_name     text,
  p_siret            text,
  p_delivery_email   text,
  p_pdf_url          text
) RETURNS TABLE(invoice_id uuid, invoice_number text)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_seq    int;
  v_id     uuid;
  v_number text;
BEGIN
  -- Advisory lock scoped to this transaction — sérialise les insertions par (establishment, year)
  PERFORM pg_advisory_xact_lock(
    ('x' || substr(md5(p_establishment_id::text || p_year::text), 1, 16))::bit(64)::bigint
  );

  SELECT COALESCE(MAX(sequence_number), 0) + 1
  INTO v_seq
  FROM invoices
  WHERE establishment_id = p_establishment_id AND invoice_year = p_year;

  INSERT INTO invoices (establishment_id, order_id, invoice_year, sequence_number, company_name, siret, delivery_email, pdf_url)
  VALUES (p_establishment_id, p_order_id, p_year, v_seq, p_company_name, p_siret, p_delivery_email, p_pdf_url)
  RETURNING id, number INTO v_id, v_number;

  RETURN QUERY SELECT v_id, v_number;
END;
$$;
```

- [ ] **Step 2: Appliquer la migration (à faire en local si Supabase CLI disponible, sinon via Dashboard SQL)**

```bash
# Si Supabase CLI est configuré :
cd "/Users/anthony/Super pouvoir/Alloflow"
npx supabase db push 2>&1 | tail -5
# OU via le dashboard Supabase : copier-coller le SQL dans SQL Editor
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260402000001_invoices.sql
git commit -m "feat: add invoices table migration"
```

---

## Task 7: Route invoice PDF

**Files:**
- Create: `src/lib/supabase/service.ts` (si inexistant)
- Create: `src/app/api/receipts/[orderId]/invoice/route.ts`

- [ ] **Step 1: Créer src/lib/supabase/service.ts**

Vérifier si le fichier existe : `ls src/lib/supabase/`. Si `service.ts` est absent, le créer :

```typescript
// src/lib/supabase/service.ts
import { createClient } from '@supabase/supabase-js'

export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing Supabase service role config')
  return createClient(url, key)
}
```

Vérifier que `SUPABASE_SERVICE_ROLE_KEY` est dans `.env.local`.

- [ ] **Step 2: Installer pdfkit**

```bash
cd "/Users/anthony/Super pouvoir/Alloflow"
npm install pdfkit
npm install --save-dev @types/pdfkit
```

Expected: pdfkit ajouté dans package.json

- [ ] **Step 3: Créer la route invoice**

```typescript
// src/app/api/receipts/[orderId]/invoice/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'  // service role key — voir note ci-dessous
import PDFDocument from 'pdfkit'
import { z } from 'zod'

// Note: createServiceClient utilise process.env.SUPABASE_SERVICE_ROLE_KEY
// Si ce helper n'existe pas, le créer dans src/lib/supabase/service.ts :
// import { createClient as _create } from '@supabase/supabase-js'
// export function createServiceClient() {
//   return _create(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
// }

const invoiceSchema = z.object({
  company_name:   z.string().min(1),
  siret:          z.string().optional(),
  delivery_email: z.string().email().optional(),
})

export async function POST(req: NextRequest, { params }: { params: Promise<{ orderId: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { orderId } = await params
  const body = await req.json()
  const parsed = invoiceSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const { data: profile } = await supabase.from('profiles').select('establishment_id').eq('id', user.id).single()
  if (!profile?.establishment_id) return NextResponse.json({ error: 'Establishment not found' }, { status: 400 })

  const estabId = profile.establishment_id

  // Fetch order + items
  const { data: order } = await supabase
    .from('orders')
    .select('created_at, total_ttc, status, subtotal_ht, tax_5_5, tax_10, tax_20, order_items(product_name, emoji, quantity, unit_price, tva_rate)')
    .eq('id', orderId)
    .eq('establishment_id', estabId)
    .single()

  if (!order) return NextResponse.json({ error: 'order_not_found' }, { status: 404 })
  if (order.status !== 'paid') return NextResponse.json({ error: 'order_not_paid' }, { status: 422 })

  const { data: estab } = await supabase
    .from('establishments')
    .select('name, address, siret')
    .eq('id', estabId)
    .single()

  if (!estab) return NextResponse.json({ error: 'establishment_not_found' }, { status: 500 })

  const year = new Date().getFullYear()
  const serviceClient = createServiceClient()

  // Générer PDF en mémoire
  const pdfBuffer = await new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'A4' })
    const chunks: Buffer[] = []
    doc.on('data', c => chunks.push(c))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    const dateStr = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(order.created_at))

    // Header
    doc.fontSize(20).font('Helvetica-Bold').text(estab.name, 50, 50)
    if (estab.address) doc.fontSize(10).font('Helvetica').text(estab.address, 50, 75)
    if (estab.siret) doc.fontSize(10).text(`SIRET émetteur : ${estab.siret}`, 50, 90)

    doc.fontSize(16).font('Helvetica-Bold').text(`FACTURE ${invoiceNumber}`, 350, 50, { align: 'right' })
    doc.fontSize(10).font('Helvetica').text(`Date : ${dateStr}`, 350, 75, { align: 'right' })

    // Client info
    doc.moveTo(50, 120).lineTo(545, 120).stroke()
    doc.fontSize(11).font('Helvetica-Bold').text('Facturer à :', 50, 135)
    doc.fontSize(10).font('Helvetica').text(parsed.data.company_name, 50, 150)
    if (parsed.data.siret) doc.text(`SIRET : ${parsed.data.siret}`, 50, 165)

    // Items table
    const tableTop = 210
    doc.font('Helvetica-Bold').fontSize(10)
    doc.text('Article', 50, tableTop)
    doc.text('Qté', 320, tableTop, { width: 60, align: 'right' })
    doc.text('Prix TTC', 390, tableTop, { width: 80, align: 'right' })
    doc.text('TVA', 480, tableTop, { width: 65, align: 'right' })
    doc.moveTo(50, tableTop + 15).lineTo(545, tableTop + 15).stroke()

    let y = tableTop + 25
    doc.font('Helvetica').fontSize(10)
    const items = (order.order_items ?? []) as Array<{ product_name: string; emoji: string | null; quantity: number; unit_price: number; tva_rate: number }>
    for (const item of items) {
      const ttc = item.unit_price * (1 + item.tva_rate / 100) * item.quantity
      doc.text(item.product_name, 50, y)
      doc.text(String(item.quantity), 320, y, { width: 60, align: 'right' })
      doc.text(`${ttc.toFixed(2)} €`, 390, y, { width: 80, align: 'right' })
      doc.text(`${item.tva_rate}%`, 480, y, { width: 65, align: 'right' })
      y += 18
    }

    // Totals
    doc.moveTo(50, y + 5).lineTo(545, y + 5).stroke()
    y += 15
    doc.text(`Sous-total HT :`, 350, y)
    doc.text(`${(order.subtotal_ht ?? 0).toFixed(2)} €`, 480, y, { width: 65, align: 'right' })
    y += 15
    if ((order.tax_5_5 ?? 0) > 0) { doc.text('TVA 5,5% :', 350, y); doc.text(`${(order.tax_5_5 ?? 0).toFixed(2)} €`, 480, y, { width: 65, align: 'right' }); y += 15 }
    if ((order.tax_10  ?? 0) > 0) { doc.text('TVA 10% :', 350, y);  doc.text(`${(order.tax_10  ?? 0).toFixed(2)} €`, 480, y, { width: 65, align: 'right' }); y += 15 }
    if ((order.tax_20  ?? 0) > 0) { doc.text('TVA 20% :', 350, y);  doc.text(`${(order.tax_20  ?? 0).toFixed(2)} €`, 480, y, { width: 65, align: 'right' }); y += 15 }
    doc.font('Helvetica-Bold').fontSize(12)
    doc.text('TOTAL TTC :', 350, y)
    doc.text(`${order.total_ttc.toFixed(2)} €`, 480, y, { width: 65, align: 'right' })

    // Footer
    doc.fontSize(8).font('Helvetica').text('Alloflow — logiciel de caisse certifié', 50, 760, { align: 'center', width: 495 })

    doc.end()
  })

  // Upload dans Supabase Storage (bucket 'invoices' doit exister, créer dans Dashboard → Storage)
  // On uploade d'abord avec un nom temporaire, puis on insère en DB atomiquement
  const tempFileName = `${estabId}/tmp-${orderId}.pdf`
  const { error: uploadError } = await serviceClient.storage
    .from('invoices')
    .upload(tempFileName, pdfBuffer, { contentType: 'application/pdf', upsert: true })

  if (uploadError) {
    console.error('[invoice] Storage upload failed:', uploadError)
    return NextResponse.json({ error: 'pdf_upload_failed' }, { status: 500 })
  }

  // Insérer en DB atomiquement via RPC (advisory lock — pas de race condition)
  const { data: invoiceData, error: rpcError } = await serviceClient.rpc('insert_invoice_atomic', {
    p_establishment_id: estabId,
    p_order_id:         orderId,
    p_year:             year,
    p_company_name:     parsed.data.company_name,
    p_siret:            parsed.data.siret ?? null,
    p_delivery_email:   parsed.data.delivery_email ?? null,
    p_pdf_url:          tempFileName,  // sera mis à jour après rename
  })

  if (rpcError || !invoiceData?.[0]) {
    console.error('[invoice] RPC insert failed:', rpcError)
    return NextResponse.json({ error: 'invoice_insert_failed' }, { status: 500 })
  }

  const { invoice_number: invoiceNumber } = invoiceData[0]

  // Renommer le fichier avec le numéro définitif
  const finalFileName = `${estabId}/${invoiceNumber}.pdf`
  await serviceClient.storage.from('invoices').move(tempFileName, finalFileName)
  await serviceClient.from('invoices').update({ pdf_url: finalFileName }).eq('order_id', orderId).eq('establishment_id', estabId)

  // URL signée 1h
  const { data: signedData } = await serviceClient.storage
    .from('invoices')
    .createSignedUrl(finalFileName, 3600)

  if (!signedData?.signedUrl) {
    return NextResponse.json({ error: 'signed_url_failed' }, { status: 500 })
  }

  return NextResponse.json({ pdf_url: signedData.signedUrl, invoice_number: invoiceNumber })
}
```

**Note storage :** Créer le bucket `invoices` dans Supabase Dashboard → Storage → New bucket, nom `invoices`, private (avant de tester).

- [ ] **Step 4: Vérifier TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep "invoice" | head -10
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/supabase/service.ts src/app/api/receipts/[orderId]/invoice/ package.json package-lock.json
git commit -m "feat: add invoice PDF route with pdfkit + Supabase Storage"
```

---

## Task 8: Page publique reçu /receipt/[orderId]

**Files:**
- Create: `src/app/receipt/[orderId]/page.tsx`

- [ ] **Step 1: Créer la page**

```tsx
// src/app/receipt/[orderId]/page.tsx
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { createServiceClient } from '@/lib/supabase/service'

export const metadata: Metadata = {
  robots: { index: false, follow: false },
}

interface Props {
  params: Promise<{ orderId: string }>
}

export default async function ReceiptPage({ params }: Props) {
  const { orderId } = await params
  const supabase = createServiceClient()

  const { data: order } = await supabase
    .from('orders')
    .select('created_at, total_ttc, status, subtotal_ht, tax_5_5, tax_10, tax_20, order_items(product_name, emoji, quantity, unit_price, tva_rate), establishments(name, address, siret, receipt_footer)')
    .eq('id', orderId)
    .eq('status', 'paid')
    .single()

  if (!order) notFound()

  const estab = order.establishments as { name: string; address: string | null; siret: string | null; receipt_footer: string | null } | null
  const items = (order.order_items ?? []) as Array<{ product_name: string; emoji: string | null; quantity: number; unit_price: number; tva_rate: number }>

  const dateStr = new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris',
  }).format(new Date(order.created_at))

  return (
    <div style={{ minHeight: '100vh', background: '#0f172a', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '32px 16px' }}>
      <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '16px', padding: '32px 24px', maxWidth: '480px', width: '100%', color: '#f1f5f9' }}>

        {/* Header */}
        <div style={{ marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
            <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#1d4ed8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: '700', color: 'white' }}>A</div>
            <span style={{ fontSize: '18px', fontWeight: '700' }}>{estab?.name ?? 'Établissement'}</span>
          </div>
          {estab?.address && <p style={{ fontSize: '12px', color: '#64748b', margin: 0 }}>{estab.address}</p>}
          {estab?.siret && <p style={{ fontSize: '12px', color: '#64748b', margin: 0 }}>SIRET : {estab.siret}</p>}
          <p style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>{dateStr}</p>
        </div>

        {/* Items */}
        <div style={{ borderTop: '1px solid #334155', paddingTop: '16px', marginBottom: '16px' }}>
          {items.map((item, i) => {
            const ttc = item.unit_price * (1 + item.tva_rate / 100) * item.quantity
            return (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', fontSize: '14px' }}>
                <span style={{ color: '#f1f5f9' }}>{item.emoji ? `${item.emoji} ` : ''}{item.product_name} <span style={{ color: '#64748b' }}>×{item.quantity}</span></span>
                <span style={{ fontWeight: '600', color: '#f1f5f9' }}>{ttc.toFixed(2)} €</span>
              </div>
            )
          })}
        </div>

        {/* TVA detail */}
        <div style={{ borderTop: '1px solid #334155', paddingTop: '12px', marginBottom: '12px', fontSize: '12px', color: '#64748b' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Sous-total HT</span><span>{(order.subtotal_ht ?? 0).toFixed(2)} €</span></div>
          {(order.tax_5_5 ?? 0) > 0 && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>TVA 5,5%</span><span>{(order.tax_5_5 ?? 0).toFixed(2)} €</span></div>}
          {(order.tax_10  ?? 0) > 0 && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>TVA 10%</span><span>{(order.tax_10  ?? 0).toFixed(2)} €</span></div>}
          {(order.tax_20  ?? 0) > 0 && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>TVA 20%</span><span>{(order.tax_20  ?? 0).toFixed(2)} €</span></div>}
        </div>

        {/* Total */}
        <div style={{ borderTop: '2px solid #334155', paddingTop: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '16px', fontWeight: '700' }}>Total TTC</span>
          <span style={{ fontSize: '24px', fontWeight: '900' }}>{order.total_ttc.toFixed(2)} €</span>
        </div>

        {/* Footer */}
        {estab?.receipt_footer && (
          <p style={{ fontSize: '11px', color: '#475569', textAlign: 'center', marginTop: '20px' }}>
            {estab.receipt_footer}
          </p>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Vérifier TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep "receipt\[" | head -10
```

- [ ] **Step 3: Lancer le dev server et vérifier qu'une URL `/receipt/fakeid` retourne 404**

```bash
# Dans un autre terminal :
cd "/Users/anthony/Super pouvoir/Alloflow" && npm run dev &
sleep 5
curl -s http://localhost:3000/receipt/00000000-0000-0000-0000-000000000000 | grep -i "not found\|404" | head -3
```

Expected: 404 page (commande inexistante)

- [ ] **Step 4: Commit**

```bash
git add src/app/receipt/
git commit -m "feat: add public receipt page /receipt/[orderId]"
```

---

## Tests de validation finale

Après toutes les tâches, vérifier :

```bash
cd "/Users/anthony/Super pouvoir/Alloflow"
npx vitest run src/app/caisse/pos/_components/payment-split.test.tsx
npx tsc --noEmit 2>&1 | grep -v "^$" | head -20
```

Expected: 5 tests PASS, 0 erreurs TypeScript nouvelles
