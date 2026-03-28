# Sprint 10 — Infrastructure Franchise & Command Center

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the `franchise_admin` role, franchise network Command Center dashboard, and franchisee onboarding flow for Allocookie.

**Architecture:** New `franchise_admin` role lives entirely under `/dashboard/franchise/` — its own layout, sidebar, and pages, isolated from the regular `admin` dashboard. Three API routes serve the franchise dashboard, all using a two-client pattern: anon client for auth/role check, then `supabaseAdmin` (service role) for all cross-establishment data reads. Franchisee onboarding is a single transactional endpoint that creates org + establishment + contract + auth invite + profile upsert in sequence, with manual rollback on any step failure.

**Tech Stack:** Next.js 15 App Router, TypeScript, Supabase PostgreSQL + RLS + Auth Admin API, Zod v4, existing CSS variable design system (`var(--bg)`, `var(--surface)`, `var(--blue)`, etc.)

**Spec:** `docs/superpowers/specs/2026-03-28-sprint10-franchise-command-center-design.md`

---

## File Map

**New files:**
- `supabase/migrations/20260328000007_sprint10_franchise.sql` — DB schema changes
- `src/app/dashboard/franchise/layout.tsx` — franchise layout with server-side role guard
- `src/app/dashboard/franchise/page.tsx` — redirect to command-center
- `src/app/dashboard/franchise/_components/franchise-sidebar.tsx` — nav sidebar
- `src/app/dashboard/franchise/command-center/page.tsx` — server component, fetches data
- `src/app/dashboard/franchise/command-center/_components/command-center-client.tsx` — client shell
- `src/app/dashboard/franchise/franchises/page.tsx` — franchisee list (server)
- `src/app/dashboard/franchise/franchises/_components/franchises-page-client.tsx` — list client
- `src/app/dashboard/franchise/franchises/nouveau/page.tsx` — onboarding form (server shell)
- `src/app/dashboard/franchise/franchises/nouveau/_components/onboarding-form.tsx` — form client
- `src/app/dashboard/franchise/franchises/[establishmentId]/page.tsx` — fiche franchisé (server)
- `src/app/dashboard/franchise/franchises/[establishmentId]/_components/fiche-client.tsx` — fiche client
- `src/app/api/franchise/network-stats/route.ts` — GET consolidated network data
- `src/app/api/franchise/establishments/route.ts` — GET list + POST onboarding
- `src/app/api/franchise/contracts/[establishmentId]/route.ts` — GET + PATCH contract

**Modified files:**
- `src/app/dashboard/layout.tsx` — add `franchise_admin` redirect + `org_id` in profile select
- `src/lib/types/database.ts` — add `franchise_admin` role, `parent_org_id`/`type` on orgs, `franchise_contracts` table

---

## Task 1: DB Migration

**Files:**
- Create: `supabase/migrations/20260328000007_sprint10_franchise.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- Sprint 10: Franchise infrastructure
-- 1. Add 'franchise_admin' to user_role enum
alter type public.user_role add value if not exists 'franchise_admin';

-- 2. Add parent_org_id to organizations
alter table public.organizations
  add column if not exists parent_org_id uuid references public.organizations(id) on delete set null;

-- 3. Ensure type column exists with correct constraint
alter table public.organizations
  add column if not exists type text default 'independent';

alter table public.organizations
  drop constraint if exists organizations_type_check;

alter table public.organizations
  add constraint organizations_type_check check (type in ('siege', 'franchise', 'independent'));

-- 4. Restrict organizations RLS to own network only
-- Drop any permissive SELECT policy that exposes all orgs
drop policy if exists "Enable read access for all users" on public.organizations;
drop policy if exists "orgs_visible_to_own_network" on public.organizations;

alter table public.organizations enable row level security;

create policy "orgs_visible_to_own_network"
  on public.organizations for select
  using (
    id = (select org_id from public.profiles where id = auth.uid() and org_id is not null)
    or
    parent_org_id = (select org_id from public.profiles where id = auth.uid() and org_id is not null)
  );

-- Allow franchise_admin to insert/update orgs in their network (needed for onboarding)
create policy "franchise_admin_manages_orgs"
  on public.organizations for all
  using (
    id = (select org_id from public.profiles where id = auth.uid() and role = 'franchise_admin' and org_id is not null)
    or
    parent_org_id = (select org_id from public.profiles where id = auth.uid() and role = 'franchise_admin' and org_id is not null)
  )
  with check (
    parent_org_id = (select org_id from public.profiles where id = auth.uid() and role = 'franchise_admin' and org_id is not null)
    or
    id = (select org_id from public.profiles where id = auth.uid() and role = 'franchise_admin' and org_id is not null)
  );

-- 5. Create franchise_contracts table
create table if not exists public.franchise_contracts (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references public.organizations(id) on delete cascade,
  establishment_id uuid not null references public.establishments(id) on delete cascade,
  royalty_rate     numeric(5,2) not null default 0
                     check (royalty_rate >= 0 and royalty_rate <= 100),
  marketing_rate   numeric(5,2) not null default 0
                     check (marketing_rate >= 0 and marketing_rate <= 100),
  start_date       date not null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique(org_id, establishment_id)
);

alter table public.franchise_contracts enable row level security;

-- franchise_admin can do everything on their own contracts
create policy "franchise_admin_manages_contracts"
  on public.franchise_contracts for all
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

-- franchisee admin can read their own contract
create policy "franchisee_admin_reads_own_contract"
  on public.franchise_contracts for select
  using (
    establishment_id in (
      select establishment_id from public.profiles
      where id = auth.uid() and role = 'admin' and establishment_id is not null
    )
  );

-- 6. updated_at trigger for franchise_contracts
create or replace function public.handle_updated_at()
  returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_franchise_contracts_updated_at on public.franchise_contracts;
create trigger set_franchise_contracts_updated_at
  before update on public.franchise_contracts
  for each row execute function public.handle_updated_at();

-- 7. Update handle_new_user trigger to also set org_id
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, role, establishment_id, org_id, first_name)
  values (
    new.id,
    coalesce((new.raw_user_meta_data->>'role')::text, 'caissier'),
    (new.raw_user_meta_data->>'establishment_id')::uuid,
    (new.raw_user_meta_data->>'org_id')::uuid,
    coalesce(new.raw_user_meta_data->>'first_name', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
```

- [ ] **Step 2: Apply the migration**

```bash
cd "/Users/anthony/Super pouvoir/Alloflow"
npx supabase db push
```

Expected: migration applied, no errors.

- [ ] **Step 3: Verify in Supabase SQL Editor**

Run:
```sql
select enum_range(null::public.user_role);
-- should include 'franchise_admin'

select column_name from information_schema.columns
where table_name = 'organizations' and column_name in ('parent_org_id', 'type');
-- should return 2 rows

select table_name from information_schema.tables
where table_name = 'franchise_contracts';
-- should return 1 row
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260328000007_sprint10_franchise.sql
git commit -m "feat(db): add franchise_admin role, parent_org_id, franchise_contracts (sprint 10)"
```

---

## Task 2: TypeScript Types

**Files:**
- Modify: `src/lib/types/database.ts`

- [ ] **Step 1: Read the current database.ts to find exact lines to update**

Read `src/lib/types/database.ts` — locate the `profiles` Row/Insert/Update (role enum), `organizations` Row/Insert/Update, and the end of the Tables section to add `franchise_contracts`.

- [ ] **Step 2: Update profiles type (role + missing columns)**

Find the `profiles` table. The Row/Insert/Update types need three additions beyond the role enum:
- `first_name` (added in Sprint 9a migration but may not be in database.ts yet)
- `email` (used in the onboarding upsert)
- `last_sign_in_at` (used in GET establishments to determine invitation status — this is actually an `auth.users` field, so use `(supabaseAdmin as any)` for that query instead of adding to profiles type)

Update the `profiles` Row type. Change:
```typescript
role: 'super_admin' | 'admin' | 'caissier'
```
to:
```typescript
role: 'super_admin' | 'admin' | 'caissier' | 'franchise_admin'
```
Apply the same change to Insert and Update types for profiles. Also add `first_name: string` and `email: string | null` to Row, and optionally to Insert/Update. **Note:** `last_sign_in_at` is NOT a profiles column — it lives on `auth.users`. The GET establishments route uses `(supabaseAdmin as any)` when querying it via the Admin API, so no type change needed for that field.

- [ ] **Step 3: Update organizations type**

**First read the current `src/lib/types/database.ts`** to find the exact current shape of `organizations`. The shape shown below is based on exploration — verify it matches before editing. If the actual shape differs, adjust accordingly.

Find the `organizations` table. Change the existing Row/Insert/Update to:
```typescript
Row: { id: string; name: string; type: 'siege' | 'franchise' | 'independent'; parent_org_id: string | null; created_at: string }
Insert: { id?: string; name: string; type?: 'siege' | 'franchise' | 'independent'; parent_org_id?: string | null; created_at?: string }
Update: { id?: string; name?: string; type?: 'siege' | 'franchise' | 'independent'; parent_org_id?: string | null; created_at?: string }
Relationships: [
  { foreignKeyName: "organizations_parent_org_id_fkey"; columns: ["parent_org_id"]; isOneToOne: false; referencedRelation: "organizations"; referencedColumns: ["id"] }
]
```

- [ ] **Step 4: Add franchise_contracts table type**

Add inside the `Tables` object (after `establishments` entry is fine):

```typescript
franchise_contracts: {
  Row: {
    id: string
    org_id: string
    establishment_id: string
    royalty_rate: number
    marketing_rate: number
    start_date: string
    created_at: string
    updated_at: string
  }
  Insert: {
    id?: string
    org_id: string
    establishment_id: string
    royalty_rate?: number
    marketing_rate?: number
    start_date: string
    created_at?: string
    updated_at?: string
  }
  Update: {
    id?: string
    org_id?: string
    establishment_id?: string
    royalty_rate?: number
    marketing_rate?: number
    start_date?: string
    created_at?: string
    updated_at?: string
  }
  Relationships: [
    { foreignKeyName: "franchise_contracts_org_id_fkey"; columns: ["org_id"]; isOneToOne: false; referencedRelation: "organizations"; referencedColumns: ["id"] },
    { foreignKeyName: "franchise_contracts_establishment_id_fkey"; columns: ["establishment_id"]; isOneToOne: false; referencedRelation: "establishments"; referencedColumns: ["id"] }
  ]
}
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
cd "/Users/anthony/Super pouvoir/Alloflow"
npx tsc --noEmit
```

Expected: 0 errors (or only pre-existing errors unrelated to franchise_contracts).

- [ ] **Step 6: Commit**

```bash
git add src/lib/types/database.ts
git commit -m "feat(types): add franchise_admin role, organizations.parent_org_id, franchise_contracts"
```

---

## Task 3: Dashboard Layout — franchise_admin Redirect

**Files:**
- Modify: `src/app/dashboard/layout.tsx`

- [ ] **Step 1: Read the current file**

Read `src/app/dashboard/layout.tsx` — confirm the current content (shown in plan context above).

- [ ] **Step 2: Update the profile select to include org_id**

Find:
```typescript
const { data: profile } = await supabase
  .from('profiles')
  .select('role, establishment_id')
  .eq('id', user.id)
  .single()
```

Change to:
```typescript
const { data: profile } = await supabase
  .from('profiles')
  .select('role, establishment_id, org_id')
  .eq('id', user.id)
  .single()
```

- [ ] **Step 3: Add franchise_admin redirect**

Find:
```typescript
if (!profile) redirect('/login?error=profile_not_found')
if (profile.role === 'caissier') redirect('/caisse/pos')
```

Change to:
```typescript
if (!profile) redirect('/login?error=profile_not_found')
if (profile.role === 'franchise_admin') redirect('/dashboard/franchise')
if (profile.role === 'caissier') redirect('/caisse/pos')
```

- [ ] **Step 4: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: 0 new errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/layout.tsx
git commit -m "feat(auth): redirect franchise_admin to /dashboard/franchise"
```

---

## Task 4: Franchise Layout + Sidebar

**Files:**
- Create: `src/app/dashboard/franchise/layout.tsx`
- Create: `src/app/dashboard/franchise/page.tsx`
- Create: `src/app/dashboard/franchise/_components/franchise-sidebar.tsx`

- [ ] **Step 1: Create the layout file**

`src/app/dashboard/franchise/layout.tsx`:
```typescript
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { FranchiseSidebar } from './_components/franchise-sidebar'

export default async function FranchiseLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, org_id')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'franchise_admin') redirect('/dashboard')

  return (
    <div className="flex flex-1 min-h-0">
      <FranchiseSidebar />
      <main className="flex-1 overflow-y-auto py-8 px-6">
        {children}
      </main>
    </div>
  )
}
```

- [ ] **Step 2: Create the index redirect**

`src/app/dashboard/franchise/page.tsx`:
```typescript
import { redirect } from 'next/navigation'

export default function FranchisePage() {
  redirect('/dashboard/franchise/command-center')
}
```

- [ ] **Step 3: Create the sidebar**

`src/app/dashboard/franchise/_components/franchise-sidebar.tsx`:
```typescript
'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const links = [
  { href: '/dashboard/franchise/command-center', label: '📊 Command Center' },
  { href: '/dashboard/franchise/franchises',     label: '🏪 Franchisés' },
]

export function FranchiseSidebar() {
  const pathname = usePathname()

  return (
    <nav
      className="w-48 flex-shrink-0 flex flex-col gap-1 py-6 px-3 border-r"
      style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
    >
      <p className="text-xs font-semibold text-[var(--text4)] uppercase tracking-wider px-2 mb-2">
        🍪 Allocookie Siège
      </p>
      {links.map(link => {
        const active = pathname === link.href || pathname.startsWith(link.href + '/')
        return (
          <Link
            key={link.href}
            href={link.href}
            className="px-3 py-2 rounded-lg text-sm transition-colors"
            style={
              active
                ? { background: 'var(--selection-bg)', color: 'var(--text1)', fontWeight: 500 }
                : { color: 'var(--text3)' }
            }
          >
            {link.label}
          </Link>
        )
      })}
    </nav>
  )
}
```

- [ ] **Step 4: TypeScript check**

```bash
npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/franchise/
git commit -m "feat(franchise): add layout, sidebar, and index redirect"
```

---

## Task 5: API — `/api/franchise/network-stats`

**Files:**
- Create: `src/app/api/franchise/network-stats/route.ts`

- [ ] **Step 1: Create the route**

`src/app/api/franchise/network-stats/route.ts`:
```typescript
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

export async function GET() {
  // 1. Auth + role check (anon client)
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, org_id')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'franchise_admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  if (!profile.org_id) {
    return NextResponse.json({ error: 'org_id manquant sur le profil' }, { status: 400 })
  }

  const supabaseAdmin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  const orgId = profile.org_id

  // 2. All orgs in network (siege + franchisees)
  const { data: networkOrgs } = await supabaseAdmin
    .from('organizations')
    .select('id, type, name')
    .or(`id.eq.${orgId},parent_org_id.eq.${orgId}`)

  if (!networkOrgs || networkOrgs.length === 0) {
    return NextResponse.json({ network: { ca_yesterday: 0, ca_month: 0, ca_month_prev: 0 }, establishments: [] })
  }

  const orgIds = networkOrgs.map((o: { id: string }) => o.id)

  // 3. All establishments in network
  const { data: establishments } = await supabaseAdmin
    .from('establishments')
    .select('id, name, org_id')
    .in('org_id', orgIds)

  if (!establishments || establishments.length === 0) {
    return NextResponse.json({ network: { ca_yesterday: 0, ca_month: 0, ca_month_prev: 0 }, establishments: [] })
  }

  const estIds = establishments.map((e: { id: string }) => e.id)

  // 4. Franchise contracts (keyed by establishment_id)
  const { data: contracts } = await supabaseAdmin
    .from('franchise_contracts')
    .select('establishment_id, royalty_rate, marketing_rate')
    .eq('org_id', orgId)

  const contractMap = new Map(
    (contracts ?? []).map((c: { establishment_id: string; royalty_rate: number; marketing_rate: number }) => [
      c.establishment_id,
      { royalty_rate: c.royalty_rate, marketing_rate: c.marketing_rate },
    ])
  )

  // 5. Date ranges
  const now = new Date()
  const todayStr = now.toISOString().split('T')[0]                              // e.g. '2026-03-28'
  const yesterdayStr = new Date(now.getTime() - 864e5).toISOString().split('T')[0]
  const monthStartStr = `${todayStr.slice(0, 7)}-01`
  const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const prevMonthEnd   = new Date(now.getFullYear(), now.getMonth(), 0)
  const prevMonthStartStr = prevMonthStart.toISOString().split('T')[0]
  const prevMonthEndStr   = prevMonthEnd.toISOString().split('T')[0]

  // 6. Orders queries (all at once, then group by establishment)
  const [{ data: ordersYest }, { data: ordersMonth }, { data: ordersPrevMonth }] = await Promise.all([
    supabaseAdmin
      .from('orders')
      .select('establishment_id, total_ttc')
      .in('establishment_id', estIds)
      .eq('status', 'paid')
      .gte('created_at', `${yesterdayStr}T00:00:00`)
      .lt('created_at',  `${todayStr}T00:00:00`),
    supabaseAdmin
      .from('orders')
      .select('establishment_id, total_ttc')
      .in('establishment_id', estIds)
      .eq('status', 'paid')
      .gte('created_at', `${monthStartStr}T00:00:00`),
    supabaseAdmin
      .from('orders')
      .select('establishment_id, total_ttc')
      .in('establishment_id', estIds)
      .eq('status', 'paid')
      .gte('created_at', `${prevMonthStartStr}T00:00:00`)
      .lte('created_at', `${prevMonthEndStr}T23:59:59`),
  ])

  function sumByEstablishment(orders: Array<{ establishment_id: string; total_ttc: number }> | null) {
    const map = new Map<string, number>()
    for (const o of orders ?? []) {
      map.set(o.establishment_id, (map.get(o.establishment_id) ?? 0) + (o.total_ttc ?? 0))
    }
    return map
  }

  const caYestMap  = sumByEstablishment(ordersYest)
  const caMonthMap = sumByEstablishment(ordersMonth)
  const caPrevMap  = sumByEstablishment(ordersPrevMonth)

  // 7. Alerts
  // 7a. session_fermee: no open cash session today
  const { data: openSessions } = await supabaseAdmin
    .from('cash_sessions')
    .select('establishment_id')
    .in('establishment_id', estIds)
    .eq('status', 'open')

  const openSessionEstIds = new Set((openSessions ?? []).map((s: { establishment_id: string }) => s.establishment_id))

  // 7b. stock_bas: any stock item with current_quantity <= 0
  // Uses (supabaseAdmin as any) because stock_items.current_quantity may not be in database.ts
  const { data: lowStockItems } = await (supabaseAdmin as any)
    .from('stock_items')
    .select('establishment_id')
    .in('establishment_id', estIds)
    .lte('current_quantity', 0)
    .not('current_quantity', 'is', null)

  const lowStockEstIds = new Set(
    (lowStockItems ?? []).map((s: { establishment_id: string }) => s.establishment_id)
  )

  // 8. Build per-establishment response
  const orgsMap = new Map(networkOrgs.map((o: { id: string; type: string; name: string }) => [o.id, o]))

  const estResults = establishments.map((est: { id: string; name: string; org_id: string }) => {
    const org      = orgsMap.get(est.org_id)
    const isFranchise = org?.type === 'franchise'
    const contract = contractMap.get(est.id)
    const caMonth  = caMonthMap.get(est.id) ?? 0
    const royaltyRate   = isFranchise ? (contract?.royalty_rate   ?? 0) : 0
    const marketingRate = isFranchise ? (contract?.marketing_rate ?? 0) : 0

    const alerts: string[] = []
    if (!openSessionEstIds.has(est.id)) alerts.push('session_fermee')
    if (lowStockEstIds.has(est.id))     alerts.push('stock_bas')

    return {
      id:               est.id,
      name:             est.name,
      type:             isFranchise ? 'franchise' : 'own' as 'franchise' | 'own',
      ca_yesterday:     caYestMap.get(est.id) ?? 0,
      ca_month:         caMonth,
      royalty_rate:     royaltyRate,
      marketing_rate:   marketingRate,
      royalty_amount:   Math.round(caMonth * royaltyRate) / 100,
      marketing_amount: Math.round(caMonth * marketingRate) / 100,
      alerts,
    }
  })

  const networkCaYest  = estResults.reduce((s: number, e: { ca_yesterday: number }) => s + e.ca_yesterday, 0)
  const networkCaMonth = estResults.reduce((s: number, e: { ca_month: number })     => s + e.ca_month, 0)
  const networkCaPrev  = Array.from(caPrevMap.values()).reduce((s, v) => s + v, 0)

  return NextResponse.json({
    network: {
      ca_yesterday:  networkCaYest,
      ca_month:      networkCaMonth,
      ca_month_prev: networkCaPrev,
    },
    establishments: estResults,
  })
}
```

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: 0 new errors.

- [ ] **Step 3: Smoke test (requires a franchise_admin user in DB)**

```bash
# From a terminal with the dev server running (npm run dev):
curl -s http://localhost:3000/api/franchise/network-stats \
  -H "Cookie: <paste a valid franchise_admin session cookie>" | jq .
```

Expected: JSON with `network` and `establishments` keys. Without a valid session: `{"error":"Unauthorized"}`.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/franchise/network-stats/route.ts
git commit -m "feat(api): add /api/franchise/network-stats endpoint"
```

---

## Task 6: API — `/api/franchise/establishments`

**Files:**
- Create: `src/app/api/franchise/establishments/route.ts`

- [ ] **Step 1: Create the route**

`src/app/api/franchise/establishments/route.ts`:
```typescript
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

const onboardingSchema = z.object({
  company_name:       z.string().min(1).max(100),
  shop_name:          z.string().min(1).max(100),
  manager_email:      z.string().email(),
  manager_first_name: z.string().min(1).max(50),
  royalty_rate:       z.number().min(0).max(50),
  marketing_rate:     z.number().min(0).max(20),
  start_date:         z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
})

async function getFranchiseAdminProfile() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, org_id')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'franchise_admin' || !profile.org_id) return null
  return { userId: user.id, orgId: profile.org_id }
}

export async function GET() {
  const caller = await getFranchiseAdminProfile()
  if (!caller) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const supabaseAdmin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // All orgs in network
  const { data: networkOrgs } = await supabaseAdmin
    .from('organizations')
    .select('id, name, type')
    .or(`id.eq.${caller.orgId},parent_org_id.eq.${caller.orgId}`)

  const orgIds = (networkOrgs ?? []).map((o: { id: string }) => o.id)

  const { data: establishments } = await supabaseAdmin
    .from('establishments')
    .select('id, name, org_id')
    .in('org_id', orgIds.length > 0 ? orgIds : ['__none__'])

  const { data: contracts } = await supabaseAdmin
    .from('franchise_contracts')
    .select('establishment_id, royalty_rate, marketing_rate, start_date')
    .eq('org_id', caller.orgId)

  const contractMap = new Map(
    (contracts ?? []).map((c: { establishment_id: string; royalty_rate: number; marketing_rate: number; start_date: string }) => [
      c.establishment_id,
      c,
    ])
  )

  const orgsMap = new Map((networkOrgs ?? []).map((o: { id: string; type: string }) => [o.id, o]))

  // Get admin profiles for each establishment (to retrieve their user IDs)
  const { data: adminProfiles } = await supabaseAdmin
    .from('profiles')
    .select('id, establishment_id')
    .in('establishment_id', (establishments ?? []).map((e: { id: string }) => e.id))
    .eq('role', 'admin')

  // Get last_sign_in_at from auth.users (NOT from profiles — it's an auth.users field)
  const adminProfileIds = (adminProfiles ?? []).map((p: { id: string }) => p.id)
  let authUsersMap = new Map<string, string | null>()
  if (adminProfileIds.length > 0) {
    const { data: { users: authUsers } } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 })
    authUsersMap = new Map(
      authUsers
        .filter(u => adminProfileIds.includes(u.id))
        .map(u => [u.id, u.last_sign_in_at ?? null])
    )
  }

  // Map establishment_id → last_sign_in_at
  const estLastSignIn = new Map<string, string | null>()
  for (const p of (adminProfiles ?? []) as Array<{ id: string; establishment_id: string }>) {
    estLastSignIn.set(p.establishment_id, authUsersMap.get(p.id) ?? null)
  }

  const result = (establishments ?? []).map((est: { id: string; name: string; org_id: string }) => {
    const org           = orgsMap.get(est.org_id)
    const contract      = contractMap.get(est.id)
    const lastSignIn    = estLastSignIn.get(est.id) ?? null
    return {
      id:             est.id,
      name:           est.name,
      type:           org?.type === 'franchise' ? 'franchise' : 'own',
      royalty_rate:   contract?.royalty_rate   ?? 0,
      marketing_rate: contract?.marketing_rate ?? 0,
      start_date:     contract?.start_date     ?? null,
      status:         lastSignIn ? 'actif' : 'invitation_envoyee',
    }
  })

  return NextResponse.json({ establishments: result })
}

export async function POST(req: NextRequest) {
  const caller = await getFranchiseAdminProfile()
  if (!caller) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = onboardingSchema.safeParse(await req.json())
  if (!body.success) return NextResponse.json({ error: body.error.flatten() }, { status: 422 })

  const { company_name, shop_name, manager_email, manager_first_name, royalty_rate, marketing_rate, start_date } = body.data

  const supabaseAdmin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  let franchiseeOrgId: string | null = null
  let establishmentId: string | null = null
  let invitedUserId:   string | null = null

  try {
    // Step 1: Create franchisee org
    const { data: org, error: orgErr } = await supabaseAdmin
      .from('organizations')
      .insert({ name: company_name, type: 'franchise', parent_org_id: caller.orgId })
      .select('id')
      .single()
    if (orgErr || !org) throw new Error(orgErr?.message ?? 'Failed to create org')
    franchiseeOrgId = org.id

    // Step 2: Create establishment
    const { data: est, error: estErr } = await supabaseAdmin
      .from('establishments')
      .insert({ name: shop_name, org_id: franchiseeOrgId })
      .select('id')
      .single()
    if (estErr || !est) throw new Error(estErr?.message ?? 'Failed to create establishment')
    establishmentId = est.id

    // Step 3: Create franchise contract
    const { error: contractErr } = await supabaseAdmin
      .from('franchise_contracts')
      .insert({ org_id: caller.orgId, establishment_id: establishmentId, royalty_rate, marketing_rate, start_date })
    if (contractErr) throw new Error(contractErr.message)

    // Step 4: Invite manager
    const { data: { user: invitedUser }, error: inviteErr } = await supabaseAdmin.auth.admin.inviteUserByEmail(
      manager_email,
      { data: { role: 'admin', establishment_id: establishmentId, org_id: franchiseeOrgId, first_name: manager_first_name } }
    )
    if (inviteErr || !invitedUser) throw new Error(inviteErr?.message ?? 'Failed to invite user')
    invitedUserId = invitedUser.id

    // Step 5: Upsert profile immediately (handle_new_user fires only on password confirmation)
    const { error: profileErr } = await supabaseAdmin
      .from('profiles')
      .upsert(
        {
          id:               invitedUserId,
          email:            manager_email,
          first_name:       manager_first_name,
          role:             'admin',
          establishment_id: establishmentId,
          org_id:           franchiseeOrgId,
        },
        { onConflict: 'id' }
      )
    if (profileErr) throw new Error(profileErr.message)

    return NextResponse.json({ ok: true, establishment_id: establishmentId }, { status: 201 })

  } catch (err) {
    // Manual rollback in reverse order: profile → auth user → contract → establishment → org
    if (invitedUserId) {
      // deleteUser also removes the auth.users row; the profile row cascades (FK) or was upserted
      await supabaseAdmin.from('profiles').delete().eq('id', invitedUserId).catch(() => null)
      await supabaseAdmin.auth.admin.deleteUser(invitedUserId).catch(() => null)
    }
    if (establishmentId) {
      // Delete contract before establishment (avoids FK issues if cascade not set)
      await supabaseAdmin.from('franchise_contracts').delete().eq('establishment_id', establishmentId).catch(() => null)
      await supabaseAdmin.from('establishments').delete().eq('id', establishmentId).catch(() => null)
    }
    if (franchiseeOrgId) {
      await supabaseAdmin.from('organizations').delete().eq('id', franchiseeOrgId).catch(() => null)
    }
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
```

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: 0 new errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/franchise/establishments/route.ts
git commit -m "feat(api): add /api/franchise/establishments GET + POST"
```

---

## Task 7: API — `/api/franchise/contracts/[establishmentId]`

**Files:**
- Create: `src/app/api/franchise/contracts/[establishmentId]/route.ts`

- [ ] **Step 1: Create the route**

`src/app/api/franchise/contracts/[establishmentId]/route.ts`:
```typescript
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

const patchSchema = z.object({
  royalty_rate:   z.number().min(0).max(50).optional(),
  marketing_rate: z.number().min(0).max(20).optional(),
  start_date:     z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
})

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ establishmentId: string }> }
) {
  const { establishmentId } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles').select('role, org_id').eq('id', user.id).single()
  if (!profile || profile.role !== 'franchise_admin' || !profile.org_id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const supabaseAdmin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: contract, error } = await supabaseAdmin
    .from('franchise_contracts')
    .select('royalty_rate, marketing_rate, start_date')
    .eq('org_id', profile.org_id)          // ownership check
    .eq('establishment_id', establishmentId)
    .single()

  if (error || !contract) return NextResponse.json({ error: 'Contrat introuvable' }, { status: 404 })

  return NextResponse.json({ contract })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ establishmentId: string }> }
) {
  const { establishmentId } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles').select('role, org_id').eq('id', user.id).single()
  if (!profile || profile.role !== 'franchise_admin' || !profile.org_id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = patchSchema.safeParse(await req.json())
  if (!body.success) return NextResponse.json({ error: body.error.flatten() }, { status: 422 })
  if (Object.keys(body.data).length === 0) {
    return NextResponse.json({ error: 'Aucun champ à mettre à jour' }, { status: 400 })
  }

  const supabaseAdmin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: updated, error } = await supabaseAdmin
    .from('franchise_contracts')
    .update(body.data)
    .eq('org_id', profile.org_id)           // ownership check
    .eq('establishment_id', establishmentId)
    .select('royalty_rate, marketing_rate, start_date')
    .single()

  if (error || !updated) return NextResponse.json({ error: 'Contrat introuvable ou non autorisé' }, { status: 404 })

  return NextResponse.json({ contract: updated })
}
```

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/franchise/contracts/
git commit -m "feat(api): add /api/franchise/contracts/[establishmentId] GET + PATCH"
```

---

## Task 8: Command Center Page

**Files:**
- Create: `src/app/dashboard/franchise/command-center/page.tsx`
- Create: `src/app/dashboard/franchise/command-center/_components/command-center-client.tsx`

- [ ] **Step 1: Create the server page**

`src/app/dashboard/franchise/command-center/page.tsx`:
```typescript
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { CommandCenterClient } from './_components/command-center-client'

export default async function CommandCenterPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Fetch data server-side for initial render
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const cookieHeader = (await import('next/headers')).cookies()
  const cookieStr = (await cookieHeader).toString()

  const res = await fetch(`${baseUrl}/api/franchise/network-stats`, {
    headers: { Cookie: cookieStr },
    cache: 'no-store',
  })

  const data = res.ok ? await res.json() : { network: { ca_yesterday: 0, ca_month: 0, ca_month_prev: 0 }, establishments: [] }

  return <CommandCenterClient initialData={data} />
}
```

- [ ] **Step 2: Create the client component**

`src/app/dashboard/franchise/command-center/_components/command-center-client.tsx`:
```typescript
'use client'
import { useState } from 'react'

interface EstablishmentStat {
  id:               string
  name:             string
  type:             'own' | 'franchise'
  ca_yesterday:     number
  ca_month:         number
  royalty_rate:     number
  marketing_rate:   number
  royalty_amount:   number
  marketing_amount: number
  alerts:           string[]
}

interface NetworkStats {
  ca_yesterday:  number
  ca_month:      number
  ca_month_prev: number
}

interface Props {
  initialData: {
    network:        NetworkStats
    establishments: EstablishmentStat[]
  }
}

function fmt(n: number) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)
}

function pct(current: number, prev: number) {
  if (prev === 0) return null
  const delta = Math.round(((current - prev) / prev) * 100)
  return delta
}

export function CommandCenterClient({ initialData }: Props) {
  const [data, setData] = useState(initialData)
  const [refreshing, setRefreshing] = useState(false)

  async function refresh() {
    setRefreshing(true)
    try {
      const res = await fetch('/api/franchise/network-stats', { cache: 'no-store' })
      if (res.ok) setData(await res.json())
    } finally {
      setRefreshing(false)
    }
  }

  const { network, establishments } = data

  // Totals "dans ma poche"
  const totalRoyalties  = establishments.reduce((s, e) => s + e.royalty_amount,   0)
  const totalMarketing  = establishments.reduce((s, e) => s + e.marketing_amount, 0)
  const ownEst          = establishments.filter(e => e.type === 'own')
  const totalLaboSales  = ownEst.reduce((s, e) => s + e.ca_month, 0)
  const totalPocket     = totalRoyalties + totalMarketing + totalLaboSales

  const evolution = pct(network.ca_month, network.ca_month_prev)

  return (
    <div className="max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-[var(--text1)]">Command Center</h1>
          <p className="text-sm text-[var(--text4)] mt-0.5">Vue réseau en temps réel</p>
        </div>
        <button
          onClick={refresh}
          disabled={refreshing}
          className="text-xs px-3 py-1.5 rounded-lg transition-opacity"
          style={{ background: 'var(--surface2)', color: 'var(--text3)', border: '1px solid var(--border)', opacity: refreshing ? 0.5 : 1 }}
        >
          {refreshing ? '↻ Actualisation…' : '↻ Actualiser'}
        </button>
      </div>

      {/* Bloc "Dans ma poche ce mois" */}
      <div
        className="rounded-xl p-4 mb-4"
        style={{ background: 'linear-gradient(135deg, #0f1f35 0%, #0a1628 100%)', border: '1px solid #1e3a5f' }}
      >
        <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: '#60a5fa' }}>
          💰 Dans ma poche — ce mois
        </p>
        <div className="grid grid-cols-4 gap-4">
          <div>
            <p className="text-xs mb-1" style={{ color: '#4a6a8a' }}>Royalties</p>
            <p className="text-2xl font-bold" style={{ color: '#60a5fa' }}>{fmt(totalRoyalties)}</p>
          </div>
          <div>
            <p className="text-xs mb-1" style={{ color: '#4a6a8a' }}>Fonds marketing</p>
            <p className="text-2xl font-bold" style={{ color: '#60a5fa' }}>{fmt(totalMarketing)}</p>
          </div>
          <div>
            <p className="text-xs mb-1" style={{ color: '#4a6a8a' }}>Ventes labo</p>
            <p className="text-2xl font-bold" style={{ color: '#60a5fa' }}>{fmt(totalLaboSales)}</p>
          </div>
          <div className="pl-4" style={{ borderLeft: '1px solid #1e3a5f' }}>
            <p className="text-xs font-semibold mb-1" style={{ color: '#93c5fd' }}>TOTAL</p>
            <p className="text-3xl font-bold text-white">{fmt(totalPocket)}</p>
          </div>
        </div>
      </div>

      {/* KPIs réseau */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div
          className="rounded-xl p-4"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
        >
          <p className="text-xs uppercase text-[var(--text4)] mb-1">CA réseau — hier</p>
          <p className="text-2xl font-bold text-[var(--text1)]">{fmt(network.ca_yesterday)}</p>
        </div>
        <div
          className="rounded-xl p-4"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
        >
          <p className="text-xs uppercase text-[var(--text4)] mb-1">CA réseau — ce mois</p>
          <p className="text-2xl font-bold text-[var(--text1)]">{fmt(network.ca_month)}</p>
          {evolution !== null && (
            <p className="text-xs mt-1" style={{ color: evolution >= 0 ? 'var(--green)' : 'var(--red)' }}>
              {evolution >= 0 ? '↑' : '↓'} {Math.abs(evolution)}% vs mois dernier
            </p>
          )}
        </div>
      </div>

      {/* Tableau par établissement */}
      <div
        className="rounded-xl overflow-hidden"
        style={{ border: '1px solid var(--border)' }}
      >
        {/* Table header */}
        <div
          className="grid text-xs uppercase font-semibold px-4 py-2"
          style={{
            gridTemplateColumns: '1.5fr 90px 100px 70px 80px 80px 100px',
            gap: '8px',
            background: 'var(--surface2)',
            color: 'var(--text4)',
            letterSpacing: '0.07em',
          }}
        >
          <span>Boutique</span>
          <span>CA hier</span>
          <span>CA mois</span>
          <span>Roy.%</span>
          <span>Roy.€</span>
          <span>Mktg.€</span>
          <span style={{ color: '#60a5fa' }}>→ Franchiseur</span>
        </div>

        {establishments.map((est, i) => {
          const total = est.royalty_amount + est.marketing_amount
          return (
            <div
              key={est.id}
              className="grid items-center px-4 py-3"
              style={{
                gridTemplateColumns: '1.5fr 90px 100px 70px 80px 80px 100px',
                gap: '8px',
                borderTop: i > 0 ? '1px solid var(--border)' : undefined,
                background: 'var(--surface)',
              }}
            >
              {/* Boutique */}
              <div className="flex items-center gap-2">
                <div
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ background: est.alerts.length > 0 ? 'var(--amber)' : 'var(--green)' }}
                />
                <div>
                  <p className="text-sm font-medium text-[var(--text1)]">{est.name}</p>
                  <p className="text-xs text-[var(--text4)]">
                    {est.type === 'franchise' ? 'Franchisé' : 'Établissement propre'}
                  </p>
                </div>
              </div>

              {/* CA hier */}
              <span className="text-sm font-semibold text-[var(--text1)]">{fmt(est.ca_yesterday)}</span>

              {/* CA mois */}
              <span className="text-sm font-semibold text-[var(--text1)]">{fmt(est.ca_month)}</span>

              {/* Roy % */}
              <span className="text-sm text-[var(--text3)]">
                {est.type === 'franchise' ? `${est.royalty_rate}%` : '—'}
              </span>

              {/* Roy € */}
              <span className="text-sm" style={{ color: est.type === 'franchise' ? 'var(--green)' : 'var(--text4)' }}>
                {est.type === 'franchise' ? fmt(est.royalty_amount) : '—'}
              </span>

              {/* Mktg € */}
              <span className="text-sm" style={{ color: est.type === 'franchise' ? 'var(--green)' : 'var(--text4)' }}>
                {est.type === 'franchise' ? fmt(est.marketing_amount) : '—'}
              </span>

              {/* Total → franchiseur */}
              <div className="flex items-center gap-2">
                {est.type === 'franchise' ? (
                  <span className="text-sm font-bold" style={{ color: '#60a5fa' }}>{fmt(total)}</span>
                ) : (
                  <span className="text-sm font-medium" style={{ color: '#a78bfa' }}>Direct</span>
                )}
                {est.alerts.map(alert => (
                  <span
                    key={alert}
                    className="text-xs px-1.5 py-0.5 rounded font-medium"
                    style={{ background: '#2a1a1a', color: 'var(--amber)' }}
                    title={alert === 'session_fermee' ? 'Session de caisse non ouverte' : alert}
                  >
                    ⚠
                  </span>
                ))}
              </div>
            </div>
          )
        })}

        {establishments.length === 0 && (
          <div className="px-4 py-8 text-center text-sm text-[var(--text4)]">
            Aucun établissement dans le réseau
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: 0 new errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/dashboard/franchise/command-center/
git commit -m "feat(franchise): add Command Center page and client"
```

---

## Task 9: Franchisés List Page

**Files:**
- Create: `src/app/dashboard/franchise/franchises/page.tsx`
- Create: `src/app/dashboard/franchise/franchises/_components/franchises-page-client.tsx`

- [ ] **Step 1: Create the server page**

`src/app/dashboard/franchise/franchises/page.tsx`:
```typescript
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { FranchisesPageClient } from './_components/franchises-page-client'

export default async function FranchisesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!profile || profile.role !== 'franchise_admin') redirect('/dashboard')

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const cookieHeader = (await import('next/headers')).cookies()
  const cookieStr = (await cookieHeader).toString()

  const res = await fetch(`${baseUrl}/api/franchise/establishments`, {
    headers: { Cookie: cookieStr },
    cache: 'no-store',
  })

  const data = res.ok ? await res.json() : { establishments: [] }

  return <FranchisesPageClient initialEstablishments={data.establishments} />
}
```

- [ ] **Step 2: Create the client component**

`src/app/dashboard/franchise/franchises/_components/franchises-page-client.tsx`:
```typescript
'use client'
import Link from 'next/link'
import { useState } from 'react'

interface FranchiseeEstablishment {
  id:             string
  name:           string
  type:           'own' | 'franchise'
  royalty_rate:   number
  marketing_rate: number
  start_date:     string | null
  status:         'actif' | 'invitation_envoyee'
}

interface Props { initialEstablishments: FranchiseeEstablishment[] }

export function FranchisesPageClient({ initialEstablishments }: Props) {
  const [establishments] = useState(initialEstablishments)

  const franchisees = establishments.filter(e => e.type === 'franchise')
  const own         = establishments.filter(e => e.type === 'own')

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-[var(--text1)]">Franchisés</h1>
          <p className="text-sm text-[var(--text4)] mt-0.5">
            {franchisees.length} franchisé{franchisees.length !== 1 ? 's' : ''} · {own.length} propre{own.length !== 1 ? 's' : ''}
          </p>
        </div>
        <Link
          href="/dashboard/franchise/franchises/nouveau"
          className="px-4 py-2 rounded-lg text-sm font-medium text-white"
          style={{ background: 'var(--blue)' }}
        >
          + Onboarder un franchisé
        </Link>
      </div>

      <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
        {/* Header */}
        <div
          className="grid px-4 py-2 text-xs font-semibold uppercase tracking-wider"
          style={{ gridTemplateColumns: '1.5fr 80px 80px 80px 100px', gap: '8px', background: 'var(--surface2)', color: 'var(--text4)' }}
        >
          <span>Établissement</span>
          <span>Royalty</span>
          <span>Marketing</span>
          <span>Statut</span>
          <span />
        </div>

        {establishments.map((est, i) => (
          <div
            key={est.id}
            className="grid items-center px-4 py-3"
            style={{
              gridTemplateColumns: '1.5fr 80px 80px 80px 100px',
              gap: '8px',
              borderTop: i > 0 ? '1px solid var(--border)' : undefined,
              background: 'var(--surface)',
            }}
          >
            <div>
              <p className="text-sm font-medium text-[var(--text1)]">{est.name}</p>
              <p className="text-xs text-[var(--text4)]">
                {est.type === 'franchise' ? 'Franchisé' : 'Établissement propre'}
                {est.start_date && ` · depuis ${est.start_date}`}
              </p>
            </div>
            <span className="text-sm text-[var(--text2)]">
              {est.type === 'franchise' ? `${est.royalty_rate}%` : '—'}
            </span>
            <span className="text-sm text-[var(--text2)]">
              {est.type === 'franchise' ? `${est.marketing_rate}%` : '—'}
            </span>
            <span className="text-xs" style={{ color: est.status === 'actif' ? 'var(--green)' : 'var(--amber)' }}>
              {est.status === 'actif' ? '● Actif' : '⏳ Invitation'}
            </span>
            {est.type === 'franchise' ? (
              <Link
                href={`/dashboard/franchise/franchises/${est.id}`}
                className="text-xs font-medium text-right block"
                style={{ color: 'var(--blue)' }}
              >
                Voir →
              </Link>
            ) : (
              <span />
            )}
          </div>
        ))}

        {establishments.length === 0 && (
          <div className="px-4 py-10 text-center text-sm text-[var(--text4)]">
            Aucun établissement.{' '}
            <Link href="/dashboard/franchise/franchises/nouveau" style={{ color: 'var(--blue)' }}>
              Onboarder le premier franchisé →
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: TypeScript check**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add src/app/dashboard/franchise/franchises/
git commit -m "feat(franchise): add franchisees list page"
```

---

## Task 10: Onboarding Form Page

**Files:**
- Create: `src/app/dashboard/franchise/franchises/nouveau/page.tsx`
- Create: `src/app/dashboard/franchise/franchises/nouveau/_components/onboarding-form.tsx`

- [ ] **Step 1: Create the server shell**

`src/app/dashboard/franchise/franchises/nouveau/page.tsx`:
```typescript
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { OnboardingForm } from './_components/onboarding-form'

export default async function NouveauFranchisePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!profile || profile.role !== 'franchise_admin') redirect('/dashboard')

  return (
    <div className="max-w-lg">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-[var(--text1)]">Onboarder un franchisé</h1>
        <p className="text-sm text-[var(--text4)] mt-0.5">
          Crée la société franchisée, son établissement, et envoie l'invitation au gérant.
        </p>
      </div>
      <OnboardingForm />
    </div>
  )
}
```

- [ ] **Step 2: Create the form client component**

`src/app/dashboard/franchise/franchises/nouveau/_components/onboarding-form.tsx`:
```typescript
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

const inputStyle = {
  background: 'var(--surface2)',
  border: '1px solid var(--border)',
  color: 'var(--text1)',
  borderRadius: '8px',
  padding: '8px 12px',
  fontSize: '14px',
  width: '100%',
  outline: 'none',
} as React.CSSProperties

const labelStyle = {
  display: 'block',
  fontSize: '11px',
  fontWeight: 600,
  color: 'var(--text4)',
  textTransform: 'uppercase' as const,
  letterSpacing: '0.07em',
  marginBottom: '6px',
}

export function OnboardingForm() {
  const router = useRouter()

  const [form, setForm] = useState({
    company_name:       '',
    shop_name:          '',
    manager_email:      '',
    manager_first_name: '',
    royalty_rate:       5,
    marketing_rate:     2,
    start_date:         new Date().toISOString().split('T')[0],
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError]           = useState<string | null>(null)

  function set(key: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = ['royalty_rate', 'marketing_rate'].includes(key)
        ? parseFloat(e.target.value) || 0
        : e.target.value
      setForm(prev => ({ ...prev, [key]: val }))
    }
  }

  // Projection automatique
  const estimatedCA = 15000
  const projectedRoyalty   = Math.round(estimatedCA * form.royalty_rate)   / 100
  const projectedMarketing = Math.round(estimatedCA * form.marketing_rate) / 100

  async function handleSubmit() {
    setSubmitting(true); setError(null)
    try {
      const res = await fetch('/api/franchise/establishments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (!res.ok) {
        const d = await res.json()
        throw new Error(typeof d.error === 'string' ? d.error : 'Erreur lors de l\'onboarding')
      }
      router.push('/dashboard/franchise/franchises')
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setSubmitting(false)
    }
  }

  const canSubmit = form.company_name && form.shop_name && form.manager_email &&
                    form.manager_first_name && form.start_date

  return (
    <div
      className="rounded-xl p-6"
      style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
    >
      <div className="flex flex-col gap-4">
        <div>
          <label style={labelStyle}>Nom de la société franchisée *</label>
          <input style={inputStyle} value={form.company_name} onChange={set('company_name')} placeholder="Dupont SAS" />
        </div>
        <div>
          <label style={labelStyle}>Nom de la boutique *</label>
          <input style={inputStyle} value={form.shop_name} onChange={set('shop_name')} placeholder="Allocookie Paris 11e" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label style={labelStyle}>Prénom du gérant *</label>
            <input style={inputStyle} value={form.manager_first_name} onChange={set('manager_first_name')} placeholder="Jean" />
          </div>
          <div>
            <label style={labelStyle}>Email du gérant *</label>
            <input type="email" style={inputStyle} value={form.manager_email} onChange={set('manager_email')} placeholder="jean@dupont.fr" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label style={labelStyle}>Royalties (% CA HT) *</label>
            <input
              type="number" min={0} max={50} step={0.5}
              style={inputStyle}
              value={form.royalty_rate}
              onChange={set('royalty_rate')}
            />
          </div>
          <div>
            <label style={labelStyle}>Fonds marketing (% CA HT) *</label>
            <input
              type="number" min={0} max={20} step={0.5}
              style={inputStyle}
              value={form.marketing_rate}
              onChange={set('marketing_rate')}
            />
          </div>
        </div>

        <div>
          <label style={labelStyle}>Date de démarrage *</label>
          <input type="date" style={inputStyle} value={form.start_date} onChange={set('start_date')} />
        </div>

        {/* Projection automatique */}
        <div
          className="rounded-lg p-3 text-sm"
          style={{ background: '#0f1f10', border: '1px solid #1a3a1a' }}
        >
          <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: '#4a7a4a' }}>
            Projection sur CA estimé de {new Intl.NumberFormat('fr-FR').format(estimatedCA)} €/mois
          </p>
          <div className="flex gap-6">
            <div>
              <p className="text-xs text-[var(--text4)]">Royalties</p>
              <p className="font-semibold" style={{ color: '#4ade80' }}>
                {new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(projectedRoyalty)}
              </p>
            </div>
            <div>
              <p className="text-xs text-[var(--text4)]">Marketing</p>
              <p className="font-semibold" style={{ color: '#4ade80' }}>
                {new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(projectedMarketing)}
              </p>
            </div>
            <div className="pl-4" style={{ borderLeft: '1px solid #1a3a1a' }}>
              <p className="text-xs font-semibold" style={{ color: '#93c5fd' }}>TOTAL</p>
              <p className="font-bold" style={{ color: '#60a5fa' }}>
                {new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(projectedRoyalty + projectedMarketing)}
              </p>
            </div>
          </div>
        </div>

        {error && <p className="text-sm" style={{ color: 'var(--red)' }}>{error}</p>}

        <div className="flex gap-3 mt-2">
          <button
            type="button"
            onClick={() => router.push('/dashboard/franchise/franchises')}
            className="flex-1 py-2 rounded-lg text-sm"
            style={{ background: 'var(--surface2)', color: 'var(--text2)', border: '1px solid var(--border)' }}
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || !canSubmit}
            className="flex-1 py-2 rounded-lg text-sm font-medium text-white transition-opacity"
            style={{ background: 'var(--blue)', opacity: (submitting || !canSubmit) ? 0.5 : 1 }}
          >
            {submitting ? 'Onboarding en cours…' : '✉ Créer & inviter'}
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: TypeScript check**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add src/app/dashboard/franchise/franchises/nouveau/
git commit -m "feat(franchise): add franchisee onboarding form page"
```

---

## Task 11: Fiche Franchisé Page

**Files:**
- Create: `src/app/dashboard/franchise/franchises/[establishmentId]/page.tsx`
- Create: `src/app/dashboard/franchise/franchises/[establishmentId]/_components/fiche-client.tsx`

- [ ] **Step 1: Create the server page**

`src/app/dashboard/franchise/franchises/[establishmentId]/page.tsx`:
```typescript
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { FicheClient } from './_components/fiche-client'

export default async function FicheFranchisePage({
  params,
}: {
  params: Promise<{ establishmentId: string }>
}) {
  const { establishmentId } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!profile || profile.role !== 'franchise_admin') redirect('/dashboard')

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const cookieHeader = (await import('next/headers')).cookies()
  const cookieStr = (await cookieHeader).toString()

  const res = await fetch(`${baseUrl}/api/franchise/contracts/${establishmentId}`, {
    headers: { Cookie: cookieStr },
    cache: 'no-store',
  })

  if (!res.ok) redirect('/dashboard/franchise/franchises')

  const { contract } = await res.json()

  return <FicheClient establishmentId={establishmentId} initialContract={contract} />
}
```

- [ ] **Step 2: Create the fiche client component**

`src/app/dashboard/franchise/franchises/[establishmentId]/_components/fiche-client.tsx`:
```typescript
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Contract {
  royalty_rate:   number
  marketing_rate: number
  start_date:     string
}

interface Props {
  establishmentId: string
  initialContract: Contract
}

const inputStyle = {
  background: 'var(--surface2)',
  border: '1px solid var(--border)',
  color: 'var(--text1)',
  borderRadius: '8px',
  padding: '8px 12px',
  fontSize: '18px',
  fontWeight: 700,
  width: '80px',
  outline: 'none',
  textAlign: 'center' as const,
} as React.CSSProperties

const labelStyle = {
  display: 'block',
  fontSize: '10px',
  fontWeight: 600,
  color: 'var(--text4)',
  textTransform: 'uppercase' as const,
  letterSpacing: '0.07em',
  marginBottom: '5px',
}

export function FicheClient({ establishmentId, initialContract }: Props) {
  const router = useRouter()
  const [contract, setContract] = useState(initialContract)
  const [saving,   setSaving]   = useState(false)
  const [saved,    setSaved]    = useState(false)
  const [error,    setError]    = useState<string | null>(null)

  async function handleSave() {
    setSaving(true); setError(null); setSaved(false)
    try {
      const res = await fetch(`/api/franchise/contracts/${establishmentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          royalty_rate:   contract.royalty_rate,
          marketing_rate: contract.marketing_rate,
          start_date:     contract.start_date,
        }),
      })
      if (!res.ok) {
        const d = await res.json()
        throw new Error(typeof d.error === 'string' ? d.error : 'Erreur')
      }
      const { contract: updated } = await res.json()
      setContract(updated)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setSaving(false)
    }
  }

  // Live projection (use actual contract CA month if available — here showing with 15k estimate)
  const estimatedCA = 15000
  const projRoyalty   = Math.round(estimatedCA * contract.royalty_rate)   / 100
  const projMarketing = Math.round(estimatedCA * contract.marketing_rate) / 100
  const fmt = (n: number) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)

  return (
    <div className="max-w-lg">
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => router.push('/dashboard/franchise/franchises')}
          className="text-sm text-[var(--text4)] hover:text-[var(--text2)] transition-colors"
        >
          ← Retour
        </button>
        <h1 className="text-xl font-semibold text-[var(--text1)]">Contrat franchisé</h1>
      </div>

      <div
        className="rounded-xl p-6"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
      >
        <div className="flex flex-col gap-5">
          {/* Rates */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label style={labelStyle}>Redevance royalties</label>
              <div className="flex items-center gap-2">
                <input
                  type="number" min={0} max={50} step={0.5}
                  style={inputStyle}
                  value={contract.royalty_rate}
                  onChange={e => setContract(prev => ({ ...prev, royalty_rate: parseFloat(e.target.value) || 0 }))}
                />
                <span className="text-sm text-[var(--text3)]">% du CA HT</span>
              </div>
            </div>
            <div>
              <label style={labelStyle}>Fonds marketing</label>
              <div className="flex items-center gap-2">
                <input
                  type="number" min={0} max={20} step={0.5}
                  style={inputStyle}
                  value={contract.marketing_rate}
                  onChange={e => setContract(prev => ({ ...prev, marketing_rate: parseFloat(e.target.value) || 0 }))}
                />
                <span className="text-sm text-[var(--text3)]">% du CA HT</span>
              </div>
            </div>
          </div>

          {/* Start date */}
          <div>
            <label style={labelStyle}>Date de démarrage</label>
            <input
              type="date"
              style={{ ...inputStyle, width: 'auto', fontSize: '14px', fontWeight: 400, textAlign: 'left' as const }}
              value={contract.start_date}
              onChange={e => setContract(prev => ({ ...prev, start_date: e.target.value }))}
            />
          </div>

          {/* Projection */}
          <div
            className="rounded-lg p-3"
            style={{ background: '#0f1f10', border: '1px solid #1a3a1a' }}
          >
            <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: '#4a7a4a' }}>
              Projection mois en cours (CA estimé {fmt(estimatedCA)})
            </p>
            <div className="flex gap-6 items-end">
              <div>
                <p className="text-xs text-[var(--text4)]">Royalties</p>
                <p className="text-sm font-bold" style={{ color: '#4ade80' }}>{fmt(projRoyalty)}</p>
              </div>
              <div>
                <p className="text-xs text-[var(--text4)]">Marketing</p>
                <p className="text-sm font-bold" style={{ color: '#4ade80' }}>{fmt(projMarketing)}</p>
              </div>
              <div className="pl-4" style={{ borderLeft: '1px solid #1a3a1a' }}>
                <p className="text-xs font-semibold" style={{ color: '#93c5fd' }}>TOTAL →</p>
                <p className="text-base font-bold" style={{ color: '#60a5fa' }}>{fmt(projRoyalty + projMarketing)}</p>
              </div>
            </div>
          </div>

          {error && <p className="text-sm" style={{ color: 'var(--red)' }}>{error}</p>}

          <div className="flex justify-end">
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-5 py-2 rounded-lg text-sm font-medium text-white transition-all"
              style={{
                background: saved ? 'var(--green)' : 'var(--blue)',
                opacity: saving ? 0.6 : 1,
              }}
            >
              {saving ? 'Enregistrement…' : saved ? '✓ Enregistré' : 'Enregistrer'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: 0 new errors.

- [ ] **Step 4: Final smoke test**

Start dev server and verify:
```bash
npm run dev
```

- Navigate to `/login`, sign in as `franchise_admin` user
- Verify redirect to `/dashboard/franchise/command-center`
- Verify Command Center renders with network stats
- Navigate to `/dashboard/franchise/franchises`
- Verify franchisees list renders
- Click "Onboarder un franchisé" — verify form renders with projection
- Submit form with test data — verify API returns 201
- Navigate back to list — verify new franchisee appears
- Click "Voir →" on a franchisee — verify contract fiche renders
- Update royalty rate, save — verify PATCH 200

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/franchise/franchises/[establishmentId]/
git commit -m "feat(franchise): add fiche franchisé page with contract editing"
```

---

## Final Step: Build Verification

- [ ] **Verify production build**

```bash
npm run build
```

Expected: Build completes without errors. TypeScript errors cause build failure.

- [ ] **Push to production**

```bash
git push origin main
```

Vercel will deploy automatically. Verify at https://alloflow.vercel.app that the deploy succeeds.
