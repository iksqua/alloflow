# Sprint 6 — Fidélité POS Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate the loyalty program directly into the POS checkout flow: identify/register customers before payment, apply rewards as discounts, credit points automatically via DB trigger, and display points earned in the receipt modal.

**Architecture:** The loyalty flow inserts a new UX step between "ticket composed" and "payment": `TicketPanel` shows a loyalty trigger (amber button) instead of "Encaisser" when `loyaltyDone = false`. After identification or skip, `loyaltyDone = true` and the normal payment button reappears. `PosShell` holds `linkedCustomer`, `linkedReward`, `loyaltyDone` state. `PaymentModal` receives these as props and includes `customer_id`/`reward_id` in POST /api/orders. Points are credited by a Postgres trigger on `orders.status = 'paid'`.

**Tech Stack:** Next.js 16 App Router, Supabase PostgreSQL, TypeScript, Tailwind CSS, Zod

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `supabase/migrations/20260327000005_loyalty_v2.sql` | Extend customers (first_name/last_name/created_by), add customer_id+reward_id to orders, RLS policies, points DB trigger |
| Create | `src/lib/validations/loyalty.ts` | Zod schemas for customer CRUD + apply-reward |
| Create | `src/app/api/customers/search/route.ts` | GET search by phone or email (min 3 chars) |
| Create | `src/app/api/customers/route.ts` | POST create customer |
| Create | `src/app/api/customers/[id]/rewards/route.ts` | GET available rewards for a customer |
| Create | `src/app/api/loyalty/apply-reward/route.ts` | POST apply reward discount to an order |
| Modify | `src/app/caisse/pos/types.ts` | Add LoyaltyCustomer + LoyaltyReward types |
| Create | `src/app/caisse/pos/_components/loyalty-modal.tsx` | 3-state modal: searching/found/new-customer |
| Create | `src/app/caisse/pos/_components/loyalty-badge.tsx` | Compact inline badge on ticket panel |
| Modify | `src/app/caisse/pos/_components/ticket-panel.tsx` | LoyaltyTrigger + LoyaltyBadge + conditional Encaisser button |
| Modify | `src/app/caisse/pos/_components/pos-shell.tsx` | linkedCustomer/linkedReward/loyaltyDone state + LoyaltyModal |
| Modify | `src/app/caisse/pos/_components/payment-modal.tsx` | Accept linkedCustomer/linkedReward props, add to POST /api/orders |
| Modify | `src/app/caisse/pos/_components/receipt-modal.tsx` | Show "+X pts crédités" banner when customer linked |
| Modify | `src/app/api/orders/route.ts` | Accept customer_id + reward_id, compute loyalty discount_amount |

---

## Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/20260327000005_loyalty_v2.sql`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/20260327000005_loyalty_v2.sql

-- 1. Extend customers table
alter table public.customers
  add column if not exists first_name  text,
  add column if not exists last_name   text,
  add column if not exists created_by  uuid references public.profiles(id) on delete set null;

-- Backfill: copy name into first_name for existing rows
update public.customers set first_name = name where first_name is null;

-- Make first_name NOT NULL now that backfill is done
alter table public.customers alter column first_name set not null;
alter table public.customers alter column first_name set default '';

-- Update tier check constraint: bronze/argent/or → standard/silver/gold
alter table public.customers drop constraint if exists customers_tier_check;
alter table public.customers add constraint customers_tier_check
  check (tier in ('standard', 'silver', 'gold'));
-- Update existing tier values
update public.customers set tier = 'standard' where tier in ('bronze');
update public.customers set tier = 'silver'   where tier in ('argent');
update public.customers set tier = 'gold'     where tier in ('or');
-- Change default to 'standard'
alter table public.customers alter column tier set default 'standard';

-- 2. Add customer_id + reward_id to orders
alter table public.orders
  add column if not exists customer_id  uuid references public.customers(id) on delete set null,
  add column if not exists reward_id    uuid references public.loyalty_rewards(id) on delete set null;

-- 3. RLS on customers (establishment-scoped)
create policy "customers_by_establishment"
  on public.customers for all
  using (
    establishment_id in (
      select establishment_id from public.profiles where id = auth.uid()
    )
  );

-- 4. RLS on loyalty_rewards
create policy "loyalty_rewards_by_establishment"
  on public.loyalty_rewards for all
  using (
    establishment_id in (
      select establishment_id from public.profiles where id = auth.uid()
    )
  );

-- 5. RLS on loyalty_transactions (via customer's establishment)
create policy "loyalty_transactions_by_establishment"
  on public.loyalty_transactions for all
  using (
    customer_id in (
      select c.id from public.customers c
      join public.profiles p on p.establishment_id = c.establishment_id
      where p.id = auth.uid()
    )
  );

-- 6. DB trigger: credit points when order is paid
create or replace function public.credit_loyalty_points()
returns trigger language plpgsql security definer as $$
declare
  v_points int;
begin
  -- Only fire when transitioning to 'paid' with a customer
  if NEW.status = 'paid' and OLD.status <> 'paid' and NEW.customer_id is not null then
    v_points := floor(NEW.total_ttc - NEW.discount_amount);
    if v_points > 0 then
      -- Insert loyalty transaction
      insert into public.loyalty_transactions (customer_id, order_id, points, type)
      values (NEW.customer_id, NEW.id, v_points, 'earn');
      -- Update customer points + tier
      update public.customers
      set
        points = points + v_points,
        tier = case
          when points + v_points >= 200 then 'gold'
          when points + v_points >= 100 then 'silver'
          else 'standard'
        end
      where id = NEW.customer_id;
    end if;
  end if;
  return NEW;
end;
$$;

create trigger trg_credit_loyalty_points
  after update on public.orders
  for each row execute function public.credit_loyalty_points();
```

- [ ] **Step 2: Apply (skip if no local Supabase)**

```bash
cd "/Users/anthony/Super pouvoir/Alloflow"
npx supabase db push
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260327000005_loyalty_v2.sql
git commit -m "feat(db): loyalty v2 — extend customers, add customer_id+reward_id to orders, RLS policies, points trigger"
```

---

## Task 2: Zod Validation Schemas

**Files:**
- Create: `src/lib/validations/loyalty.ts`

- [ ] **Step 1: Write schemas**

```typescript
// src/lib/validations/loyalty.ts
import { z } from 'zod'

export const createCustomerSchema = z.object({
  first_name: z.string().min(1).max(100),
  last_name:  z.string().max(100).nullable().optional(),
  phone:      z.string().min(6).max(20).nullable().optional(),
  email:      z.string().email().nullable().optional(),
}).refine(d => d.phone || d.email, {
  message: 'Phone ou email requis',
})

export const applyRewardSchema = z.object({
  order_id:    z.string().uuid(),
  reward_id:   z.string().uuid(),
  customer_id: z.string().uuid(),
})

export type CreateCustomerInput = z.infer<typeof createCustomerSchema>
export type ApplyRewardInput    = z.infer<typeof applyRewardSchema>
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/validations/loyalty.ts
git commit -m "feat(loyalty): add Zod validation schemas"
```

---

## Task 3: API — Customers Search + Create

**Files:**
- Create: `src/app/api/customers/search/route.ts`
- Create: `src/app/api/customers/route.ts`

- [ ] **Step 1: Write search route**

```typescript
// src/app/api/customers/search/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

async function getEstablishmentId(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data } = await supabase.from('profiles').select('establishment_id').eq('id', userId).single()
  return data?.establishment_id ?? null
}

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const establishmentId = await getEstablishmentId(supabase, user.id)
  if (!establishmentId) return NextResponse.json({ error: 'Établissement non trouvé' }, { status: 400 })

  const q = new URL(req.url).searchParams.get('q') ?? ''
  if (q.length < 3) return NextResponse.json({ customers: [] })

  // Detect search type: email contains @, otherwise treat as phone
  const isEmail = q.includes('@')
  const { data, error } = await supabase
    .from('customers')
    .select('id, first_name, last_name, phone, email, points, tier')
    .eq('establishment_id', establishmentId)
    .ilike(isEmail ? 'email' : 'phone', `%${q}%`)
    .limit(5)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ customers: data ?? [] })
}
```

- [ ] **Step 2: Write create route**

```typescript
// src/app/api/customers/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createCustomerSchema } from '@/lib/validations/loyalty'

async function getEstablishmentId(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data } = await supabase.from('profiles').select('establishment_id').eq('id', userId).single()
  return data?.establishment_id ?? null
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const establishmentId = await getEstablishmentId(supabase, user.id)
  if (!establishmentId) return NextResponse.json({ error: 'Établissement non trouvé' }, { status: 400 })

  const body = await req.json()
  const result = createCustomerSchema.safeParse(body)
  if (!result.success) return NextResponse.json({ error: result.error.flatten() }, { status: 400 })

  const { data, error } = await supabase
    .from('customers')
    .insert({
      establishment_id: establishmentId,
      created_by:       user.id,
      name:             result.data.first_name,   // legacy `name` field (NOT NULL)
      first_name:       result.data.first_name,
      last_name:        result.data.last_name ?? null,
      phone:            result.data.phone ?? null,
      email:            result.data.email ?? null,
      points:           0,
      tier:             'standard',
    })
    .select('id, first_name, last_name, phone, email, points, tier')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
```

- [ ] **Step 3: TypeScript check + commit**

```bash
cd "/Users/anthony/Super pouvoir/Alloflow"
npx tsc --noEmit 2>&1 | grep -v "src/lib/types/database.ts" | head -20
git add src/app/api/customers/
git commit -m "feat(loyalty): add customers search + create API"
```

---

## Task 4: API — Rewards + Apply Reward

**Files:**
- Create: `src/app/api/customers/[id]/rewards/route.ts`
- Create: `src/app/api/loyalty/apply-reward/route.ts`

- [ ] **Step 1: Write rewards route**

```typescript
// src/app/api/customers/[id]/rewards/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Fetch customer to get points and tier
  const { data: customer, error: cErr } = await supabase
    .from('customers')
    .select('points, tier')
    .eq('id', id)
    .single()
  if (cErr || !customer) return NextResponse.json({ error: 'Client non trouvé' }, { status: 404 })

  const { data: profile } = await supabase
    .from('profiles').select('establishment_id').eq('id', user.id).single()
  if (!profile?.establishment_id) return NextResponse.json({ error: 'Établissement non trouvé' }, { status: 400 })

  // Return rewards the customer can afford
  const { data, error } = await supabase
    .from('loyalty_rewards')
    .select('id, name, points_required, discount_type, discount_value')
    .eq('establishment_id', profile.establishment_id)
    .lte('points_required', customer.points)
    .order('points_required')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ rewards: data ?? [], customer_points: customer.points, customer_tier: customer.tier })
}
```

- [ ] **Step 2: Write apply-reward route**

```typescript
// src/app/api/loyalty/apply-reward/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { applyRewardSchema } from '@/lib/validations/loyalty'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const result = applyRewardSchema.safeParse(body)
  if (!result.success) return NextResponse.json({ error: result.error.flatten() }, { status: 400 })

  const { order_id, reward_id, customer_id } = result.data

  // Fetch reward
  const { data: reward, error: rErr } = await supabase
    .from('loyalty_rewards')
    .select('discount_type, discount_value')
    .eq('id', reward_id)
    .single()
  if (rErr || !reward) return NextResponse.json({ error: 'Récompense non trouvée' }, { status: 404 })

  // Fetch order total
  const { data: order, error: oErr } = await supabase
    .from('orders')
    .select('total_ttc')
    .eq('id', order_id)
    .single()
  if (oErr || !order) return NextResponse.json({ error: 'Commande non trouvée' }, { status: 404 })

  const discountAmount = reward.discount_type === 'percent'
    ? Math.round(order.total_ttc * (reward.discount_value / 100) * 100) / 100
    : reward.discount_value

  const newTotal = Math.max(0, order.total_ttc - discountAmount)

  const { error: uErr } = await supabase
    .from('orders')
    .update({
      customer_id,
      reward_id,
      discount_amount: discountAmount,
      total_ttc:       newTotal,
    })
    .eq('id', order_id)

  if (uErr) return NextResponse.json({ error: uErr.message }, { status: 500 })
  return NextResponse.json({ order_id, discount_amount: discountAmount, new_total: newTotal })
}
```

- [ ] **Step 3: TypeScript check + commit**

```bash
cd "/Users/anthony/Super pouvoir/Alloflow"
npx tsc --noEmit 2>&1 | grep -v "src/lib/types/database.ts" | head -20
git add src/app/api/customers/[id]/ src/app/api/loyalty/
git commit -m "feat(loyalty): add rewards GET + apply-reward POST API"
```

---

## Task 5: POS Types Update + Orders API

**Files:**
- Modify: `src/app/caisse/pos/types.ts`
- Modify: `src/app/api/orders/route.ts`

- [ ] **Step 1: Add loyalty types to types.ts**

In `src/app/caisse/pos/types.ts`, add at the end of the file:

```typescript
// Loyalty types (Sprint 6)
export interface LoyaltyCustomer {
  id: string
  first_name: string
  last_name: string | null
  phone: string | null
  email: string | null
  points: number
  tier: 'standard' | 'silver' | 'gold'
}

export interface LoyaltyReward {
  id: string
  name: string
  points_required: number
  discount_type: 'percent' | 'fixed'
  discount_value: number
}
```

- [ ] **Step 2: Update orders API to accept customer_id + reward_id**

In `src/app/api/orders/route.ts`, update `createOrderSchema` to add optional loyalty fields, and pass them to the insert:

Replace the schema definition:
```typescript
const createOrderSchema = z.object({
  session_id:  z.string().uuid().optional(),
  table_id:    z.string().uuid().optional(),
  customer_id: z.string().uuid().optional(),
  reward_id:   z.string().uuid().optional(),
  reward_discount_amount: z.number().min(0).optional(),
  items: z.array(z.object({
    product_id:   z.string().uuid(),
    product_name: z.string(),
    emoji:        z.string().nullable().optional(),
    unit_price:   z.number().positive(),   // HT
    tva_rate:     z.union([z.literal(5.5), z.literal(10), z.literal(20)]),
    quantity:     z.number().int().positive(),
    note:         z.string().optional(),
  })).min(1, 'Au moins un article requis'),
})
```

Replace the order insert to include loyalty fields:
```typescript
  const { data: order, error: orderError } = await supabase
    .from('orders')
    .insert({
      establishment_id: profile.establishment_id,
      session_id:       session_id ?? null,
      table_id:         table_id ?? null,
      cashier_id:       user.id,
      customer_id:      parsed.data.customer_id ?? null,
      reward_id:        parsed.data.reward_id ?? null,
      discount_amount:  parsed.data.reward_discount_amount ?? 0,
      subtotal_ht:      subtotalHt,
      tax_5_5:          tax55,
      tax_10:           tax10,
      tax_20:           tax20,
      total_ttc:        Math.max(0, totalTtc - (parsed.data.reward_discount_amount ?? 0)),
    })
    .select()
    .single()
```

Also update the destructuring after safeParse:
```typescript
  const { items, session_id, table_id } = parsed.data
```

- [ ] **Step 3: TypeScript check + commit**

```bash
cd "/Users/anthony/Super pouvoir/Alloflow"
npx tsc --noEmit 2>&1 | grep -v "src/lib/types/database.ts" | head -20
git add src/app/caisse/pos/types.ts src/app/api/orders/route.ts
git commit -m "feat(loyalty): add LoyaltyCustomer/LoyaltyReward types + update orders API to accept customer_id/reward"
```

---

## Task 6: LoyaltyModal Component

**Files:**
- Create: `src/app/caisse/pos/_components/loyalty-modal.tsx`

- [ ] **Step 1: Write component**

```tsx
// src/app/caisse/pos/_components/loyalty-modal.tsx
'use client'
import { useState, useEffect, useRef } from 'react'
import type { LoyaltyCustomer, LoyaltyReward } from '../types'

type ModalState = 'searching' | 'found' | 'new-customer'

interface Props {
  open: boolean
  orderTotal: number
  onClose: () => void
  onConfirm: (customer: LoyaltyCustomer, reward: LoyaltyReward | null) => void
  onSkip: () => void
}

function tierLabel(tier: string) {
  if (tier === 'gold')   return { label: 'Gold',     cls: 'bg-yellow-900/20 text-yellow-400' }
  if (tier === 'silver') return { label: 'Silver',   cls: 'bg-slate-700/40 text-slate-300'   }
  return                        { label: 'Standard', cls: 'bg-[var(--surface2)] text-[var(--text4)]' }
}

export function LoyaltyModal({ open, orderTotal, onClose, onConfirm, onSkip }: Props) {
  const [query,       setQuery]       = useState('')
  const [state,       setState]       = useState<ModalState>('searching')
  const [customers,   setCustomers]   = useState<LoyaltyCustomer[]>([])
  const [selected,    setSelected]    = useState<LoyaltyCustomer | null>(null)
  const [rewards,     setRewards]     = useState<LoyaltyReward[]>([])
  const [chosenReward,setChosenReward]= useState<LoyaltyReward | null>(null)
  const [searching,   setSearching]   = useState(false)

  // New customer form
  const [newFirstName, setNewFirstName] = useState('')
  const [newLastName,  setNewLastName]  = useState('')
  const [newPhone,     setNewPhone]     = useState('')
  const [newEmail,     setNewEmail]     = useState('')
  const [saving,       setSaving]       = useState(false)
  const [formError,    setFormError]    = useState<string | null>(null)

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (open) {
      setQuery(''); setState('searching'); setCustomers([]); setSelected(null)
      setRewards([]); setChosenReward(null); setSearching(false)
      setNewFirstName(''); setNewLastName(''); setNewPhone(''); setNewEmail(''); setFormError(null)
    }
  }, [open])

  // Debounced search
  useEffect(() => {
    if (state !== 'searching') return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (query.length < 3) { setCustomers([]); return }
    debounceRef.current = setTimeout(async () => {
      setSearching(true)
      try {
        const res = await fetch(`/api/customers/search?q=${encodeURIComponent(query)}`)
        const json = await res.json()
        setCustomers(json.customers ?? [])
      } finally {
        setSearching(false)
      }
    }, 300)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [query, state])

  async function selectCustomer(c: LoyaltyCustomer) {
    setSelected(c)
    const res = await fetch(`/api/customers/${c.id}/rewards`)
    const json = await res.json()
    setRewards(json.rewards ?? [])
    setState('found')
  }

  async function handleCreate() {
    if (!newFirstName.trim() || (!newPhone.trim() && !newEmail.trim())) {
      setFormError('Prénom et (téléphone ou email) requis')
      return
    }
    setSaving(true); setFormError(null)
    try {
      const res = await fetch('/api/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          first_name: newFirstName.trim(),
          last_name:  newLastName.trim() || null,
          phone:      newPhone.trim() || null,
          email:      newEmail.trim() || null,
        }),
      })
      if (!res.ok) { const j = await res.json(); throw new Error(j.error ?? 'Erreur') }
      const customer: LoyaltyCustomer = await res.json()
      onConfirm(customer, null)
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Erreur')
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  const pointsToEarn = Math.floor(orderTotal - (chosenReward?.discount_value ?? 0))

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70">
      <div className="w-full max-w-md rounded-2xl border border-[var(--border)] overflow-hidden" style={{ background: 'var(--surface)' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
          <div>
            <h2 className="text-sm font-bold text-[var(--text1)]">🎁 Programme fidélité</h2>
            <p className="text-xs text-[var(--text4)]">Identifiez le client pour créditer ses points</p>
          </div>
          <button onClick={onClose} className="text-[var(--text4)] hover:text-[var(--text2)] text-xl">×</button>
        </div>

        <div className="p-5 space-y-4">

          {/* STATE: searching */}
          {state === 'searching' && (
            <>
              <input
                autoFocus
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Téléphone ou email du client…"
                className="w-full px-4 py-3 rounded-xl border border-[var(--border)] bg-[var(--bg)] text-[var(--text1)] text-sm focus:outline-none focus:border-[var(--blue)]"
              />

              {searching && (
                <p className="text-xs text-[var(--text4)] text-center py-2">Recherche…</p>
              )}

              {!searching && query.length >= 3 && customers.length === 0 && (
                <div className="text-center py-4">
                  <p className="text-sm text-[var(--text3)] mb-3">Aucun compte trouvé</p>
                  <p className="text-xs text-[var(--text4)] mb-4">Inscrire en 10 secondes — le client gagne +{Math.floor(orderTotal)} pts dès aujourd&#39;hui</p>
                  <button
                    onClick={() => {
                      if (query.includes('@')) setNewEmail(query)
                      else setNewPhone(query)
                      setState('new-customer')
                    }}
                    className="px-4 py-2 rounded-lg text-sm font-semibold text-white"
                    style={{ background: 'var(--blue)' }}
                  >
                    + Inscrire ce client
                  </button>
                </div>
              )}

              {customers.length > 0 && (
                <div className="space-y-2">
                  {customers.map(c => {
                    const tier = tierLabel(c.tier)
                    return (
                      <button key={c.id} onClick={() => selectCustomer(c)}
                        className="w-full flex items-center gap-3 px-3 py-3 rounded-xl border border-[var(--border)] hover:border-[var(--blue)]/50 transition-colors text-left"
                        style={{ background: 'var(--bg)' }}>
                        <div className="w-9 h-9 rounded-full bg-[var(--blue)] flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
                          {c.first_name[0].toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-semibold text-[var(--text1)]">{c.first_name} {c.last_name ?? ''}</div>
                          <div className="text-xs text-[var(--text4)]">{c.phone ?? c.email} · {c.points} pts</div>
                        </div>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${tier.cls}`}>{tier.label}</span>
                      </button>
                    )
                  })}
                </div>
              )}
            </>
          )}

          {/* STATE: found */}
          {state === 'found' && selected && (
            <>
              {/* Client card */}
              <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-[var(--border)]" style={{ background: 'var(--bg)' }}>
                <div className="w-10 h-10 rounded-full bg-[var(--blue)] flex items-center justify-center text-sm font-bold text-white flex-shrink-0">
                  {selected.first_name[0].toUpperCase()}
                </div>
                <div className="flex-1">
                  <div className="font-semibold text-[var(--text1)]">{selected.first_name} {selected.last_name ?? ''}</div>
                  <div className="text-xs text-[var(--text4)]">
                    {selected.points} pts actuels · +{pointsToEarn} pts sur cette commande
                  </div>
                </div>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${tierLabel(selected.tier).cls}`}>
                  {tierLabel(selected.tier).label}
                </span>
              </div>

              {/* Rewards */}
              {rewards.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-[var(--text4)] uppercase tracking-wide mb-2">Récompenses disponibles</p>
                  <div className="space-y-1.5">
                    {rewards.map(r => (
                      <button key={r.id}
                        onClick={() => setChosenReward(chosenReward?.id === r.id ? null : r)}
                        className={`w-full flex items-center justify-between px-3 py-2 rounded-lg border text-left transition-colors text-sm ${
                          chosenReward?.id === r.id
                            ? 'border-[var(--green)] bg-[var(--green-bg)] text-[var(--green)]'
                            : 'border-[var(--border)] text-[var(--text2)] hover:bg-[var(--surface2)]'
                        }`}>
                        <span>{r.name}</span>
                        <span className="text-xs font-semibold">
                          {r.discount_type === 'percent' ? `−${r.discount_value}%` : `−${r.discount_value.toFixed(2)} €`}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {rewards.length === 0 && (
                <p className="text-xs text-[var(--text4)] text-center py-1">Aucune récompense disponible (points insuffisants)</p>
              )}

              <button
                onClick={() => onConfirm(selected, chosenReward)}
                className="w-full py-3 rounded-xl text-sm font-bold text-white"
                style={{ background: 'var(--blue)' }}
              >
                Confirmer (+{pointsToEarn} pts) →
              </button>
            </>
          )}

          {/* STATE: new-customer */}
          {state === 'new-customer' && (
            <>
              <p className="text-xs text-[var(--text4)]">
                Inscrire en 10 secondes — le client gagne +{Math.floor(orderTotal)} pts dès aujourd&#39;hui
              </p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-[var(--text4)]">Prénom *</label>
                  <input value={newFirstName} onChange={e => setNewFirstName(e.target.value)}
                    className="mt-0.5 w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-[var(--text1)] text-sm" />
                </div>
                <div>
                  <label className="text-[10px] text-[var(--text4)]">Nom</label>
                  <input value={newLastName} onChange={e => setNewLastName(e.target.value)}
                    className="mt-0.5 w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-[var(--text1)] text-sm" />
                </div>
              </div>
              <div>
                <label className="text-[10px] text-[var(--text4)]">Téléphone *</label>
                <input value={newPhone} onChange={e => setNewPhone(e.target.value)}
                  className="mt-0.5 w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-[var(--text1)] text-sm" />
              </div>
              <div>
                <label className="text-[10px] text-[var(--text4)]">Email</label>
                <input value={newEmail} onChange={e => setNewEmail(e.target.value)}
                  className="mt-0.5 w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-[var(--text1)] text-sm" />
              </div>
              {formError && <p className="text-xs text-red-400">{formError}</p>}
              <button
                onClick={handleCreate}
                disabled={saving}
                className="w-full py-3 rounded-xl text-sm font-bold text-white disabled:opacity-50"
                style={{ background: 'var(--blue)' }}
              >
                {saving ? 'Inscription…' : 'Inscrire & continuer →'}
              </button>
            </>
          )}

          {/* Skip link (always visible) */}
          <div className="text-center">
            <button onClick={onSkip} className="text-xs text-[var(--text4)] hover:text-[var(--text2)] underline">
              Passer sans fidélité
            </button>
          </div>

        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: TypeScript check + commit**

```bash
cd "/Users/anthony/Super pouvoir/Alloflow"
npx tsc --noEmit 2>&1 | grep -v "src/lib/types/database.ts" | head -20
git add src/app/caisse/pos/_components/loyalty-modal.tsx
git commit -m "feat(loyalty): add LoyaltyModal — searching/found/new-customer states"
```

---

## Task 7: LoyaltyBadge Component

**Files:**
- Create: `src/app/caisse/pos/_components/loyalty-badge.tsx`

- [ ] **Step 1: Write component**

```tsx
// src/app/caisse/pos/_components/loyalty-badge.tsx
import type { LoyaltyCustomer, LoyaltyReward } from '../types'

interface Props {
  customer: LoyaltyCustomer
  reward: LoyaltyReward | null
  orderTotal: number
}

export function LoyaltyBadge({ customer, reward, orderTotal }: Props) {
  const rewardDiscount = reward
    ? reward.discount_type === 'percent'
      ? Math.round(orderTotal * (reward.discount_value / 100) * 100) / 100
      : reward.discount_value
    : 0
  const pointsToEarn = Math.floor(orderTotal - rewardDiscount)

  const tierColors: Record<string, string> = {
    gold:     'text-yellow-400',
    silver:   'text-slate-300',
    standard: 'text-[var(--text4)]',
  }

  return (
    <div className="px-3 py-2 rounded-lg border border-[var(--border)] flex items-center gap-2.5" style={{ background: 'var(--bg)' }}>
      <div className="w-7 h-7 rounded-full bg-[var(--blue)] flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0">
        {customer.first_name[0].toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-semibold text-[var(--text1)] truncate">
          {customer.first_name} {customer.last_name ?? ''}
          <span className={`ml-1.5 text-[10px] font-medium ${tierColors[customer.tier] ?? ''}`}>
            {customer.tier}
          </span>
        </div>
        {reward && (
          <div className="text-[10px] text-[var(--green)]">🎁 {reward.name} appliquée</div>
        )}
      </div>
      <div className="text-xs font-bold text-[var(--blue)] flex-shrink-0">
        +{pointsToEarn} pts
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/caisse/pos/_components/loyalty-badge.tsx
git commit -m "feat(loyalty): add LoyaltyBadge — compact ticket panel badge"
```

---

## Task 8: TicketPanel — LoyaltyTrigger + Conditional Encaisser

**Files:**
- Modify: `src/app/caisse/pos/_components/ticket-panel.tsx`

- [ ] **Step 1: Add loyalty props to TicketPanel**

Read the current `ticket-panel.tsx`. Add the following props to the interface and component:

```typescript
// Add to TicketPanelProps interface:
  linkedCustomer:   LoyaltyCustomer | null
  linkedReward:     LoyaltyReward | null
  loyaltyDone:      boolean
  onLoyaltyTrigger: () => void
  onLoyaltySkip:    () => void
```

Add import at top of file:
```typescript
import type { LoyaltyCustomer, LoyaltyReward } from '../types'
import { LoyaltyBadge } from './loyalty-badge'
```

- [ ] **Step 2: Replace the bottom "Totaux + Actions" section**

The section starting at `{/* Totaux + Actions */}` currently ends with a single "Encaisser" button. Replace that entire `<div className="border-t ... p-4 space-y-3">` block with:

```tsx
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
              {loyaltyDone && linkedReward && (() => {
                const loyaltyDiscount = linkedReward.discount_type === 'percent'
                  ? Math.round(total * (linkedReward.discount_value / 100) * 100) / 100
                  : linkedReward.discount_value
                return (
                  <div className="flex justify-between text-[var(--green)]">
                    <span>🎁 {linkedReward.name}</span>
                    <span className="tabular-nums">−{loyaltyDiscount.toFixed(2).replace('.', ',')} €</span>
                  </div>
                )
              })()}
              <div className="flex justify-between text-[var(--text1)] font-bold text-base pt-1 border-t border-[var(--border)]">
                <span>Total TTC</span>
                <span className="tabular-nums">
                  {(() => {
                    const loyaltyDiscount = (loyaltyDone && linkedReward)
                      ? linkedReward.discount_type === 'percent'
                        ? Math.round(total * (linkedReward.discount_value / 100) * 100) / 100
                        : linkedReward.discount_value
                      : 0
                    return Math.max(0, total - loyaltyDiscount).toFixed(2).replace('.', ',')
                  })()} €
                </span>
              </div>
            </div>

            <button
              onClick={onDiscount}
              className="w-full h-9 rounded-lg text-sm font-medium text-[var(--text2)] border border-[var(--border)] hover:bg-[var(--surface2)] transition-colors"
            >
              Appliquer une remise
            </button>

            {/* Loyalty Badge — shown after identification */}
            {loyaltyDone && linkedCustomer && (
              <LoyaltyBadge
                customer={linkedCustomer}
                reward={linkedReward}
                orderTotal={total}
              />
            )}
          </>
        )}

        {/* Loyalty Trigger OR Encaisser */}
        {!isEmpty && !loyaltyDone ? (
          <div className="space-y-2">
            <button
              onClick={onLoyaltyTrigger}
              disabled={!sessionOpen}
              className="w-full h-12 rounded-xl text-sm font-bold text-white transition-all disabled:opacity-30 hover:opacity-90"
              style={{ background: '#d97706' }}
            >
              🎁 Identifier le client →
            </button>
            <div className="text-center">
              <button
                onClick={onLoyaltySkip}
                disabled={!sessionOpen}
                className="text-xs text-[var(--text4)] hover:text-[var(--text2)] disabled:opacity-30"
              >
                Passer sans fidélité
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={onPay}
            disabled={isEmpty || !sessionOpen}
            className="w-full h-12 rounded-xl text-base font-bold text-white transition-all disabled:opacity-30 hover:opacity-90"
            style={{ background: isEmpty ? 'var(--border)' : 'var(--green)' }}
          >
            {!sessionOpen ? 'Ouvrir la session' : isEmpty ? 'Ticket vide' : (() => {
              const loyaltyDiscount = (loyaltyDone && linkedReward)
                ? linkedReward.discount_type === 'percent'
                  ? Math.round(total * (linkedReward.discount_value / 100) * 100) / 100
                  : linkedReward.discount_value
                : 0
              return `Encaisser ${Math.max(0, total - loyaltyDiscount).toFixed(2).replace('.', ',')} €`
            })()}
          </button>
        )}
      </div>
```

- [ ] **Step 3: TypeScript check + commit**

```bash
cd "/Users/anthony/Super pouvoir/Alloflow"
npx tsc --noEmit 2>&1 | grep -v "src/lib/types/database.ts" | head -20
git add src/app/caisse/pos/_components/ticket-panel.tsx
git commit -m "feat(loyalty): update TicketPanel — loyalty trigger + conditional Encaisser + LoyaltyBadge"
```

---

## Task 9: PosShell + PaymentModal + ReceiptModal Wiring

**Files:**
- Modify: `src/app/caisse/pos/_components/pos-shell.tsx`
- Modify: `src/app/caisse/pos/_components/payment-modal.tsx`
- Modify: `src/app/caisse/pos/_components/receipt-modal.tsx`

- [ ] **Step 1: Update PosShell**

Read `pos-shell.tsx`. Add these changes:

**Add import:**
```typescript
import { LoyaltyModal } from './loyalty-modal'
import type { LoyaltyCustomer, LoyaltyReward } from '../types'
```

**Add state after existing state declarations:**
```typescript
  const [linkedCustomer, setLinkedCustomer] = useState<LoyaltyCustomer | null>(null)
  const [linkedReward,   setLinkedReward]   = useState<LoyaltyReward | null>(null)
  const [loyaltyDone,    setLoyaltyDone]    = useState(false)
  const [showLoyalty,    setShowLoyalty]    = useState(false)
```

**Update `clearTicket` to also reset loyalty state:**
```typescript
  const clearTicket = () => {
    setTicket(EMPTY_TICKET)
    setLinkedCustomer(null)
    setLinkedReward(null)
    setLoyaltyDone(false)
  }
```

**Update TicketPanel props** (add 4 new props):
```typescript
        <TicketPanel
          ticket={ticket}
          onUpdateQuantity={updateQuantity}
          onRemove={removeItem}
          onClear={clearTicket}
          onDiscount={() => setShowDiscount(true)}
          onPay={() => session ? setShowPayment(true) : setShowSession(true)}
          sessionOpen={!!session}
          linkedCustomer={linkedCustomer}
          linkedReward={linkedReward}
          loyaltyDone={loyaltyDone}
          onLoyaltyTrigger={() => setShowLoyalty(true)}
          onLoyaltySkip={() => setLoyaltyDone(true)}
        />
```

**Update PaymentModal call** (add 2 new props):
```typescript
      {showPayment && (
        <PaymentModal
          ticket={ticket}
          session={session}
          cashierId={cashierId}
          isOffline={isOffline}
          linkedCustomer={linkedCustomer}
          linkedReward={linkedReward}
          onClose={() => setShowPayment(false)}
          onSuccess={(order) => {
            setCompletedOrder(order)
            setShowPayment(false)
            setShowReceipt(true)
            clearTicket()
          }}
        />
      )}
```

**Update ReceiptModal call** (add loyalty props):
```typescript
      {showReceipt && completedOrder && (
        <ReceiptModal
          order={completedOrder}
          linkedCustomer={linkedCustomer}
          onClose={() => { setShowReceipt(false); setCompletedOrder(null) }}
          onNewOrder={() => { setShowReceipt(false); setCompletedOrder(null) }}
        />
      )}
```

**Add LoyaltyModal before the closing `</div>` of the component:**
```typescript
      {showLoyalty && (
        <LoyaltyModal
          open={showLoyalty}
          orderTotal={ticket.items.reduce((sum, i) => sum + i.unitPriceHt * i.quantity * (1 + i.tvaRate / 100), 0)}
          onClose={() => setShowLoyalty(false)}
          onConfirm={(customer, reward) => {
            setLinkedCustomer(customer)
            setLinkedReward(reward)
            setLoyaltyDone(true)
            setShowLoyalty(false)
          }}
          onSkip={() => {
            setLoyaltyDone(true)
            setShowLoyalty(false)
          }}
        />
      )}
```

- [ ] **Step 2: Update PaymentModal to include loyalty in order creation**

Read `payment-modal.tsx`. Add props interface update:

```typescript
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
```

Add import:
```typescript
import type { LocalTicket, CashSession, Order, PaymentMode, LoyaltyCustomer, LoyaltyReward } from '../types'
```

Update `computeTotal` to subtract loyalty discount:
```typescript
function computeTotal(ticket: LocalTicket, loyaltyReward: LoyaltyReward | null): number {
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
  let total = discountedHt + totalTax * ratio

  if (loyaltyReward) {
    const loyaltyDiscount = loyaltyReward.discount_type === 'percent'
      ? Math.round(total * (loyaltyReward.discount_value / 100) * 100) / 100
      : loyaltyReward.discount_value
    total = Math.max(0, total - loyaltyDiscount)
  }
  return total
}
```

Update function signature and total computation inside the component:
```typescript
export function PaymentModal({ ticket, session, cashierId, isOffline, linkedCustomer, linkedReward, onClose, onSuccess }: PaymentModalProps) {
  const total = computeTotal(ticket, linkedReward)
```

Update `handlePay` to include loyalty data in POST /api/orders:
```typescript
      const loyaltyDiscount = linkedReward
        ? linkedReward.discount_type === 'percent'
          ? Math.round(total * (linkedReward.discount_value / 100) * 100) / 100
          : linkedReward.discount_value
        : 0

      const orderRes = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id:             session?.id,
          table_id:               ticket.tableId,
          customer_id:            linkedCustomer?.id ?? undefined,
          reward_id:              linkedReward?.id   ?? undefined,
          reward_discount_amount: loyaltyDiscount > 0 ? loyaltyDiscount : undefined,
          items: ticket.items.map((i) => ({
            product_id:   i.productId,
            product_name: i.productName,
            emoji:        i.emoji,
            unit_price:   i.unitPriceHt,
            tva_rate:     i.tvaRate,
            quantity:     i.quantity,
          })),
        }),
      })
```

- [ ] **Step 3: Update ReceiptModal to show points banner**

Read `receipt-modal.tsx`. Add prop:
```typescript
interface ReceiptModalProps {
  order: Order
  linkedCustomer: LoyaltyCustomer | null
  onClose: () => void
  onNewOrder: () => void
}
```

Add import:
```typescript
import type { Order, LoyaltyCustomer } from '../types'
```

Add points banner in the "Interface écran" section, after the `<div className="text-center mb-6">` block and before the actions:

```tsx
          {linkedCustomer && (
            <div className="flex items-center gap-3 px-4 py-3 rounded-xl mb-4"
              style={{ background: 'rgba(16,185,129,.08)', border: '1px solid rgba(16,185,129,.2)' }}>
              <div className="w-9 h-9 rounded-full bg-[var(--green)] flex items-center justify-center text-sm font-bold text-white flex-shrink-0">
                {linkedCustomer.first_name[0].toUpperCase()}
              </div>
              <div>
                <div className="text-sm font-bold text-[var(--green)]">
                  +{Math.floor(order.total_ttc)} pts crédités !
                </div>
                <div className="text-xs text-[var(--text4)]">
                  {linkedCustomer.first_name} · {linkedCustomer.points + Math.floor(order.total_ttc)} pts au total
                </div>
              </div>
            </div>
          )}
```

- [ ] **Step 4: TypeScript check + commit**

```bash
cd "/Users/anthony/Super pouvoir/Alloflow"
npx tsc --noEmit 2>&1 | grep -v "src/lib/types/database.ts" | head -30
git add src/app/caisse/pos/_components/pos-shell.tsx \
        src/app/caisse/pos/_components/payment-modal.tsx \
        src/app/caisse/pos/_components/receipt-modal.tsx
git commit -m "feat(loyalty): wire PosShell + PaymentModal + ReceiptModal for loyalty flow"
```

---

## Task 10: End-to-End Smoke Test

- [ ] **Step 1: Start dev server**

```bash
npm run dev
```

- [ ] **Step 2: Manual verification checklist**

Visit `http://localhost:3000/caisse/pos` and verify:

**Loyalty trigger flow:**
- [ ] When ticket is empty, no loyalty trigger shown — only "Ticket vide" disabled button
- [ ] When 1+ item added, amber "🎁 Identifier le client →" button replaces Encaisser
- [ ] "Passer sans fidélité" link is visible below the amber button
- [ ] Clicking "Passer sans fidélité" shows the green "Encaisser X,XX €" button without a loyalty badge

**LoyaltyModal — searching:**
- [ ] Clicking "🎁 Identifier le client →" opens the loyalty modal
- [ ] Typing < 3 chars shows nothing
- [ ] Typing 3+ chars triggers debounced search (300ms)
- [ ] "Aucun compte trouvé" message + "Inscrire ce client" button appear for unknown input
- [ ] "Passer sans fidélité" link visible inside the modal

**LoyaltyModal — found:**
- [ ] Clicking a found customer shows their profile card with tier badge
- [ ] Points to earn = floor(order total) displayed
- [ ] Available rewards listed with apply toggle
- [ ] Clicking a reward toggles green selection
- [ ] "Confirmer (+X pts) →" button confirms

**LoyaltyModal — new customer:**
- [ ] "Inscrire ce client" form pre-fills phone or email from search
- [ ] Submitting creates customer + returns to ticket with badge

**Post-identification:**
- [ ] LoyaltyBadge appears at bottom of ticket panel
- [ ] If reward applied: "🎁 [Reward Name] appliquée" shown in badge
- [ ] Loyalty discount line shown in totals (green)
- [ ] Total TTC updated to reflect reward discount
- [ ] "Encaisser X,XX €" shows post-discount total

**Payment + Receipt:**
- [ ] Completing payment creates order with customer_id in DB
- [ ] ReceiptModal shows green "+X pts crédités !" banner with customer name
- [ ] Clearing ticket resets loyalty state (no badge on next ticket)

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "feat(loyalty): Sprint 6 Fidélité POS flow complete"
```
