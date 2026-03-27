# Sprint 5 — Recettes → Produit POS Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the complete Recettes module: recipe CRUD with dynamic ingredient list and live food cost, a "Vendu en caisse" toggle that atomically creates/updates a linked POS product, and a FoodCostIndicator component.

**Architecture:** Follow the established dashboard pattern (`page.tsx` SSR → `*-page-client.tsx` client shell → focused `_components/`). API routes use `createClient()` server Supabase client, `establishment_id` from `profiles`, Zod validation, `NextResponse.json`. Recipe + Product creation is sequential with manual rollback (delete recipe if product insert fails). Local `useState` — no external state lib.

**Tech Stack:** Next.js 16 App Router, Supabase PostgreSQL, TypeScript, Tailwind CSS, Zod, Vitest + Testing Library

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `supabase/migrations/20260327000003_recipes_v2.sql` | Extend recipes + add recipe_ingredients + recipe_id on products |
| Create | `src/lib/validations/recipe.ts` | Zod schemas for recipe CRUD |
| Create | `src/app/api/recipes/route.ts` | GET list (with food_cost) + POST create (atomic w/ product) |
| Create | `src/app/api/recipes/[id]/route.ts` | PATCH update (propagate to product) + DELETE soft delete |
| Create | `src/app/api/recipe-ingredients/[recipeId]/route.ts` | GET list + POST add ingredient |
| Create | `src/app/api/recipe-ingredients/[recipeId]/[id]/route.ts` | PATCH update + DELETE ingredient |
| Modify | `src/app/dashboard/_components/sidebar.tsx` | Add Recettes nav item |
| Create | `src/app/dashboard/recettes/page.tsx` | SSR page — fetches recipes |
| Create | `src/app/dashboard/recettes/_components/types.ts` | Local TS types |
| Create | `src/app/dashboard/recettes/_components/recipes-page-client.tsx` | Client shell with recipe cards |
| Create | `src/app/dashboard/recettes/_components/food-cost-indicator.tsx` | Reusable food cost display |
| Create | `src/app/dashboard/recettes/_components/recipe-form.tsx` | Create/edit modal with ingredient list + POS toggle |

---

## Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/20260327000003_recipes_v2.sql`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/20260327000003_recipes_v2.sql

-- 1. Extend recipes table
alter table public.recipes
  add column if not exists is_internal    boolean not null default true,
  add column if not exists category       text,
  add column if not exists description    text,
  add column if not exists portion        text,       -- ex: "8 portions", "1 assiette"
  add column if not exists active         boolean not null default true,
  add column if not exists created_at     timestamptz not null default now();

-- Backfill existing rows (if any)
update public.recipes set is_internal = true where is_internal is null;

-- 2. Create recipe_ingredients
create table public.recipe_ingredients (
  id          uuid primary key default gen_random_uuid(),
  recipe_id   uuid not null references public.recipes(id) on delete cascade,
  name        text not null,
  quantity    numeric(10, 4) not null check (quantity > 0),
  unit        text not null,
  unit_cost   numeric(10, 4) not null default 0,
  sort_order  int not null default 0
);

create index idx_recipe_ingredients_recipe on public.recipe_ingredients(recipe_id, sort_order);

alter table public.recipe_ingredients enable row level security;

create policy "recipe_ingredients_by_establishment"
  on public.recipe_ingredients for all
  using (
    recipe_id in (
      select id from public.recipes
      where establishment_id in (
        select establishment_id from public.profiles where id = auth.uid()
      )
    )
  );

-- 3. Add recipe_id to products
alter table public.products
  add column if not exists recipe_id uuid references public.recipes(id) on delete set null;

-- RLS on recipes (was enabled, add policy if missing)
do $$ begin
  if not exists (
    select 1 from pg_policies where tablename = 'recipes' and policyname = 'recipes_by_establishment'
  ) then
    create policy "recipes_by_establishment"
      on public.recipes for all
      using (
        establishment_id in (
          select establishment_id from public.profiles where id = auth.uid()
        )
      );
  end if;
end $$;
```

- [ ] **Step 2: Apply migration**

```bash
cd "/Users/anthony/Super pouvoir/Alloflow"
npx supabase db push
```

If Supabase not running locally, skip — the file is committed.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260327000003_recipes_v2.sql
git commit -m "feat(db): extend recipes + add recipe_ingredients + recipe_id on products"
```

---

## Task 2: Zod Validation Schemas

**Files:**
- Create: `src/lib/validations/recipe.ts`

- [ ] **Step 1: Write schemas**

```typescript
// src/lib/validations/recipe.ts
import { z } from 'zod'

export const ingredientSchema = z.object({
  id:         z.string().uuid().optional(),   // optional — omit for new ingredients
  name:       z.string().min(1).max(100),
  quantity:   z.number().positive(),
  unit:       z.string().min(1).max(20),
  unit_cost:  z.number().min(0).default(0),
  sort_order: z.number().int().default(0),
})

export const posParamsSchema = z.object({
  price:       z.number().positive('Le prix est requis'),
  tva_rate:    z.number().refine(v => [5.5, 10, 20].includes(v), 'TVA invalide'),
  category_id: z.string().uuid().nullable().optional(),
})

export const createRecipeSchema = z.object({
  title:       z.string().min(1).max(150),
  description: z.string().max(500).nullable().optional(),
  category:    z.string().max(80).nullable().optional(),
  portion:     z.string().max(50).nullable().optional(),
  is_internal: z.boolean().default(true),
  ingredients: z.array(ingredientSchema).default([]),
  pos:         posParamsSchema.nullable().optional(), // required if is_internal = false
}).refine(
  data => data.is_internal || (data.pos != null && data.pos.price > 0),
  { message: 'Le prix de vente est requis pour une recette POS', path: ['pos', 'price'] }
)

export const updateRecipeSchema = z.object({
  title:       z.string().min(1).max(150).optional(),
  description: z.string().max(500).nullable().optional(),
  category:    z.string().max(80).nullable().optional(),
  portion:     z.string().max(50).nullable().optional(),
  is_internal: z.boolean().optional(),
  pos:         posParamsSchema.nullable().optional(),
})

export const createIngredientSchema = z.object({
  name:       z.string().min(1).max(100),
  quantity:   z.number().positive(),
  unit:       z.string().min(1).max(20),
  unit_cost:  z.number().min(0).default(0),
  sort_order: z.number().int().default(0),
})

export const updateIngredientSchema = createIngredientSchema.partial()

export type CreateRecipeInput    = z.infer<typeof createRecipeSchema>
export type UpdateRecipeInput    = z.infer<typeof updateRecipeSchema>
export type CreateIngredientInput = z.infer<typeof createIngredientSchema>
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/validations/recipe.ts
git commit -m "feat(recettes): add Zod validation schemas"
```

---

## Task 3: API — Recipes (GET + POST)

**Files:**
- Create: `src/app/api/recipes/route.ts`

- [ ] **Step 1: Write route**

```typescript
// src/app/api/recipes/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createRecipeSchema } from '@/lib/validations/recipe'

async function getEstablishmentId(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data } = await supabase
    .from('profiles')
    .select('establishment_id')
    .eq('id', userId)
    .single()
  return data?.establishment_id ?? null
}

export async function GET(_req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const establishmentId = await getEstablishmentId(supabase, user.id)
  if (!establishmentId) return NextResponse.json({ error: 'Établissement non trouvé' }, { status: 400 })

  const { data: recipes, error } = await supabase
    .from('recipes')
    .select(`
      *,
      ingredients:recipe_ingredients(id, name, quantity, unit, unit_cost, sort_order),
      product:products!products_recipe_id_fkey(id, name, price, tva_rate, category_id, is_active)
    `)
    .eq('establishment_id', establishmentId)
    .eq('active', true)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Compute food_cost for each recipe
  const enriched = (recipes ?? []).map(r => {
    const foodCostAmount = (r.ingredients ?? []).reduce(
      (sum: number, i: { quantity: number; unit_cost: number }) => sum + i.quantity * i.unit_cost,
      0
    )
    const price = r.product?.price ?? null
    const foodCostPct = price && price > 0
      ? Math.round((foodCostAmount / price) * 1000) / 10  // one decimal
      : null

    return { ...r, food_cost_amount: foodCostAmount, food_cost_pct: foodCostPct }
  })

  return NextResponse.json({ recipes: enriched })
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const establishmentId = await getEstablishmentId(supabase, user.id)
  if (!establishmentId) return NextResponse.json({ error: 'Établissement non trouvé' }, { status: 400 })

  const body = await req.json()
  const result = createRecipeSchema.safeParse(body)
  if (!result.success) return NextResponse.json({ error: result.error.flatten() }, { status: 400 })

  const { title, description, category, portion, is_internal, ingredients, pos } = result.data

  // 1. Create recipe
  const { data: recipe, error: recipeError } = await supabase
    .from('recipes')
    .insert({
      establishment_id: establishmentId,
      title,
      description:  description ?? null,
      category:     category ?? null,
      portion:      portion ?? null,
      is_internal,
    })
    .select()
    .single()

  if (recipeError) return NextResponse.json({ error: recipeError.message }, { status: 500 })

  // 2. Insert ingredients
  if (ingredients.length > 0) {
    await supabase.from('recipe_ingredients').insert(
      ingredients.map((ing, idx) => ({
        recipe_id:  recipe.id,
        name:       ing.name,
        quantity:   ing.quantity,
        unit:       ing.unit,
        unit_cost:  ing.unit_cost,
        sort_order: ing.sort_order ?? idx,
      }))
    )
  }

  // 3. If POS, create linked product (manual rollback on failure)
  if (!is_internal && pos) {
    const { error: productError } = await supabase
      .from('products')
      .insert({
        establishment_id: establishmentId,
        name:             title,
        price:            pos.price,
        tva_rate:         pos.tva_rate,
        category_id:      pos.category_id ?? null,
        recipe_id:        recipe.id,
        category:         'autre',  // legacy enum required — always 'autre' for recipe products
        is_active:        true,
      })

    if (productError) {
      // Rollback: soft-delete the recipe
      await supabase.from('recipes').update({ active: false }).eq('id', recipe.id)
      return NextResponse.json({ error: 'Erreur création produit POS: ' + productError.message }, { status: 500 })
    }
  }

  return NextResponse.json(recipe, { status: 201 })
}
```

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/recipes/route.ts
git commit -m "feat(recettes): add GET + POST /api/recipes with food_cost + atomic product creation"
```

---

## Task 4: API — Recipes ([id] PATCH + DELETE)

**Files:**
- Create: `src/app/api/recipes/[id]/route.ts`

- [ ] **Step 1: Write route**

```typescript
// src/app/api/recipes/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { updateRecipeSchema } from '@/lib/validations/recipe'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const result = updateRecipeSchema.safeParse(body)
  if (!result.success) return NextResponse.json({ error: result.error.flatten() }, { status: 400 })

  const { title, description, category, portion, is_internal, pos } = result.data

  // Build recipe update payload
  const recipeUpdate: Record<string, unknown> = {}
  if (title       !== undefined) recipeUpdate.title       = title
  if (description !== undefined) recipeUpdate.description = description
  if (category    !== undefined) recipeUpdate.category    = category
  if (portion     !== undefined) recipeUpdate.portion     = portion
  if (is_internal !== undefined) recipeUpdate.is_internal = is_internal

  const { data: recipe, error: recipeError } = await supabase
    .from('recipes')
    .update(recipeUpdate)
    .eq('id', id)
    .select('*, product:products!products_recipe_id_fkey(id)')
    .single()

  if (recipeError) return NextResponse.json({ error: recipeError.message }, { status: 500 })

  // Propagate name and price to linked product
  const linkedProductId = recipe.product?.[0]?.id ?? null

  if (linkedProductId) {
    const productUpdate: Record<string, unknown> = {}
    if (title) productUpdate.name = title
    if (pos?.price)       productUpdate.price       = pos.price
    if (pos?.tva_rate)    productUpdate.tva_rate    = pos.tva_rate
    if (pos?.category_id !== undefined) productUpdate.category_id = pos.category_id

    // If toggling to internal: soft-delete the product
    if (is_internal === true) {
      productUpdate.is_active = false
    }
    // If toggling back to POS: re-activate
    if (is_internal === false) {
      productUpdate.is_active = true
    }

    if (Object.keys(productUpdate).length > 0) {
      await supabase.from('products').update(productUpdate).eq('id', linkedProductId)
    }
  }

  // If switching from internal → POS and no product exists yet, create it
  if (is_internal === false && !linkedProductId && pos) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('establishment_id')
      .eq('id', user.id)
      .single()

    if (profile?.establishment_id) {
      await supabase.from('products').insert({
        establishment_id: profile.establishment_id,
        name:             recipe.title,
        price:            pos.price,
        tva_rate:         pos.tva_rate,
        category_id:      pos.category_id ?? null,
        recipe_id:        id,
        category:         'autre',
        is_active:        true,
      })
    }
  }

  return NextResponse.json(recipe)
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Soft delete recipe
  const { error } = await supabase
    .from('recipes')
    .update({ active: false })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Soft delete linked product if any
  await supabase
    .from('products')
    .update({ is_active: false, deleted_at: new Date().toISOString() })
    .eq('recipe_id', id)

  return NextResponse.json({ success: true })
}
```

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/recipes/[id]/route.ts
git commit -m "feat(recettes): add PATCH + DELETE /api/recipes/[id] with product propagation"
```

---

## Task 5: API — Recipe Ingredients CRUD

**Files:**
- Create: `src/app/api/recipe-ingredients/[recipeId]/route.ts`
- Create: `src/app/api/recipe-ingredients/[recipeId]/[id]/route.ts`

- [ ] **Step 1: Write collection route**

```typescript
// src/app/api/recipe-ingredients/[recipeId]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createIngredientSchema } from '@/lib/validations/recipe'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ recipeId: string }> }) {
  const { recipeId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('recipe_ingredients')
    .select('*')
    .eq('recipe_id', recipeId)
    .order('sort_order')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ingredients: data ?? [] })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ recipeId: string }> }) {
  const { recipeId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const result = createIngredientSchema.safeParse(body)
  if (!result.success) return NextResponse.json({ error: result.error.flatten() }, { status: 400 })

  const { data, error } = await supabase
    .from('recipe_ingredients')
    .insert({ recipe_id: recipeId, ...result.data })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
```

- [ ] **Step 2: Write item route**

```typescript
// src/app/api/recipe-ingredients/[recipeId]/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { updateIngredientSchema } from '@/lib/validations/recipe'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ recipeId: string; id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const result = updateIngredientSchema.safeParse(body)
  if (!result.success) return NextResponse.json({ error: result.error.flatten() }, { status: 400 })

  const { data, error } = await supabase
    .from('recipe_ingredients')
    .update(result.data)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ recipeId: string; id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { error } = await supabase
    .from('recipe_ingredients')
    .delete()
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
```

- [ ] **Step 3: TypeScript check**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add src/app/api/recipe-ingredients/
git commit -m "feat(recettes): add recipe-ingredients CRUD API"
```

---

## Task 6: Sidebar + Types + SSR Page

**Files:**
- Modify: `src/app/dashboard/_components/sidebar.tsx`
- Create: `src/app/dashboard/recettes/_components/types.ts`
- Create: `src/app/dashboard/recettes/page.tsx`

- [ ] **Step 1: Add Recettes to sidebar**

In `sidebar.tsx`, add in `NAV_ITEMS` after Produits:
```typescript
{ href: '/dashboard/recettes', label: 'Recettes', icon: '📖' },
```

- [ ] **Step 2: Write types**

```typescript
// src/app/dashboard/recettes/_components/types.ts
export interface RecipeIngredient {
  id: string
  recipe_id: string
  name: string
  quantity: number
  unit: string
  unit_cost: number
  sort_order: number
}

export interface RecipeProduct {
  id: string
  name: string
  price: number
  tva_rate: number
  category_id: string | null
  is_active: boolean
}

export interface Recipe {
  id: string
  establishment_id: string
  title: string
  description: string | null
  category: string | null
  portion: string | null
  is_internal: boolean
  active: boolean
  created_at: string
  ingredients: RecipeIngredient[]
  product: RecipeProduct[] | null  // array from Supabase join; use [0] to access
  food_cost_amount: number
  food_cost_pct: number | null
}
```

- [ ] **Step 3: Write SSR page**

```typescript
// src/app/dashboard/recettes/page.tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { RecettesPageClient } from './_components/recettes-page-client'
import type { Recipe } from './_components/types'

export default async function RecettesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('establishment_id')
    .eq('id', user.id)
    .single()

  if (!profile?.establishment_id) redirect('/onboarding')

  const { data: recipes } = await supabase
    .from('recipes')
    .select(`
      *,
      ingredients:recipe_ingredients(id, name, quantity, unit, unit_cost, sort_order),
      product:products!products_recipe_id_fkey(id, name, price, tva_rate, category_id, is_active)
    `)
    .eq('establishment_id', profile.establishment_id)
    .eq('active', true)
    .order('created_at', { ascending: false })

  const enriched: Recipe[] = (recipes ?? []).map(r => {
    const foodCostAmount = (r.ingredients ?? []).reduce(
      (sum: number, i: { quantity: number; unit_cost: number }) => sum + i.quantity * i.unit_cost,
      0
    )
    const price = r.product?.[0]?.price ?? null
    const foodCostPct = price && price > 0
      ? Math.round((foodCostAmount / price) * 1000) / 10
      : null

    return { ...r, food_cost_amount: foodCostAmount, food_cost_pct: foodCostPct }
  })

  const { data: categories } = await supabase
    .from('categories')
    .select('id, name, color_hex, icon')
    .eq('establishment_id', profile.establishment_id)
    .order('sort_order')

  return <RecettesPageClient initialRecipes={enriched} categories={categories ?? []} />
}
```

- [ ] **Step 4: Commit**

```bash
git add src/app/dashboard/_components/sidebar.tsx \
        src/app/dashboard/recettes/_components/types.ts \
        src/app/dashboard/recettes/page.tsx
git commit -m "feat(recettes): add sidebar link + types + SSR page"
```

---

## Task 7: FoodCostIndicator Component

**Files:**
- Create: `src/app/dashboard/recettes/_components/food-cost-indicator.tsx`

- [ ] **Step 1: Write component**

```tsx
// src/app/dashboard/recettes/_components/food-cost-indicator.tsx
interface Props {
  amount: number         // food cost in €
  pct: number | null     // percentage (0-100)
  compact?: boolean      // true = single line, false = full with bar
}

export function FoodCostIndicator({ amount, pct, compact = false }: Props) {
  const color = pct === null ? 'text-[var(--text4)]'
    : pct < 30  ? 'text-green-400'
    : pct < 35  ? 'text-amber-400'
    : 'text-red-400'

  const barColor = pct === null ? 'bg-[var(--border)]'
    : pct < 30  ? 'bg-green-500'
    : pct < 35  ? 'bg-amber-500'
    : 'bg-red-500'

  if (compact) {
    return (
      <span className={`text-xs font-semibold ${color}`}>
        {pct !== null ? `Food cost ${pct}%` : `${amount.toFixed(2)} €`}
      </span>
    )
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-[var(--text4)]">Food cost</span>
        <span className={`font-bold ${color}`}>
          {pct !== null ? `${pct}%` : '—'} · {amount.toFixed(2)} €
        </span>
      </div>
      <div className="relative h-1.5 rounded-full bg-[var(--border)] overflow-hidden">
        {pct !== null && (
          <div
            className={`absolute left-0 top-0 h-full rounded-full ${barColor} transition-all`}
            style={{ width: `${Math.min(100, pct)}%` }}
          />
        )}
        {/* 35% threshold marker */}
        <div
          className="absolute top-0 h-full w-px bg-[var(--text4)]/40"
          style={{ left: '35%' }}
        />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/dashboard/recettes/_components/food-cost-indicator.tsx
git commit -m "feat(recettes): add FoodCostIndicator component"
```

---

## Task 8: RecettesPageClient

**Files:**
- Create: `src/app/dashboard/recettes/_components/recettes-page-client.tsx`

- [ ] **Step 1: Write component**

```tsx
// src/app/dashboard/recettes/_components/recettes-page-client.tsx
'use client'
import { useState } from 'react'
import { FoodCostIndicator } from './food-cost-indicator'
import { RecipeForm } from './recipe-form'
import type { Recipe } from './types'

interface Category { id: string; name: string; color_hex: string; icon: string | null }

interface Props {
  initialRecipes: Recipe[]
  categories: Category[]
}

export function RecettesPageClient({ initialRecipes, categories }: Props) {
  const [recipes, setRecipes] = useState(initialRecipes)
  const [showForm, setShowForm] = useState(false)
  const [editingRecipe, setEditingRecipe] = useState<Recipe | null>(null)
  const [filter, setFilter] = useState<'all' | 'pos' | 'internal'>('all')

  const filtered = recipes.filter(r =>
    filter === 'all' ? true
    : filter === 'pos' ? !r.is_internal
    : r.is_internal
  )

  const posCount      = recipes.filter(r => !r.is_internal).length
  const internalCount = recipes.filter(r => r.is_internal).length

  async function reload() {
    const res = await fetch('/api/recipes')
    const json = await res.json()
    setRecipes(json.recipes ?? [])
  }

  async function handleDelete(id: string) {
    if (!confirm('Supprimer cette recette ?')) return
    await fetch(`/api/recipes/${id}`, { method: 'DELETE' })
    await reload()
  }

  return (
    <div style={{ paddingLeft: '220px', minHeight: '100vh', background: 'var(--bg)' }}>
      <div className="max-w-6xl mx-auto p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-[var(--text1)]">Recettes</h1>
            <p className="text-xs text-[var(--text4)] mt-0.5">
              {posCount} vendue{posCount !== 1 ? 's' : ''} en caisse · {internalCount} interne{internalCount !== 1 ? 's' : ''}
            </p>
          </div>
          <button
            onClick={() => { setEditingRecipe(null); setShowForm(true) }}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-white"
            style={{ background: 'var(--blue)' }}
          >
            + Nouvelle recette
          </button>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-1 mb-5 border-b border-[var(--border)]">
          {[
            { key: 'all',      label: `Toutes (${recipes.length})` },
            { key: 'pos',      label: `🧾 Caisse POS (${posCount})` },
            { key: 'internal', label: `🔒 Internes (${internalCount})` },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setFilter(tab.key as typeof filter)}
              className={`px-4 py-2 text-sm font-medium rounded-t-lg border-b-2 transition-colors ${
                filter === tab.key
                  ? 'border-[var(--blue)] text-white'
                  : 'border-transparent text-[var(--text3)] hover:text-[var(--text2)]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Recipe cards */}
        {filtered.length === 0 ? (
          <div className="text-center py-20">
            <div className="text-5xl mb-4">📖</div>
            <div className="font-semibold text-[var(--text2)]">Aucune recette</div>
            <div className="text-sm text-[var(--text4)] mt-1">Commencez par créer votre première recette</div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map(recipe => (
              <div
                key={recipe.id}
                className="rounded-xl border border-[var(--border)] p-4 hover:border-[var(--blue)]/40 transition-colors"
                style={{ background: 'var(--surface)' }}
              >
                {/* Card header */}
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="min-w-0">
                    <h3 className="font-semibold text-[var(--text1)] truncate">{recipe.title}</h3>
                    {recipe.category && (
                      <span className="text-xs text-[var(--text4)]">{recipe.category}</span>
                    )}
                  </div>
                  <span className={`shrink-0 text-xs font-bold px-2 py-0.5 rounded ${
                    recipe.is_internal
                      ? 'bg-[var(--surface2)] text-[var(--text4)]'
                      : 'bg-blue-900/20 text-blue-400'
                  }`}>
                    {recipe.is_internal ? '🔒 Interne' : '🧾 POS'}
                  </span>
                </div>

                {/* Ingredients count */}
                <p className="text-xs text-[var(--text4)] mb-3">
                  {recipe.ingredients?.length ?? 0} ingrédient{(recipe.ingredients?.length ?? 0) !== 1 ? 's' : ''}
                  {recipe.portion ? ` · ${recipe.portion}` : ''}
                </p>

                {/* Food cost */}
                <div className="mb-3">
                  <FoodCostIndicator
                    amount={recipe.food_cost_amount}
                    pct={recipe.food_cost_pct}
                  />
                </div>

                {/* POS price */}
                {!recipe.is_internal && recipe.product?.[0] && (
                  <div className="flex items-center justify-between text-xs mb-3 px-2 py-1.5 rounded-lg" style={{ background: 'var(--bg)' }}>
                    <span className="text-[var(--text4)]">Prix de vente</span>
                    <span className="font-bold text-[var(--text1)]">{recipe.product[0].price.toFixed(2)} €</span>
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => { setEditingRecipe(recipe); setShowForm(true) }}
                    className="flex-1 py-1.5 rounded-lg text-xs font-medium border border-[var(--border)] text-[var(--text3)] hover:bg-[var(--surface2)]"
                  >
                    Modifier
                  </button>
                  <button
                    onClick={() => handleDelete(recipe.id)}
                    className="py-1.5 px-3 rounded-lg text-xs font-medium text-red-500/60 hover:text-red-400"
                  >
                    Suppr.
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <RecipeForm
        open={showForm}
        recipe={editingRecipe}
        categories={categories}
        onClose={() => setShowForm(false)}
        onSave={async () => { setShowForm(false); await reload() }}
      />
    </div>
  )
}
```

- [ ] **Step 2: Compile check**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/app/dashboard/recettes/_components/recettes-page-client.tsx
git commit -m "feat(recettes): add RecettesPageClient with recipe cards and filter tabs"
```

---

## Task 9: RecipeForm Modal

**Files:**
- Create: `src/app/dashboard/recettes/_components/recipe-form.tsx`

- [ ] **Step 1: Write form**

```tsx
// src/app/dashboard/recettes/_components/recipe-form.tsx
'use client'
import { useState, useEffect } from 'react'
import { FoodCostIndicator } from './food-cost-indicator'
import type { Recipe, RecipeIngredient } from './types'

interface Category { id: string; name: string; color_hex: string; icon: string | null }

interface IngredientLine {
  id?: string
  name: string
  quantity: string
  unit: string
  unit_cost: string
}

interface Props {
  open: boolean
  recipe: Recipe | null
  categories: Category[]
  onClose: () => void
  onSave: () => Promise<void>
}

const UNITS = ['kg', 'g', 'L', 'cL', 'mL', 'u.', 'pièce', 'boîte', 'sac']
const TVA_OPTIONS = [{ value: 5.5, label: '5,5%' }, { value: 10, label: '10%' }, { value: 20, label: '20%' }]

function toLine(i: RecipeIngredient): IngredientLine {
  return { id: i.id, name: i.name, quantity: String(i.quantity), unit: i.unit, unit_cost: String(i.unit_cost) }
}

export function RecipeForm({ open, recipe, categories, onClose, onSave }: Props) {
  const [title,       setTitle]       = useState('')
  const [description, setDescription] = useState('')
  const [category,    setCategory]    = useState('')
  const [portion,     setPortion]     = useState('')
  const [isInternal,  setIsInternal]  = useState(true)
  const [posPrice,    setPosPrice]    = useState('')
  const [posTva,      setPosTva]      = useState(10)
  const [posCatId,    setPosCatId]    = useState('')
  const [ingredients, setIngredients] = useState<IngredientLine[]>([])
  const [loading,     setLoading]     = useState(false)
  const [error,       setError]       = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setTitle(recipe?.title ?? '')
      setDescription(recipe?.description ?? '')
      setCategory(recipe?.category ?? '')
      setPortion(recipe?.portion ?? '')
      setIsInternal(recipe?.is_internal ?? true)
      setPosPrice(recipe?.product?.[0] ? String(recipe.product[0].price) : '')
      setPosTva(recipe?.product?.[0]?.tva_rate ?? 10)
      setPosCatId(recipe?.product?.[0]?.category_id ?? '')
      setIngredients(recipe?.ingredients?.map(toLine) ?? [])
      setError(null)
    }
  }, [open, recipe])

  if (!open) return null

  // Live food cost calculation
  const foodCostAmount = ingredients.reduce((sum, ing) => {
    const qty  = parseFloat(ing.quantity)  || 0
    const cost = parseFloat(ing.unit_cost) || 0
    return sum + qty * cost
  }, 0)
  const priceNum = parseFloat(posPrice) || 0
  const foodCostPct = !isInternal && priceNum > 0
    ? Math.round((foodCostAmount / priceNum) * 1000) / 10
    : null

  function addIngredient() {
    setIngredients(prev => [...prev, { name: '', quantity: '1', unit: 'kg', unit_cost: '0' }])
  }

  function updateIngredient(idx: number, field: keyof IngredientLine, value: string) {
    setIngredients(prev => prev.map((ing, i) => i === idx ? { ...ing, [field]: value } : ing))
  }

  function removeIngredient(idx: number) {
    setIngredients(prev => prev.filter((_, i) => i !== idx))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) { setError('Le nom est requis'); return }
    if (!isInternal && !posPrice) { setError('Le prix de vente est requis'); return }

    setLoading(true); setError(null)
    try {
      const payload = {
        title: title.trim(),
        description: description.trim() || null,
        category: category.trim() || null,
        portion: portion.trim() || null,
        is_internal: isInternal,
        ingredients: ingredients
          .filter(ing => ing.name.trim())
          .map((ing, idx) => ({
            ...(ing.id ? { id: ing.id } : {}),
            name:       ing.name.trim(),
            quantity:   parseFloat(ing.quantity) || 0,
            unit:       ing.unit,
            unit_cost:  parseFloat(ing.unit_cost) || 0,
            sort_order: idx,
          })),
        ...(!isInternal ? {
          pos: {
            price:       parseFloat(posPrice),
            tva_rate:    posTva,
            category_id: posCatId || null,
          }
        } : {}),
      }

      const url    = recipe ? `/api/recipes/${recipe.id}` : '/api/recipes'
      const method = recipe ? 'PATCH' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const j = await res.json()
        throw new Error(j.error ?? 'Erreur serveur')
      }
      await onSave()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-[var(--border)] p-6" style={{ background: 'var(--surface)' }}>
        <h2 className="text-base font-bold text-[var(--text1)] mb-5">
          {recipe ? 'Modifier la recette' : 'Nouvelle recette'}
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Informations générales */}
          <div>
            <label className="text-xs font-semibold text-[var(--text4)] uppercase tracking-wide">Nom de la recette *</label>
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Cookie chocolat"
              className="mt-1 w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-[var(--text1)] text-sm" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-[var(--text4)] uppercase tracking-wide">Catégorie recette</label>
              <input value={category} onChange={e => setCategory(e.target.value)} placeholder="Pâtisserie, Boisson..."
                className="mt-1 w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-[var(--text1)] text-sm" />
            </div>
            <div>
              <label className="text-xs font-semibold text-[var(--text4)] uppercase tracking-wide">Portion</label>
              <input value={portion} onChange={e => setPortion(e.target.value)} placeholder="8 portions"
                className="mt-1 w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-[var(--text1)] text-sm" />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-[var(--text4)] uppercase tracking-wide">Description</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2}
              className="mt-1 w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-[var(--text1)] text-sm resize-none" />
          </div>

          {/* Ingrédients */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-[var(--text4)] uppercase tracking-wide">Ingrédients</label>
              <button type="button" onClick={addIngredient}
                className="text-xs font-semibold" style={{ color: 'var(--blue)' }}>
                + Ajouter
              </button>
            </div>
            {ingredients.length === 0 && (
              <p className="text-xs text-[var(--text4)] text-center py-3 border border-dashed border-[var(--border)] rounded-lg">
                Aucun ingrédient — cliquez sur + Ajouter
              </p>
            )}
            <div className="space-y-2">
              {ingredients.map((ing, idx) => (
                <div key={idx} className="grid grid-cols-[1fr_80px_80px_80px_28px] gap-1.5 items-center">
                  <input value={ing.name} onChange={e => updateIngredient(idx, 'name', e.target.value)}
                    placeholder="Farine T55"
                    className="px-2 py-1.5 rounded-md border border-[var(--border)] bg-[var(--bg)] text-[var(--text1)] text-xs" />
                  <input type="number" step="0.001" value={ing.quantity} onChange={e => updateIngredient(idx, 'quantity', e.target.value)}
                    placeholder="Qté"
                    className="px-2 py-1.5 rounded-md border border-[var(--border)] bg-[var(--bg)] text-[var(--text1)] text-xs text-right" />
                  <select value={ing.unit} onChange={e => updateIngredient(idx, 'unit', e.target.value)}
                    className="px-2 py-1.5 rounded-md border border-[var(--border)] bg-[var(--bg)] text-[var(--text1)] text-xs">
                    {UNITS.map(u => <option key={u}>{u}</option>)}
                  </select>
                  <input type="number" step="0.001" value={ing.unit_cost} onChange={e => updateIngredient(idx, 'unit_cost', e.target.value)}
                    placeholder="0,00 €"
                    className="px-2 py-1.5 rounded-md border border-[var(--border)] bg-[var(--bg)] text-[var(--text1)] text-xs text-right" />
                  <button type="button" onClick={() => removeIngredient(idx)}
                    className="text-red-500/60 hover:text-red-400 text-sm font-bold text-center">×</button>
                </div>
              ))}
            </div>
            {ingredients.length > 0 && (
              <div className="mt-3 p-3 rounded-lg border border-[var(--border)]" style={{ background: 'var(--bg)' }}>
                <FoodCostIndicator amount={foodCostAmount} pct={foodCostPct} />
              </div>
            )}
          </div>

          {/* POS Toggle */}
          <div className="rounded-xl border border-[var(--border)] p-4" style={{ background: 'var(--bg)' }}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-[var(--text1)]">🧾 Vendu en caisse (POS)</p>
                <p className="text-xs text-[var(--text4)] mt-0.5">Expose ce plat dans la caisse enregistreuse</p>
              </div>
              <button
                type="button"
                onClick={() => setIsInternal(v => !v)}
                className={`relative w-11 h-6 rounded-full transition-colors ${!isInternal ? '' : 'bg-[var(--border)]'}`}
                style={{ background: !isInternal ? 'var(--blue)' : undefined }}
              >
                <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${!isInternal ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </div>

            {!isInternal && (
              <div className="mt-4 space-y-3 border-t border-[var(--border)] pt-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-[var(--text4)] uppercase tracking-wide">Prix de vente TTC *</label>
                    <div className="relative mt-1">
                      <input type="number" step="0.01" value={posPrice} onChange={e => setPosPrice(e.target.value)}
                        placeholder="4,50"
                        className="w-full px-3 py-2 pr-7 rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text1)] text-sm" />
                      <span className="absolute right-3 top-2.5 text-xs text-[var(--text4)]">€</span>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-[var(--text4)] uppercase tracking-wide">TVA</label>
                    <select value={posTva} onChange={e => setPosTva(parseFloat(e.target.value))}
                      className="mt-1 w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text1)] text-sm">
                      {TVA_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="text-xs font-semibold text-[var(--text4)] uppercase tracking-wide">Catégorie caisse</label>
                  <select value={posCatId} onChange={e => setPosCatId(e.target.value)}
                    className="mt-1 w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text1)] text-sm">
                    <option value="">— Aucune catégorie —</option>
                    {categories.map(c => (
                      <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
                    ))}
                  </select>
                </div>
                {posPrice && (
                  <div className="p-3 rounded-lg border border-[var(--border)]" style={{ background: 'var(--surface)' }}>
                    <FoodCostIndicator amount={foodCostAmount} pct={foodCostPct} />
                  </div>
                )}
              </div>
            )}
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 py-2 rounded-lg border border-[var(--border)] text-sm text-[var(--text3)]">Annuler</button>
            <button type="submit" disabled={loading}
              className="flex-2 px-6 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
              style={{ background: 'var(--blue)' }}>
              {loading ? 'Enregistrement...' : 'Enregistrer'}
            </button>
          </div>
        </form>
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
git add src/app/dashboard/recettes/_components/recipe-form.tsx
git commit -m "feat(recettes): add RecipeForm with ingredient list, food cost + POS toggle"
```

---

## Task 10: End-to-End Smoke Test

- [ ] **Step 1: Start dev server**

```bash
npm run dev
```

- [ ] **Step 2: Manual verification checklist**

Visit `http://localhost:3000/dashboard/recettes` and verify:
- [ ] Sidebar shows "Recettes" as an active link
- [ ] Empty state is shown when no recipes exist
- [ ] "+ Nouvelle recette" opens the form
- [ ] Adding ingredients updates the food cost indicator live
- [ ] Toggling "Vendu en caisse" reveals/hides the POS section
- [ ] Creating an internal recipe (toggle OFF) → appears with "🔒 Interne" badge
- [ ] Creating a POS recipe (toggle ON with price) → appears with "🧾 POS" badge
- [ ] Verifying the POS recipe appears in `/api/products` (for the POS cash register)
- [ ] Filter tabs (Toutes / Caisse POS / Internes) filter correctly
- [ ] "Modifier" pre-fills the form with existing data
- [ ] "Suppr." removes the recipe from the list

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "feat(recettes): Sprint 5 Recettes → Produit POS pipeline complete"
```
