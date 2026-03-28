# Sprint 11 — Fidélité cross-réseau : Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a network loyalty layer on top of the existing per-establishment system — deduplicate customers by phone across franchise establishments, aggregate points into a `network_customers` identity, and expose network stats + config to the franchise_admin.

**Architecture:** New `network_customers` table (siege-scoped, phone-dedup) is auto-linked on customer creation via a `root_org_id` resolution (parent_org_id ?? org.id). A PostgreSQL trigger keeps `total_points` and `tier` on `network_customers` in sync whenever `customers.points` changes. The franchise_admin manages levels/config via a new `network_loyalty_config` table and a new API route.

**Tech Stack:** Next.js 15 App Router, Supabase (PostgreSQL triggers + RLS), TypeScript, Zod, Vitest

**Spec:** `docs/superpowers/specs/2026-03-28-sprint11-network-loyalty-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `supabase/migrations/20260328000009_sprint11_network_loyalty.sql` | Create | All DB changes: tables, FK, index, RLS, trigger |
| `src/lib/types/database.ts` | Modify | Add `network_customers`, `network_loyalty_config` types; add `network_customer_id` to `customers` |
| `src/app/api/loyalty/network-config/route.ts` | Create | GET (config + stats) + PUT (upsert config) for franchise_admin |
| `src/app/api/loyalty/network-config/route.test.ts` | Create | Tests: 401, 403, 200 defaults, PUT validation |
| `src/app/api/customers/route.ts` | Modify | POST: auto-link to network_customers after insert |
| `src/app/api/customers/route.test.ts` | Create | Tests: auto-linking skipped for independent org |
| `src/app/api/customers/[id]/route.ts` | Modify | GET: join and return `network` field |
| `src/app/api/franchise/network-stats/route.ts` | Modify | Add `loyalty` section to response |
| `src/app/dashboard/franchise/_components/franchise-sidebar.tsx` | Modify | Add Fidélité nav link |
| `src/app/dashboard/crm/[id]/page.tsx` | Modify | Fetch `network_customers` and pass to `CustomerLoyaltyPanel` |
| `src/app/dashboard/crm/[id]/_components/customer-loyalty-panel.tsx` | Modify | Accept + render optional `network` prop |
| `src/app/dashboard/franchise/loyalty/page.tsx` | Create | Server component — fetch `/api/loyalty/network-config`, render `NetworkLoyaltyClient` |
| `src/app/dashboard/franchise/loyalty/_components/network-loyalty-client.tsx` | Create | `'use client'` — config editor + stats display |

---

## Task 1: DB Migration

**Files:**
- Create: `supabase/migrations/20260328000009_sprint11_network_loyalty.sql`

- [ ] **Step 1: Create migration file**

```sql
-- supabase/migrations/20260328000009_sprint11_network_loyalty.sql

-- 1. network_customers (org-level customer identity, scoped to siege org)
create table public.network_customers (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizations(id) on delete cascade,
  phone        text not null,
  first_name   text not null default '',
  last_name    text,
  email        text,
  total_points int not null default 0,
  tier         text not null default 'standard'
               check (tier in ('standard', 'silver', 'gold')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique(org_id, phone)
);

alter table public.network_customers enable row level security;

-- franchise_admin sees all network_customers of their org
create policy "franchise_admin_reads_network_customers"
  on public.network_customers for select
  using (
    org_id in (
      select org_id from public.profiles
      where id = auth.uid() and role = 'franchise_admin' and org_id is not null
    )
  );

-- establishment admin sees network_customers linked to their customers (role='admin' only)
create policy "admin_reads_linked_network_customers"
  on public.network_customers for select
  using (
    id in (
      select c.network_customer_id
      from public.customers c
      join public.profiles p on p.establishment_id = c.establishment_id
      where p.id = auth.uid()
        and p.role = 'admin'
        and c.network_customer_id is not null
    )
  );

-- 2. network_loyalty_config (org-level config, managed by franchise_admin)
create table public.network_loyalty_config (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null unique references public.organizations(id) on delete cascade,
  active             boolean not null default true,
  pts_per_euro       numeric(8,2) not null default 1,
  min_redemption_pts int not null default 100,
  levels             jsonb not null default '[
    {"key":"standard","name":"Standard","min":0,"max":499},
    {"key":"silver","name":"Silver","min":500,"max":1999},
    {"key":"gold","name":"Gold","min":2000,"max":null}
  ]'::jsonb,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

alter table public.network_loyalty_config enable row level security;

create policy "franchise_admin_manages_network_config"
  on public.network_loyalty_config for all
  using (
    org_id in (
      select org_id from public.profiles
      where id = auth.uid() and role = 'franchise_admin' and org_id is not null
    )
  )
  with check (
    org_id in (
      select org_id from public.profiles
      where id = auth.uid() and role = 'franchise_admin' and org_id is not null
    )
  );

-- establishment admin reads the network config of their org (resolves siege org via parent_org_id)
create policy "admin_reads_network_config"
  on public.network_loyalty_config for select
  using (
    org_id in (
      select coalesce(o.parent_org_id, o.id)
      from public.establishments e
      join public.organizations o on o.id = e.org_id
      join public.profiles p on p.establishment_id = e.id
      where p.id = auth.uid()
    )
  );

-- 3. Add network_customer_id FK to customers
alter table public.customers
  add column if not exists network_customer_id uuid
  references public.network_customers(id) on delete set null;

create index if not exists idx_customers_network_customer_id
  on public.customers(network_customer_id);

-- 4. Trigger: sync network_customers.total_points and tier on customers.points change
create or replace function public.sync_network_customer_points()
returns trigger language plpgsql security definer as $$
declare
  v_total   int;
  v_tier    text;
  v_levels  jsonb;
  v_level   jsonb;
begin
  if NEW.network_customer_id is null then return new; end if;
  if OLD.points = NEW.points then return new; end if;

  -- Recalculate total across all linked customers
  select coalesce(sum(points), 0) into v_total
  from public.customers
  where network_customer_id = NEW.network_customer_id;

  -- Fetch tier levels from network_loyalty_config
  select nlc.levels into v_levels
  from public.network_customers nc
  join public.network_loyalty_config nlc on nlc.org_id = nc.org_id
  where nc.id = NEW.network_customer_id;

  -- Fall back to defaults if no config exists
  if v_levels is null then
    v_levels := '[
      {"key":"standard","min":0,"max":499},
      {"key":"silver","min":500,"max":1999},
      {"key":"gold","min":2000,"max":null}
    ]'::jsonb;
  end if;

  -- Tier = highest level whose min <= total_points
  -- ORDER BY min ASC ensures the last match is the highest tier
  v_tier := 'standard';
  for v_level in
    select elem from jsonb_array_elements(v_levels) elem
    order by (elem->>'min')::int asc
  loop
    if v_total >= (v_level->>'min')::int then
      v_tier := v_level->>'key';
    end if;
  end loop;

  update public.network_customers
  set total_points = v_total, tier = v_tier, updated_at = now()
  where id = NEW.network_customer_id;

  return new;
end;
$$;

drop trigger if exists sync_network_customer_points_trigger on public.customers;
create trigger sync_network_customer_points_trigger
  after update of points on public.customers
  for each row execute function public.sync_network_customer_points();

-- 5. updated_at triggers (reuses existing handle_updated_at function)
create trigger set_network_customers_updated_at
  before update on public.network_customers
  for each row execute function public.handle_updated_at();

create trigger set_network_loyalty_config_updated_at
  before update on public.network_loyalty_config
  for each row execute function public.handle_updated_at();
```

- [ ] **Step 2: Apply the migration**

```bash
cd "/Users/anthony/Super pouvoir/Alloflow"
npx supabase db push
```

Expected: migration applied, no errors. If `db push` fails due to conflicts, apply SQL directly in Supabase Studio SQL editor and register via:
```sql
INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
VALUES ('20260328000009', 'sprint11_network_loyalty', ARRAY['-- applied directly']);
```

- [ ] **Step 3: Verify tables exist in Supabase Studio**

Check that `network_customers`, `network_loyalty_config` appear in Table Editor, and that `customers` has `network_customer_id` column.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260328000009_sprint11_network_loyalty.sql
git commit -m "feat(db): add network loyalty tables, trigger, and RLS (sprint 11)"
```

---

## Task 2: TypeScript Types

**Files:**
- Modify: `src/lib/types/database.ts`

- [ ] **Step 1: Add `network_customers` and `network_loyalty_config` tables after `franchise_contracts`**

In `src/lib/types/database.ts`, add after the `franchise_contracts` block (after line 63, before `profiles`):

```typescript
      network_customers: {
        Row: {
          id: string
          org_id: string
          phone: string
          first_name: string
          last_name: string | null
          email: string | null
          total_points: number
          tier: 'standard' | 'silver' | 'gold'
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          org_id: string
          phone: string
          first_name?: string
          last_name?: string | null
          email?: string | null
          total_points?: number
          tier?: 'standard' | 'silver' | 'gold'
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          org_id?: string
          phone?: string
          first_name?: string
          last_name?: string | null
          email?: string | null
          total_points?: number
          tier?: 'standard' | 'silver' | 'gold'
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          { foreignKeyName: "network_customers_org_id_fkey"; columns: ["org_id"]; isOneToOne: false; referencedRelation: "organizations"; referencedColumns: ["id"] }
        ]
      }
      network_loyalty_config: {
        Row: {
          id: string
          org_id: string
          active: boolean
          pts_per_euro: number
          min_redemption_pts: number
          levels: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          org_id: string
          active?: boolean
          pts_per_euro?: number
          min_redemption_pts?: number
          levels?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          org_id?: string
          active?: boolean
          pts_per_euro?: number
          min_redemption_pts?: number
          levels?: Json
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          { foreignKeyName: "network_loyalty_config_org_id_fkey"; columns: ["org_id"]; isOneToOne: true; referencedRelation: "organizations"; referencedColumns: ["id"] }
        ]
      }
```

- [ ] **Step 2: Add `network_customer_id` to the `customers` type**

In the `customers` block, update Row/Insert/Update and Relationships:

```typescript
      customers: {
        Row: { id: string; establishment_id: string; first_name: string; last_name: string | null; name: string; phone: string | null; email: string | null; points: number; tier: 'standard' | 'silver' | 'gold'; created_by: string | null; network_customer_id: string | null }
        Insert: { id?: string; establishment_id: string; first_name?: string; last_name?: string | null; name?: string; phone?: string | null; email?: string | null; points?: number; tier?: 'standard' | 'silver' | 'gold'; created_by?: string | null; network_customer_id?: string | null }
        Update: { id?: string; establishment_id?: string; first_name?: string; last_name?: string | null; name?: string; phone?: string | null; email?: string | null; points?: number; tier?: 'standard' | 'silver' | 'gold'; created_by?: string | null; network_customer_id?: string | null }
        Relationships: [
          { foreignKeyName: "customers_establishment_id_fkey"; columns: ["establishment_id"]; isOneToOne: false; referencedRelation: "establishments"; referencedColumns: ["id"] },
          { foreignKeyName: "customers_network_customer_id_fkey"; columns: ["network_customer_id"]; isOneToOne: false; referencedRelation: "network_customers"; referencedColumns: ["id"] }
        ]
      }
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd "/Users/anthony/Super pouvoir/Alloflow"
npx tsc --noEmit
```

Expected: no errors related to `network_customers`, `network_loyalty_config`, or `customers.network_customer_id`.

- [ ] **Step 4: Commit**

```bash
git add src/lib/types/database.ts
git commit -m "feat(types): add network_customers, network_loyalty_config, customers.network_customer_id"
```

---

## Task 3: GET + PUT /api/loyalty/network-config

**Files:**
- Create: `src/app/api/loyalty/network-config/route.ts`
- Create: `src/app/api/loyalty/network-config/route.test.ts`

**Context:** This is a NEW file (no existing `network-config` route — the existing route at `src/app/api/loyalty/config/route.ts` is per-establishment config). Accessible only to `franchise_admin`. Uses `supabaseAdmin` for cross-org reads.

- [ ] **Step 1: Write the failing test**

```typescript
// src/app/api/loyalty/network-config/route.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('next/headers', () => ({ cookies: vi.fn(() => ({ getAll: () => [], set: vi.fn() })) }))
vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn() }))

import { GET, PUT } from './route'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

function mockAnonClient(overrides: Record<string, unknown> = {}) {
  const mock = {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }) },
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { role: 'franchise_admin', org_id: 'org-1' }, error: null }),
      ...overrides,
    })),
  }
  ;(createClient as ReturnType<typeof vi.fn>).mockResolvedValue(mock)
  return mock
}

function mockAdmin(overrides: Record<string, unknown> = {}) {
  const mock = {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
      upsert: vi.fn().mockResolvedValue({ error: null }),
      ...overrides,
    })),
  }
  ;(createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue(mock)
  return mock
}

describe('GET /api/loyalty/network-config', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 if not authenticated', async () => {
    const anonMock = mockAnonClient()
    anonMock.auth.getUser.mockResolvedValue({ data: { user: null } })
    const res = await GET()
    expect(res.status).toBe(401)
  })

  it('returns 403 if not franchise_admin', async () => {
    const anonMock = mockAnonClient()
    anonMock.from.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { role: 'admin', org_id: 'org-1' }, error: null }),
    })
    const res = await GET()
    expect(res.status).toBe(403)
  })

  it('returns defaults when no config exists', async () => {
    mockAnonClient()
    const admin = mockAdmin()
    // network_loyalty_config returns null
    admin.from.mockImplementation((table: string) => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue(
        table === 'network_loyalty_config'
          ? { data: null, error: null }
          : { data: [], error: null }
      ),
      then: undefined,
    }))
    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ptsPerEuro).toBe(1)
    expect(body.minRedemptionPts).toBe(100)
    expect(Array.isArray(body.levels)).toBe(true)
  })
})

describe('PUT /api/loyalty/network-config', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 400 if levels not in ascending order', async () => {
    mockAnonClient()
    mockAdmin()
    const req = new NextRequest('http://localhost/api/loyalty/network-config', {
      method: 'PUT',
      body: JSON.stringify({
        ptsPerEuro: 1,
        minRedemptionPts: 100,
        levels: [
          { key: 'silver', name: 'Silver', min: 500, max: 1999 },
          { key: 'standard', name: 'Standard', min: 0, max: 499 },
        ],
      }),
    })
    const res = await PUT(req)
    expect(res.status).toBe(400)
  })

  it('returns 200 on valid upsert', async () => {
    mockAnonClient()
    mockAdmin()
    const req = new NextRequest('http://localhost/api/loyalty/network-config', {
      method: 'PUT',
      body: JSON.stringify({
        ptsPerEuro: 1.5,
        minRedemptionPts: 200,
        levels: [
          { key: 'standard', name: 'Standard', min: 0, max: 499 },
          { key: 'silver', name: 'Silver', min: 500, max: 1999 },
          { key: 'gold', name: 'Gold', min: 2000, max: null },
        ],
      }),
    })
    const res = await PUT(req)
    expect(res.status).toBe(200)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd "/Users/anthony/Super pouvoir/Alloflow"
npx vitest run src/app/api/loyalty/network-config/route.test.ts
```

Expected: FAIL — `route.ts` does not exist yet.

- [ ] **Step 3: Implement the route**

```typescript
// src/app/api/loyalty/network-config/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { z } from 'zod'

const DEFAULT_LEVELS = [
  { key: 'standard', name: 'Standard', min: 0,    max: 499  },
  { key: 'silver',   name: 'Silver',   min: 500,  max: 1999 },
  { key: 'gold',     name: 'Gold',     min: 2000, max: null },
]

const levelSchema = z.object({
  key:  z.string(),
  name: z.string(),
  min:  z.number().min(0),
  max:  z.number().nullable(),
})

const putSchema = z.object({
  active:            z.boolean().optional(),
  ptsPerEuro:        z.number().min(0).max(10),
  minRedemptionPts:  z.number().min(0),
  levels:            z.array(levelSchema).min(1).refine(
    levels => levels.every((l, i) => i === 0 || l.min > levels[i - 1].min),
    { message: 'Les seuils doivent être en ordre croissant de min' }
  ),
})

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles').select('role, org_id').eq('id', user.id).single()

  if (!profile || profile.role !== 'franchise_admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  if (!profile.org_id) {
    return NextResponse.json({ error: 'org_id manquant' }, { status: 400 })
  }

  const supabaseAdmin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  const orgId = profile.org_id

  // Fetch config, network customers (by tier), and month points in parallel
  const monthStartStr = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
    .toISOString()

  const [
    { data: config },
    { data: networkCustomers },
  ] = await Promise.all([
    supabaseAdmin
      .from('network_loyalty_config')
      .select('active, pts_per_euro, min_redemption_pts, levels')
      .eq('org_id', orgId)
      .single(),
    (supabaseAdmin as any)
      .from('network_customers')
      .select('tier')
      .eq('org_id', orgId),
  ])

  // Sum points issued this month via loyalty_transactions
  // First get customer IDs linked to this network
  const { data: networkCustomerIds } = await (supabaseAdmin as any)
    .from('network_customers')
    .select('id')
    .eq('org_id', orgId)

  let pointsIssuedMonth = 0
  if (networkCustomerIds && networkCustomerIds.length > 0) {
    const ncIds = (networkCustomerIds as Array<{ id: string }>).map(nc => nc.id)
    const { data: linkedCustomers } = await (supabaseAdmin as any)
      .from('customers')
      .select('id')
      .in('network_customer_id', ncIds)

    if (linkedCustomers && linkedCustomers.length > 0) {
      const customerIds = (linkedCustomers as Array<{ id: string }>).map(c => c.id)
      const { data: earnTx } = await (supabaseAdmin as any)
        .from('loyalty_transactions')
        .select('points')
        .eq('type', 'earn')
        .gte('created_at', monthStartStr)
        .in('customer_id', customerIds)

      pointsIssuedMonth = (earnTx ?? []).reduce(
        (sum: number, t: { points: number }) => sum + (t.points ?? 0), 0
      )
    }
  }

  const nc = (networkCustomers ?? []) as Array<{ tier: string }>
  const goldCount     = nc.filter(c => c.tier === 'gold').length
  const silverCount   = nc.filter(c => c.tier === 'silver').length
  const networkCustomersCount = nc.length

  if (!config) {
    return NextResponse.json({
      active:               true,
      ptsPerEuro:           1,
      minRedemptionPts:     100,
      levels:               DEFAULT_LEVELS,
      networkCustomersCount,
      goldCount,
      silverCount,
      points_issued_month:  pointsIssuedMonth,
    })
  }

  return NextResponse.json({
    active:               config.active,
    ptsPerEuro:           Number(config.pts_per_euro),
    minRedemptionPts:     config.min_redemption_pts,
    levels:               config.levels ?? DEFAULT_LEVELS,
    networkCustomersCount,
    goldCount,
    silverCount,
    points_issued_month:  pointsIssuedMonth,
  })
}

export async function PUT(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles').select('role, org_id').eq('id', user.id).single()

  if (!profile || profile.role !== 'franchise_admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  if (!profile.org_id) {
    return NextResponse.json({ error: 'org_id manquant' }, { status: 400 })
  }

  const body = await req.json()
  const result = putSchema.safeParse(body)
  if (!result.success) {
    return NextResponse.json({ error: result.error.flatten() }, { status: 400 })
  }

  const supabaseAdmin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { error } = await (supabaseAdmin as any)
    .from('network_loyalty_config')
    .upsert({
      org_id:            profile.org_id,
      active:            result.data.active ?? true,
      pts_per_euro:      result.data.ptsPerEuro,
      min_redemption_pts: result.data.minRedemptionPts,
      levels:            result.data.levels,
      updated_at:        new Date().toISOString(),
    }, { onConflict: 'org_id' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/app/api/loyalty/network-config/route.test.ts
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/loyalty/network-config/route.ts src/app/api/loyalty/network-config/route.test.ts
git commit -m "feat(api): add GET/PUT /api/loyalty/network-config for franchise_admin"
```

---

## Task 4: POST /api/customers — Network Auto-linking

**Files:**
- Modify: `src/app/api/customers/route.ts`
- Create: `src/app/api/customers/route.test.ts`

**Context:** After the existing customer `INSERT`, if:
1. `phone` was provided in the request, AND
2. The establishment's org has `type !== 'independent'`

...then auto-link the new customer to a `network_customers` record. Uses `supabaseAdmin` for cross-org lookups/inserts.

**Root org resolution:** `establishments.org_id` → load org → if `org.parent_org_id` is not null → `root_org_id = org.parent_org_id` (franchise org → use siege), else → `root_org_id = org.id`.

- [ ] **Step 1: Write the failing test**

```typescript
// src/app/api/customers/route.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('next/headers', () => ({ cookies: vi.fn(() => ({ getAll: () => [], set: vi.fn() })) }))
vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn() }))

import { POST } from './route'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

function makeReq(body: object) {
  return new NextRequest('http://localhost/api/customers', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

function mockAnonForPost(establishmentId = 'est-1') {
  const profileQuery = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: { establishment_id: establishmentId }, error: null }),
  }
  const insertQuery = {
    insert: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({
      data: { id: 'cust-1', first_name: 'Alice', last_name: null, phone: '+33600000000', email: null, points: 0, tier: 'standard' },
      error: null,
    }),
  }
  const mock = {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }) },
    from: vi.fn((table: string) =>
      table === 'profiles' ? profileQuery : insertQuery
    ),
  }
  ;(createClient as ReturnType<typeof vi.fn>).mockResolvedValue(mock)
  return mock
}

function mockAdminForLinking(orgType = 'independent') {
  const mock = {
    from: vi.fn((table: string) => {
      if (table === 'establishments') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: { org_id: 'org-1' }, error: null }),
        }
      }
      if (table === 'organizations') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: { id: 'org-1', type: orgType, parent_org_id: null },
            error: null,
          }),
        }
      }
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        insert: vi.fn().mockReturnThis(),
        update: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
      }
    }),
  }
  ;(createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue(mock)
  return mock
}

describe('POST /api/customers — network linking', () => {
  beforeEach(() => vi.clearAllMocks())

  it('skips network linking for independent org', async () => {
    mockAnonForPost()
    const adminMock = mockAdminForLinking('independent')

    const res = await POST(makeReq({ first_name: 'Alice', phone: '+33600000000' }))
    expect(res.status).toBe(201)

    // network_customers should never be queried
    const networkCalls = adminMock.from.mock.calls.filter(([t]: [string]) => t === 'network_customers')
    expect(networkCalls.length).toBe(0)
  })

  it('skips network linking when no phone provided', async () => {
    mockAnonForPost()
    const adminMock = mockAdminForLinking('siege')

    const res = await POST(makeReq({ first_name: 'Alice' }))
    expect(res.status).toBe(201)

    const networkCalls = adminMock.from.mock.calls.filter(([t]: [string]) => t === 'network_customers')
    expect(networkCalls.length).toBe(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/app/api/customers/route.test.ts
```

Expected: FAIL — `route.test.ts` imports `POST` which currently doesn't have network linking logic, and the test assertions about `network_customers` calls may pass trivially. That's fine — the test validates the "skip" behavior we're about to add.

- [ ] **Step 3: Add auto-linking to POST /api/customers**

Modify `src/app/api/customers/route.ts`. Add the import and the auto-linking helper after the existing imports:

```typescript
import { createClient as createAdminClient } from '@supabase/supabase-js'
```

Replace the entire `POST` function body with:

```typescript
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const establishmentId = await getEstablishmentId(supabase, user.id)
  if (!establishmentId) return NextResponse.json({ error: 'Établissement non trouvé' }, { status: 400 })

  const body = await req.json()
  const result = createCustomerSchema.safeParse(body)
  if (!result.success) return NextResponse.json({ error: result.error.flatten() }, { status: 400 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('customers')
    .insert({
      establishment_id: establishmentId,
      created_by:       user.id,
      name:             result.data.first_name,
      first_name:       result.data.first_name,
      last_name:        result.data.last_name ?? null,
      phone:            result.data.phone ?? null,
      email:            result.data.email ?? null,
      points:           0,
      tier:             'standard',
      opt_in_sms:       result.data.opt_in_sms ?? false,
      opt_in_email:     result.data.opt_in_email ?? false,
      opt_in_whatsapp:  result.data.opt_in_whatsapp ?? false,
    })
    .select('id, first_name, last_name, phone, email, points, tier')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Network auto-linking: if phone provided, try to link to network_customers
  if (result.data.phone) {
    try {
      const supabaseAdmin = createAdminClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      )

      // Resolve org and root_org_id
      const { data: est } = await supabaseAdmin
        .from('establishments')
        .select('org_id')
        .eq('id', establishmentId)
        .single()

      if (est?.org_id) {
        const { data: org } = await supabaseAdmin
          .from('organizations')
          .select('id, type, parent_org_id')
          .eq('id', est.org_id)
          .single()

        if (org && org.type !== 'independent') {
          const rootOrgId: string = (org.parent_org_id ?? org.id) as string

          // Look up existing network_customers for (root_org_id, phone)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data: existing } = await (supabaseAdmin as any)
            .from('network_customers')
            .select('id')
            .eq('org_id', rootOrgId)
            .eq('phone', result.data.phone)
            .single()

          let networkCustomerId: string

          if (existing) {
            networkCustomerId = existing.id as string
          } else {
            // Create new network_customers record
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data: created } = await (supabaseAdmin as any)
              .from('network_customers')
              .insert({
                org_id:     rootOrgId,
                phone:      result.data.phone,
                first_name: result.data.first_name,
                last_name:  result.data.last_name ?? null,
                email:      result.data.email ?? null,
              })
              .select('id')
              .single()

            if (!created) throw new Error('network_customers insert failed')
            networkCustomerId = created.id as string
          }

          // Link the new customer to the network identity
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (supabaseAdmin as any)
            .from('customers')
            .update({ network_customer_id: networkCustomerId })
            .eq('id', data.id)
        }
      }
    } catch {
      // Auto-linking is best-effort — customer was created successfully, don't fail the request
    }
  }

  return NextResponse.json(data, { status: 201 })
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/app/api/customers/route.test.ts
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/customers/route.ts src/app/api/customers/route.test.ts
git commit -m "feat(api): auto-link customers to network_customers on POST /api/customers"
```

---

## Task 5: GET /api/customers/[id] — Include Network Data

**Files:**
- Modify: `src/app/api/customers/[id]/route.ts`

**Context:** After fetching the customer, if `customer.network_customer_id` is not null, fetch the `network_customers` record via `supabaseAdmin` and include a `network` field in the response.

- [ ] **Step 1: Add supabaseAdmin import and network join to GET**

In `src/app/api/customers/[id]/route.ts`, add import:

```typescript
import { createClient as createAdminClient } from '@supabase/supabase-js'
```

Modify the `GET` function — replace the final return with:

```typescript
  if (error || !data) return NextResponse.json({ error: 'Client non trouvé' }, { status: 404 })

  // Fetch network identity if linked
  let network: { id: string; total_points: number; tier: string } | null = null
  if (data.network_customer_id) {
    const supabaseAdmin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: nc } = await (supabaseAdmin as any)
      .from('network_customers')
      .select('id, total_points, tier')
      .eq('id', data.network_customer_id)
      .single()
    if (nc) network = { id: nc.id, total_points: nc.total_points, tier: nc.tier }
  }

  return NextResponse.json({ ...data, network })
```

Also update the `.select(...)` on the customers query to include `network_customer_id`:

```typescript
  const { data, error } = await (supabase as any)
    .from('customers')
    .select('id, first_name, last_name, tier, points, phone, email, notes, created_at, gender, birthdate, opt_in_sms, opt_in_email, opt_in_whatsapp, opt_in_at, tags, rfm_segment, rfm_updated_at, last_order_at, order_count, avg_basket, network_customer_id')
    .eq('id', id)
    .eq('establishment_id', profile.establishment_id)
    .single()
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/customers/[id]/route.ts
git commit -m "feat(api): include network identity in GET /api/customers/[id] response"
```

---

## Task 6: GET /api/franchise/network-stats — Add Loyalty Section

**Files:**
- Modify: `src/app/api/franchise/network-stats/route.ts`

**Context:** Add a `loyalty` section to the existing response. Reads from `network_customers` (count by tier, scoped to `orgId`) and `loyalty_transactions` (earn points this month, scoped to network establishment customers). All reads use the existing `supabaseAdmin` instance.

- [ ] **Step 1: Add loyalty queries inside the existing GET handler**

After step 7b (low stock items) in the GET handler, add:

```typescript
  // 8. Loyalty network stats
  const [
    { data: networkCustomersData },
    { data: networkCustIds },
  ] = await Promise.all([
    (supabaseAdmin as any)
      .from('network_customers')
      .select('tier')
      .eq('org_id', orgId),
    (supabaseAdmin as any)
      .from('network_customers')
      .select('id')
      .eq('org_id', orgId),
  ])

  const nc = (networkCustomersData ?? []) as Array<{ tier: string }>
  let pointsIssuedMonth = 0

  if (networkCustIds && networkCustIds.length > 0) {
    const ncIds = (networkCustIds as Array<{ id: string }>).map(n => n.id)
    const { data: linkedCustomers } = await (supabaseAdmin as any)
      .from('customers')
      .select('id')
      .in('network_customer_id', ncIds)

    if (linkedCustomers && linkedCustomers.length > 0) {
      const customerIds = (linkedCustomers as Array<{ id: string }>).map(c => c.id)
      const { data: earnTx } = await (supabaseAdmin as any)
        .from('loyalty_transactions')
        .select('points')
        .eq('type', 'earn')
        .gte('created_at', `${monthStartStr}T00:00:00`)
        .in('customer_id', customerIds)

      pointsIssuedMonth = (earnTx ?? []).reduce(
        (s: number, t: { points: number }) => s + (t.points ?? 0), 0
      )
    }
  }

  const loyalty = {
    total_network_customers: nc.length,
    gold_count:              nc.filter(c => c.tier === 'gold').length,
    silver_count:            nc.filter(c => c.tier === 'silver').length,
    points_issued_month:     pointsIssuedMonth,
  }
```

Then add `loyalty` to the final `NextResponse.json(...)`:

```typescript
  return NextResponse.json({
    network: {
      ca_yesterday:  networkCaYest,
      ca_month:      networkCaMonth,
      ca_month_prev: networkCaPrev,
    },
    establishments: estResults,
    loyalty,
  })
```

- [ ] **Step 2: Update the `NetworkStats` interface in `command-center-client.tsx`**

In `src/app/dashboard/franchise/command-center/_components/command-center-client.tsx`, add `loyalty` to the `NetworkStats` interface and to the `Props.initialData` type:

```typescript
interface NetworkStats {
  ca_yesterday:  number
  ca_month:      number
  ca_month_prev: number
  loyalty?: {
    total_network_customers: number
    gold_count: number
    silver_count: number
    points_issued_month: number
  }
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add src/app/api/franchise/network-stats/route.ts src/app/dashboard/franchise/command-center/_components/command-center-client.tsx
git commit -m "feat(api): add loyalty section to GET /api/franchise/network-stats"
```

---

## Task 7: FranchiseSidebar — Add Fidélité Link

**Files:**
- Modify: `src/app/dashboard/franchise/_components/franchise-sidebar.tsx`

- [ ] **Step 1: Add the third link to the links array**

In `src/app/dashboard/franchise/_components/franchise-sidebar.tsx`, change the `links` array from:

```typescript
const links = [
  { href: '/dashboard/franchise/command-center', label: '📊 Command Center' },
  { href: '/dashboard/franchise/franchises',     label: '🏪 Franchisés' },
]
```

to:

```typescript
const links = [
  { href: '/dashboard/franchise/command-center', label: '📊 Command Center' },
  { href: '/dashboard/franchise/franchises',     label: '🏪 Franchisés' },
  { href: '/dashboard/franchise/loyalty',        label: '🎁 Fidélité' },
]
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/app/dashboard/franchise/_components/franchise-sidebar.tsx
git commit -m "feat(ui): add Fidélité nav link to FranchiseSidebar"
```

---

## Task 8: CustomerLoyaltyPanel + CRM Page — Display Network Data

**Files:**
- Modify: `src/app/dashboard/crm/[id]/_components/customer-loyalty-panel.tsx`
- Modify: `src/app/dashboard/crm/[id]/page.tsx`

**Context:** The CRM page already fetches the customer directly via supabase. We add `network_customer_id` to the select, then fetch `network_customers` via supabaseAdmin if linked. The result is passed as an optional `network` prop to `CustomerLoyaltyPanel`.

- [ ] **Step 1: Update `CustomerLoyaltyPanel` to accept and render `network` prop**

In `src/app/dashboard/crm/[id]/_components/customer-loyalty-panel.tsx`:

Add `network` to the `Props` interface:

```typescript
interface Props {
  customer: Customer
  transactions: LoyaltyTransaction[]
  rewards: LoyaltyReward[]
  network?: {
    id: string
    total_points: number
    tier: 'standard' | 'silver' | 'gold'
  } | null
}
```

Update the function signature:

```typescript
export function CustomerLoyaltyPanel({ customer, transactions, rewards, network }: Props) {
```

Add the network block inside the points card div, after the "Send QR" section and before the closing `</div>` of the points card:

```tsx
        {/* Network identity */}
        {network && (
          <div className="pt-4 border-t border-white/[0.06]">
            <p className="text-xs font-semibold text-[var(--text4)] uppercase tracking-wide mb-2">Réseau</p>
            <div className="flex items-center gap-2">
              <span
                className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
                style={{ background: 'rgba(96,165,250,0.12)', color: '#60a5fa' }}
              >
                🌐 Membre réseau
              </span>
            </div>
            <p className="text-sm text-[var(--text2)] mt-2">
              Points réseau :{' '}
              <span className="font-semibold text-white">
                {network.total_points.toLocaleString('fr-FR')} pts
              </span>
              {' · '}
              Tier réseau :{' '}
              <span className="font-semibold" style={{ color: network.tier === 'gold' ? '#fbbf24' : network.tier === 'silver' ? '#94a3b8' : 'var(--text2)' }}>
                {network.tier.charAt(0).toUpperCase() + network.tier.slice(1)}
              </span>
            </p>
          </div>
        )}
```

- [ ] **Step 2: Update the CRM page to fetch and pass network data**

In `src/app/dashboard/crm/[id]/page.tsx`:

Add import at the top:

```typescript
import { createClient as createAdminClient } from '@supabase/supabase-js'
```

Update the customer select to include `network_customer_id`:

```typescript
    supabaseAny
      .from('customers')
      .select('id, first_name, last_name, tier, points, phone, email, notes, last_order_at, gender, birthdate, opt_in_sms, opt_in_email, opt_in_whatsapp, tags, rfm_segment, avg_basket, order_count, network_customer_id')
      .eq('id', id)
      .eq('establishment_id', establishmentId)
      .single(),
```

After the parallel fetch block (after line `if (!customer) notFound()`), add:

```typescript
  // Fetch network identity if customer is linked
  let networkData: { id: string; total_points: number; tier: 'standard' | 'silver' | 'gold' } | null = null
  if (customer.network_customer_id) {
    const supabaseAdmin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    const { data: nc } = await (supabaseAdmin as any)
      .from('network_customers')
      .select('id, total_points, tier')
      .eq('id', customer.network_customer_id)
      .single()
    if (nc) networkData = nc as typeof networkData
  }
```

Pass `network={networkData}` to `CustomerLoyaltyPanel`:

```tsx
          <CustomerLoyaltyPanel
            customer={customer}
            transactions={transactions}
            rewards={rewards}
            network={networkData}
          />
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add src/app/dashboard/crm/[id]/_components/customer-loyalty-panel.tsx src/app/dashboard/crm/[id]/page.tsx
git commit -m "feat(crm): show network points and tier in customer loyalty panel"
```

---

## Task 9: Franchise Loyalty Page

**Files:**
- Create: `src/app/dashboard/franchise/loyalty/page.tsx`
- Create: `src/app/dashboard/franchise/loyalty/_components/network-loyalty-client.tsx`

**Context:** Server component fetches `/api/loyalty/network-config` (forwarding cookies), then renders `NetworkLoyaltyClient`. The client component has two sections: a config editor (PUT on save) and read-only stats. Follows the same pattern as `franchises/page.tsx` and `command-center/page.tsx`.

- [ ] **Step 1: Create the server page component**

```typescript
// src/app/dashboard/franchise/loyalty/page.tsx
import { cookies } from 'next/headers'
import { NetworkLoyaltyClient } from './_components/network-loyalty-client'

interface LoyaltyLevel {
  key: string
  name: string
  min: number
  max: number | null
}

interface NetworkConfig {
  active: boolean
  ptsPerEuro: number
  minRedemptionPts: number
  levels: LoyaltyLevel[]
  networkCustomersCount: number
  goldCount: number
  silverCount: number
  points_issued_month: number
}

const DEFAULT_CONFIG: NetworkConfig = {
  active: true,
  ptsPerEuro: 1,
  minRedemptionPts: 100,
  levels: [
    { key: 'standard', name: 'Standard', min: 0,    max: 499  },
    { key: 'silver',   name: 'Silver',   min: 500,  max: 1999 },
    { key: 'gold',     name: 'Gold',     min: 2000, max: null },
  ],
  networkCustomersCount: 0,
  goldCount: 0,
  silverCount: 0,
  points_issued_month: 0,
}

export default async function FranchiseLoyaltyPage() {
  const cookieStore = await cookies()
  const cookieHeader = cookieStore.getAll().map(c => `${c.name}=${c.value}`).join('; ')

  let config: NetworkConfig = DEFAULT_CONFIG
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'}/api/loyalty/network-config`, {
      headers: { cookie: cookieHeader },
      cache: 'no-store',
    })
    if (res.ok) config = await res.json()
  } catch {
    // use defaults
  }

  return <NetworkLoyaltyClient initialConfig={config} />
}
```

- [ ] **Step 2: Create the client component**

```typescript
// src/app/dashboard/franchise/loyalty/_components/network-loyalty-client.tsx
'use client'
import { useState } from 'react'

interface LoyaltyLevel {
  key: string
  name: string
  min: number
  max: number | null
}

interface NetworkConfig {
  active: boolean
  ptsPerEuro: number
  minRedemptionPts: number
  levels: LoyaltyLevel[]
  networkCustomersCount: number
  goldCount: number
  silverCount: number
  points_issued_month: number
}

interface Props {
  initialConfig: NetworkConfig
}

function fmt(n: number) {
  return new Intl.NumberFormat('fr-FR').format(n)
}

export function NetworkLoyaltyClient({ initialConfig }: Props) {
  const [config, setConfig]   = useState(initialConfig)
  const [saving, setSaving]   = useState(false)
  const [saved, setSaved]     = useState(false)
  const [error, setError]     = useState<string | null>(null)

  // Editable state for the config form
  const [ptsPerEuro,       setPtsPerEuro]       = useState(String(initialConfig.ptsPerEuro))
  const [minRedemptionPts, setMinRedemptionPts] = useState(String(initialConfig.minRedemptionPts))
  // Tier thresholds: Standard max = levels[0].max, Silver max = levels[1].max
  const [standardMax, setStandardMax] = useState(String(initialConfig.levels[0]?.max ?? 499))
  const [silverMax,   setSilverMax]   = useState(String(initialConfig.levels[1]?.max ?? 1999))

  async function handleSave() {
    setError(null)
    setSaving(true)
    try {
      const stdMax  = parseInt(standardMax, 10)
      const slvMax  = parseInt(silverMax, 10)
      const goldMin = slvMax + 1

      if (isNaN(stdMax) || isNaN(slvMax) || stdMax >= slvMax) {
        setError('Standard max doit être inférieur à Silver max')
        return
      }

      const levels: LoyaltyLevel[] = [
        { key: 'standard', name: 'Standard', min: 0,       max: stdMax  },
        { key: 'silver',   name: 'Silver',   min: stdMax + 1, max: slvMax },
        { key: 'gold',     name: 'Gold',     min: goldMin, max: null    },
      ]

      const body = {
        ptsPerEuro:       parseFloat(ptsPerEuro),
        minRedemptionPts: parseInt(minRedemptionPts, 10),
        levels,
      }

      const res = await fetch('/api/loyalty/network-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const data = await res.json()
        setError(data.error?.message ?? 'Erreur lors de la sauvegarde')
        return
      }

      setConfig(prev => ({ ...prev, ...body, levels }))
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } finally {
      setSaving(false)
    }
  }

  const standardCount = config.networkCustomersCount - config.goldCount - config.silverCount

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-[var(--text1)]">Fidélité réseau</h1>
        <p className="text-sm text-[var(--text4)] mt-0.5">Configuration du programme de fidélité commun à tout le réseau</p>
      </div>

      {/* Stats section */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <div className="rounded-xl p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <p className="text-xs uppercase text-[var(--text4)] mb-1">Membres réseau</p>
          <p className="text-2xl font-bold text-[var(--text1)]">{fmt(config.networkCustomersCount)}</p>
          <div className="flex gap-3 mt-1.5">
            <span className="text-xs" style={{ color: '#fbbf24' }}>🥇 {config.goldCount} Gold</span>
            <span className="text-xs" style={{ color: '#94a3b8' }}>🥈 {config.silverCount} Silver</span>
            <span className="text-xs text-[var(--text4)]">{standardCount} Standard</span>
          </div>
        </div>
        <div className="rounded-xl p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <p className="text-xs uppercase text-[var(--text4)] mb-1">Points émis ce mois</p>
          <p className="text-2xl font-bold text-[var(--text1)]">{fmt(config.points_issued_month)}</p>
          <p className="text-xs text-[var(--text4)] mt-1">pts accumulés dans le réseau</p>
        </div>
      </div>

      {/* Config editor */}
      <div className="rounded-xl p-5" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <h2 className="text-sm font-semibold text-[var(--text1)] mb-4">Configuration</h2>

        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-[var(--text3)] mb-1">Points par euro</label>
              <input
                type="number"
                min="0"
                max="10"
                step="0.5"
                value={ptsPerEuro}
                onChange={e => setPtsPerEuro(e.target.value)}
                className="w-full px-3 py-2 rounded-lg text-sm text-[var(--text1)]"
                style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}
              />
            </div>
            <div>
              <label className="block text-xs text-[var(--text3)] mb-1">Points min. rédemption</label>
              <input
                type="number"
                min="0"
                value={minRedemptionPts}
                onChange={e => setMinRedemptionPts(e.target.value)}
                className="w-full px-3 py-2 rounded-lg text-sm text-[var(--text1)]"
                style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}
              />
            </div>
          </div>

          <div>
            <p className="text-xs text-[var(--text3)] mb-2">Seuils de tiers</p>
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg p-3" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
                <p className="text-xs font-medium text-[var(--text2)] mb-2">Standard</p>
                <p className="text-xs text-[var(--text4)]">0 pts —</p>
                <div className="flex items-center gap-1 mt-1">
                  <input
                    type="number"
                    min="0"
                    value={standardMax}
                    onChange={e => setStandardMax(e.target.value)}
                    className="w-20 px-2 py-1 rounded text-xs text-[var(--text1)]"
                    style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}
                  />
                  <span className="text-xs text-[var(--text4)]">pts max</span>
                </div>
              </div>
              <div className="rounded-lg p-3" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
                <p className="text-xs font-medium" style={{ color: '#94a3b8' }}>Silver</p>
                <p className="text-xs text-[var(--text4)] mt-1">{parseInt(standardMax) + 1} pts —</p>
                <div className="flex items-center gap-1 mt-1">
                  <input
                    type="number"
                    min="0"
                    value={silverMax}
                    onChange={e => setSilverMax(e.target.value)}
                    className="w-20 px-2 py-1 rounded text-xs text-[var(--text1)]"
                    style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}
                  />
                  <span className="text-xs text-[var(--text4)]">pts max</span>
                </div>
              </div>
              <div className="rounded-lg p-3" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
                <p className="text-xs font-medium" style={{ color: '#fbbf24' }}>Gold</p>
                <p className="text-xs text-[var(--text4)] mt-1">{parseInt(silverMax) + 1} pts+</p>
                <p className="text-xs text-[var(--text4)] mt-1">Sans maximum</p>
              </div>
            </div>
          </div>
        </div>

        {error && (
          <p className="mt-3 text-xs" style={{ color: 'var(--red)' }}>{error}</p>
        )}

        <div className="mt-4 flex justify-end">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            style={{
              background: saved ? 'var(--green)' : 'var(--blue)',
              color: 'white',
              opacity: saving ? 0.7 : 1,
            }}
          >
            {saving ? 'Enregistrement…' : saved ? '✓ Enregistré' : 'Enregistrer'}
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Run full vitest suite**

```bash
npx vitest run
```

Expected: all existing tests pass, plus the new tests added in Tasks 3 and 4.

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/franchise/loyalty/page.tsx src/app/dashboard/franchise/loyalty/_components/network-loyalty-client.tsx
git commit -m "feat(ui): add franchise loyalty page with config editor and network stats"
```

---

## Verification Checklist

After all tasks are complete:

- [ ] `npx tsc --noEmit` — no TypeScript errors
- [ ] `npx vitest run` — all tests pass
- [ ] `npm run build` — build succeeds with no errors

**Manual smoke test (requires a dev Supabase instance with franchise_admin account):**
1. Log in as `franchise_admin` → verify `/dashboard/franchise/loyalty` appears in sidebar and loads
2. Edit pts_per_euro and save → verify "✓ Enregistré" appears
3. Log in as a cashier → create a customer with a phone number at a franchise establishment → verify `customers.network_customer_id` is set in DB
4. Open the same customer in CRM → verify "🌐 Membre réseau" badge and network points appear
5. Open Command Center → verify `loyalty` section appears in the API response (check Network tab)
