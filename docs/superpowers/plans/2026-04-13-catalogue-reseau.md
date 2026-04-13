# Catalogue Réseau Partagé — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permettre au siège franchise de créer un catalogue réseau (produits, recettes, SOPs) propagé automatiquement à tous les franchisés, avec éléments obligatoires/optionnels, notifications de mises à jour et compliance score.

**Architecture:** Nouvelles tables `network_catalog_items` / `network_catalog_item_data` / `establishment_catalog_items` / `sop_completions`. Routes API siège sous `/api/franchise/catalogue/` et routes franchisé sous `/api/catalogue-reseau/`. Pages UI : `/dashboard/franchise/catalogue` (siège) et `/dashboard/catalogue-reseau` (franchisé). Propagation en logique applicative dans les routes publish/archive, pas de triggers Postgres.

**Tech Stack:** Next.js 16 App Router, TypeScript strict, Supabase (service role pour opérations cross-tenant), Zod v4, Tailwind + CSS vars, sonner toasts.

---

## File Map

**New files:**
- `supabase/migrations/20260413000001_catalogue_reseau.sql`
- `src/lib/validations/catalogue.ts`
- `src/lib/__tests__/catalogue-helpers.test.ts`
- `src/lib/catalogue-helpers.ts`
- `src/app/api/franchise/catalogue/route.ts`
- `src/app/api/franchise/catalogue/[id]/route.ts`
- `src/app/api/franchise/catalogue/[id]/publish/route.ts`
- `src/app/api/franchise/catalogue/[id]/archive/route.ts`
- `src/app/api/catalogue-reseau/route.ts`
- `src/app/api/catalogue-reseau/[id]/route.ts`
- `src/app/api/catalogue-reseau/[id]/seen/route.ts`
- `src/app/dashboard/franchise/catalogue/page.tsx`
- `src/app/dashboard/franchise/catalogue/_components/catalogue-page-client.tsx`
- `src/app/dashboard/franchise/catalogue/_components/catalogue-item-form.tsx`
- `src/app/dashboard/catalogue-reseau/page.tsx`
- `src/app/dashboard/catalogue-reseau/_components/catalogue-reseau-page-client.tsx`
- `src/app/dashboard/catalogue-reseau/_components/catalogue-notification-banner.tsx`

**Modified files:**
- `src/app/dashboard/franchise/_components/franchise-sidebar.tsx` — ajouter lien `📦 Catalogue réseau`
- `src/app/api/franchise/establishments/route.ts` — POST : ajouter seeding catalogue après création établissement
- `src/app/api/franchise/network-stats/route.ts` — ajouter compliance score par établissement
- `src/app/dashboard/franchise/command-center/_components/command-center-client.tsx` — ajouter colonne Conformité
- `src/app/dashboard/layout.tsx` — ajouter `<CatalogueNotificationBanner>` pour rôle admin

---

## Task 1: Migration DB

**Files:**
- Create: `supabase/migrations/20260413000001_catalogue_reseau.sql`

- [ ] **Step 1: Écrire la migration**

```sql
-- supabase/migrations/20260413000001_catalogue_reseau.sql

-- Table des items maîtres du catalogue réseau
CREATE TABLE public.network_catalog_items (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  type         text NOT NULL CHECK (type IN ('product', 'recipe', 'sop')),
  name         text NOT NULL,
  description  text,
  is_mandatory boolean NOT NULL DEFAULT false,
  is_seasonal  boolean NOT NULL DEFAULT false,
  expires_at   date,
  status       text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  version      integer NOT NULL DEFAULT 1,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- Payload JSONB + snapshot pour diff visuel
CREATE TABLE public.network_catalog_item_data (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  catalog_item_id  uuid NOT NULL REFERENCES public.network_catalog_items(id) ON DELETE RESTRICT,
  payload          jsonb NOT NULL DEFAULT '{}',
  previous_payload jsonb,
  UNIQUE (catalog_item_id)
);

-- Liaison franchisé ↔ catalogue
CREATE TABLE public.establishment_catalog_items (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id      uuid NOT NULL REFERENCES public.establishments(id) ON DELETE CASCADE,
  catalog_item_id       uuid NOT NULL REFERENCES public.network_catalog_items(id) ON DELETE RESTRICT,
  local_price           numeric(10,2),
  local_stock_threshold integer,
  is_active             boolean NOT NULL DEFAULT true,
  current_version       integer NOT NULL DEFAULT 1,
  notified_at           timestamptz,
  seen_at               timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (establishment_id, catalog_item_id)
);

-- Tracking SOPs caissiers
CREATE TABLE public.sop_completions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id uuid NOT NULL REFERENCES public.establishments(id) ON DELETE CASCADE,
  catalog_item_id  uuid NOT NULL REFERENCES public.network_catalog_items(id) ON DELETE CASCADE,
  user_id          uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  completed_at     timestamptz NOT NULL DEFAULT now()
);

-- Index pour les requêtes fréquentes
CREATE INDEX ON public.establishment_catalog_items(establishment_id);
CREATE INDEX ON public.establishment_catalog_items(catalog_item_id);
CREATE INDEX ON public.network_catalog_items(org_id, status);

-- RLS
ALTER TABLE public.network_catalog_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.network_catalog_item_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.establishment_catalog_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sop_completions ENABLE ROW LEVEL SECURITY;

-- franchise_admin : accès complet à son org
CREATE POLICY "franchise_admin_catalog" ON public.network_catalog_items
  FOR ALL USING (
    org_id = (SELECT org_id FROM public.profiles WHERE id = auth.uid())
    AND (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'franchise_admin'
  );

-- admin franchisé : lecture seule sur les items publiés de son réseau
CREATE POLICY "admin_read_catalog" ON public.network_catalog_items
  FOR SELECT USING (
    status = 'published'
    AND org_id IN (
      SELECT o.id FROM public.organizations o
      JOIN public.establishments e ON e.org_id = o.id
      JOIN public.profiles p ON p.establishment_id = e.id
      WHERE p.id = auth.uid()
    )
  );

-- network_catalog_item_data : suit les mêmes droits que l'item parent
CREATE POLICY "catalog_data_franchise_admin" ON public.network_catalog_item_data
  FOR ALL USING (
    catalog_item_id IN (
      SELECT id FROM public.network_catalog_items
      WHERE org_id = (SELECT org_id FROM public.profiles WHERE id = auth.uid())
      AND (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'franchise_admin'
    )
  );

CREATE POLICY "catalog_data_admin_read" ON public.network_catalog_item_data
  FOR SELECT USING (
    catalog_item_id IN (
      SELECT id FROM public.network_catalog_items WHERE status = 'published'
    )
  );

-- establishment_catalog_items : chaque établissement accède uniquement aux siennes
CREATE POLICY "establishment_catalog_items_rls" ON public.establishment_catalog_items
  FOR ALL USING (
    establishment_id = (SELECT establishment_id FROM public.profiles WHERE id = auth.uid())
  );

-- franchise_admin peut tout lire (pour compliance score)
CREATE POLICY "franchise_admin_read_eci" ON public.establishment_catalog_items
  FOR SELECT USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'franchise_admin'
  );

-- sop_completions : établissement courant
CREATE POLICY "sop_completions_rls" ON public.sop_completions
  FOR ALL USING (
    establishment_id = (SELECT establishment_id FROM public.profiles WHERE id = auth.uid())
  );
```

- [ ] **Step 2: Appliquer la migration**

```bash
cd /Users/anthony/Super\ pouvoir/Alloflow
npx supabase db push
```
Expected: migration applied successfully, no errors.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260413000001_catalogue_reseau.sql
git commit -m "feat: add catalogue reseau DB migration (network_catalog_items, establishment_catalog_items, sop_completions)"
```

---

## Task 2: Helpers & Validations TypeScript

**Files:**
- Create: `src/lib/validations/catalogue.ts`
- Create: `src/lib/catalogue-helpers.ts`
- Create: `src/lib/__tests__/catalogue-helpers.test.ts`

- [ ] **Step 1: Écrire les tests en premier**

```typescript
// src/lib/__tests__/catalogue-helpers.test.ts
import { describe, it, expect } from 'vitest'
import { computeComplianceScore, hasUnseenNotifications, isItemExpired } from '../catalogue-helpers'

describe('computeComplianceScore', () => {
  it('returns 100 when all mandatory items are active', () => {
    expect(computeComplianceScore(3, 3)).toBe(100)
  })
  it('returns 0 when no mandatory items are active', () => {
    expect(computeComplianceScore(0, 3)).toBe(0)
  })
  it('returns 0 when no mandatory items exist', () => {
    expect(computeComplianceScore(0, 0)).toBe(0)
  })
  it('returns 67 for 2 out of 3', () => {
    expect(computeComplianceScore(2, 3)).toBe(67)
  })
})

describe('hasUnseenNotifications', () => {
  it('returns true when seen_at is null and notified_at is set', () => {
    expect(hasUnseenNotifications(new Date().toISOString(), null)).toBe(true)
  })
  it('returns true when seen_at is before notified_at', () => {
    const earlier = new Date(Date.now() - 10000).toISOString()
    const later   = new Date().toISOString()
    expect(hasUnseenNotifications(later, earlier)).toBe(true)
  })
  it('returns false when seen_at is after notified_at', () => {
    const earlier = new Date(Date.now() - 10000).toISOString()
    const later   = new Date().toISOString()
    expect(hasUnseenNotifications(earlier, later)).toBe(false)
  })
  it('returns false when notified_at is null', () => {
    expect(hasUnseenNotifications(null, null)).toBe(false)
  })
})

describe('isItemExpired', () => {
  it('returns true for past date', () => {
    expect(isItemExpired('2020-01-01')).toBe(true)
  })
  it('returns false for future date', () => {
    expect(isItemExpired('2099-01-01')).toBe(false)
  })
  it('returns false when expires_at is null', () => {
    expect(isItemExpired(null)).toBe(false)
  })
})
```

- [ ] **Step 2: Vérifier que les tests échouent**

```bash
cd /Users/anthony/Super\ pouvoir/Alloflow
npx vitest run src/lib/__tests__/catalogue-helpers.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implémenter les helpers**

```typescript
// src/lib/catalogue-helpers.ts

/** score = actifs / total mandatory. Returns 0 if no mandatory items. */
export function computeComplianceScore(activeCount: number, totalMandatory: number): number {
  if (totalMandatory === 0) return 0
  return Math.round((activeCount / totalMandatory) * 100)
}

/** true if notified_at is set and (seen_at is null OR seen_at < notified_at) */
export function hasUnseenNotifications(
  notifiedAt: string | null,
  seenAt: string | null
): boolean {
  if (!notifiedAt) return false
  if (!seenAt) return true
  return new Date(seenAt) < new Date(notifiedAt)
}

/** true if expires_at is a past date */
export function isItemExpired(expiresAt: string | null): boolean {
  if (!expiresAt) return false
  return new Date(expiresAt) < new Date()
}
```

- [ ] **Step 4: Écrire les validations Zod**

```typescript
// src/lib/validations/catalogue.ts
import { z } from 'zod'

export const createCatalogueItemSchema = z.object({
  type:         z.enum(['product', 'recipe', 'sop']),
  name:         z.string().min(1).max(100),
  description:  z.string().max(500).optional(),
  is_mandatory: z.boolean().default(false),
  is_seasonal:  z.boolean().default(false),
  expires_at:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  payload:      z.record(z.unknown()).default({}),
})

export const updateCatalogueItemSchema = createCatalogueItemSchema.partial()

export const updateEstablishmentCatalogItemSchema = z.object({
  local_price:           z.number().positive().nullable().optional(),
  local_stock_threshold: z.number().int().min(0).nullable().optional(),
  is_active:             z.boolean().optional(),
})

export type CreateCatalogueItemInput = z.infer<typeof createCatalogueItemSchema>
export type UpdateCatalogueItemInput = z.infer<typeof updateCatalogueItemSchema>
export type UpdateEstablishmentCatalogItemInput = z.infer<typeof updateEstablishmentCatalogItemSchema>
```

- [ ] **Step 5: Vérifier que les tests passent**

```bash
npx vitest run src/lib/__tests__/catalogue-helpers.test.ts
```
Expected: PASS (3 suites, 9 tests).

- [ ] **Step 6: Commit**

```bash
git add src/lib/catalogue-helpers.ts src/lib/__tests__/catalogue-helpers.test.ts src/lib/validations/catalogue.ts
git commit -m "feat: add catalogue helpers and Zod validations"
```

---

## Task 3: API Siège — CRUD Catalogue (GET + POST + PATCH)

**Files:**
- Create: `src/app/api/franchise/catalogue/route.ts`
- Create: `src/app/api/franchise/catalogue/[id]/route.ts`

- [ ] **Step 1: Créer la route GET + POST**

```typescript
// src/app/api/franchise/catalogue/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { createCatalogueItemSchema } from '@/lib/validations/catalogue'

async function getFranchiseAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase
    .from('profiles').select('role, org_id').eq('id', user.id).single()
  if (!profile || profile.role !== 'franchise_admin' || !profile.org_id) return null
  return { userId: user.id, orgId: profile.org_id }
}

function adminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function GET() {
  const caller = await getFranchiseAdmin()
  if (!caller) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const supabase = adminClient()
  const { data: items, error } = await supabase
    .from('network_catalog_items')
    .select('*, network_catalog_item_data(payload, previous_payload)')
    .eq('org_id', caller.orgId)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ items: items ?? [] })
}

export async function POST(req: NextRequest) {
  const caller = await getFranchiseAdmin()
  if (!caller) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = createCatalogueItemSchema.safeParse(await req.json())
  if (!body.success) return NextResponse.json({ error: body.error.flatten() }, { status: 422 })

  const { payload, ...itemFields } = body.data
  const supabase = adminClient()

  const { data: item, error: itemErr } = await supabase
    .from('network_catalog_items')
    .insert({ ...itemFields, org_id: caller.orgId })
    .select().single()

  if (itemErr || !item) return NextResponse.json({ error: itemErr?.message ?? 'Erreur' }, { status: 500 })

  await supabase.from('network_catalog_item_data').insert({ catalog_item_id: item.id, payload })

  return NextResponse.json({ item }, { status: 201 })
}
```

- [ ] **Step 2: Créer la route PATCH**

```typescript
// src/app/api/franchise/catalogue/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { updateCatalogueItemSchema } from '@/lib/validations/catalogue'

async function getFranchiseAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase
    .from('profiles').select('role, org_id').eq('id', user.id).single()
  if (!profile || profile.role !== 'franchise_admin' || !profile.org_id) return null
  return { userId: user.id, orgId: profile.org_id }
}

function adminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const caller = await getFranchiseAdmin()
  if (!caller) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const body = updateCatalogueItemSchema.safeParse(await req.json())
  if (!body.success) return NextResponse.json({ error: body.error.flatten() }, { status: 422 })

  const { payload, ...itemFields } = body.data
  const supabase = adminClient()

  // Verify ownership
  const { data: existing } = await supabase
    .from('network_catalog_items').select('id, org_id, version, is_mandatory, status').eq('id', id).single()
  if (!existing || existing.org_id !== caller.orgId)
    return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const wasMandatory = existing.is_mandatory
  const becomesMandatory = itemFields.is_mandatory ?? wasMandatory
  const isPublished = existing.status === 'published'

  // Update item fields
  const updateData: Record<string, unknown> = { ...itemFields, updated_at: new Date().toISOString() }
  if (payload !== undefined) updateData.version = existing.version + 1

  const { data: updated, error: updateErr } = await supabase
    .from('network_catalog_items').update(updateData).eq('id', id).select().single()
  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

  // Update payload (snapshot previous before overwriting)
  if (payload !== undefined) {
    const { data: existingData } = await supabase
      .from('network_catalog_item_data').select('payload').eq('catalog_item_id', id).single()

    await supabase.from('network_catalog_item_data').upsert({
      catalog_item_id:  id,
      payload,
      previous_payload: existingData?.payload ?? null,
    }, { onConflict: 'catalog_item_id' })

    // Notify franchisees if published
    if (isPublished) {
      await supabase.from('establishment_catalog_items')
        .update({ notified_at: new Date().toISOString() })
        .eq('catalog_item_id', id)
    }
  }

  // optional → mandatory: force is_active = true on all + notify
  if (isPublished && !wasMandatory && becomesMandatory) {
    await supabase.from('establishment_catalog_items')
      .update({ is_active: true, notified_at: new Date().toISOString() })
      .eq('catalog_item_id', id)
  }

  return NextResponse.json({ item: updated })
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/franchise/catalogue/route.ts src/app/api/franchise/catalogue/[id]/route.ts
git commit -m "feat: add catalogue CRUD API routes (GET, POST, PATCH)"
```

---

## Task 4: API Siège — Publish + Archive

**Files:**
- Create: `src/app/api/franchise/catalogue/[id]/publish/route.ts`
- Create: `src/app/api/franchise/catalogue/[id]/archive/route.ts`

- [ ] **Step 1: Route publish (propagation réseau)**

```typescript
// src/app/api/franchise/catalogue/[id]/publish/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

async function getFranchiseAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase
    .from('profiles').select('role, org_id').eq('id', user.id).single()
  if (!profile || profile.role !== 'franchise_admin' || !profile.org_id) return null
  return { userId: user.id, orgId: profile.org_id }
}

function adminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const caller = await getFranchiseAdmin()
  if (!caller) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const supabase = adminClient()

  // Verify ownership + current status
  const { data: item } = await supabase
    .from('network_catalog_items').select('id, org_id, status, version').eq('id', id).single()
  if (!item || item.org_id !== caller.orgId)
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (item.status === 'published')
    return NextResponse.json({ error: 'Déjà publié' }, { status: 409 })
  if (item.status === 'archived')
    return NextResponse.json({ error: 'Item archivé — impossible de republier' }, { status: 409 })

  // Publish
  const { error: pubErr } = await supabase
    .from('network_catalog_items')
    .update({ status: 'published', updated_at: new Date().toISOString() })
    .eq('id', id)
  if (pubErr) return NextResponse.json({ error: pubErr.message }, { status: 500 })

  // Fetch all active establishments in this network (siege + franchisees)
  const { data: networkOrgs } = await supabase
    .from('organizations').select('id')
    .or(`id.eq.${caller.orgId},parent_org_id.eq.${caller.orgId}`)
  const orgIds = (networkOrgs ?? []).map((o: { id: string }) => o.id)

  const { data: establishments } = await supabase
    .from('establishments').select('id').in('org_id', orgIds.length > 0 ? orgIds : ['__none__'])
  const estIds = (establishments ?? []).map((e: { id: string }) => e.id)

  if (estIds.length > 0) {
    const rows = estIds.map((estId: string) => ({
      establishment_id: estId,
      catalog_item_id:  id,
      is_active:        true,
      current_version:  item.version,
    }))
    // upsert — idempotent if establishment already has the item
    await supabase.from('establishment_catalog_items').upsert(rows, { onConflict: 'establishment_id,catalog_item_id' })
  }

  return NextResponse.json({ ok: true, propagated: estIds.length })
}
```

- [ ] **Step 2: Route archive (cascade is_active = false)**

```typescript
// src/app/api/franchise/catalogue/[id]/archive/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

async function getFranchiseAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase
    .from('profiles').select('role, org_id').eq('id', user.id).single()
  if (!profile || profile.role !== 'franchise_admin' || !profile.org_id) return null
  return { userId: user.id, orgId: profile.org_id }
}

function adminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const caller = await getFranchiseAdmin()
  if (!caller) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const supabase = adminClient()

  const { data: item } = await supabase
    .from('network_catalog_items').select('id, org_id, status').eq('id', id).single()
  if (!item || item.org_id !== caller.orgId)
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (item.status === 'archived')
    return NextResponse.json({ error: 'Déjà archivé' }, { status: 409 })

  // Archive item
  await supabase.from('network_catalog_items')
    .update({ status: 'archived', updated_at: new Date().toISOString() })
    .eq('id', id)

  // Cascade: désactiver chez tous les franchisés
  await supabase.from('establishment_catalog_items')
    .update({ is_active: false })
    .eq('catalog_item_id', id)

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/franchise/catalogue/[id]/publish/route.ts src/app/api/franchise/catalogue/[id]/archive/route.ts
git commit -m "feat: add catalogue publish and archive API routes with network propagation"
```

---

## Task 5: API Franchisé — Catalogue Reseau

**Files:**
- Create: `src/app/api/catalogue-reseau/route.ts`
- Create: `src/app/api/catalogue-reseau/[id]/route.ts`
- Create: `src/app/api/catalogue-reseau/[id]/seen/route.ts`

- [ ] **Step 1: Helper auth franchisé (réutilisé dans les 3 routes)**

```typescript
// Pattern dans chaque route — récupère establishment_id du profil admin courant
async function getAdminProfile() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase
    .from('profiles').select('role, establishment_id').eq('id', user.id).single()
  if (!profile || !['admin', 'caissier'].includes(profile.role) || !profile.establishment_id) return null
  return { userId: user.id, establishmentId: profile.establishment_id }
}
```

- [ ] **Step 2: Créer GET /api/catalogue-reseau**

```typescript
// src/app/api/catalogue-reseau/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isItemExpired } from '@/lib/catalogue-helpers'

async function getAdminProfile() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase
    .from('profiles').select('role, establishment_id').eq('id', user.id).single()
  if (!profile || !['admin', 'caissier'].includes(profile.role) || !profile.establishment_id) return null
  return { userId: user.id, establishmentId: profile.establishment_id }
}

export async function GET() {
  const caller = await getAdminProfile()
  if (!caller) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const supabase = await createClient()
  const { data: items, error } = await supabase
    .from('establishment_catalog_items')
    .select(`
      *,
      network_catalog_items (
        id, type, name, description, is_mandatory, is_seasonal, expires_at, status, version,
        network_catalog_item_data (payload, previous_payload)
      )
    `)
    .eq('establishment_id', caller.establishmentId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Check seasonal expiry at read time
  const result = (items ?? []).map((item: Record<string, unknown>) => {
    const catalogItem = item.network_catalog_items as Record<string, unknown> | null
    if (catalogItem && catalogItem.is_seasonal && isItemExpired(catalogItem.expires_at as string | null)) {
      return { ...item, network_catalog_items: { ...catalogItem, status: 'archived' } }
    }
    return item
  })

  return NextResponse.json({ items: result })
}
```

- [ ] **Step 3: Créer PATCH /api/catalogue-reseau/[id]**

```typescript
// src/app/api/catalogue-reseau/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { updateEstablishmentCatalogItemSchema } from '@/lib/validations/catalogue'

async function getAdminProfile() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase
    .from('profiles').select('role, establishment_id').eq('id', user.id).single()
  if (!profile || profile.role !== 'admin' || !profile.establishment_id) return null
  return { userId: user.id, establishmentId: profile.establishment_id }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const caller = await getAdminProfile()
  if (!caller) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const body = updateEstablishmentCatalogItemSchema.safeParse(await req.json())
  if (!body.success) return NextResponse.json({ error: body.error.flatten() }, { status: 422 })

  const supabase = await createClient()

  // Verify the item belongs to this establishment
  const { data: eci } = await supabase
    .from('establishment_catalog_items')
    .select('id, catalog_item_id, network_catalog_items(is_mandatory)')
    .eq('id', id)
    .eq('establishment_id', caller.establishmentId)
    .single()

  if (!eci) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Prevent toggling is_active on mandatory items
  const catalogItem = eci.network_catalog_items as { is_mandatory: boolean } | null
  if (body.data.is_active === false && catalogItem?.is_mandatory) {
    return NextResponse.json({ error: 'Impossible de désactiver un item obligatoire' }, { status: 400 })
  }

  const { data: updated, error } = await supabase
    .from('establishment_catalog_items')
    .update(body.data)
    .eq('id', id)
    .eq('establishment_id', caller.establishmentId)
    .select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ item: updated })
}
```

- [ ] **Step 4: Créer POST /api/catalogue-reseau/[id]/seen**

```typescript
// src/app/api/catalogue-reseau/[id]/seen/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

async function getAdminProfile() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase
    .from('profiles').select('role, establishment_id').eq('id', user.id).single()
  if (!profile || profile.role !== 'admin' || !profile.establishment_id) return null
  return { userId: user.id, establishmentId: profile.establishment_id }
}

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const caller = await getAdminProfile()
  if (!caller) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const supabase = await createClient()

  const { error } = await supabase
    .from('establishment_catalog_items')
    .update({ seen_at: new Date().toISOString() })
    .eq('id', id)
    .eq('establishment_id', caller.establishmentId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 5: Commit**

```bash
git add src/app/api/catalogue-reseau/
git commit -m "feat: add franchisee catalogue API routes (GET, PATCH, POST /seen)"
```

---

## Task 6: UI Siège — Page Catalogue + Sidebar

**Files:**
- Create: `src/app/dashboard/franchise/catalogue/page.tsx`
- Create: `src/app/dashboard/franchise/catalogue/_components/catalogue-page-client.tsx`
- Create: `src/app/dashboard/franchise/catalogue/_components/catalogue-item-form.tsx`
- Modify: `src/app/dashboard/franchise/_components/franchise-sidebar.tsx`

- [ ] **Step 1: Ajouter le lien dans la sidebar**

Dans `src/app/dashboard/franchise/_components/franchise-sidebar.tsx`, ajouter dans le tableau `links` :

```typescript
{ href: '/dashboard/franchise/catalogue', label: '📦 Catalogue réseau' },
```
Ajouter après la ligne `{ href: '/dashboard/franchise/pilotage', ... }`.

- [ ] **Step 2: Créer la page SSR**

```typescript
// src/app/dashboard/franchise/catalogue/page.tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { CataloguePageClient } from './_components/catalogue-page-client'

export default async function CataloguePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const cookieHeader = (await import('next/headers')).cookies()
  const cookieStr = (await cookieHeader).toString()

  let items: unknown[] = []
  try {
    const res = await fetch(`${baseUrl}/api/franchise/catalogue`, {
      headers: { Cookie: cookieStr },
      cache: 'no-store',
    })
    if (res.ok) ({ items } = await res.json())
  } catch { /* use defaults */ }

  return <CataloguePageClient initialItems={items} />
}
```

- [ ] **Step 3: Créer le client shell + formulaire**

```typescript
// src/app/dashboard/franchise/catalogue/_components/catalogue-page-client.tsx
'use client'
import { useState } from 'react'
import { toast } from 'sonner'
import { CatalogueItemForm } from './catalogue-item-form'

type CatalogItem = {
  id: string; type: string; name: string; description?: string
  is_mandatory: boolean; is_seasonal: boolean; expires_at?: string | null
  status: string; version: number
  network_catalog_item_data?: { payload: Record<string, unknown> }
}

export function CataloguePageClient({ initialItems }: { initialItems: unknown[] }) {
  const [items, setItems]       = useState<CatalogItem[]>(initialItems as CatalogItem[])
  const [tab, setTab]           = useState<'product' | 'recipe' | 'sop'>('product')
  const [showForm, setShowForm] = useState(false)
  const [editItem, setEditItem] = useState<CatalogItem | null>(null)

  const filtered = items.filter(i => i.type === tab)

  async function handlePublish(id: string) {
    const res = await fetch(`/api/franchise/catalogue/${id}/publish`, { method: 'POST' })
    if (res.ok) {
      setItems(prev => prev.map(i => i.id === id ? { ...i, status: 'published' } : i))
      toast.success('Item publié et propagé au réseau')
    } else {
      const d = await res.json()
      toast.error(d.error ?? 'Erreur')
    }
  }

  async function handleArchive(id: string) {
    const item = items.find(i => i.id === id)
    if (item?.is_mandatory && !confirm(`Cet item est obligatoire. L'archivage le désactivera chez tous les franchisés. Continuer ?`)) return
    const res = await fetch(`/api/franchise/catalogue/${id}/archive`, { method: 'POST' })
    if (res.ok) {
      setItems(prev => prev.map(i => i.id === id ? { ...i, status: 'archived' } : i))
      toast.success('Item archivé')
    } else {
      toast.error('Erreur lors de l\'archivage')
    }
  }

  function onSaved(item: CatalogItem) {
    setItems(prev => {
      const exists = prev.find(i => i.id === item.id)
      return exists ? prev.map(i => i.id === item.id ? item : i) : [item, ...prev]
    })
    setShowForm(false); setEditItem(null)
  }

  const tabStyle = (active: boolean) => ({
    padding: '6px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 500, cursor: 'pointer',
    background: active ? 'var(--surface2)' : 'transparent',
    color: active ? 'var(--text1)' : 'var(--text3)',
    border: 'none',
  } as React.CSSProperties)

  const statusBadge = (status: string) => {
    const map: Record<string, { bg: string; color: string; label: string }> = {
      draft:     { bg: '#1a1a2e', color: '#94a3b8', label: 'DRAFT' },
      published: { bg: '#0f2010', color: '#4ade80', label: 'PUBLIÉ' },
      archived:  { bg: '#1a1010', color: '#f87171', label: 'ARCHIVÉ' },
    }
    const s = map[status] ?? map.draft
    return (
      <span style={{ background: s.bg, color: s.color, padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 600 }}>
        {s.label}
      </span>
    )
  }

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-[var(--text1)]">Catalogue réseau</h1>
          <p className="text-sm text-[var(--text4)] mt-0.5">Gérez les produits, recettes et SOPs partagés avec vos franchisés</p>
        </div>
        <button
          onClick={() => { setEditItem(null); setShowForm(true) }}
          className="px-4 py-2 rounded-lg text-sm font-medium text-white"
          style={{ background: 'var(--blue)' }}
        >
          + Nouvel item
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 p-1 rounded-lg" style={{ background: 'var(--surface)' }}>
        {(['product', 'recipe', 'sop'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={tabStyle(tab === t)}>
            {t === 'product' ? '🛍 Produits' : t === 'recipe' ? '📋 Recettes' : '📖 SOPs'}
          </button>
        ))}
      </div>

      {/* List */}
      <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
        {filtered.length === 0 && (
          <div className="px-4 py-8 text-center text-sm text-[var(--text4)]">
            Aucun item dans cette catégorie
          </div>
        )}
        {filtered.map((item, i) => (
          <div
            key={item.id}
            className="flex items-center justify-between px-4 py-3 gap-4"
            style={{ background: 'var(--surface)', borderTop: i > 0 ? '1px solid var(--border)' : undefined }}
          >
            <div className="flex items-center gap-3 min-w-0">
              <div>
                <p className="text-sm font-medium text-[var(--text1)]">{item.name}</p>
                {item.description && <p className="text-xs text-[var(--text4)] truncate">{item.description}</p>}
              </div>
              {statusBadge(item.status)}
              {item.is_mandatory && (
                <span style={{ background: '#1a1530', color: '#a78bfa', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 600 }}>OBLIGATOIRE</span>
              )}
              {item.is_seasonal && (
                <span style={{ background: '#1a1200', color: '#fbbf24', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 600 }}>
                  SAISONNIER{item.expires_at ? ` · ${new Date(item.expires_at).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })}` : ''}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button onClick={() => { setEditItem(item); setShowForm(true) }}
                className="text-xs px-3 py-1.5 rounded-lg"
                style={{ background: 'var(--surface2)', color: 'var(--text3)', border: '1px solid var(--border)' }}>
                Éditer
              </button>
              {item.status === 'draft' && (
                <button onClick={() => handlePublish(item.id)}
                  className="text-xs px-3 py-1.5 rounded-lg font-medium text-white"
                  style={{ background: 'var(--blue)' }}>
                  Publier
                </button>
              )}
              {item.status !== 'archived' && (
                <button onClick={() => handleArchive(item.id)}
                  className="text-xs px-3 py-1.5 rounded-lg"
                  style={{ background: '#1a1010', color: '#f87171', border: '1px solid #3a1010' }}>
                  Archiver
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Form overlay */}
      {showForm && (
        <CatalogueItemForm
          item={editItem}
          defaultType={tab}
          onClose={() => { setShowForm(false); setEditItem(null) }}
          onSaved={onSaved}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 4: Créer le formulaire slide-in**

```typescript
// src/app/dashboard/franchise/catalogue/_components/catalogue-item-form.tsx
'use client'
import { useState } from 'react'
import { toast } from 'sonner'

type CatalogItem = {
  id: string; type: string; name: string; description?: string
  is_mandatory: boolean; is_seasonal: boolean; expires_at?: string | null
  status: string; version: number
  network_catalog_item_data?: { payload: Record<string, unknown> }
}

const inputStyle: React.CSSProperties = {
  background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text1)',
  borderRadius: '8px', padding: '8px 12px', fontSize: '14px', width: '100%', outline: 'none',
}
const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text4)',
  textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '6px',
}

export function CatalogueItemForm({
  item, defaultType, onClose, onSaved,
}: {
  item: CatalogItem | null
  defaultType: 'product' | 'recipe' | 'sop'
  onClose: () => void
  onSaved: (item: CatalogItem) => void
}) {
  const [form, setForm] = useState({
    type:         item?.type ?? defaultType,
    name:         item?.name ?? '',
    description:  item?.description ?? '',
    is_mandatory: item?.is_mandatory ?? false,
    is_seasonal:  item?.is_seasonal ?? false,
    expires_at:   item?.expires_at ?? '',
    payload:      item?.network_catalog_item_data?.payload ?? {},
  })
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    setSaving(true)
    try {
      const url    = item ? `/api/franchise/catalogue/${item.id}` : '/api/franchise/catalogue'
      const method = item ? 'PATCH' : 'POST'
      const res    = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, expires_at: form.expires_at || null }),
      })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error?.message ?? d.error ?? 'Erreur') }
      const data = await res.json()
      onSaved(data.item)
      toast.success(item ? 'Item mis à jour' : 'Item créé')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'var(--overlay-bg)' }}>
      <div className="w-full max-w-lg rounded-xl p-6" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-[var(--text1)]">{item ? 'Modifier l\'item' : 'Nouvel item catalogue'}</h2>
          <button onClick={onClose} style={{ color: 'var(--text3)', background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer' }}>✕</button>
        </div>
        <div className="flex flex-col gap-4">
          <div>
            <label style={labelStyle}>Type</label>
            <select style={inputStyle} value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value }))} disabled={!!item}>
              <option value="product">Produit</option>
              <option value="recipe">Recette</option>
              <option value="sop">SOP / Guide</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>Nom *</label>
            <input style={inputStyle} value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Ex: Cookie Chocolat" />
          </div>
          <div>
            <label style={labelStyle}>Description</label>
            <textarea style={{ ...inputStyle, height: '72px', resize: 'none' }} value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} />
          </div>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.is_mandatory} onChange={e => setForm(p => ({ ...p, is_mandatory: e.target.checked }))} />
              <span className="text-sm text-[var(--text2)]">Obligatoire</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.is_seasonal} onChange={e => setForm(p => ({ ...p, is_seasonal: e.target.checked }))} />
              <span className="text-sm text-[var(--text2)]">Saisonnier</span>
            </label>
          </div>
          {form.is_seasonal && (
            <div>
              <label style={labelStyle}>Date d'expiration</label>
              <input type="date" style={inputStyle} value={form.expires_at ?? ''} onChange={e => setForm(p => ({ ...p, expires_at: e.target.value }))} />
            </div>
          )}
        </div>
        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="flex-1 py-2 rounded-lg text-sm" style={{ background: 'var(--surface2)', color: 'var(--text2)', border: '1px solid var(--border)' }}>Annuler</button>
          <button onClick={handleSave} disabled={saving || !form.name} className="flex-1 py-2 rounded-lg text-sm font-medium text-white" style={{ background: 'var(--blue)', opacity: (saving || !form.name) ? 0.5 : 1 }}>
            {saving ? 'Enregistrement…' : item ? 'Mettre à jour' : 'Créer'}
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/franchise/catalogue/ src/app/dashboard/franchise/_components/franchise-sidebar.tsx
git commit -m "feat: add catalogue reseau UI for franchise_admin (page + form + sidebar link)"
```

---

## Task 7: UI Franchisé — Page Catalogue Réseau + Notification Banner

**Files:**
- Create: `src/app/dashboard/catalogue-reseau/page.tsx`
- Create: `src/app/dashboard/catalogue-reseau/_components/catalogue-reseau-page-client.tsx`
- Create: `src/app/dashboard/catalogue-reseau/_components/catalogue-notification-banner.tsx`
- Modify: `src/app/dashboard/layout.tsx`

- [ ] **Step 1: Créer le bandeau de notification (server component)**

```typescript
// src/app/dashboard/catalogue-reseau/_components/catalogue-notification-banner.tsx
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'

export async function CatalogueNotificationBanner({ establishmentId }: { establishmentId: string }) {
  const supabase = await createClient()

  // Cross-column comparison (seen_at < notified_at) requires RPC — use a Postgres function
  // Alternatively, fetch the rows and filter in JS (safe for small counts per establishment)
  const { data: notifiedItems } = await supabase
    .from('establishment_catalog_items')
    .select('notified_at, seen_at')
    .eq('establishment_id', establishmentId)
    .not('notified_at', 'is', null)

  const updatedCount = (notifiedItems ?? []).filter(
    (i: { notified_at: string | null; seen_at: string | null }) =>
      !i.seen_at || new Date(i.seen_at) < new Date(i.notified_at!)
  ).length

  const { data: newOptionalItems } = await supabase
    .from('establishment_catalog_items')
    .select('seen_at, network_catalog_items!inner(is_mandatory)')
    .eq('establishment_id', establishmentId)
    .eq('network_catalog_items.is_mandatory', false)
    .is('seen_at', null)
  const newOptionalCount = (newOptionalItems ?? []).length

  const total = (updatedCount ?? 0) + (newOptionalCount ?? 0)
  if (total === 0) return null

  const parts: string[] = []
  if (updatedCount && updatedCount > 0) parts.push(`${updatedCount} élément${updatedCount > 1 ? 's' : ''} mis à jour par le siège`)
  if (newOptionalCount && newOptionalCount > 0) parts.push(`${newOptionalCount} nouveau${newOptionalCount > 1 ? 'x' : ''} produit${newOptionalCount > 1 ? 's' : ''} optionnel${newOptionalCount > 1 ? 's' : ''} disponible${newOptionalCount > 1 ? 's' : ''}`)

  return (
    <Link
      href="/dashboard/catalogue-reseau"
      className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg mx-6 mt-4"
      style={{ background: '#0f1f35', border: '1px solid #1e3a5f', color: '#60a5fa' }}
    >
      <span>📦</span>
      <span>{parts.join(' · ')}</span>
      <span className="ml-auto text-xs opacity-60">Voir →</span>
    </Link>
  )
}
```

- [ ] **Step 2: Injecter le bandeau dans le layout dashboard (admin uniquement)**

Dans `src/app/dashboard/layout.tsx`, après l'import `ThemeToggle`, ajouter :

```typescript
import { CatalogueNotificationBanner } from './catalogue-reseau/_components/catalogue-notification-banner'
```

Et dans le JSX, après `<main className="p-6">`, modifier pour :

```typescript
<main>
  {profile.role === 'admin' && profile.establishment_id && (
    <CatalogueNotificationBanner establishmentId={profile.establishment_id} />
  )}
  <div className="p-6">{children}</div>
</main>
```

- [ ] **Step 3: Créer la page franchisé (SSR)**

```typescript
// src/app/dashboard/catalogue-reseau/page.tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { CatalogueReseauPageClient } from './_components/catalogue-reseau-page-client'

export default async function CatalogueReseauPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('role, establishment_id').eq('id', user.id).single()
  if (!profile || profile.role !== 'admin') redirect('/dashboard')

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const cookieHeader = (await import('next/headers')).cookies()
  const cookieStr = (await cookieHeader).toString()

  let items: unknown[] = []
  try {
    const res = await fetch(`${baseUrl}/api/catalogue-reseau`, { headers: { Cookie: cookieStr }, cache: 'no-store' })
    if (res.ok) ({ items } = await res.json())
  } catch { /* use defaults */ }

  return <CatalogueReseauPageClient initialItems={items} />
}
```

- [ ] **Step 4: Créer le client shell franchisé**

```typescript
// src/app/dashboard/catalogue-reseau/_components/catalogue-reseau-page-client.tsx
'use client'
import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { hasUnseenNotifications } from '@/lib/catalogue-helpers'

type EstablishmentCatalogItem = {
  id: string; is_active: boolean; local_price: number | null; local_stock_threshold: number | null
  current_version: number; notified_at: string | null; seen_at: string | null
  network_catalog_items: {
    id: string; type: string; name: string; description?: string
    is_mandatory: boolean; is_seasonal: boolean; expires_at?: string | null; status: string; version: number
    network_catalog_item_data?: { payload: Record<string, unknown>; previous_payload: Record<string, unknown> | null }
  }
}

export function CatalogueReseauPageClient({ initialItems }: { initialItems: unknown[] }) {
  const [items, setItems] = useState<EstablishmentCatalogItem[]>(initialItems as EstablishmentCatalogItem[])
  const [tab, setTab]     = useState<'product' | 'recipe' | 'sop'>('product')

  const filtered = items.filter(i => i.network_catalog_items?.type === tab)

  // Mark all as seen on mount
  useEffect(() => {
    const unseen = items.filter(i => hasUnseenNotifications(i.notified_at, i.seen_at))
    unseen.forEach(i => {
      fetch(`/api/catalogue-reseau/${i.id}/seen`, { method: 'POST' }).catch(() => null)
    })
    if (unseen.length > 0) {
      setItems(prev => prev.map(i => ({ ...i, seen_at: new Date().toISOString() })))
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleToggle(id: string, is_active: boolean) {
    const res = await fetch(`/api/catalogue-reseau/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active }),
    })
    if (res.ok) {
      setItems(prev => prev.map(i => i.id === id ? { ...i, is_active } : i))
      toast.success(is_active ? 'Item activé' : 'Item désactivé')
    } else {
      const d = await res.json()
      toast.error(d.error ?? 'Erreur')
    }
  }

  const tabStyle = (active: boolean) => ({
    padding: '6px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 500, cursor: 'pointer',
    background: active ? 'var(--surface2)' : 'transparent',
    color: active ? 'var(--text1)' : 'var(--text3)', border: 'none',
  } as React.CSSProperties)

  return (
    <div className="max-w-4xl">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-[var(--text1)]">Catalogue réseau</h1>
        <p className="text-sm text-[var(--text4)] mt-0.5">Éléments partagés par le siège</p>
      </div>

      <div className="flex gap-1 mb-4 p-1 rounded-lg" style={{ background: 'var(--surface)' }}>
        {(['product', 'recipe', 'sop'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={tabStyle(tab === t)}>
            {t === 'product' ? '🛍 Produits' : t === 'recipe' ? '📋 Recettes' : '📖 SOPs'}
          </button>
        ))}
      </div>

      <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
        {filtered.length === 0 && (
          <div className="px-4 py-8 text-center text-sm text-[var(--text4)]">Aucun item dans cette catégorie</div>
        )}
        {filtered.map((eci, i) => {
          const cat = eci.network_catalog_items
          if (!cat) return null
          const isNew     = eci.current_version === 1 && !eci.seen_at
          const isUpdated = eci.current_version < cat.version
          const hasDiff   = isUpdated && cat.network_catalog_item_data?.previous_payload

          return (
            <div key={eci.id} className="px-4 py-3" style={{ background: 'var(--surface)', borderTop: i > 0 ? '1px solid var(--border)' : undefined }}>
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div>
                    <p className="text-sm font-medium text-[var(--text1)]">{cat.name}</p>
                    {cat.description && <p className="text-xs text-[var(--text4)]">{cat.description}</p>}
                  </div>
                  {cat.is_mandatory && (
                    <span style={{ background: '#1a1530', color: '#a78bfa', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 600 }}>OBLIGATOIRE</span>
                  )}
                  {isNew     && <span style={{ background: '#0f2010', color: '#4ade80', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 600 }}>NOUVEAU</span>}
                  {isUpdated && <span style={{ background: '#1a1200', color: '#fbbf24', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 600 }}>MIS À JOUR</span>}
                </div>
                {!cat.is_mandatory && (
                  <button
                    onClick={() => handleToggle(eci.id, !eci.is_active)}
                    className="text-xs px-3 py-1.5 rounded-lg flex-shrink-0"
                    style={{ background: eci.is_active ? '#0f2010' : 'var(--surface2)', color: eci.is_active ? '#4ade80' : 'var(--text3)', border: `1px solid ${eci.is_active ? '#1a4020' : 'var(--border)'}` }}
                  >
                    {eci.is_active ? 'Actif' : 'Inactif'}
                  </button>
                )}
              </div>

              {/* Diff visuel */}
              {hasDiff && (
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <div className="rounded-lg p-3" style={{ background: '#1a1010', border: '1px solid #3a1010' }}>
                    <p className="text-xs font-semibold text-[var(--text4)] mb-1">AVANT</p>
                    <pre className="text-xs text-[var(--text3)] whitespace-pre-wrap">
                      {JSON.stringify(cat.network_catalog_item_data!.previous_payload, null, 2)}
                    </pre>
                  </div>
                  <div className="rounded-lg p-3" style={{ background: '#0f1f10', border: '1px solid #1a4020' }}>
                    <p className="text-xs font-semibold text-[var(--text4)] mb-1">APRÈS</p>
                    <pre className="text-xs text-[var(--text3)] whitespace-pre-wrap">
                      {JSON.stringify(cat.network_catalog_item_data!.payload, null, 2)}
                    </pre>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/catalogue-reseau/ src/app/dashboard/layout.tsx
git commit -m "feat: add franchisee catalogue-reseau page and notification banner"
```

---

## Task 8: Compliance Score dans Command Center + Network Stats

**Files:**
- Modify: `src/app/api/franchise/network-stats/route.ts`
- Modify: `src/app/dashboard/franchise/command-center/_components/command-center-client.tsx`

- [ ] **Step 1: Ajouter le compliance score dans network-stats**

Dans `src/app/api/franchise/network-stats/route.ts`, dans la boucle qui construit le résultat par établissement, ajouter :

```typescript
// Après avoir récupéré les establishments, ajouter ce bloc avant le return :

// Fetch mandatory catalog items count for this org
const { count: totalMandatory } = await supabaseAdmin
  .from('network_catalog_items')
  .select('*', { count: 'exact', head: true })
  .eq('org_id', orgId)
  .eq('is_mandatory', true)
  .eq('status', 'published')

// Fetch active mandatory items per establishment
const { data: activePerEst } = await supabaseAdmin
  .from('establishment_catalog_items')
  .select('establishment_id, network_catalog_items!inner(is_mandatory)')
  .eq('network_catalog_items.is_mandatory', true)
  .eq('is_active', true)
  .in('establishment_id', (establishments ?? []).map((e: { id: string }) => e.id))

const activeMandatoryMap = new Map<string, number>()
for (const row of (activePerEst ?? []) as Array<{ establishment_id: string }>) {
  activeMandatoryMap.set(row.establishment_id, (activeMandatoryMap.get(row.establishment_id) ?? 0) + 1)
}
```

Et dans la map finale des résultats, ajouter le champ :

```typescript
compliance_score: computeComplianceScore(
  activeMandatoryMap.get(est.id) ?? 0,
  totalMandatory ?? 0
),
```

Ajouter l'import en haut du fichier :

```typescript
import { computeComplianceScore } from '@/lib/catalogue-helpers'
```

- [ ] **Step 2: Ajouter la colonne Conformité dans le Command Center**

Dans `src/app/dashboard/franchise/command-center/_components/command-center-client.tsx` :

Ajouter `compliance_score: number` à l'interface `EstablishmentStat`.

Modifier `gridTemplateColumns` de `'1.5fr 90px 100px 70px 80px 80px 100px'` à `'1.5fr 90px 100px 70px 80px 80px 90px 100px'`.

Ajouter dans le header : `<span style={{ color: 'var(--text4)' }}>Conf.</span>`

Ajouter dans chaque ligne, après la colonne "→ Franchiseur" :

```typescript
<span
  className="text-sm font-semibold"
  style={{ color: est.compliance_score >= 90 ? 'var(--green)' : est.compliance_score >= 70 ? 'var(--amber)' : 'var(--red)' }}
>
  {est.compliance_score}%
</span>
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/franchise/network-stats/route.ts src/app/dashboard/franchise/command-center/_components/command-center-client.tsx
git commit -m "feat: add compliance score in network stats and command center"
```

---

## Task 9: Onboarding Automatique Franchisé

**Files:**
- Modify: `src/app/api/franchise/establishments/route.ts`

- [ ] **Step 1: Ajouter le seeding catalogue dans le POST onboarding**

Dans `src/app/api/franchise/establishments/route.ts`, dans la fonction POST, après le Step 5 (upsert profile), ajouter :

```typescript
// Step 6: Seed catalogue — insère tous les items publiés du siège dans le nouvel établissement
const { data: catalogItems } = await supabaseAdmin
  .from('network_catalog_items')
  .select('id, version')
  .eq('org_id', caller.orgId)
  .eq('status', 'published')

if (catalogItems && catalogItems.length > 0 && establishmentId) {
  const catalogRows = catalogItems.map((item: { id: string; version: number }) => ({
    establishment_id: establishmentId,
    catalog_item_id:  item.id,
    is_active:        true,
    current_version:  item.version,
  }))
  await supabaseAdmin
    .from('establishment_catalog_items')
    .upsert(catalogRows, { onConflict: 'establishment_id,catalog_item_id' })
    .then(() => null, () => null) // non-blocking — onboarding proceeds even if catalog seed fails
}
```

Ajouter dans le rollback (bloc catch), avant le `return NextResponse.json({ error... })` :

```typescript
// No rollback needed for catalog items — CASCADE on establishment delete handles it
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/franchise/establishments/route.ts
git commit -m "feat: auto-seed catalogue items on franchisee onboarding"
```

---

## Task 10: Run all tests + vérification TypeScript

- [ ] **Step 1: Vérification TypeScript complète**

```bash
cd /Users/anthony/Super\ pouvoir/Alloflow
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 2: Run tous les tests Vitest**

```bash
npx vitest run
```
Expected: all tests pass (existing + new catalogue-helpers tests).

- [ ] **Step 3: Commit final si corrections nécessaires**

```bash
git add src/app/ src/lib/ supabase/
git commit -m "fix: resolve TypeScript errors and test failures post-catalogue-reseau"
```
