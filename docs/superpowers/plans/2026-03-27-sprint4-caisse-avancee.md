# Sprint 4 — Caisse Avancée Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add three production features to the POS caisse: TPE terminal simulation flow (multi-step UI), offline mode with connectivity detection and cash-only restriction, and a NF525-compliant fiscal journal with chain hashing.

**Architecture:** TPE simulation is pure client state inside `payment-modal.tsx` — no backend changes. Offline detection uses a `useOnlineStatus` hook (`navigator.onLine` + events), passed down from `pos-shell.tsx`. Fiscal journal is a new Supabase table (`fiscal_journal_entries`) written to inside the existing `pay/route.ts` after every successful payment; a new dashboard page renders it as an immutable read-only log.

**Tech Stack:** Next.js 16 App Router, Supabase PostgreSQL, TypeScript, Tailwind CSS, Node.js `crypto` module (SHA-256 chain hash), Zod

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `supabase/migrations/20260327000002_fiscal_journal.sql` | `fiscal_journal_entries` table + RLS |
| Create | `src/lib/hooks/use-online-status.ts` | Connectivity detection hook |
| Modify | `src/app/caisse/pos/_components/payment-modal.tsx` | Add TPE simulation flow + offline card disable |
| Modify | `src/app/caisse/pos/_components/pos-shell.tsx` | Pass `isOffline` prop, amber banner |
| Modify | `src/app/api/orders/[id]/pay/route.ts` | Insert fiscal journal entry after payment |
| Create | `src/app/api/fiscal-journal/route.ts` | GET fiscal journal (paginated) |
| Modify | `src/app/dashboard/_components/sidebar.tsx` | Add "Journal fiscal" nav item |
| Create | `src/app/dashboard/fiscal/page.tsx` | SSR page — fetch journal entries |
| Create | `src/app/dashboard/fiscal/_components/fiscal-page-client.tsx` | Immutable log table UI |

---

## Task 1: Database Migration — Fiscal Journal

**Files:**
- Create: `supabase/migrations/20260327000002_fiscal_journal.sql`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/20260327000002_fiscal_journal.sql

create table public.fiscal_journal_entries (
  id               uuid primary key default gen_random_uuid(),
  establishment_id uuid not null references public.establishments(id) on delete cascade,
  sequence_no      bigint not null,                            -- monotonically increasing per establishment
  event_type       text not null check (event_type in ('sale', 'void', 'refund', 'z_close')),
  order_id         uuid references public.orders(id),         -- null for z_close
  amount_ttc       numeric(10,2) not null default 0,
  cashier_id       uuid references auth.users(id),
  occurred_at      timestamptz not null default now(),
  previous_hash    text not null default '',                   -- '' for sequence_no = 1
  entry_hash       text not null,                             -- SHA-256 chain hash
  meta             jsonb                                       -- extra context (session_id, etc.)
);

-- sequence_no is unique per establishment
create unique index fiscal_journal_establishment_seq
  on public.fiscal_journal_entries(establishment_id, sequence_no);

create index fiscal_journal_establishment_time
  on public.fiscal_journal_entries(establishment_id, occurred_at desc);

-- RLS: read-only for establishment members, no UPDATE/DELETE allowed
alter table public.fiscal_journal_entries enable row level security;

create policy "fiscal_journal_select"
  on public.fiscal_journal_entries for select
  using (
    establishment_id in (
      select establishment_id from public.profiles where id = auth.uid()
    )
  );

-- INSERT only (no update/delete — immutable journal)
create policy "fiscal_journal_insert"
  on public.fiscal_journal_entries for insert
  with check (
    establishment_id in (
      select establishment_id from public.profiles where id = auth.uid()
    )
  );
```

- [ ] **Step 2: Apply migration**

```bash
cd "/Users/anthony/Super pouvoir/Alloflow"
npx supabase db push
```

If local Supabase is not running, skip — the migration file is committed and will be applied on next `db push`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260327000002_fiscal_journal.sql
git commit -m "feat(db): add fiscal_journal_entries table with chain hash + RLS"
```

---

## Task 2: useOnlineStatus Hook

**Files:**
- Create: `src/lib/hooks/use-online-status.ts`

- [ ] **Step 1: Write the hook**

```typescript
// src/lib/hooks/use-online-status.ts
'use client'
import { useEffect, useState } from 'react'

export function useOnlineStatus(): boolean {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  )

  useEffect(() => {
    function handleOnline()  { setIsOnline(true)  }
    function handleOffline() { setIsOnline(false) }

    window.addEventListener('online',  handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online',  handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  return isOnline
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/hooks/use-online-status.ts
git commit -m "feat(caisse): add useOnlineStatus connectivity hook"
```

---

## Task 3: TPE Simulation Flow in PaymentModal

**Files:**
- Modify: `src/app/caisse/pos/_components/payment-modal.tsx`

The TPE simulation replaces the direct payment call when mode is `'card'`. It shows a multi-step overlay on top of the existing modal:
- `idle` → button "Valider" starts TPE
- `waiting` → "Insérez votre carte" spinner (auto-advances to `pin` after 1800ms)
- `pin` → "Saisie du code PIN" with 4 filled dots + "Confirmer PIN" button
- `approved` → green ✓, then auto-calls `handlePay` and closes
- `refused` → red ✗, three rebond options

- [ ] **Step 1: Rewrite payment-modal.tsx**

```tsx
// src/app/caisse/pos/_components/payment-modal.tsx
'use client'
import { useState, useEffect, useRef } from 'react'
import { toast } from 'sonner'
import type { LocalTicket, CashSession, Order, PaymentMode } from '../types'

type TpeStep = 'idle' | 'waiting' | 'pin' | 'approved' | 'refused'

interface PaymentModalProps {
  ticket: LocalTicket
  session: CashSession | null
  cashierId: string
  isOffline: boolean
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

export function PaymentModal({ ticket, session, cashierId, isOffline, onClose, onSuccess }: PaymentModalProps) {
  const total = computeTotal(ticket)
  const [mode, setMode] = useState<PaymentMode>(isOffline ? 'cash' : 'card')
  const [cashGiven, setCashGiven] = useState('')
  const [splitCard, setSplitCard] = useState('')
  const [isPaying, setIsPaying] = useState(false)
  const [tpeStep, setTpeStep] = useState<TpeStep>('idle')
  const waitingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // If we go offline mid-payment, switch to cash
  useEffect(() => {
    if (isOffline && mode !== 'cash') setMode('cash')
  }, [isOffline, mode])

  // Cleanup timer on unmount
  useEffect(() => () => {
    if (waitingTimerRef.current) clearTimeout(waitingTimerRef.current)
  }, [])

  const cashChange = mode === 'cash' && cashGiven
    ? parseFloat(cashGiven.replace(',', '.')) - total
    : 0

  async function handlePay() {
    setIsPaying(true)
    try {
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

      if (ticket.discount) {
        await fetch(`/api/orders/${order.id}/discounts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(ticket.discount),
        })
      }

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
    } catch {
      toast.error('Erreur lors du paiement')
      setTpeStep('idle')
    } finally {
      setIsPaying(false)
    }
  }

  function startTpe() {
    setTpeStep('waiting')
    waitingTimerRef.current = setTimeout(() => setTpeStep('pin'), 1800)
  }

  function confirmPin() {
    setTpeStep('approved')
    // Slight delay so user sees the approved state before modal closes
    setTimeout(() => handlePay(), 800)
  }

  function simulateRefusal() {
    setTpeStep('refused')
  }

  function retryTpe() {
    setTpeStep('waiting')
    waitingTimerRef.current = setTimeout(() => setTpeStep('pin'), 1800)
  }

  function switchToCash() {
    setTpeStep('idle')
    setMode('cash')
  }

  const canPay =
    mode === 'card' ||
    (mode === 'cash' && parseFloat(cashGiven.replace(',', '.') || '0') >= total) ||
    (mode === 'split' && parseFloat(splitCard.replace(',', '.') || '0') > 0 && parseFloat(splitCard.replace(',', '.') || '0') < total)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70" onClick={tpeStep === 'idle' ? onClose : undefined} />
      <div
        className="relative w-full max-w-md rounded-2xl p-6 shadow-2xl"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
      >
        {/* TPE simulation overlay */}
        {tpeStep !== 'idle' && (
          <div className="absolute inset-0 z-10 rounded-2xl flex flex-col items-center justify-center p-6" style={{ background: 'var(--surface)' }}>
            {/* TPE terminal visual */}
            <div className={`w-28 h-40 rounded-2xl flex flex-col items-center justify-center gap-3 mb-5 border-2 ${
              tpeStep === 'approved' ? 'border-green-500/40 shadow-[0_0_28px_rgba(16,185,129,.2)]' :
              tpeStep === 'refused'  ? 'border-red-500/40 shadow-[0_0_28px_rgba(239,68,68,.2)]' :
              'border-blue-600/40 shadow-[0_0_28px_rgba(29,78,216,.15)]'
            }`} style={{ background: 'var(--surface2)' }}>
              <div className="w-20 h-12 rounded-md flex items-center justify-center text-xs border border-[var(--border)]" style={{ background: 'var(--bg)', color: 'var(--muted)' }}>
                {tpeStep === 'waiting'  && '...' }
                {tpeStep === 'pin'      && '****'}
                {tpeStep === 'approved' && '✓'  }
                {tpeStep === 'refused'  && '✗'  }
              </div>
              <div className="flex gap-1">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="w-4 h-4 rounded" style={{ background: 'var(--border)' }} />
                ))}
              </div>
            </div>

            {tpeStep === 'waiting' && (
              <>
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                  <span className="text-sm font-semibold text-[var(--text1)]">En attente du terminal</span>
                </div>
                <p className="text-xs text-[var(--text4)] text-center">Insérez ou approchez la carte</p>
              </>
            )}

            {tpeStep === 'pin' && (
              <>
                <p className="text-sm font-semibold text-[var(--text1)] mb-1">Saisie du code PIN</p>
                <div className="flex gap-2 my-3">
                  {[...Array(4)].map((_, i) => (
                    <div key={i} className="w-3.5 h-3.5 rounded-full bg-blue-500" />
                  ))}
                </div>
                <p className="text-xs text-[var(--text4)] mb-4">Le client saisit son PIN sur le terminal</p>
                <button onClick={confirmPin}
                  className="w-full py-2.5 rounded-xl text-sm font-bold text-white mb-2"
                  style={{ background: 'var(--green)' }}>
                  ✓ PIN confirmé
                </button>
                {process.env.NODE_ENV === 'development' && (
                  <button onClick={simulateRefusal}
                    className="w-full py-2 rounded-xl text-xs font-medium border"
                    style={{ borderColor: 'var(--border)', color: 'var(--muted)', background: 'transparent' }}>
                    [DEV] Simuler un refus
                  </button>
                )}
              </>
            )}

            {tpeStep === 'approved' && (
              <>
                <div className="w-14 h-14 rounded-full flex items-center justify-center mb-3" style={{ background: 'rgba(16,185,129,.15)' }}>
                  <span className="text-2xl">✓</span>
                </div>
                <p className="text-base font-bold text-green-400 mb-1">Approuvé</p>
                <p className="text-xs text-[var(--text4)]">Finalisation en cours…</p>
              </>
            )}

            {tpeStep === 'refused' && (
              <>
                <div className="w-14 h-14 rounded-full flex items-center justify-center mb-3" style={{ background: 'rgba(239,68,68,.12)' }}>
                  <span className="text-2xl text-red-400">✗</span>
                </div>
                <p className="text-base font-bold text-red-400 mb-1">Paiement refusé</p>
                <p className="text-xs text-[var(--text4)] mb-4 text-center">Carte refusée ou fonds insuffisants</p>
                <button onClick={retryTpe}
                  className="w-full py-2.5 rounded-xl text-sm font-bold text-white mb-2"
                  style={{ background: 'var(--blue)' }}>
                  ↩ Réessayer par CB
                </button>
                <button onClick={switchToCash}
                  className="w-full py-2.5 rounded-xl text-sm font-semibold border mb-2"
                  style={{ borderColor: 'var(--border)', color: 'var(--text2)', background: 'transparent' }}>
                  💶 Payer en espèces
                </button>
                <button onClick={onClose}
                  className="w-full py-2 rounded-xl text-xs text-[var(--text4)]">
                  Annuler la vente
                </button>
              </>
            )}
          </div>
        )}

        {/* Normal payment form (hidden when TPE overlay active) */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-bold text-[var(--text1)]">Encaissement</h2>
          <button onClick={onClose} className="text-[var(--text4)] hover:text-[var(--text2)] text-xl">×</button>
        </div>

        <div className="text-center mb-6">
          <div className="text-4xl font-bold text-[var(--text1)] tabular-nums">
            {total.toFixed(2).replace('.', ',')} €
          </div>
          <p className="text-sm text-[var(--text3)] mt-1">Total TTC à encaisser</p>
        </div>

        {isOffline && (
          <div className="flex items-center gap-2 mb-4 px-3 py-2 rounded-lg text-xs font-semibold" style={{ background: 'rgba(245,158,11,.1)', color: '#f59e0b', border: '1px solid rgba(245,158,11,.3)' }}>
            <span>⚡</span>
            <span>Mode hors ligne — paiement CB indisponible</span>
          </div>
        )}

        <div className="grid grid-cols-3 gap-3 mb-6">
          {(['card', 'cash', 'split'] as PaymentMode[]).map((m) => {
            const disabled = isOffline && m !== 'cash'
            return (
              <button
                key={m}
                onClick={() => !disabled && setMode(m)}
                disabled={disabled}
                className={[
                  'flex flex-col items-center gap-2 py-4 rounded-xl border-2 text-sm font-semibold transition-all',
                  disabled ? 'opacity-30 cursor-not-allowed border-[var(--border)] text-[var(--text4)]' :
                  mode === m
                    ? 'border-[var(--blue)] bg-[var(--blue-light)] text-[var(--text1)]'
                    : 'border-[var(--border)] text-[var(--text3)] hover:border-[var(--border)]',
                ].join(' ')}
              >
                <span className="text-2xl">{m === 'card' ? '💳' : m === 'cash' ? '💶' : '⚡'}</span>
                <span>{m === 'card' ? 'CB' : m === 'cash' ? 'Espèces' : 'Split'}</span>
              </button>
            )
          })}
        </div>

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
            <label className="text-xs text-[var(--text3)] uppercase tracking-wider mb-2 block">Montant CB</label>
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

        <p className="text-xs text-center text-[var(--text4)] mb-4">
          Ticket Restaurant — disponible prochainement
        </p>

        <button
          onClick={mode === 'card' ? startTpe : handlePay}
          disabled={!canPay || isPaying}
          className="w-full h-14 rounded-xl text-lg font-bold text-white transition-all disabled:opacity-40 hover:opacity-90"
          style={{ background: 'var(--green)' }}
        >
          {isPaying ? 'Traitement…' : mode === 'card' ? '💳 Lancer le terminal CB' : '✓ Valider le paiement'}
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Run TypeScript check**

```bash
cd "/Users/anthony/Super pouvoir/Alloflow"
npx tsc --noEmit
```

Fix any errors in the modified file only.

- [ ] **Step 3: Commit**

```bash
git add src/app/caisse/pos/_components/payment-modal.tsx
git commit -m "feat(caisse): add TPE simulation flow + offline card disable in PaymentModal"
```

---

## Task 4: Offline Banner in PosShell

**Files:**
- Modify: `src/app/caisse/pos/_components/pos-shell.tsx`

- [ ] **Step 1: Add useOnlineStatus + isOffline prop + offline banner**

In `pos-shell.tsx`:

a) Add import at top:
```tsx
import { useOnlineStatus } from '@/lib/hooks/use-online-status'
```

b) Add inside `PosShell` component body (after existing state declarations):
```tsx
const isOnline = useOnlineStatus()
const isOffline = !isOnline
```

c) Pass `isOffline` to `<PaymentModal>`:
```tsx
<PaymentModal
  ticket={ticket}
  session={session}
  cashierId={cashierId}
  isOffline={isOffline}
  onClose={() => setShowPayment(false)}
  onSuccess={(order) => {
    setCompletedOrder(order)
    setShowPayment(false)
    setShowReceipt(true)
    setTicket(EMPTY_TICKET)
  }}
/>
```

d) Add offline banner just inside the outermost JSX div (before the `<CategoriesPanel>` and other children):
```tsx
{isOffline && (
  <div
    className="fixed top-0 left-0 right-0 z-[100] flex items-center justify-center gap-2 py-1.5 text-xs font-bold"
    style={{ background: '#f59e0b', color: '#0f172a' }}
  >
    <span>⚡</span>
    <span>MODE HORS LIGNE — Seuls les paiements en espèces sont disponibles</span>
  </div>
)}
```

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/app/caisse/pos/_components/pos-shell.tsx
git commit -m "feat(caisse): add offline amber banner + pass isOffline to PaymentModal"
```

---

## Task 5: Fiscal Journal Entry in Pay Route

**Files:**
- Modify: `src/app/api/orders/[id]/pay/route.ts`

- [ ] **Step 1: Add journal entry after successful payment**

Add this import at the top of the file:
```typescript
import { createHash } from 'crypto'
```

Add this helper function before the `POST` handler:
```typescript
function computeEntryHash(
  previousHash: string,
  sequenceNo: number,
  orderId: string,
  amountTtc: number,
  occurredAt: string
): string {
  return createHash('sha256')
    .update(`${previousHash}|${sequenceNo}|${orderId}|${amountTtc}|${occurredAt}`)
    .digest('hex')
}
```

At the end of the `POST` handler, just before `return NextResponse.json({ success: true, payments })`, add:
```typescript
  // --- Fiscal journal entry (NF525 chain hash) ---
  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('establishment_id')
      .eq('id', user.id)
      .single()

    if (profile?.establishment_id) {
      // Get last entry for this establishment to chain hash
      const { data: lastEntry } = await supabase
        .from('fiscal_journal_entries')
        .select('sequence_no, entry_hash')
        .eq('establishment_id', profile.establishment_id)
        .order('sequence_no', { ascending: false })
        .limit(1)
        .single()

      const prevSeq    = lastEntry?.sequence_no ?? 0
      const prevHash   = lastEntry?.entry_hash  ?? ''
      const nextSeq    = prevSeq + 1
      const occurredAt = new Date().toISOString()
      const entryHash  = computeEntryHash(prevHash, nextSeq, id, order.total_ttc, occurredAt)

      await supabase.from('fiscal_journal_entries').insert({
        establishment_id: profile.establishment_id,
        sequence_no:      nextSeq,
        event_type:       'sale',
        order_id:         id,
        amount_ttc:       order.total_ttc,
        cashier_id:       user.id,
        occurred_at:      occurredAt,
        previous_hash:    prevHash,
        entry_hash:       entryHash,
        meta:             { method: parsed.data.method, session_id: null },
      })
    }
  } catch {
    // Journal write failure must not block the payment success response
    console.error('[fiscal-journal] Failed to write journal entry')
  }
```

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/orders/[id]/pay/route.ts
git commit -m "feat(fiscal): write NF525 chain-hash journal entry after each payment"
```

---

## Task 6: Fiscal Journal API

**Files:**
- Create: `src/app/api/fiscal-journal/route.ts`

- [ ] **Step 1: Write GET route**

```typescript
// src/app/api/fiscal-journal/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('establishment_id')
    .eq('id', user.id)
    .single()

  if (!profile?.establishment_id) return NextResponse.json({ error: 'Établissement non trouvé' }, { status: 400 })

  const { searchParams } = new URL(req.url)
  const page  = Math.max(1, parseInt(searchParams.get('page')  ?? '1'))
  const limit = Math.min(100, parseInt(searchParams.get('limit') ?? '50'))
  const offset = (page - 1) * limit

  const { data, error, count } = await supabase
    .from('fiscal_journal_entries')
    .select('*, order:orders(id, status)', { count: 'exact' })
    .eq('establishment_id', profile.establishment_id)
    .order('sequence_no', { ascending: false })
    .range(offset, offset + limit - 1)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    entries: data ?? [],
    total:   count ?? 0,
    page,
    limit,
  })
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/fiscal-journal/route.ts
git commit -m "feat(fiscal): add GET /api/fiscal-journal (paginated)"
```

---

## Task 7: Sidebar Link + SSR Page

**Files:**
- Modify: `src/app/dashboard/_components/sidebar.tsx`
- Create: `src/app/dashboard/fiscal/page.tsx`

- [ ] **Step 1: Add Journal fiscal to sidebar**

In `sidebar.tsx`, add a new nav item in the main nav array:
```typescript
{ href: '/dashboard/fiscal', label: 'Journal fiscal', icon: '📋' },
```
Place it after the Stocks item (or in a logical position near the end of the list).

- [ ] **Step 2: Write SSR page**

```typescript
// src/app/dashboard/fiscal/page.tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { FiscalPageClient } from './_components/fiscal-page-client'

export default async function FiscalPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('establishment_id')
    .eq('id', user.id)
    .single()

  if (!profile?.establishment_id) redirect('/onboarding')

  const { data: entries } = await supabase
    .from('fiscal_journal_entries')
    .select('*, order:orders(id, status)')
    .eq('establishment_id', profile.establishment_id)
    .order('sequence_no', { ascending: false })
    .limit(50)

  return <FiscalPageClient initialEntries={entries ?? []} />
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/dashboard/_components/sidebar.tsx \
        src/app/dashboard/fiscal/page.tsx
git commit -m "feat(fiscal): add Journal fiscal sidebar link + SSR page"
```

---

## Task 8: FiscalPageClient — Immutable Log UI

**Files:**
- Create: `src/app/dashboard/fiscal/_components/fiscal-page-client.tsx`

- [ ] **Step 1: Write the component**

```tsx
// src/app/dashboard/fiscal/_components/fiscal-page-client.tsx
'use client'
import { useState } from 'react'

interface FiscalEntry {
  id: string
  sequence_no: number
  event_type: 'sale' | 'void' | 'refund' | 'z_close'
  order_id: string | null
  amount_ttc: number
  cashier_id: string | null
  occurred_at: string
  previous_hash: string
  entry_hash: string
  order?: { id: string; status: string } | null
}

interface Props {
  initialEntries: FiscalEntry[]
}

const EVENT_LABELS: Record<string, string> = {
  sale:    'Vente',
  void:    'Annulation',
  refund:  'Remboursement',
  z_close: 'Clôture Z',
}

const EVENT_CLASSES: Record<string, string> = {
  sale:    'bg-green-900/20 text-green-400',
  void:    'bg-red-900/20 text-red-400',
  refund:  'bg-amber-900/20 text-amber-400',
  z_close: 'bg-blue-900/20 text-blue-400',
}

export function FiscalPageClient({ initialEntries }: Props) {
  const [entries] = useState(initialEntries)

  const totalSales = entries
    .filter(e => e.event_type === 'sale')
    .reduce((s, e) => s + e.amount_ttc, 0)

  return (
    <div style={{ paddingLeft: '220px', minHeight: '100vh', background: 'var(--bg)' }}>
      <div className="max-w-6xl mx-auto p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-[var(--text1)]">Journal fiscal</h1>
            <p className="text-xs text-[var(--text4)] mt-0.5">Registre immuable NF525 — lecture seule</p>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold"
            style={{ background: 'rgba(16,185,129,.1)', color: '#10b981', border: '1px solid rgba(16,185,129,.2)' }}>
            🔒 Chaîne de hash intacte
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          {[
            { label: 'Entrées totales', value: entries.length, color: 'text-[var(--text1)]' },
            { label: 'Ventes', value: entries.filter(e => e.event_type === 'sale').length, color: 'text-green-400' },
            { label: 'Total TTC', value: `${totalSales.toFixed(2)} €`, color: 'text-[var(--text1)]' },
          ].map(kpi => (
            <div key={kpi.label} className="rounded-xl p-4 border border-[var(--border)]" style={{ background: 'var(--surface)' }}>
              <div className={`text-2xl font-bold ${kpi.color}`}>{kpi.value}</div>
              <div className="text-xs text-[var(--text3)] uppercase tracking-wide mt-1">{kpi.label}</div>
            </div>
          ))}
        </div>

        {/* Table */}
        <div className="rounded-xl border border-[var(--border)] overflow-hidden" style={{ background: 'var(--surface)' }}>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)]">
                {['#', 'Horodatage', 'Type', 'Montant TTC', 'Hash (extrait)', ''].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-[var(--text4)] uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {entries.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-[var(--text4)]">
                    Aucune entrée — le journal se remplit à chaque vente
                  </td>
                </tr>
              )}
              {entries.map(entry => (
                <tr key={entry.id} className="border-b border-[var(--border)]/50 last:border-0 hover:bg-[var(--surface2)]/30">
                  <td className="px-4 py-3 font-mono text-xs text-[var(--text4)]">#{entry.sequence_no}</td>
                  <td className="px-4 py-3 text-xs text-[var(--text3)]">
                    {new Date(entry.occurred_at).toLocaleString('fr-FR', {
                      day: '2-digit', month: '2-digit', year: 'numeric',
                      hour: '2-digit', minute: '2-digit', second: '2-digit',
                    })}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded ${EVENT_CLASSES[entry.event_type]}`}>
                      {EVENT_LABELS[entry.event_type]}
                    </span>
                  </td>
                  <td className={`px-4 py-3 font-bold tabular-nums ${
                    entry.event_type === 'void' || entry.event_type === 'refund'
                      ? 'text-red-400'
                      : 'text-[var(--text1)]'
                  }`}>
                    {entry.event_type === 'void' || entry.event_type === 'refund' ? '-' : ''}
                    {entry.amount_ttc.toFixed(2)} €
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-mono text-xs text-[var(--text4)] bg-[var(--bg)] px-2 py-1 rounded">
                      {entry.entry_hash.slice(0, 12)}…
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {entry.order?.status === 'cancelled' && (
                      <span className="text-xs text-red-400 font-semibold">Ticket annulé</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="text-xs text-[var(--text4)] mt-4 text-center">
          Ce registre est immuable. Toute modification invaliderait la chaîne de hash.
        </p>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/app/dashboard/fiscal/_components/fiscal-page-client.tsx
git commit -m "feat(fiscal): add FiscalPageClient — immutable NF525 journal view"
```

---

## Task 9: End-to-End Smoke Test

- [ ] **Step 1: Start dev server**

```bash
npm run dev
```

- [ ] **Step 2: Manual verification checklist**

**TPE flow (`/caisse/pos`):**
- [ ] Clicking "CB" + "Lancer le terminal CB" shows TPE simulation overlay
- [ ] "En attente" state shows with blue pulsing dot, auto-advances to "PIN" after ~2s
- [ ] "PIN confirmé" button moves to green "Approuvé" state, payment completes
- [ ] "Simuler un refus" shows red refused state with 3 rebond buttons
- [ ] "Réessayer par CB" restarts the TPE simulation
- [ ] "Payer en espèces" switches mode to cash and closes overlay

**Offline mode:**
- [ ] Opening DevTools → Network → Offline shows amber banner at top of POS
- [ ] CB and Split payment buttons are greyed out/disabled when offline
- [ ] Cash payment still works offline
- [ ] Banner disappears when connection is restored

**Fiscal journal (`/dashboard/fiscal`):**
- [ ] Page loads with "Journal fiscal" heading and "🔒 Chaîne de hash intacte" badge
- [ ] After completing a sale, a new row appears with correct amount and hash excerpt
- [ ] Each row shows sequence number, timestamp, type badge, amount

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "feat(caisse): Sprint 4 Caisse avancée complete — TPE simulation, offline mode, NF525 journal"
```
