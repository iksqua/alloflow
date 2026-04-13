# Catalogue Réseau v2 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the live Catalogue Réseau with ingredients, SOP step editor + SopKitchenMode viewer, PROCHAINEMENT badge, and item duplication.

**Architecture:** Build on top of the v1 architecture already in production. No new tables — two ALTER TABLE statements only. All logic in application layer (no DB triggers). Reuse `SopKitchenMode` component from `src/app/dashboard/sops/_components/` without modification.

**Tech Stack:** Next.js 16 App Router, TypeScript strict, Supabase (service role for propagation), Zod v4, Tailwind 4, Vitest

---

## File Map

### New files
- `supabase/migrations/20260413000002_catalogue_reseau_v2.sql` — ALTER TABLE migration
- `src/app/api/franchise/catalogue/[id]/duplicate/route.ts` — duplicate endpoint
- `src/app/dashboard/franchise/catalogue/_components/sop-steps-editor.tsx` — step list editor
- `src/app/dashboard/catalogue-reseau/_components/sop-kitchen-viewer.tsx` — payload → SopWithSteps wrapper

### Modified files
- `src/lib/catalogue-helpers.ts` — add `isUpcoming()`
- `src/lib/__tests__/catalogue-helpers.test.ts` — tests for `isUpcoming()`
- `src/lib/validations/catalogue.ts` — add `available_from`, SOP+ingredient payload schemas
- `src/app/api/franchise/catalogue/[id]/publish/route.ts` — suppress `notified_at` if upcoming
- `src/app/api/catalogue-reseau/route.ts` — add `available_from` to select, compute `is_upcoming`
- `src/app/api/catalogue-reseau/[id]/route.ts` — server-side `is_upcoming` guard on PATCH
- `src/app/api/franchise/establishments/route.ts` — seed `stock_items` from network ingredients
- `src/app/dashboard/franchise/catalogue/_components/catalogue-item-form.tsx` — ingredient form, SOP editor, `available_from`
- `src/app/dashboard/franchise/catalogue/_components/catalogue-page-client.tsx` — Ingrédients tab, Dupliquer button
- `src/app/dashboard/catalogue-reseau/_components/catalogue-reseau-page-client.tsx` — Ingrédients tab, PROCHAINEMENT, SOP viewer

---

## Task 1: Migration DB — type ingredient + available_from

**Files:**
- Create: `supabase/migrations/20260413000002_catalogue_reseau_v2.sql`

- [ ] **Step 1: Écrire la migration**

```sql
-- supabase/migrations/20260413000002_catalogue_reseau_v2.sql

-- 1. Ajouter le type 'ingredient' au CHECK
ALTER TABLE public.network_catalog_items
  DROP CONSTRAINT network_catalog_items_type_check,
  ADD CONSTRAINT network_catalog_items_type_check
    CHECK (type IN ('product', 'recipe', 'sop', 'ingredient'));

-- 2. Ajouter la colonne available_from
ALTER TABLE public.network_catalog_items
  ADD COLUMN IF NOT EXISTS available_from date;
```

- [ ] **Step 2: Appliquer la migration en production via l'API Supabase**

```bash
SQL=$(cat supabase/migrations/20260413000002_catalogue_reseau_v2.sql)
curl -s -X POST "https://api.supabase.com/v1/projects/vblxzfsddxhtthycsmim/database/query" \
  -H "Authorization: Bearer sbp_2eabc46efa66238bd0ed4b9f5cf508d2bdfee2d9" \
  -H "Content-Type: application/json" \
  -d "{\"query\": $(echo "$SQL" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))')}" \
  | python3 -m json.tool
```

Expected: `[]` (empty array = success)

- [ ] **Step 3: Régénérer les types TypeScript**

```bash
SUPABASE_ACCESS_TOKEN=sbp_2eabc46efa66238bd0ed4b9f5cf508d2bdfee2d9 \
  npx supabase gen types typescript --project-id vblxzfsddxhtthycsmim \
  | grep -v "^A new version" | grep -v "^We recommend" \
  > src/lib/types/database.ts
```

Expected: file updated, grep `available_from` shows the new column

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260413000002_catalogue_reseau_v2.sql src/lib/types/database.ts
git commit -m "feat(db): add ingredient type and available_from to network_catalog_items"
```

---

## Task 2: Helpers + Validations

**Files:**
- Modify: `src/lib/catalogue-helpers.ts`
- Modify: `src/lib/__tests__/catalogue-helpers.test.ts`
- Modify: `src/lib/validations/catalogue.ts`

- [ ] **Step 1: Écrire les tests qui échouent pour `isUpcoming`**

Dans `src/lib/__tests__/catalogue-helpers.test.ts`, ajouter après les tests existants :

```typescript
describe('isUpcoming', () => {
  it('returns true for a future date', () => {
    expect(isUpcoming('2099-12-31')).toBe(true)
  })
  it('returns false for a past date', () => {
    expect(isUpcoming('2020-01-01')).toBe(false)
  })
  it('returns false for today', () => {
    const today = new Date().toISOString().split('T')[0]
    expect(isUpcoming(today)).toBe(false)
  })
  it('returns false when null', () => {
    expect(isUpcoming(null)).toBe(false)
  })
})
```

- [ ] **Step 2: Vérifier que les tests échouent**

```bash
npm run test:run -- src/lib/__tests__/catalogue-helpers.test.ts
```

Expected: FAIL — `isUpcoming is not a function`

- [ ] **Step 3: Implémenter `isUpcoming` dans `src/lib/catalogue-helpers.ts`**

Ajouter à la fin du fichier :

```typescript
/** true if available_from is set and is strictly in the future */
export function isUpcoming(availableFrom: string | null): boolean {
  if (!availableFrom) return false
  // Compare date strings directly (YYYY-MM-DD) — no time zone issues
  const today = new Date().toISOString().split('T')[0]
  return availableFrom > today
}
```

- [ ] **Step 4: Vérifier que les tests passent**

```bash
npm run test:run -- src/lib/__tests__/catalogue-helpers.test.ts
```

Expected: all passing

- [ ] **Step 5: Mettre à jour `src/lib/validations/catalogue.ts`**

Remplacer le fichier entier :

```typescript
import { z } from 'zod'

export const createCatalogueItemSchema = z.object({
  type:           z.enum(['product', 'recipe', 'sop', 'ingredient']),
  name:           z.string().min(1).max(100),
  description:    z.string().max(500).optional(),
  is_mandatory:   z.boolean().default(false),
  is_seasonal:    z.boolean().default(false),
  expires_at:     z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  available_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  payload:        z.record(z.string(), z.unknown()).default({}),
})

export const updateCatalogueItemSchema = createCatalogueItemSchema.partial()

export const updateEstablishmentCatalogItemSchema = z.object({
  local_price:           z.number().positive().nullable().optional(),
  local_stock_threshold: z.number().int().min(0).nullable().optional(),
  is_active:             z.boolean().optional(),
})

// Payload validators (used in publish route to enforce SOP min steps)
export const sopPayloadSchema = z.object({
  steps: z.array(z.object({
    sort_order:       z.number(),
    title:            z.string().min(1),
    description:      z.string().min(1),
    duration_seconds: z.number().nullable().optional(),
    media_url:        z.string().nullable().optional(),
    note_type:        z.enum(['warning', 'tip']).nullable().optional(),
    note_text:        z.string().nullable().optional(),
  })).min(1, 'Un SOP doit avoir au moins une étape'),
})

export const ingredientPayloadSchema = z.object({
  unit:     z.enum(['g', 'kg', 'ml', 'cl', 'L', 'pièce']),
  category: z.string().optional(),
})

export type CreateCatalogueItemInput  = z.infer<typeof createCatalogueItemSchema>
export type UpdateCatalogueItemInput  = z.infer<typeof updateCatalogueItemSchema>
export type UpdateEstablishmentCatalogItemInput = z.infer<typeof updateEstablishmentCatalogItemSchema>
```

- [ ] **Step 6: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: 0 errors

- [ ] **Step 7: Commit**

```bash
git add src/lib/catalogue-helpers.ts src/lib/__tests__/catalogue-helpers.test.ts src/lib/validations/catalogue.ts
git commit -m "feat: add isUpcoming helper, available_from + ingredient/SOP payload schemas"
```

---

## Task 3: Route duplicate

**Files:**
- Create: `src/app/api/franchise/catalogue/[id]/duplicate/route.ts`

- [ ] **Step 1: Créer la route**

```typescript
// src/app/api/franchise/catalogue/[id]/duplicate/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

async function getFranchiseAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 401 as const }
  const { data: profile } = await supabase
    .from('profiles').select('role, org_id').eq('id', user.id).single()
  if (!profile || profile.role !== 'franchise_admin' || !profile.org_id) return { error: 403 as const }
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
  if ('error' in caller) return NextResponse.json({ error: caller.error === 401 ? 'Unauthorized' : 'Forbidden' }, { status: caller.error })

  const { id } = await params
  const supabase = adminClient()

  // Fetch original item + data
  const { data: original } = await supabase
    .from('network_catalog_items')
    .select('*, network_catalog_item_data(payload)')
    .eq('id', id)
    .single()

  if (!original || original.org_id !== caller.orgId)
    return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Create duplicate — always draft, version reset to 1
  const { data: copy, error: copyErr } = await supabase
    .from('network_catalog_items')
    .insert({
      org_id:         original.org_id,
      type:           original.type,
      name:           `Copie de ${original.name}`,
      description:    original.description,
      is_mandatory:   original.is_mandatory,
      is_seasonal:    original.is_seasonal,
      expires_at:     original.expires_at,
      available_from: original.available_from,
      status:         'draft',
      version:        1,
    })
    .select()
    .single()

  if (copyErr || !copy) return NextResponse.json({ error: copyErr?.message ?? 'Failed to duplicate' }, { status: 500 })

  // Copy payload data
  const originalData = original.network_catalog_item_data as { payload: Record<string, unknown> } | null
  if (originalData?.payload) {
    const { error: dataErr } = await supabase
      .from('network_catalog_item_data')
      .insert({ catalog_item_id: copy.id, payload: originalData.payload, previous_payload: null })
    if (dataErr) return NextResponse.json({ error: dataErr.message }, { status: 500 })
  }

  return NextResponse.json({ item: copy }, { status: 201 })
}
```

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add src/app/api/franchise/catalogue/[id]/duplicate/route.ts
git commit -m "feat: add POST /api/franchise/catalogue/[id]/duplicate route"
```

---

## Task 4: Route publish — suppression notified_at si PROCHAINEMENT

**Files:**
- Modify: `src/app/api/franchise/catalogue/[id]/publish/route.ts`

- [ ] **Step 1: Modifier la route publish**

Remplacer le bloc de construction des rows (lignes 55-61) :

```typescript
  if (estIds.length > 0) {
    const isUpcomingItem = original.available_from
      ? original.available_from > new Date().toISOString().split('T')[0]
      : false

    const rows = estIds.map((estId: string) => ({
      establishment_id: estId,
      catalog_item_id:  id,
      is_active:        true,
      current_version:  item.version,
      // Don't notify if item is PROCHAINEMENT — franchisees see it as upcoming, no urgent banner
      notified_at:      isUpcomingItem ? null : new Date().toISOString(),
    }))
    await supabase.from('establishment_catalog_items').upsert(rows, { onConflict: 'establishment_id,catalog_item_id' })
  }
```

Also: update the select on line 29 to include `available_from`:

```typescript
  const { data: item } = await supabase
    .from('network_catalog_items').select('id, org_id, status, version, available_from').eq('id', id).single()
```

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add src/app/api/franchise/catalogue/[id]/publish/route.ts
git commit -m "feat: suppress notified_at on publish for upcoming (available_from > today) items"
```

---

## Task 5: Route GET franchisé — is_upcoming flag

**Files:**
- Modify: `src/app/api/catalogue-reseau/route.ts`

- [ ] **Step 1: Mettre à jour la route GET**

Remplacer le fichier entier :

```typescript
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isItemExpired, isUpcoming } from '@/lib/catalogue-helpers'

async function getAdminProfile() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 401 as const }
  const { data: profile } = await supabase
    .from('profiles').select('role, establishment_id').eq('id', user.id).single()
  if (!profile || !['admin', 'caissier'].includes(profile.role) || !profile.establishment_id) return { error: 403 as const }
  return { userId: user.id, establishmentId: profile.establishment_id }
}

export async function GET() {
  const caller = await getAdminProfile()
  if ('error' in caller) return NextResponse.json({ error: caller.error === 401 ? 'Unauthorized' : 'Forbidden' }, { status: caller.error })

  const supabase = await createClient()
  const { data: items, error } = await supabase
    .from('establishment_catalog_items')
    .select(`
      *,
      network_catalog_items (
        id, type, name, description, is_mandatory, is_seasonal, expires_at, available_from, status, version,
        network_catalog_item_data (payload, previous_payload)
      )
    `)
    .eq('establishment_id', caller.establishmentId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const result = (items ?? []).map((item) => {
    const cat = item.network_catalog_items as {
      is_seasonal?: boolean; expires_at?: string | null
      available_from?: string | null; status?: string
    } | null

    // Seasonal expiry check at read time
    if (cat?.is_seasonal && isItemExpired(cat.expires_at ?? null)) {
      return { ...item, network_catalog_items: { ...cat, status: 'archived' }, is_upcoming: false }
    }
    // Upcoming check at read time
    const upcoming = isUpcoming(cat?.available_from ?? null)
    return { ...item, is_upcoming: upcoming }
  })

  return NextResponse.json({ items: result })
}
```

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add src/app/api/catalogue-reseau/route.ts
git commit -m "feat: add is_upcoming flag to GET /api/catalogue-reseau (read-time available_from check)"
```

---

## Task 6: Route PATCH franchisé — garde server-side is_upcoming

**Files:**
- Modify: `src/app/api/catalogue-reseau/[id]/route.ts`

- [ ] **Step 1: Ajouter la garde is_upcoming dans le PATCH**

Remplacer le fichier entier :

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { updateEstablishmentCatalogItemSchema } from '@/lib/validations/catalogue'
import { isUpcoming } from '@/lib/catalogue-helpers'

async function getAdminProfile() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 401 as const }
  const { data: profile } = await supabase
    .from('profiles').select('role, establishment_id').eq('id', user.id).single()
  if (!profile || profile.role !== 'admin' || !profile.establishment_id) return { error: 403 as const }
  return { userId: user.id, establishmentId: profile.establishment_id }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const caller = await getAdminProfile()
  if ('error' in caller) return NextResponse.json({ error: caller.error === 401 ? 'Unauthorized' : 'Forbidden' }, { status: caller.error })

  const { id } = await params
  const body = updateEstablishmentCatalogItemSchema.safeParse(await req.json())
  if (!body.success) return NextResponse.json({ error: body.error.flatten() }, { status: 422 })

  const supabase = await createClient()

  const { data: eci } = await supabase
    .from('establishment_catalog_items')
    .select('id, catalog_item_id, network_catalog_items(is_mandatory, available_from)')
    .eq('id', id)
    .eq('establishment_id', caller.establishmentId)
    .single()

  if (!eci) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const catalogItem = eci.network_catalog_items as { is_mandatory: boolean; available_from: string | null } | null

  // Block activation of upcoming items server-side
  if (body.data.is_active === true && isUpcoming(catalogItem?.available_from ?? null)) {
    return NextResponse.json({ error: 'Item non encore disponible' }, { status: 400 })
  }

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

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add src/app/api/catalogue-reseau/[id]/route.ts
git commit -m "feat: add server-side is_upcoming guard to PATCH /api/catalogue-reseau/[id]"
```

---

## Task 7: Onboarding — seed stock_items depuis les ingrédients réseau

**Files:**
- Modify: `src/app/api/franchise/establishments/route.ts` (autour de la ligne 200)

- [ ] **Step 1: Ajouter le seed stock_items après le seed catalogue existant**

Après le bloc "Step 6: Seed catalogue" (après la ligne `await supabaseAdmin.from('establishment_catalog_items')...then(() => null, () => null)`), ajouter :

```typescript
    // Step 7: Seed stock_items from published network ingredients
    const { data: networkIngredients } = await supabaseAdmin
      .from('network_catalog_items')
      .select('id, name, network_catalog_item_data(payload)')
      .eq('org_id', caller.orgId)
      .eq('type', 'ingredient')
      .eq('status', 'published')

    if (networkIngredients && networkIngredients.length > 0 && establishmentId) {
      const stockRows = (networkIngredients as Array<{
        id: string
        name: string
        network_catalog_item_data: { payload: { unit?: string } } | null
      }>).map(ing => ({
        establishment_id: establishmentId,
        name:             ing.name,
        unit:             ing.network_catalog_item_data?.payload?.unit ?? 'pièce',
        quantity:         0,
        alert_threshold:  0,
        active:           true,
      }))
      await supabaseAdmin
        .from('stock_items')
        .upsert(stockRows, { onConflict: 'establishment_id,name', ignoreDuplicates: true })
        .then(() => null, () => null) // non-blocking
    }
```

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add src/app/api/franchise/establishments/route.ts
git commit -m "feat: seed stock_items from network ingredients on franchisee onboarding"
```

---

## Task 8: SopStepsEditor component (siège)

**Files:**
- Create: `src/app/dashboard/franchise/catalogue/_components/sop-steps-editor.tsx`

- [ ] **Step 1: Créer le composant**

```typescript
// src/app/dashboard/franchise/catalogue/_components/sop-steps-editor.tsx
'use client'

export type SopStepDraft = {
  sort_order: number
  title: string
  description: string
  duration_seconds: number | null
  media_url: string | null
  note_type: 'warning' | 'tip' | null
  note_text: string | null
}

const inputStyle: React.CSSProperties = {
  background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text1)',
  borderRadius: '8px', padding: '8px 12px', fontSize: '14px', width: '100%', outline: 'none',
}
const labelCls = 'block text-xs font-semibold text-[var(--text4)] uppercase tracking-wide mb-1.5'

function emptyStep(sort_order: number): SopStepDraft {
  return { sort_order, title: '', description: '', duration_seconds: null, media_url: null, note_type: null, note_text: null }
}

export function SopStepsEditor({
  steps, onChange,
}: {
  steps: SopStepDraft[]
  onChange: (steps: SopStepDraft[]) => void
}) {
  function update(index: number, patch: Partial<SopStepDraft>) {
    onChange(steps.map((s, i) => i === index ? { ...s, ...patch } : s))
  }

  function add() {
    onChange([...steps, emptyStep(steps.length)])
  }

  function remove(index: number) {
    onChange(steps.filter((_, i) => i !== index).map((s, i) => ({ ...s, sort_order: i })))
  }

  function move(index: number, direction: -1 | 1) {
    const next = index + direction
    if (next < 0 || next >= steps.length) return
    const arr = [...steps]
    ;[arr[index], arr[next]] = [arr[next], arr[index]]
    onChange(arr.map((s, i) => ({ ...s, sort_order: i })))
  }

  return (
    <div className="flex flex-col gap-3">
      {steps.map((step, i) => (
        <div key={i} className="rounded-xl p-4" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-[var(--text4)] uppercase tracking-wide">Étape {i + 1}</span>
            <div className="flex gap-1">
              <button type="button" onClick={() => move(i, -1)} disabled={i === 0}
                className="px-2 py-1 rounded text-xs text-[var(--text3)] disabled:opacity-30"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>↑</button>
              <button type="button" onClick={() => move(i, 1)} disabled={i === steps.length - 1}
                className="px-2 py-1 rounded text-xs text-[var(--text3)] disabled:opacity-30"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>↓</button>
              <button type="button" onClick={() => remove(i)}
                className="px-2 py-1 rounded text-xs text-red-400 border border-red-900/30 bg-red-900/10">✕</button>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <div>
              <label className={labelCls}>Titre *</label>
              <input style={inputStyle} value={step.title}
                onChange={e => update(i, { title: e.target.value })} placeholder="Ex: Préchauffer le four" />
            </div>
            <div>
              <label className={labelCls}>Description *</label>
              <textarea style={{ ...inputStyle, height: '64px', resize: 'none' }} value={step.description}
                onChange={e => update(i, { description: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Durée (secondes)</label>
                <input type="number" style={inputStyle} min={0}
                  value={step.duration_seconds ?? ''}
                  onChange={e => update(i, { duration_seconds: e.target.value ? Number(e.target.value) : null })} />
              </div>
              <div>
                <label className={labelCls}>URL vidéo/image</label>
                <input style={inputStyle} value={step.media_url ?? ''}
                  onChange={e => update(i, { media_url: e.target.value || null })} placeholder="https://..." />
              </div>
            </div>
            <div>
              <label className={labelCls}>Note</label>
              <select style={inputStyle} value={step.note_type ?? ''}
                onChange={e => update(i, { note_type: (e.target.value as 'warning' | 'tip') || null, note_text: e.target.value ? step.note_text : null })}>
                <option value="">Aucune</option>
                <option value="warning">⚠ Attention</option>
                <option value="tip">💡 Conseil</option>
              </select>
            </div>
            {step.note_type && (
              <div>
                <label className={labelCls}>Texte de la note</label>
                <input style={inputStyle} value={step.note_text ?? ''}
                  onChange={e => update(i, { note_text: e.target.value || null })} />
              </div>
            )}
          </div>
        </div>
      ))}

      <button type="button" onClick={add}
        className="w-full py-2 rounded-xl text-sm text-[var(--text3)] border border-dashed border-[var(--border)] hover:border-[var(--text4)] transition-colors"
        style={{ background: 'transparent' }}>
        + Ajouter une étape
      </button>
    </div>
  )
}
```

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add src/app/dashboard/franchise/catalogue/_components/sop-steps-editor.tsx
git commit -m "feat: add SopStepsEditor component for network SOP step authoring"
```

---

## Task 9: SopKitchenViewer component (franchisé)

**Files:**
- Create: `src/app/dashboard/catalogue-reseau/_components/sop-kitchen-viewer.tsx`

The `SopWithSteps` interface requires: `id, title, content, category_id, recipe_id, active, category, recipe, step_count, total_duration_seconds, has_video, steps[]`. Read `src/app/dashboard/sops/_components/types.ts` to verify before writing.

- [ ] **Step 1: Créer le composant**

```typescript
// src/app/dashboard/catalogue-reseau/_components/sop-kitchen-viewer.tsx
'use client'
import { useState } from 'react'
import { SopKitchenMode } from '@/app/dashboard/sops/_components/sop-kitchen-mode'
import type { SopWithSteps } from '@/app/dashboard/sops/_components/types'

type PayloadStep = {
  sort_order?: number
  title: string
  description: string
  duration_seconds?: number | null
  media_url?: string | null
  note_type?: 'warning' | 'tip' | null
  note_text?: string | null
}

function payloadToSopWithSteps(id: string, name: string, payload: Record<string, unknown>): SopWithSteps {
  const rawSteps = (payload?.steps ?? []) as PayloadStep[]
  const steps = rawSteps.map((s, i) => ({
    id:               `${id}-${i}`,
    sop_id:           id,
    sort_order:       s.sort_order ?? i,
    title:            s.title,
    description:      s.description,
    duration_seconds: s.duration_seconds ?? null,
    media_url:        s.media_url ?? null,
    note_type:        s.note_type ?? null,
    note_text:        s.note_text ?? null,
  }))

  return {
    id,
    title:                   name,
    content:                 null,
    category_id:             null,
    recipe_id:               null,
    active:                  true,
    category:                null,
    recipe:                  null,
    step_count:              steps.length,
    total_duration_seconds:  steps.reduce((acc, s) => acc + (s.duration_seconds ?? 0), 0),
    has_video:               steps.some(s => !!s.media_url),
    steps,
  }
}

export function SopKitchenViewer({
  id, name, payload,
}: {
  id: string
  name: string
  payload: Record<string, unknown>
}) {
  const [open, setOpen] = useState(false)
  const steps = (payload?.steps ?? []) as PayloadStep[]

  if (steps.length === 0) return null

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="text-xs px-3 py-1.5 rounded-lg font-medium text-white flex-shrink-0"
        style={{ background: 'var(--blue)' }}
      >
        ▶ Voir le guide
      </button>
      {open && (
        <SopKitchenMode
          sop={payloadToSopWithSteps(id, name, payload)}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}
```

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add src/app/dashboard/catalogue-reseau/_components/sop-kitchen-viewer.tsx
git commit -m "feat: add SopKitchenViewer — maps network SOP payload to SopKitchenMode"
```

---

## Task 10: CatalogueItemForm — ingrédient + SOP editor + available_from

**Files:**
- Modify: `src/app/dashboard/franchise/catalogue/_components/catalogue-item-form.tsx`

- [ ] **Step 1: Réécrire le formulaire**

Remplacer le fichier entier :

```typescript
'use client'
import { useState } from 'react'
import { toast } from 'sonner'
import { SopStepsEditor, type SopStepDraft } from './sop-steps-editor'

type CatalogItem = {
  id: string; type: string; name: string; description?: string
  is_mandatory: boolean; is_seasonal: boolean; expires_at?: string | null
  available_from?: string | null; status: string; version: number
  network_catalog_item_data?: { payload: Record<string, unknown> }
}

const inputStyle: React.CSSProperties = {
  background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text1)',
  borderRadius: '8px', padding: '8px 12px', fontSize: '14px', width: '100%', outline: 'none',
}
const labelCls = 'block text-xs font-semibold text-[var(--text4)] uppercase tracking-wide mb-1.5'

function initSteps(payload: Record<string, unknown>): SopStepDraft[] {
  const raw = (payload?.steps ?? []) as SopStepDraft[]
  return raw.length > 0 ? raw : []
}

function initIngredientPayload(payload: Record<string, unknown>) {
  return { unit: (payload?.unit as string) ?? 'kg', category: (payload?.category as string) ?? '' }
}

export function CatalogueItemForm({
  item, defaultType, onClose, onSaved,
}: {
  item: CatalogItem | null
  defaultType: 'product' | 'recipe' | 'sop' | 'ingredient'
  onClose: () => void
  onSaved: (item: CatalogItem) => void
}) {
  const [form, setForm] = useState({
    type:           item?.type ?? defaultType,
    name:           item?.name ?? '',
    description:    item?.description ?? '',
    is_mandatory:   item?.is_mandatory ?? false,
    is_seasonal:    item?.is_seasonal ?? false,
    expires_at:     item?.expires_at ?? '',
    available_from: item?.available_from ?? '',
    payload:        item?.network_catalog_item_data?.payload ?? {},
  })
  const [sopSteps,  setSopSteps]  = useState<SopStepDraft[]>(() => initSteps(form.payload))
  const [ingPayload, setIngPayload] = useState(() => initIngredientPayload(form.payload))
  const [saving, setSaving] = useState(false)

  function buildPayload(): Record<string, unknown> {
    if (form.type === 'sop')        return { steps: sopSteps }
    if (form.type === 'ingredient') return { unit: ingPayload.unit, ...(ingPayload.category ? { category: ingPayload.category } : {}) }
    return form.payload
  }

  async function handleSave() {
    if (form.type === 'sop' && sopSteps.length === 0) {
      toast.error('Un SOP doit avoir au moins une étape')
      return
    }
    setSaving(true)
    try {
      const url    = item ? `/api/franchise/catalogue/${item.id}` : '/api/franchise/catalogue'
      const method = item ? 'PATCH' : 'POST'
      const res    = await fetch(url, {
        method, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          expires_at:     form.expires_at     || null,
          available_from: form.available_from || null,
          payload:        buildPayload(),
        }),
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

  const canSave = form.name.trim().length > 0 && (form.type !== 'sop' || sopSteps.length > 0)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'var(--overlay-bg)' }}>
      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl p-6" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-[var(--text1)]">{item ? 'Modifier l\'item' : 'Nouvel item catalogue'}</h2>
          <button onClick={onClose} className="text-lg text-[var(--text3)] hover:text-[var(--text1)] transition-colors" style={{ background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
        </div>

        <div className="flex flex-col gap-4">
          {/* Type */}
          <div>
            <label className={labelCls}>Type</label>
            <select style={inputStyle} value={form.type}
              onChange={e => setForm(p => ({ ...p, type: e.target.value }))} disabled={!!item}>
              <option value="product">Produit</option>
              <option value="recipe">Recette</option>
              <option value="sop">SOP / Guide</option>
              <option value="ingredient">Ingrédient</option>
            </select>
          </div>

          {/* Nom */}
          <div>
            <label className={labelCls}>Nom *</label>
            <input style={inputStyle} value={form.name}
              onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Ex: Farine T45" />
          </div>

          {/* Description */}
          <div>
            <label className={labelCls}>Description</label>
            <textarea style={{ ...inputStyle, height: '64px', resize: 'none' }} value={form.description}
              onChange={e => setForm(p => ({ ...p, description: e.target.value }))} />
          </div>

          {/* Ingredient-specific fields */}
          {form.type === 'ingredient' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Unité *</label>
                <select style={inputStyle} value={ingPayload.unit}
                  onChange={e => setIngPayload(p => ({ ...p, unit: e.target.value }))}>
                  {['g', 'kg', 'ml', 'cl', 'L', 'pièce'].map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Catégorie</label>
                <input style={inputStyle} value={ingPayload.category}
                  onChange={e => setIngPayload(p => ({ ...p, category: e.target.value }))}
                  placeholder="Ex: Pâtisserie" />
              </div>
            </div>
          )}

          {/* SOP step editor */}
          {form.type === 'sop' && (
            <div>
              <label className={labelCls}>Étapes *</label>
              <SopStepsEditor steps={sopSteps} onChange={setSopSteps} />
            </div>
          )}

          {/* Flags */}
          <div className="flex gap-4 flex-wrap">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.is_mandatory}
                onChange={e => setForm(p => ({ ...p, is_mandatory: e.target.checked }))} />
              <span className="text-sm text-[var(--text2)]">Obligatoire</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.is_seasonal}
                onChange={e => setForm(p => ({ ...p, is_seasonal: e.target.checked }))} />
              <span className="text-sm text-[var(--text2)]">Saisonnier</span>
            </label>
          </div>

          {form.is_seasonal && (
            <div>
              <label className={labelCls}>Date d'expiration</label>
              <input type="date" style={inputStyle} value={form.expires_at ?? ''}
                onChange={e => setForm(p => ({ ...p, expires_at: e.target.value }))} />
            </div>
          )}

          {/* Available from */}
          <div>
            <label className="flex items-center gap-2 cursor-pointer mb-2">
              <input type="checkbox"
                checked={!!form.available_from}
                onChange={e => setForm(p => ({ ...p, available_from: e.target.checked ? '' : null }))} />
              <span className="text-sm text-[var(--text2)]">Annoncer à l'avance (PROCHAINEMENT)</span>
            </label>
            {form.available_from !== null && (
              <div>
                <label className={labelCls}>Disponible à partir du</label>
                <input type="date" style={inputStyle} value={form.available_from ?? ''}
                  onChange={e => setForm(p => ({ ...p, available_from: e.target.value }))} />
              </div>
            )}
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="flex-1 py-2 rounded-lg text-sm"
            style={{ background: 'var(--surface2)', color: 'var(--text2)', border: '1px solid var(--border)' }}>
            Annuler
          </button>
          <button onClick={handleSave} disabled={saving || !canSave}
            className="flex-1 py-2 rounded-lg text-sm font-medium text-white"
            style={{ background: 'var(--blue)', opacity: (saving || !canSave) ? 0.5 : 1 }}>
            {saving ? 'Enregistrement…' : item ? 'Mettre à jour' : 'Créer'}
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add src/app/dashboard/franchise/catalogue/_components/catalogue-item-form.tsx
git commit -m "feat: extend CatalogueItemForm with ingredient fields, SOP step editor, available_from"
```

---

## Task 11: CataloguePageClient siège — tab Ingrédients + bouton Dupliquer

**Files:**
- Modify: `src/app/dashboard/franchise/catalogue/_components/catalogue-page-client.tsx`

- [ ] **Step 1: Ajouter le tab Ingrédients et le bouton Dupliquer**

Deux changements dans le fichier existant :

**A — Type tab étendu :** remplacer `useState<'product' | 'recipe' | 'sop'>` par `useState<'product' | 'recipe' | 'sop' | 'ingredient'>`

**B — Ajouter `handleDuplicate` :**

```typescript
  async function handleDuplicate(id: string) {
    const res = await fetch(`/api/franchise/catalogue/${id}/duplicate`, { method: 'POST' })
    if (res.ok) {
      const d = await res.json()
      setItems(prev => [d.item, ...prev])
      toast.success('Item dupliqué — modifiez-le avant de publier')
    } else {
      toast.error('Erreur lors de la duplication')
    }
  }
```

**C — Tab bar :** remplacer le map des tabs par :

```typescript
      <div className="flex gap-1 mb-4 p-1 rounded-xl" style={{ background: 'var(--surface)' }}>
        {(['product', 'recipe', 'sop', 'ingredient'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={tabStyle(tab === t)}>
            {t === 'product' ? '🛍 Produits' : t === 'recipe' ? '📋 Recettes' : t === 'sop' ? '📖 SOPs' : '🥕 Ingrédients'}
          </button>
        ))}
      </div>
```

**D — Bouton Dupliquer** dans les actions de chaque item, après le bouton "Éditer" :

```typescript
              <button onClick={() => handleDuplicate(item.id)}
                className="text-xs px-3 py-1.5 rounded-lg border border-[var(--border)] text-[var(--text3)]"
                style={{ background: 'var(--surface2)' }}>
                ⎘ Dupliquer
              </button>
```

**E — defaultType dans CatalogueItemForm :** s'assurer que `defaultType={tab}` passe bien `'ingredient'` quand tab = 'ingredient'.

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add src/app/dashboard/franchise/catalogue/_components/catalogue-page-client.tsx
git commit -m "feat: add Ingrédients tab and Dupliquer button to franchise catalogue page"
```

---

## Task 12: CatalogueReseauPageClient franchisé — Ingrédients + PROCHAINEMENT + SOP viewer

**Files:**
- Modify: `src/app/dashboard/catalogue-reseau/_components/catalogue-reseau-page-client.tsx`

- [ ] **Step 1: Mettre à jour le composant franchisé**

Remplacer le fichier entier :

```typescript
'use client'
import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { hasUnseenNotifications } from '@/lib/catalogue-helpers'
import { SopKitchenViewer } from './sop-kitchen-viewer'

type NetworkCatalogItem = {
  id: string; type: string; name: string; description?: string
  is_mandatory: boolean; is_seasonal: boolean; expires_at?: string | null
  available_from?: string | null; status: string; version: number
  network_catalog_item_data?: { payload: Record<string, unknown>; previous_payload: Record<string, unknown> | null } | null
}

type EstablishmentCatalogItem = {
  id: string; is_active: boolean; local_price: number | null; local_stock_threshold: number | null
  current_version: number; notified_at: string | null; seen_at: string | null
  is_upcoming: boolean
  network_catalog_items: NetworkCatalogItem | null
}

const tabStyle = (active: boolean): React.CSSProperties => ({
  padding: '6px 16px', borderRadius: '10px', fontSize: '13px', fontWeight: 500, cursor: 'pointer',
  background: active ? 'var(--surface2)' : 'transparent',
  color: active ? 'var(--text1)' : 'var(--text3)', border: 'none',
  boxShadow: active ? '0 1px 3px rgba(0,0,0,0.2)' : undefined,
})

export function CatalogueReseauPageClient({ initialItems }: { initialItems: unknown[] }) {
  const [items, setItems] = useState<EstablishmentCatalogItem[]>(initialItems as EstablishmentCatalogItem[])
  const [tab, setTab]     = useState<'product' | 'recipe' | 'sop' | 'ingredient'>('product')

  const filtered = items.filter(i => i.network_catalog_items?.type === tab)

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

  function formatDate(d: string) {
    return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })
  }

  return (
    <div className="max-w-4xl">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-[var(--text1)]">Catalogue réseau</h1>
        <p className="text-sm text-[var(--text4)] mt-0.5">Éléments partagés par le siège</p>
      </div>

      <div className="flex gap-1 mb-4 p-1 rounded-xl" style={{ background: 'var(--surface)' }}>
        {(['product', 'recipe', 'sop', 'ingredient'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={tabStyle(tab === t)}>
            {t === 'product' ? '🛍 Produits' : t === 'recipe' ? '📋 Recettes' : t === 'sop' ? '📖 SOPs' : '🥕 Ingrédients'}
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

          return (
            <div key={eci.id} className="px-4 py-3" style={{ background: 'var(--surface)', borderTop: i > 0 ? '1px solid var(--border)' : undefined }}>
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-2 min-w-0 flex-wrap">
                  <div>
                    <p className="text-sm font-medium text-[var(--text1)]">{cat.name}</p>
                    {cat.type === 'ingredient' && cat.network_catalog_item_data?.payload?.unit && (
                      <p className="text-xs text-[var(--text4)]">{String(cat.network_catalog_item_data.payload.unit)}{cat.network_catalog_item_data.payload.category ? ` · ${cat.network_catalog_item_data.payload.category}` : ''}</p>
                    )}
                    {cat.description && cat.type !== 'ingredient' && <p className="text-xs text-[var(--text4)]">{cat.description}</p>}
                  </div>
                  {cat.is_mandatory && (
                    <span className="text-xs font-semibold px-2 py-0.5 rounded bg-purple-900/20 text-purple-400">OBLIGATOIRE</span>
                  )}
                  {cat.is_seasonal && (
                    <span className="text-xs font-semibold px-2 py-0.5 rounded bg-amber-900/20 text-amber-400">
                      SAISONNIER{cat.expires_at ? ` · ${formatDate(cat.expires_at)}` : ''}
                    </span>
                  )}
                  {eci.is_upcoming && cat.available_from && (
                    <span className="text-xs font-semibold px-2 py-0.5 rounded bg-blue-900/20 text-blue-400">
                      PROCHAINEMENT · {formatDate(cat.available_from)}
                    </span>
                  )}
                  {!eci.is_upcoming && isNew     && <span className="text-xs font-semibold px-2 py-0.5 rounded bg-green-900/20 text-green-400">NOUVEAU</span>}
                  {!eci.is_upcoming && isUpdated && <span className="text-xs font-semibold px-2 py-0.5 rounded bg-amber-900/20 text-amber-400">MIS À JOUR</span>}
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  {/* SOP viewer button */}
                  {cat.type === 'sop' && cat.network_catalog_item_data?.payload && !eci.is_upcoming && (
                    <SopKitchenViewer
                      id={cat.id}
                      name={cat.name}
                      payload={cat.network_catalog_item_data.payload}
                    />
                  )}
                  {cat.type === 'sop' && eci.is_upcoming && (
                    <button disabled className="text-xs px-3 py-1.5 rounded-lg border border-[var(--border)] text-[var(--text4)]"
                      style={{ background: 'var(--surface2)' }}
                      title={cat.available_from ? `Disponible le ${formatDate(cat.available_from)}` : 'Bientôt disponible'}>
                      ▶ Bientôt
                    </button>
                  )}

                  {/* Toggle actif/inactif — not for ingredients, not for upcoming items */}
                  {cat.type !== 'ingredient' && !cat.is_mandatory && !eci.is_upcoming && (
                    <button
                      onClick={() => handleToggle(eci.id, !eci.is_active)}
                      className={`text-xs px-3 py-1.5 rounded-lg flex-shrink-0 font-medium border ${
                        eci.is_active
                          ? 'bg-green-900/20 text-green-400 border-green-900/30'
                          : 'border-[var(--border)] text-[var(--text3)]'
                      }`}
                      style={eci.is_active ? {} : { background: 'var(--surface2)' }}
                    >
                      {eci.is_active ? 'Actif' : 'Inactif'}
                    </button>
                  )}
                  {eci.is_upcoming && cat.type !== 'sop' && (
                    <span className="text-xs text-[var(--text4)]" title={`Disponible le ${cat.available_from ? formatDate(cat.available_from) : '?'}`}>
                      Disponible le {cat.available_from ? formatDate(cat.available_from) : '?'}
                    </span>
                  )}
                </div>
              </div>

              {/* Diff AVANT/APRÈS — only for updated, non-upcoming items */}
              {!eci.is_upcoming && isUpdated && cat.network_catalog_item_data?.previous_payload && (
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <div className="rounded-lg p-3 bg-red-900/10 border border-red-900/20">
                    <p className="text-xs font-semibold text-[var(--text4)] uppercase tracking-wide mb-1">Avant</p>
                    <pre className="text-xs text-[var(--text3)] whitespace-pre-wrap">
                      {JSON.stringify(cat.network_catalog_item_data.previous_payload, null, 2)}
                    </pre>
                  </div>
                  <div className="rounded-lg p-3 bg-green-900/10 border border-green-900/20">
                    <p className="text-xs font-semibold text-[var(--text4)] uppercase tracking-wide mb-1">Après</p>
                    <pre className="text-xs text-[var(--text3)] whitespace-pre-wrap">
                      {JSON.stringify(cat.network_catalog_item_data.payload, null, 2)}
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

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add src/app/dashboard/catalogue-reseau/_components/catalogue-reseau-page-client.tsx
git commit -m "feat: add Ingrédients tab, PROCHAINEMENT badge, and SOP viewer to franchisee catalogue"
```

---

## Task 13: TypeScript final + tous les tests

**Files:**
- All modified files verified

- [ ] **Step 1: TypeScript exhaustif**

```bash
npx tsc --noEmit 2>&1
```

Expected: 0 errors. Si erreurs → corriger avant de continuer.

- [ ] **Step 2: Tous les tests**

```bash
npm run test:run
```

Expected: tous les tests passent (87+ tests). Si échecs → corriger.

- [ ] **Step 3: Commit final**

```bash
git add src/ supabase/ docs/
git commit -m "chore: final TypeScript + test verification for catalogue réseau v2"
git push
```

---

## Récapitulatif des fichiers

| Fichier | Action |
|---------|--------|
| `supabase/migrations/20260413000002_catalogue_reseau_v2.sql` | Créer |
| `src/lib/types/database.ts` | Régénérer |
| `src/lib/catalogue-helpers.ts` | Modifier (add isUpcoming) |
| `src/lib/__tests__/catalogue-helpers.test.ts` | Modifier (add tests) |
| `src/lib/validations/catalogue.ts` | Modifier (add schemas) |
| `src/app/api/franchise/catalogue/[id]/duplicate/route.ts` | Créer |
| `src/app/api/franchise/catalogue/[id]/publish/route.ts` | Modifier |
| `src/app/api/catalogue-reseau/route.ts` | Modifier |
| `src/app/api/catalogue-reseau/[id]/route.ts` | Modifier |
| `src/app/api/franchise/establishments/route.ts` | Modifier |
| `src/app/dashboard/franchise/catalogue/_components/sop-steps-editor.tsx` | Créer |
| `src/app/dashboard/franchise/catalogue/_components/catalogue-item-form.tsx` | Modifier |
| `src/app/dashboard/franchise/catalogue/_components/catalogue-page-client.tsx` | Modifier |
| `src/app/dashboard/catalogue-reseau/_components/sop-kitchen-viewer.tsx` | Créer |
| `src/app/dashboard/catalogue-reseau/_components/catalogue-reseau-page-client.tsx` | Modifier |
