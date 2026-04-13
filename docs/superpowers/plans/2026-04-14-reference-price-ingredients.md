# Prix de référence ingrédients réseau — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permettre au siège de définir un prix de référence (package price + size) sur les ingrédients du catalogue réseau, pré-remplissant automatiquement `unit_price` dans `stock_items` lors de l'onboarding des nouveaux franchisés.

**Architecture:** Extension du payload JSONB existant (`network_catalog_item_data.payload`) avec deux champs optionnels. Validation enforced au publish. Onboarding modifié pour lire le prix et le calculer. UI: deux champs dans le formulaire siège + affichage info sur la vue franchisé.

**Tech Stack:** Next.js 16 App Router, TypeScript strict, Supabase, Tailwind 4, Vitest, Zod

**Spec:** `docs/superpowers/specs/2026-04-14-reference-price-ingredients-design.md`

---

### Task 1: Extend `ingredientPayloadSchema` + fix publish error handling

**Files:**
- Modify: `src/lib/validations/catalogue.ts`
- Modify: `src/app/api/franchise/catalogue/[id]/publish/route.ts`
- Test: `src/lib/__tests__/catalogue-validations.test.ts` (**append to existing file**)

- [ ] **Step 1: Append failing tests to the existing test file**

Open `src/lib/__tests__/catalogue-validations.test.ts` and **append** the following describe block at the end (do NOT overwrite the file — it already has tests for `sopPayloadSchema`, `ingredientPayloadSchema` existing units, and `createCatalogueItemSchema`):

```ts
describe('ingredientPayloadSchema — reference price', () => {
  it('accepts payload without reference price (backward compat)', () => {
    expect(ingredientPayloadSchema.safeParse({ unit: 'ml' }).success).toBe(true)
  })

  it('accepts payload with both reference price fields', () => {
    const r = ingredientPayloadSchema.safeParse({
      unit: 'ml',
      reference_package_price: 7.45,
      reference_package_size: 750,
    })
    expect(r.success).toBe(true)
  })

  it('rejects price without size', () => {
    expect(ingredientPayloadSchema.safeParse({
      unit: 'ml', reference_package_price: 7.45,
    }).success).toBe(false)
  })

  it('rejects size without price', () => {
    expect(ingredientPayloadSchema.safeParse({
      unit: 'ml', reference_package_size: 750,
    }).success).toBe(false)
  })

  it('rejects negative price', () => {
    expect(ingredientPayloadSchema.safeParse({
      unit: 'ml', reference_package_price: -1, reference_package_size: 750,
    }).success).toBe(false)
  })
})
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
cd "/Users/anthony/Super pouvoir/Alloflow" && npm run test:run -- --reporter=verbose src/lib/__tests__/catalogue-validations.test.ts
```

Expected: FAIL (schema doesn't have new fields yet)

- [ ] **Step 3: Extend `ingredientPayloadSchema` in `src/lib/validations/catalogue.ts`**

Replace lines 35-38:
```ts
export const ingredientPayloadSchema = z.object({
  unit:                    z.enum(['g', 'kg', 'ml', 'cl', 'L', 'pièce']),
  category:                z.string().optional(),
  reference_package_price: z.number().positive().optional(),
  reference_package_size:  z.number().positive().optional(),
}).refine(
  d => (d.reference_package_price == null) === (d.reference_package_size == null),
  { message: 'reference_package_price et reference_package_size doivent être fournis ensemble ou pas du tout' }
)
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
cd "/Users/anthony/Super pouvoir/Alloflow" && npm run test:run -- --reporter=verbose src/lib/__tests__/catalogue-validations.test.ts
```

Expected: 5 PASS

- [ ] **Step 5: Fix publish route error message for `.refine()` failures**

In `src/app/api/franchise/catalogue/[id]/publish/route.ts`, find the ingredient validation block (around line 50-53) and update the error extraction:

```ts
if (item.type === 'ingredient') {
  const result = ingredientPayloadSchema.safeParse(payload)
  if (!result.success) return NextResponse.json({
    error: result.error.flatten().fieldErrors.unit?.[0]
      ?? result.error.flatten().formErrors[0]
      ?? 'Payload ingrédient invalide'
  }, { status: 422 })
}
```

- [ ] **Step 6: TypeScript check**

```bash
cd "/Users/anthony/Super pouvoir/Alloflow" && npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors related to `ingredientPayloadSchema`

- [ ] **Step 7: Commit**

```bash
cd "/Users/anthony/Super pouvoir/Alloflow" && git add src/lib/validations/catalogue.ts src/app/api/franchise/catalogue/[id]/publish/route.ts src/lib/__tests__/catalogue-validations.test.ts && git commit -m "feat: extend ingredientPayloadSchema with reference price fields"
```

---

### Task 2: Update `CatalogueItemForm` — reference price UI

**Files:**
- Modify: `src/app/dashboard/franchise/catalogue/_components/catalogue-item-form.tsx`

No API changes needed — the PATCH route already passes `payload` through from `buildPayload()`.

- [ ] **Step 1: Create test directory and write logic tests**

```bash
mkdir -p "/Users/anthony/Super pouvoir/Alloflow/src/app/dashboard/franchise/catalogue/_components/__tests__"
```

The form is a client component — test the pure logic functions in isolation.

```ts
// src/app/dashboard/franchise/catalogue/_components/__tests__/catalogue-item-form.logic.test.ts
import { describe, it, expect } from 'vitest'

// Copy-paste the functions under test (they'll be extracted from the component after this test passes)
function initIngredientPayload(payload: Record<string, unknown>) {
  return {
    unit:                    (payload?.unit as string) ?? 'kg',
    category:                (payload?.category as string) ?? '',
    reference_package_price: (payload?.reference_package_price as number | undefined) ?? '' as number | '',
    reference_package_size:  (payload?.reference_package_size as number | undefined) ?? '' as number | '',
  }
}

function buildIngredientPayload(ingPayload: { unit: string; category: string; reference_package_price: number | ''; reference_package_size: number | '' }) {
  const refPrice = Number(ingPayload.reference_package_price)
  const refSize  = Number(ingPayload.reference_package_size)
  const hasRef   = refPrice > 0 && refSize > 0
  return {
    unit: ingPayload.unit,
    ...(ingPayload.category ? { category: ingPayload.category } : {}),
    ...(hasRef ? { reference_package_price: refPrice, reference_package_size: refSize } : {}),
  }
}

describe('initIngredientPayload', () => {
  it('reads reference price from existing payload', () => {
    const result = initIngredientPayload({ unit: 'ml', reference_package_price: 7.45, reference_package_size: 750 })
    expect(result.reference_package_price).toBe(7.45)
    expect(result.reference_package_size).toBe(750)
  })

  it('defaults to empty string when no reference price', () => {
    const result = initIngredientPayload({ unit: 'kg' })
    expect(result.reference_package_price).toBe('')
    expect(result.reference_package_size).toBe('')
  })
})

describe('buildIngredientPayload', () => {
  it('includes reference price when both fields > 0', () => {
    const result = buildIngredientPayload({ unit: 'ml', category: '', reference_package_price: 7.45, reference_package_size: 750 })
    expect(result.reference_package_price).toBe(7.45)
    expect(result.reference_package_size).toBe(750)
  })

  it('omits reference price when one field is empty string', () => {
    const result = buildIngredientPayload({ unit: 'ml', category: '', reference_package_price: '', reference_package_size: 750 })
    expect('reference_package_price' in result).toBe(false)
    expect('reference_package_size' in result).toBe(false)
  })

  it('omits reference price when both empty', () => {
    const result = buildIngredientPayload({ unit: 'ml', category: '', reference_package_price: '', reference_package_size: '' })
    expect('reference_package_price' in result).toBe(false)
  })
})
```

- [ ] **Step 2: Run tests — verify they pass (logic is correct)**

```bash
cd "/Users/anthony/Super pouvoir/Alloflow" && npm run test:run -- --reporter=verbose "src/app/dashboard/franchise/catalogue/_components/__tests__/catalogue-item-form.logic.test.ts"
```

Expected: PASS (these are pure function tests, no component needed)

- [ ] **Step 3: Update `catalogue-item-form.tsx`**

**3a. Add `IngPayload` type** (file-local, insert just before `function initIngredientPayload` at line 25, do NOT export — this is internal to the form file):

```ts
type IngPayload = {
  unit: string
  category: string
  reference_package_price: number | ''
  reference_package_size:  number | ''
}
```

**3b. Update `initIngredientPayload`** — replace the existing function using its signature as the anchor:

Current code to replace:
```ts
function initIngredientPayload(payload: Record<string, unknown>) {
  return { unit: (payload?.unit as string) ?? 'kg', category: (payload?.category as string) ?? '' }
}
```

```ts
function initIngredientPayload(payload: Record<string, unknown>): IngPayload {
  return {
    unit:                    (payload?.unit as string) ?? 'kg',
    category:                (payload?.category as string) ?? '',
    reference_package_price: (payload?.reference_package_price as number | undefined) ?? '',
    reference_package_size:  (payload?.reference_package_size as number | undefined) ?? '',
  }
}
```

**3c. Update `useState` call** — find this line by its content (not line number, since earlier steps shift lines):

Find:
```ts
const [ingPayload, setIngPayload] = useState(() => initIngredientPayload(form.payload))
```

Replace with:
```ts
const [ingPayload, setIngPayload] = useState<IngPayload>(() => initIngredientPayload(form.payload))
```

**3d. Update `buildPayload`** (line 64 — replace the ingredient branch):

```ts
if (form.type === 'ingredient') {
  const refPrice = Number(ingPayload.reference_package_price)
  const refSize  = Number(ingPayload.reference_package_size)
  const hasRef   = refPrice > 0 && refSize > 0
  return {
    unit: ingPayload.unit,
    ...(ingPayload.category ? { category: ingPayload.category } : {}),
    ...(hasRef ? { reference_package_price: refPrice, reference_package_size: refSize } : {}),
  }
}
```

**3e. Add reference price UI** — inside `{form.type === 'ingredient' && (...)}`, after the existing Unité/Catégorie `grid grid-cols-2` div, add:

```tsx
<div className="grid grid-cols-2 gap-3">
  <div>
    <label className={labelCls}>Prix du package (€)</label>
    <input type="number" step="0.01" min="0" style={inputStyle}
      value={ingPayload.reference_package_price}
      onChange={e => setIngPayload(p => ({ ...p, reference_package_price: e.target.value === '' ? '' : Number(e.target.value) }))}
      placeholder="Ex: 7.45" />
  </div>
  <div>
    <label className={labelCls}>Contenance ({ingPayload.unit})</label>
    <input type="number" step="1" min="0" style={inputStyle}
      value={ingPayload.reference_package_size}
      onChange={e => setIngPayload(p => ({ ...p, reference_package_size: e.target.value === '' ? '' : Number(e.target.value) }))}
      placeholder={`Ex: 750`} />
  </div>
</div>
{Number(ingPayload.reference_package_price) > 0 && Number(ingPayload.reference_package_size) > 0 && (
  <p className="text-xs text-[var(--text4)] -mt-1">
    = {(Number(ingPayload.reference_package_price) / Number(ingPayload.reference_package_size)).toFixed(4)} €/{ingPayload.unit}
  </p>
)}
```

- [ ] **Step 4: TypeScript check**

```bash
cd "/Users/anthony/Super pouvoir/Alloflow" && npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors in `catalogue-item-form.tsx`

- [ ] **Step 5: Commit**

```bash
cd "/Users/anthony/Super pouvoir/Alloflow" && git add "src/app/dashboard/franchise/catalogue/_components/catalogue-item-form.tsx" "src/app/dashboard/franchise/catalogue/_components/__tests__/catalogue-item-form.logic.test.ts" && git commit -m "feat: add reference price fields to CatalogueItemForm for ingredients"
```

---

### Task 3: Update `CatalogueReseauPageClient` — filter diff + display reference price

**Files:**
- Modify: `src/app/dashboard/catalogue-reseau/_components/catalogue-reseau-page-client.tsx`
- Test: `src/app/dashboard/catalogue-reseau/_components/__tests__/filter-payload.test.ts` (create)

- [ ] **Step 1: Create test directory and write tests**

```bash
mkdir -p "/Users/anthony/Super pouvoir/Alloflow/src/app/dashboard/catalogue-reseau/_components/__tests__"
```

```ts
// src/app/dashboard/catalogue-reseau/_components/__tests__/filter-payload.test.ts
import { describe, it, expect } from 'vitest'

const HIDDEN_PAYLOAD_KEYS = ['reference_package_price', 'reference_package_size']

function filterPayloadForDisplay(payload: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(payload).filter(([k]) => !HIDDEN_PAYLOAD_KEYS.includes(k))
  )
}

describe('filterPayloadForDisplay', () => {
  it('removes reference price keys', () => {
    expect(filterPayloadForDisplay({
      unit: 'ml', reference_package_price: 7.45, reference_package_size: 750,
    })).toEqual({ unit: 'ml' })
  })

  it('leaves other keys untouched', () => {
    expect(filterPayloadForDisplay({ unit: 'kg', category: 'Farines' }))
      .toEqual({ unit: 'kg', category: 'Farines' })
  })
})
```

- [ ] **Step 2: Run tests — verify they pass**

```bash
cd "/Users/anthony/Super pouvoir/Alloflow" && npm run test:run -- --reporter=verbose "src/app/dashboard/catalogue-reseau/_components/__tests__/filter-payload.test.ts"
```

Expected: PASS

- [ ] **Step 3: Update `catalogue-reseau-page-client.tsx`**

**3a. Add `HIDDEN_PAYLOAD_KEYS` and `filterPayloadForDisplay`** near the top of the file (after imports, before the component):

```ts
const HIDDEN_PAYLOAD_KEYS = ['reference_package_price', 'reference_package_size']

function filterPayloadForDisplay(payload: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(payload).filter(([k]) => !HIDDEN_PAYLOAD_KEYS.includes(k))
  )
}
```

**3b. Update diff viewer** — find the two `JSON.stringify` calls in the diff section (around lines 206 and 212) and wrap with the filter + null guard:

```tsx
{JSON.stringify(filterPayloadForDisplay(cat.network_catalog_item_data.previous_payload ?? {}), null, 2)}
// ...
{JSON.stringify(filterPayloadForDisplay(cat.network_catalog_item_data.payload ?? {}), null, 2)}
```

**3c. Add reference price display for ingredients** — in `catalogue-reseau-page-client.tsx`, find this exact block (around line 139-141):

```tsx
{cat.type === 'ingredient' && cat.network_catalog_item_data?.payload?.unit != null && (
  <p className="text-xs text-[var(--text4)]">{String(cat.network_catalog_item_data.payload.unit)}{cat.network_catalog_item_data.payload.category ? ` · ${String(cat.network_catalog_item_data.payload.category)}` : ''}</p>
)}
```

Insert the following **immediately after** (still inside the `<div>` wrapping the name):

```tsx
{cat.type === 'ingredient' && (() => {
  const p = cat.network_catalog_item_data?.payload as Record<string, unknown> | undefined
  const price = p?.reference_package_price as number | undefined
  const size  = p?.reference_package_size  as number | undefined
  if (!price || !size) return null
  return (
    <p className="text-xs text-[var(--text4)] mt-0.5">
      Réf. siège : {(price / size).toFixed(4)} €/{p?.unit as string}
    </p>
  )
})()}
```

- [ ] **Step 4: TypeScript check**

```bash
cd "/Users/anthony/Super pouvoir/Alloflow" && npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors in `catalogue-reseau-page-client.tsx`

- [ ] **Step 5: Commit**

```bash
cd "/Users/anthony/Super pouvoir/Alloflow" && git add "src/app/dashboard/catalogue-reseau/_components/catalogue-reseau-page-client.tsx" "src/app/dashboard/catalogue-reseau/_components/__tests__/filter-payload.test.ts" && git commit -m "feat: filter reference price from diff view + display ref price on ingredient rows"
```

---

### Task 4: Update onboarding to pre-fill `unit_price`

**Files:**
- Modify: `src/app/api/franchise/establishments/route.ts`
- Test: `src/app/api/franchise/establishments/__tests__/onboarding-stock-seed.test.ts` (create)

- [ ] **Step 1: Create test directory and write tests**

```bash
mkdir -p "/Users/anthony/Super pouvoir/Alloflow/src/app/api/franchise/establishments/__tests__"
```

```ts
// src/app/api/franchise/establishments/__tests__/onboarding-stock-seed.test.ts
import { describe, it, expect } from 'vitest'

// Extract the mapping logic as a pure function to test in isolation
type IngData = {
  id: string
  name: string
  network_catalog_item_data: { payload: Record<string, unknown> } | Array<{ payload: Record<string, unknown> }> | null
}

function buildStockRow(ing: IngData, establishmentId: string) {
  const data = Array.isArray(ing.network_catalog_item_data)
    ? ing.network_catalog_item_data[0]
    : ing.network_catalog_item_data
  const payload = data?.payload as {
    unit?: string
    reference_package_price?: number
    reference_package_size?: number
  } | undefined

  const refPrice = payload?.reference_package_price
  const refSize  = payload?.reference_package_size
  const unit_price =
    refPrice && refSize
      ? Math.round(refPrice / refSize * 1e6) / 1e6
      : undefined

  return {
    establishment_id: establishmentId,
    name:             ing.name,
    unit:             payload?.unit ?? 'pièce',
    quantity:         0,
    alert_threshold:  0,
    active:           true,
    ...(unit_price !== undefined ? { unit_price } : {}),
  }
}

describe('buildStockRow', () => {
  const estId = 'est-1'

  it('sets unit_price when both reference price fields are present', () => {
    const row = buildStockRow({
      id: '1', name: 'Sirop vanille',
      network_catalog_item_data: { payload: { unit: 'ml', reference_package_price: 7.45, reference_package_size: 750 } },
    }, estId)
    expect(row.unit_price).toBe(Math.round(7.45 / 750 * 1e6) / 1e6)
    expect(row.unit).toBe('ml')
  })

  it('omits unit_price when no reference price', () => {
    const row = buildStockRow({
      id: '2', name: 'Farine',
      network_catalog_item_data: { payload: { unit: 'kg' } },
    }, estId)
    expect('unit_price' in row).toBe(false)
  })

  it('omits unit_price when only one field present', () => {
    const row = buildStockRow({
      id: '3', name: 'Sel',
      network_catalog_item_data: { payload: { unit: 'g', reference_package_price: 1.5 } },
    }, estId)
    expect('unit_price' in row).toBe(false)
  })

  it('handles array-shaped network_catalog_item_data', () => {
    const row = buildStockRow({
      id: '4', name: 'Sucre',
      network_catalog_item_data: [{ payload: { unit: 'kg', reference_package_price: 2.0, reference_package_size: 1000 } }],
    }, estId)
    expect(row.unit_price).toBeDefined()
    expect(row.unit).toBe('kg')
  })

  it('handles null network_catalog_item_data', () => {
    const row = buildStockRow({ id: '5', name: 'Eau', network_catalog_item_data: null }, estId)
    expect(row.unit).toBe('pièce')
    expect('unit_price' in row).toBe(false)
  })
})
```

- [ ] **Step 2: Run tests — verify the logic is correct**

```bash
cd "/Users/anthony/Super pouvoir/Alloflow" && npm run test:run -- --reporter=verbose "src/app/api/franchise/establishments/__tests__/onboarding-stock-seed.test.ts"
```

Expected: PASS — `buildStockRow` is defined inline in the test file, so all 5 tests pass immediately. This confirms the target logic is correct before we apply the same logic to the actual route.

- [ ] **Step 3: Update `establishments/route.ts` Step 7**

In the `stockRows` `.map()` (around lines 216-228), update the type annotation and add `unit_price` computation:

Change the map callback to:
```ts
(networkIngredients as Array<{
  id: string
  name: string
  network_catalog_item_data: { payload: { unit?: string; reference_package_price?: number; reference_package_size?: number } } | Array<{ payload: { unit?: string; reference_package_price?: number; reference_package_size?: number } }> | null
}>).map(ing => {
  const data = Array.isArray(ing.network_catalog_item_data)
    ? ing.network_catalog_item_data[0]
    : ing.network_catalog_item_data
  const payload = data?.payload

  const refPrice = payload?.reference_package_price
  const refSize  = payload?.reference_package_size
  const unit_price =
    refPrice && refSize
      ? Math.round(refPrice / refSize * 1e6) / 1e6
      : undefined

  return {
    establishment_id: establishmentId,
    name:             ing.name,
    unit:             payload?.unit ?? 'pièce',
    quantity:         0,
    alert_threshold:  0,
    active:           true,
    ...(unit_price !== undefined ? { unit_price } : {}),
  }
})
```

- [ ] **Step 4: TypeScript check**

```bash
cd "/Users/anthony/Super pouvoir/Alloflow" && npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors in `establishments/route.ts`

- [ ] **Step 5: Run all tests**

```bash
cd "/Users/anthony/Super pouvoir/Alloflow" && npm run test:run
```

Expected: all tests pass

- [ ] **Step 6: Commit**

```bash
cd "/Users/anthony/Super pouvoir/Alloflow" && git add "src/app/api/franchise/establishments/route.ts" "src/app/api/franchise/establishments/__tests__/onboarding-stock-seed.test.ts" && git commit -m "feat: pre-fill unit_price at onboarding from network ingredient reference price"
```

---

### Task 5: Final TypeScript check + full test run

**Files:** no changes

- [ ] **Step 1: Full TypeScript check**

```bash
cd "/Users/anthony/Super pouvoir/Alloflow" && npx tsc --noEmit 2>&1
```

Expected: zero errors

- [ ] **Step 2: Full test suite**

```bash
cd "/Users/anthony/Super pouvoir/Alloflow" && npm run test:run
```

Expected: all tests pass, no failures

- [ ] **Step 3: If TypeScript errors, fix them before proceeding**

Common issues to check:
- `IngPayload` type propagation in `catalogue-item-form.tsx`
- `filterPayloadForDisplay` null guard in `catalogue-reseau-page-client.tsx`
- `unit_price` spread on `stock_items` upsert (confirm column exists in DB types or use `as any` with comment)

- [ ] **Step 4: Commit if any fixes were needed**

```bash
cd "/Users/anthony/Super pouvoir/Alloflow" && git add src/lib/validations/catalogue.ts "src/app/dashboard/franchise/catalogue/_components/catalogue-item-form.tsx" "src/app/dashboard/catalogue-reseau/_components/catalogue-reseau-page-client.tsx" "src/app/api/franchise/establishments/route.ts" && git commit -m "fix: TypeScript cleanup for reference price feature"
```
