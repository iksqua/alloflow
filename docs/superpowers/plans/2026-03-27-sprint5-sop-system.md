# Sprint 5 — SOPs System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the complete SOPs module: flexible category management (per-establishment), structured step-based SOPs with timers and video URLs, an optional recipe link, a list view with filters, a create/edit form with inline step editor, and a full-screen kitchen reading mode.

**Architecture:** Dashboard pattern (`page.tsx` SSR → `*-page-client.tsx` → `_components/`). SOP creation with inline steps uses sequential inserts (steps inserted after SOP row). Kitchen mode is pure client state (`currentStepIndex`, timer `useEffect`). Categories seeded in migration for existing establishments; new establishments seeded on first SOP page visit if 0 categories exist.

**Tech Stack:** Next.js 16 App Router, Supabase PostgreSQL, TypeScript, Tailwind CSS, Zod

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `supabase/migrations/20260327000004_sop_system.sql` | sop_categories + sop_steps tables + extend sops + seed 6 default categories |
| Create | `src/lib/validations/sop.ts` | Zod schemas for SOP + category CRUD |
| Create | `src/app/api/sop-categories/route.ts` | GET list + POST create |
| Create | `src/app/api/sop-categories/[id]/route.ts` | PATCH + DELETE |
| Create | `src/app/api/sops/route.ts` | GET list (with computed fields) + POST create (with steps) |
| Create | `src/app/api/sops/[id]/route.ts` | PATCH + DELETE soft |
| Create | `src/app/api/sops/[id]/steps/route.ts` | GET steps + POST add step |
| Create | `src/app/api/sops/[id]/steps/[stepId]/route.ts` | PATCH + DELETE step |
| Modify | `src/app/dashboard/_components/sidebar.tsx` | Add SOPs nav item |
| Create | `src/app/dashboard/sops/page.tsx` | SSR page |
| Create | `src/app/dashboard/sops/_components/types.ts` | Local TS types |
| Create | `src/app/dashboard/sops/_components/sops-page-client.tsx` | List + filter + modals orchestrator |
| Create | `src/app/dashboard/sops/_components/sop-category-manager.tsx` | Category CRUD modal |
| Create | `src/app/dashboard/sops/_components/sop-form.tsx` | Create/edit form with inline step editor |
| Create | `src/app/dashboard/sops/_components/sop-kitchen-mode.tsx` | Full-screen sequential reading mode |

---

## Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/20260327000004_sop_system.sql`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/20260327000004_sop_system.sql

-- 1. SOP categories (per-establishment, flexible)
create table public.sop_categories (
  id               uuid primary key default gen_random_uuid(),
  establishment_id uuid not null references public.establishments(id) on delete cascade,
  name             text not null,
  emoji            text,
  sort_order       int not null default 0
);

create index idx_sop_categories_establishment on public.sop_categories(establishment_id, sort_order);

alter table public.sop_categories enable row level security;

create policy "sop_categories_by_establishment"
  on public.sop_categories for all
  using (
    establishment_id in (
      select establishment_id from public.profiles where id = auth.uid()
    )
  );

-- 2. Extend sops table
alter table public.sops
  add column if not exists category_id  uuid references public.sop_categories(id) on delete set null,
  add column if not exists recipe_id    uuid references public.recipes(id) on delete set null,
  add column if not exists active       boolean not null default true;

-- RLS on sops
do $$ begin
  if not exists (
    select 1 from pg_policies where tablename = 'sops' and policyname = 'sops_by_establishment'
  ) then
    create policy "sops_by_establishment"
      on public.sops for all
      using (
        establishment_id in (
          select establishment_id from public.profiles where id = auth.uid()
        )
      );
  end if;
end $$;

-- 3. SOP steps
create table public.sop_steps (
  id               uuid primary key default gen_random_uuid(),
  sop_id           uuid not null references public.sops(id) on delete cascade,
  sort_order       int not null default 0,
  title            text not null,
  description      text not null default '',
  duration_seconds int,                          -- null = no timer
  media_url        text,                         -- YouTube/Vimeo URL, null if absent
  note_type        text check (note_type in ('warning', 'tip')),
  note_text        text
);

create index idx_sop_steps_sop on public.sop_steps(sop_id, sort_order);

alter table public.sop_steps enable row level security;

create policy "sop_steps_by_establishment"
  on public.sop_steps for all
  using (
    sop_id in (
      select id from public.sops
      where establishment_id in (
        select establishment_id from public.profiles where id = auth.uid()
      )
    )
  );

-- 4. Seed 6 default categories for all existing establishments
insert into public.sop_categories (establishment_id, name, emoji, sort_order)
select e.id, cats.name, cats.emoji, cats.sort_order
from public.establishments e
cross join (values
  ('Recettes & Production', '🍳', 0),
  ('Hygiène & HACCP',       '🧼', 1),
  ('Tenue & Comportement',  '👕', 2),
  ('Nettoyage & Entretien', '🧹', 3),
  ('Rôle & Accueil',        '👤', 4),
  ('Réception & Stocks',    '📦', 5)
) as cats(name, emoji, sort_order)
on conflict do nothing;
```

- [ ] **Step 2: Apply (skip if no local Supabase)**

```bash
cd "/Users/anthony/Super pouvoir/Alloflow"
npx supabase db push
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260327000004_sop_system.sql
git commit -m "feat(db): add sop_categories + sop_steps + extend sops + seed 6 default categories"
```

---

## Task 2: Zod Validation Schemas

**Files:**
- Create: `src/lib/validations/sop.ts`

- [ ] **Step 1: Write schemas**

```typescript
// src/lib/validations/sop.ts
import { z } from 'zod'

export const sopCategorySchema = z.object({
  name:       z.string().min(1).max(80),
  emoji:      z.string().max(10).nullable().optional(),
  sort_order: z.number().int().min(0).optional(),
})

export const updateSopCategorySchema = sopCategorySchema.partial()

export const sopStepSchema = z.object({
  title:            z.string().min(1).max(200),
  description:      z.string().max(2000).default(''),
  sort_order:       z.number().int().min(0),
  duration_seconds: z.number().int().positive().nullable().optional(),
  media_url:        z.string().url().nullable().optional(),
  note_type:        z.enum(['warning', 'tip']).nullable().optional(),
  note_text:        z.string().max(500).nullable().optional(),
})

export const createSopSchema = z.object({
  title:       z.string().min(1).max(200),
  content:     z.string().max(2000).nullable().optional(),   // general notes
  category_id: z.string().uuid().nullable().optional(),
  recipe_id:   z.string().uuid().nullable().optional(),
  steps:       z.array(sopStepSchema).default([]),
})

export const updateSopSchema = z.object({
  title:       z.string().min(1).max(200).optional(),
  content:     z.string().max(2000).nullable().optional(),
  category_id: z.string().uuid().nullable().optional(),
  recipe_id:   z.string().uuid().nullable().optional(),
})

export type SopCategoryInput       = z.infer<typeof sopCategorySchema>
export type CreateSopInput         = z.infer<typeof createSopSchema>
export type UpdateSopInput         = z.infer<typeof updateSopSchema>
export type SopStepInput           = z.infer<typeof sopStepSchema>
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/validations/sop.ts
git commit -m "feat(sops): add Zod validation schemas"
```

---

## Task 3: API — SOP Categories CRUD

**Files:**
- Create: `src/app/api/sop-categories/route.ts`
- Create: `src/app/api/sop-categories/[id]/route.ts`

- [ ] **Step 1: Write collection route**

```typescript
// src/app/api/sop-categories/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sopCategorySchema } from '@/lib/validations/sop'

async function getEstablishmentId(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data } = await supabase.from('profiles').select('establishment_id').eq('id', userId).single()
  return data?.establishment_id ?? null
}

export async function GET(_req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const establishmentId = await getEstablishmentId(supabase, user.id)
  if (!establishmentId) return NextResponse.json({ error: 'Établissement non trouvé' }, { status: 400 })

  // Seed 6 default categories if establishment has none yet
  const { count } = await supabase
    .from('sop_categories')
    .select('*', { count: 'exact', head: true })
    .eq('establishment_id', establishmentId)

  if (count === 0) {
    await supabase.from('sop_categories').insert([
      { establishment_id: establishmentId, name: 'Recettes & Production', emoji: '🍳', sort_order: 0 },
      { establishment_id: establishmentId, name: 'Hygiène & HACCP',       emoji: '🧼', sort_order: 1 },
      { establishment_id: establishmentId, name: 'Tenue & Comportement',  emoji: '👕', sort_order: 2 },
      { establishment_id: establishmentId, name: 'Nettoyage & Entretien', emoji: '🧹', sort_order: 3 },
      { establishment_id: establishmentId, name: 'Rôle & Accueil',        emoji: '👤', sort_order: 4 },
      { establishment_id: establishmentId, name: 'Réception & Stocks',    emoji: '📦', sort_order: 5 },
    ])
  }

  const { data, error } = await supabase
    .from('sop_categories')
    .select('*')
    .eq('establishment_id', establishmentId)
    .order('sort_order')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ categories: data ?? [] })
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const establishmentId = await getEstablishmentId(supabase, user.id)
  if (!establishmentId) return NextResponse.json({ error: 'Établissement non trouvé' }, { status: 400 })

  const body = await req.json()
  const result = sopCategorySchema.safeParse(body)
  if (!result.success) return NextResponse.json({ error: result.error.flatten() }, { status: 400 })

  const { data, error } = await supabase
    .from('sop_categories')
    .insert({ establishment_id: establishmentId, ...result.data })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
```

- [ ] **Step 2: Write item route**

```typescript
// src/app/api/sop-categories/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { updateSopCategorySchema } from '@/lib/validations/sop'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const result = updateSopCategorySchema.safeParse(body)
  if (!result.success) return NextResponse.json({ error: result.error.flatten() }, { status: 400 })

  const { data, error } = await supabase
    .from('sop_categories')
    .update(result.data)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Nullify category_id on related sops before deleting (cascade handled by ON DELETE SET NULL)
  const { error } = await supabase.from('sop_categories').delete().eq('id', id)
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
git add src/app/api/sop-categories/
git commit -m "feat(sops): add sop-categories CRUD API with auto-seed on first visit"
```

---

## Task 4: API — SOPs GET + POST

**Files:**
- Create: `src/app/api/sops/route.ts`

- [ ] **Step 1: Write route**

```typescript
// src/app/api/sops/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createSopSchema } from '@/lib/validations/sop'

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

  const { searchParams } = new URL(req.url)
  const categoryId = searchParams.get('category_id')
  const search     = searchParams.get('search')

  let query = supabase
    .from('sops')
    .select(`
      id, title, content, category_id, recipe_id, active,
      category:sop_categories(id, name, emoji),
      recipe:recipes(id, title),
      steps:sop_steps(id, sort_order, duration_seconds, media_url)
    `)
    .eq('establishment_id', establishmentId)
    .eq('active', true)
    .order('title')

  if (categoryId) query = query.eq('category_id', categoryId)
  if (search)     query = query.ilike('title', `%${search}%`)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Compute derived fields
  const sops = (data ?? []).map(s => ({
    ...s,
    step_count:             (s.steps ?? []).length,
    total_duration_seconds: (s.steps ?? []).reduce((sum: number, step: { duration_seconds: number | null }) => sum + (step.duration_seconds ?? 0), 0),
    has_video:              (s.steps ?? []).some((step: { media_url: string | null }) => !!step.media_url),
  }))

  return NextResponse.json({ sops })
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const establishmentId = await getEstablishmentId(supabase, user.id)
  if (!establishmentId) return NextResponse.json({ error: 'Établissement non trouvé' }, { status: 400 })

  const body = await req.json()
  const result = createSopSchema.safeParse(body)
  if (!result.success) return NextResponse.json({ error: result.error.flatten() }, { status: 400 })

  const { title, content, category_id, recipe_id, steps } = result.data

  const { data: sop, error: sopError } = await supabase
    .from('sops')
    .insert({ establishment_id: establishmentId, title, content: content ?? null, category_id: category_id ?? null, recipe_id: recipe_id ?? null })
    .select()
    .single()

  if (sopError) return NextResponse.json({ error: sopError.message }, { status: 500 })

  if (steps.length > 0) {
    const { error: stepsError } = await supabase.from('sop_steps').insert(
      steps.map(step => ({ sop_id: sop.id, ...step }))
    )
    if (stepsError) {
      await supabase.from('sops').update({ active: false }).eq('id', sop.id)
      return NextResponse.json({ error: 'Erreur création étapes: ' + stepsError.message }, { status: 500 })
    }
  }

  return NextResponse.json(sop, { status: 201 })
}
```

- [ ] **Step 2: TypeScript check + commit**

```bash
npx tsc --noEmit
git add src/app/api/sops/route.ts
git commit -m "feat(sops): add GET + POST /api/sops with computed step_count, total_duration, has_video"
```

---

## Task 5: API — SOPs [id] PATCH + DELETE + Steps CRUD

**Files:**
- Create: `src/app/api/sops/[id]/route.ts`
- Create: `src/app/api/sops/[id]/steps/route.ts`
- Create: `src/app/api/sops/[id]/steps/[stepId]/route.ts`

- [ ] **Step 1: Write [id] route**

```typescript
// src/app/api/sops/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { updateSopSchema } from '@/lib/validations/sop'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const result = updateSopSchema.safeParse(body)
  if (!result.success) return NextResponse.json({ error: result.error.flatten() }, { status: 400 })

  const { data, error } = await supabase
    .from('sops')
    .update(result.data)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { error } = await supabase.from('sops').update({ active: false }).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
```

- [ ] **Step 2: Write steps collection route**

```typescript
// src/app/api/sops/[id]/steps/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sopStepSchema } from '@/lib/validations/sop'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('sop_steps')
    .select('*')
    .eq('sop_id', id)
    .order('sort_order')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ steps: data ?? [] })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const result = sopStepSchema.safeParse(body)
  if (!result.success) return NextResponse.json({ error: result.error.flatten() }, { status: 400 })

  const { data, error } = await supabase
    .from('sop_steps')
    .insert({ sop_id: id, ...result.data })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
```

- [ ] **Step 3: Write steps item route**

```typescript
// src/app/api/sops/[id]/steps/[stepId]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sopStepSchema } from '@/lib/validations/sop'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; stepId: string }> }) {
  const { stepId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const result = sopStepSchema.partial().safeParse(body)
  if (!result.success) return NextResponse.json({ error: result.error.flatten() }, { status: 400 })

  const { data, error } = await supabase
    .from('sop_steps')
    .update(result.data)
    .eq('id', stepId)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; stepId: string }> }) {
  const { stepId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { error } = await supabase.from('sop_steps').delete().eq('id', stepId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
```

- [ ] **Step 4: TypeScript check + commit**

```bash
npx tsc --noEmit
git add src/app/api/sops/
git commit -m "feat(sops): add SOPs PATCH/DELETE + steps CRUD API"
```

---

## Task 6: Sidebar + Types + SSR Page

**Files:**
- Modify: `src/app/dashboard/_components/sidebar.tsx`
- Create: `src/app/dashboard/sops/_components/types.ts`
- Create: `src/app/dashboard/sops/page.tsx`

- [ ] **Step 1: Add SOPs to sidebar**

In `sidebar.tsx`, add after Recettes:
```typescript
{ href: '/dashboard/sops', label: 'SOPs', icon: '📋' },
```

- [ ] **Step 2: Write types**

```typescript
// src/app/dashboard/sops/_components/types.ts
export interface SopCategory {
  id: string
  establishment_id: string
  name: string
  emoji: string | null
  sort_order: number
}

export interface SopStep {
  id: string
  sop_id: string
  sort_order: number
  title: string
  description: string
  duration_seconds: number | null
  media_url: string | null
  note_type: 'warning' | 'tip' | null
  note_text: string | null
}

export interface Sop {
  id: string
  title: string
  content: string | null
  category_id: string | null
  recipe_id: string | null
  active: boolean
  category: { id: string; name: string; emoji: string | null } | null
  recipe: { id: string; title: string } | null
  // computed
  step_count: number
  total_duration_seconds: number
  has_video: boolean
}

export interface SopWithSteps extends Sop {
  steps: SopStep[]
}
```

- [ ] **Step 3: Write SSR page**

```typescript
// src/app/dashboard/sops/page.tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { SopsPageClient } from './_components/sops-page-client'
import type { Sop, SopCategory } from './_components/types'

export default async function SopsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('establishment_id')
    .eq('id', user.id)
    .single()

  if (!profile?.establishment_id) redirect('/onboarding')

  const [sopsRes, catsRes, recipesRes] = await Promise.all([
    supabase
      .from('sops')
      .select(`
        id, title, content, category_id, recipe_id, active,
        category:sop_categories(id, name, emoji),
        recipe:recipes(id, title),
        steps:sop_steps(id, sort_order, duration_seconds, media_url)
      `)
      .eq('establishment_id', profile.establishment_id)
      .eq('active', true)
      .order('title'),
    supabase
      .from('sop_categories')
      .select('*')
      .eq('establishment_id', profile.establishment_id)
      .order('sort_order'),
    supabase
      .from('recipes')
      .select('id, title')
      .eq('establishment_id', profile.establishment_id)
      .eq('active', true)
      .order('title'),
  ])

  const sops: Sop[] = (sopsRes.data ?? []).map(s => ({
    ...s,
    category: Array.isArray(s.category) ? s.category[0] ?? null : s.category,
    recipe:   Array.isArray(s.recipe)   ? s.recipe[0]   ?? null : s.recipe,
    step_count:             (s.steps ?? []).length,
    total_duration_seconds: (s.steps ?? []).reduce((sum: number, step: { duration_seconds: number | null }) => sum + (step.duration_seconds ?? 0), 0),
    has_video:              (s.steps ?? []).some((step: { media_url: string | null }) => !!step.media_url),
  }))

  // Seed categories if none exist (new establishment)
  let categories = (catsRes.data ?? []) as SopCategory[]
  if (categories.length === 0) {
    const seeds = [
      { establishment_id: profile.establishment_id, name: 'Recettes & Production', emoji: '🍳', sort_order: 0 },
      { establishment_id: profile.establishment_id, name: 'Hygiène & HACCP',       emoji: '🧼', sort_order: 1 },
      { establishment_id: profile.establishment_id, name: 'Tenue & Comportement',  emoji: '👕', sort_order: 2 },
      { establishment_id: profile.establishment_id, name: 'Nettoyage & Entretien', emoji: '🧹', sort_order: 3 },
      { establishment_id: profile.establishment_id, name: 'Rôle & Accueil',        emoji: '👤', sort_order: 4 },
      { establishment_id: profile.establishment_id, name: 'Réception & Stocks',    emoji: '📦', sort_order: 5 },
    ]
    const { data: seeded } = await supabase.from('sop_categories').insert(seeds).select()
    categories = (seeded ?? []) as SopCategory[]
  }

  return (
    <SopsPageClient
      initialSops={sops}
      initialCategories={categories}
      recipes={(recipesRes.data ?? []) as { id: string; title: string }[]}
    />
  )
}
```

- [ ] **Step 4: Commit**

```bash
git add src/app/dashboard/_components/sidebar.tsx \
        src/app/dashboard/sops/_components/types.ts \
        src/app/dashboard/sops/page.tsx
git commit -m "feat(sops): add sidebar link + types + SSR page"
```

---

## Task 7: SopsPageClient + SOPCategoryManager

**Files:**
- Create: `src/app/dashboard/sops/_components/sops-page-client.tsx`
- Create: `src/app/dashboard/sops/_components/sop-category-manager.tsx`

- [ ] **Step 1: Write sops-page-client.tsx**

```tsx
// src/app/dashboard/sops/_components/sops-page-client.tsx
'use client'
import { useState } from 'react'
import type { Sop, SopCategory, SopWithSteps } from './types'
import { SopForm } from './sop-form'
import { SopKitchenMode } from './sop-kitchen-mode'
import { SopCategoryManager } from './sop-category-manager'

interface Props {
  initialSops: Sop[]
  initialCategories: SopCategory[]
  recipes: { id: string; title: string }[]
}

function formatDuration(seconds: number): string {
  if (seconds === 0) return ''
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return m > 0 ? `${m}min${s > 0 ? ` ${s}s` : ''}` : `${s}s`
}

export function SopsPageClient({ initialSops, initialCategories, recipes }: Props) {
  const [sops,       setSops]       = useState(initialSops)
  const [categories, setCategories] = useState(initialCategories)
  const [catFilter,  setCatFilter]  = useState<string | null>(null)
  const [search,     setSearch]     = useState('')
  const [showForm,   setShowForm]   = useState(false)
  const [editingSop, setEditingSop] = useState<SopWithSteps | null>(null)
  const [kitchenSop, setKitchenSop] = useState<SopWithSteps | null>(null)
  const [showCatMgr, setShowCatMgr] = useState(false)

  const filtered = sops.filter(s => {
    if (catFilter && s.category_id !== catFilter) return false
    if (search && !s.title.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  async function reloadSops() {
    const res = await fetch('/api/sops')
    const json = await res.json()
    setSops(json.sops ?? [])
  }

  async function reloadCategories() {
    const res = await fetch('/api/sop-categories')
    const json = await res.json()
    setCategories(json.categories ?? [])
  }

  async function openKitchenMode(sop: Sop) {
    const res = await fetch(`/api/sops/${sop.id}/steps`)
    const json = await res.json()
    setKitchenSop({ ...sop, steps: json.steps ?? [] })
  }

  async function openEditForm(sop: Sop) {
    const res = await fetch(`/api/sops/${sop.id}/steps`)
    const json = await res.json()
    setEditingSop({ ...sop, steps: json.steps ?? [] })
    setShowForm(true)
  }

  async function handleDelete(id: string) {
    if (!confirm('Supprimer ce SOP ?')) return
    await fetch(`/api/sops/${id}`, { method: 'DELETE' })
    await reloadSops()
  }

  return (
    <div style={{ paddingLeft: '220px', minHeight: '100vh', background: 'var(--bg)' }}>
      <div className="max-w-6xl mx-auto p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-[var(--text1)]">SOPs</h1>
            <p className="text-xs text-[var(--text4)] mt-0.5">{sops.length} procédure{sops.length !== 1 ? 's' : ''}</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setShowCatMgr(true)}
              className="px-3 py-1.5 rounded-lg text-sm font-medium border border-[var(--border)] text-[var(--text3)] hover:bg-[var(--surface)]">
              ⚙️ Catégories
            </button>
            <button onClick={() => { setEditingSop(null); setShowForm(true) }}
              className="px-4 py-2 rounded-lg text-sm font-semibold text-white"
              style={{ background: 'var(--blue)' }}>
              + Nouveau SOP
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 mb-5 flex-wrap">
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher..."
            className="px-3 py-1.5 rounded-lg text-sm border border-[var(--border)] bg-[var(--surface)] text-[var(--text2)] w-52" />
          <div className="flex gap-1.5 flex-wrap">
            <button onClick={() => setCatFilter(null)}
              className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${catFilter === null ? 'text-white' : 'text-[var(--text3)] hover:bg-[var(--surface)]'}`}
              style={{ background: catFilter === null ? 'var(--blue)' : undefined }}>
              Tous ({sops.length})
            </button>
            {categories.map(cat => {
              const count = sops.filter(s => s.category_id === cat.id).length
              return (
                <button key={cat.id} onClick={() => setCatFilter(catFilter === cat.id ? null : cat.id)}
                  className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${catFilter === cat.id ? 'text-white' : 'text-[var(--text3)] hover:bg-[var(--surface)]'}`}
                  style={{ background: catFilter === cat.id ? 'var(--blue)' : undefined }}>
                  {cat.emoji} {cat.name} ({count})
                </button>
              )
            })}
          </div>
        </div>

        {/* SOP list */}
        {filtered.length === 0 ? (
          <div className="text-center py-20">
            <div className="text-5xl mb-4">📋</div>
            <div className="font-semibold text-[var(--text2)]">Aucun SOP</div>
            <div className="text-sm text-[var(--text4)] mt-1">Créez votre première procédure opérationnelle</div>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map(sop => (
              <div key={sop.id} className="flex items-center gap-4 px-4 py-3 rounded-xl border border-[var(--border)] hover:border-[var(--blue)]/30 transition-colors" style={{ background: 'var(--surface)' }}>
                {/* Category emoji */}
                <div className="text-xl flex-shrink-0 w-8 text-center">
                  {sop.category?.emoji ?? '📋'}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-[var(--text1)] truncate">{sop.title}</span>
                    {sop.category && (
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-[var(--surface2)] text-[var(--text4)]">
                        {sop.category.name}
                      </span>
                    )}
                    {sop.recipe && (
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-blue-900/20 text-blue-400">
                        📖 {sop.recipe.title}
                      </span>
                    )}
                    {sop.has_video && (
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-purple-900/20 text-purple-400">▶ Vidéo</span>
                    )}
                  </div>
                  <div className="text-xs text-[var(--text4)] mt-0.5">
                    {sop.step_count} étape{sop.step_count !== 1 ? 's' : ''}
                    {sop.total_duration_seconds > 0 && ` · ${formatDuration(sop.total_duration_seconds)}`}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-2 flex-shrink-0">
                  <button onClick={() => openKitchenMode(sop)}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-[var(--border)] text-[var(--text2)] hover:bg-[var(--surface2)]">
                    ▶ Mode cuisine
                  </button>
                  <button onClick={() => openEditForm(sop)}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium text-[var(--text4)] hover:text-[var(--text2)]">
                    Modifier
                  </button>
                  <button onClick={() => handleDelete(sop.id)}
                    className="px-2 py-1.5 rounded-lg text-xs text-red-500/60 hover:text-red-400">✕</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <SopForm
        open={showForm}
        sop={editingSop}
        categories={categories}
        recipes={recipes}
        onClose={() => setShowForm(false)}
        onSave={async () => { setShowForm(false); await reloadSops() }}
      />

      {kitchenSop && (
        <SopKitchenMode
          sop={kitchenSop}
          onClose={() => setKitchenSop(null)}
        />
      )}

      <SopCategoryManager
        open={showCatMgr}
        categories={categories}
        onClose={() => setShowCatMgr(false)}
        onSave={async () => { await reloadCategories() }}
      />
    </div>
  )
}
```

- [ ] **Step 2: Write sop-category-manager.tsx**

```tsx
// src/app/dashboard/sops/_components/sop-category-manager.tsx
'use client'
import { useState, useEffect } from 'react'
import type { SopCategory } from './types'

interface Props {
  open: boolean
  categories: SopCategory[]
  onClose: () => void
  onSave: () => Promise<void>
}

export function SopCategoryManager({ open, categories: initialCategories, onClose, onSave }: Props) {
  const [cats,    setCats]    = useState(initialCategories)
  const [newName, setNewName] = useState('')
  const [newEmoji,setNewEmoji]= useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (open) { setCats(initialCategories); setNewName(''); setNewEmoji('') }
  }, [open, initialCategories])

  if (!open) return null

  async function addCategory() {
    if (!newName.trim()) return
    setLoading(true)
    const res = await fetch('/api/sop-categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName.trim(), emoji: newEmoji.trim() || null, sort_order: cats.length }),
    })
    if (res.ok) {
      setNewName(''); setNewEmoji('')
      await onSave()
      const res2 = await fetch('/api/sop-categories')
      const json = await res2.json()
      setCats(json.categories ?? [])
    }
    setLoading(false)
  }

  async function deleteCategory(id: string) {
    const affected = cats.length  // simplified — we just show count of categories being managed
    if (!confirm(`Supprimer cette catégorie ? Les SOPs associés n'auront plus de catégorie.`)) return
    await fetch(`/api/sop-categories/${id}`, { method: 'DELETE' })
    await onSave()
    setCats(prev => prev.filter(c => c.id !== id))
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-[480px] max-h-[90vh] overflow-y-auto rounded-2xl border border-[var(--border)] p-6" style={{ background: 'var(--surface)' }}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-bold text-[var(--text1)]">Gérer les catégories</h2>
          <button onClick={onClose} className="text-[var(--text4)] hover:text-[var(--text2)] text-xl">×</button>
        </div>

        {/* Existing categories */}
        <div className="space-y-2 mb-5">
          {cats.map(cat => (
            <div key={cat.id} className="flex items-center gap-3 px-3 py-2 rounded-lg border border-[var(--border)]" style={{ background: 'var(--bg)' }}>
              <span className="text-lg">{cat.emoji ?? '📋'}</span>
              <span className="flex-1 text-sm text-[var(--text2)]">{cat.name}</span>
              <button onClick={() => deleteCategory(cat.id)}
                className="text-xs text-red-500/60 hover:text-red-400">Suppr.</button>
            </div>
          ))}
        </div>

        {/* Add new category */}
        <div className="border-t border-[var(--border)] pt-4">
          <p className="text-xs font-semibold text-[var(--text4)] uppercase tracking-wide mb-3">Nouvelle catégorie</p>
          <div className="flex gap-2 mb-3">
            <input value={newEmoji} onChange={e => setNewEmoji(e.target.value)} placeholder="🏷️" maxLength={2}
              className="w-14 px-2 py-2 text-center rounded-lg border border-[var(--border)] bg-[var(--bg)] text-[var(--text1)] text-lg" />
            <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Nom de la catégorie"
              className="flex-1 px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-[var(--text1)] text-sm" />
          </div>
          <button onClick={addCategory} disabled={!newName.trim() || loading}
            className="w-full py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
            style={{ background: 'var(--blue)' }}>
            {loading ? 'Ajout...' : '+ Ajouter'}
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: TypeScript check + commit**

```bash
npx tsc --noEmit
git add src/app/dashboard/sops/_components/sops-page-client.tsx \
        src/app/dashboard/sops/_components/sop-category-manager.tsx
git commit -m "feat(sops): add SopsPageClient + SOPCategoryManager"
```

---

## Task 8: SOPForm with Step Editor

**Files:**
- Create: `src/app/dashboard/sops/_components/sop-form.tsx`

- [ ] **Step 1: Write form**

```tsx
// src/app/dashboard/sops/_components/sop-form.tsx
'use client'
import { useState, useEffect } from 'react'
import type { SopCategory, SopStep, SopWithSteps } from './types'

interface StepLine {
  id?: string
  title: string
  description: string
  duration_seconds: string
  media_url: string
  note_type: '' | 'warning' | 'tip'
  note_text: string
}

interface Props {
  open: boolean
  sop: SopWithSteps | null
  categories: SopCategory[]
  recipes: { id: string; title: string }[]
  onClose: () => void
  onSave: () => Promise<void>
}

function toLine(s: SopStep): StepLine {
  return {
    id:               s.id,
    title:            s.title,
    description:      s.description,
    duration_seconds: s.duration_seconds ? String(s.duration_seconds) : '',
    media_url:        s.media_url ?? '',
    note_type:        (s.note_type as StepLine['note_type']) ?? '',
    note_text:        s.note_text ?? '',
  }
}

export function SopForm({ open, sop, categories, recipes, onClose, onSave }: Props) {
  const [title,      setTitle]      = useState('')
  const [content,    setContent]    = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [recipeId,   setRecipeId]   = useState('')
  const [steps,      setSteps]      = useState<StepLine[]>([])
  const [loading,    setLoading]    = useState(false)
  const [error,      setError]      = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setTitle(sop?.title ?? '')
      setContent(sop?.content ?? '')
      setCategoryId(sop?.category_id ?? '')
      setRecipeId(sop?.recipe_id ?? '')
      setSteps(sop?.steps?.map(toLine) ?? [])
      setError(null)
    }
  }, [open, sop])

  if (!open) return null

  function addStep() {
    setSteps(prev => [...prev, { title: '', description: '', duration_seconds: '', media_url: '', note_type: '', note_text: '' }])
  }

  function updateStep(idx: number, field: keyof StepLine, value: string) {
    setSteps(prev => prev.map((s, i) => i === idx ? { ...s, [field]: value } : s))
  }

  function removeStep(idx: number) {
    setSteps(prev => prev.filter((_, i) => i !== idx))
  }

  function moveStep(idx: number, direction: -1 | 1) {
    const next = idx + direction
    if (next < 0 || next >= steps.length) return
    setSteps(prev => {
      const arr = [...prev]
      ;[arr[idx], arr[next]] = [arr[next], arr[idx]]
      return arr
    })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) { setError('Le titre est requis'); return }
    setLoading(true); setError(null)
    try {
      const payload = {
        title:       title.trim(),
        content:     content.trim() || null,
        category_id: categoryId || null,
        recipe_id:   recipeId   || null,
        steps: steps
          .filter(s => s.title.trim())
          .map((s, idx) => ({
            ...(s.id ? { id: s.id } : {}),
            sort_order:       idx,
            title:            s.title.trim(),
            description:      s.description.trim(),
            duration_seconds: s.duration_seconds ? parseInt(s.duration_seconds) : null,
            media_url:        s.media_url.trim() || null,
            note_type:        s.note_type || null,
            note_text:        s.note_text.trim() || null,
          })),
      }

      if (sop) {
        // Update metadata
        await fetch(`/api/sops/${sop.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: payload.title, content: payload.content, category_id: payload.category_id, recipe_id: payload.recipe_id }),
        })
        // Replace all steps: delete existing, insert new
        for (const oldStep of sop.steps) {
          await fetch(`/api/sops/${sop.id}/steps/${oldStep.id}`, { method: 'DELETE' })
        }
        for (const step of payload.steps) {
          await fetch(`/api/sops/${sop.id}/steps`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(step),
          })
        }
      } else {
        const res = await fetch('/api/sops', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        if (!res.ok) { const j = await res.json(); throw new Error(j.error ?? 'Erreur') }
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
        <h2 className="text-base font-bold text-[var(--text1)] mb-5">{sop ? 'Modifier le SOP' : 'Nouveau SOP'}</h2>
        <form onSubmit={handleSubmit} className="space-y-4">

          {/* General info */}
          <div>
            <label className="text-xs font-semibold text-[var(--text4)] uppercase tracking-wide">Titre *</label>
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Nettoyage de la salle"
              className="mt-1 w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-[var(--text1)] text-sm" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-[var(--text4)] uppercase tracking-wide">Catégorie</label>
              <select value={categoryId} onChange={e => setCategoryId(e.target.value)}
                className="mt-1 w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-[var(--text1)] text-sm">
                <option value="">— Aucune —</option>
                {categories.map(c => (
                  <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-[var(--text4)] uppercase tracking-wide">Recette liée</label>
              <select value={recipeId} onChange={e => setRecipeId(e.target.value)}
                className="mt-1 w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-[var(--text1)] text-sm">
                <option value="">— Aucune recette —</option>
                {recipes.map(r => <option key={r.id} value={r.id}>{r.title}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-[var(--text4)] uppercase tracking-wide">Notes générales</label>
            <textarea value={content} onChange={e => setContent(e.target.value)} rows={2}
              className="mt-1 w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-[var(--text1)] text-sm resize-none" />
          </div>

          {/* Steps */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-[var(--text4)] uppercase tracking-wide">Étapes</label>
              <button type="button" onClick={addStep}
                className="text-xs font-semibold" style={{ color: 'var(--blue)' }}>+ Ajouter une étape</button>
            </div>

            {steps.length === 0 && (
              <p className="text-xs text-[var(--text4)] text-center py-3 border border-dashed border-[var(--border)] rounded-lg">
                Aucune étape — cliquez sur + Ajouter
              </p>
            )}

            <div className="space-y-3">
              {steps.map((step, idx) => (
                <div key={idx} className="rounded-xl border border-[var(--border)] p-3 space-y-2" style={{ background: 'var(--bg)' }}>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-[var(--text4)] w-5">{idx + 1}</span>
                    <input value={step.title} onChange={e => updateStep(idx, 'title', e.target.value)}
                      placeholder="Titre de l'étape"
                      className="flex-1 px-2 py-1.5 rounded-md border border-[var(--border)] bg-[var(--surface)] text-[var(--text1)] text-xs" />
                    <div className="flex gap-1">
                      <button type="button" onClick={() => moveStep(idx, -1)} disabled={idx === 0}
                        className="text-xs text-[var(--text4)] disabled:opacity-30 px-1">↑</button>
                      <button type="button" onClick={() => moveStep(idx, 1)} disabled={idx === steps.length - 1}
                        className="text-xs text-[var(--text4)] disabled:opacity-30 px-1">↓</button>
                      <button type="button" onClick={() => removeStep(idx)}
                        className="text-xs text-red-500/60 hover:text-red-400 px-1">✕</button>
                    </div>
                  </div>

                  <textarea value={step.description} onChange={e => updateStep(idx, 'description', e.target.value)}
                    placeholder="Description détaillée de l'étape" rows={2}
                    className="w-full px-2 py-1.5 rounded-md border border-[var(--border)] bg-[var(--surface)] text-[var(--text1)] text-xs resize-none" />

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] text-[var(--text4)]">Timer (secondes)</label>
                      <input type="number" value={step.duration_seconds} onChange={e => updateStep(idx, 'duration_seconds', e.target.value)}
                        placeholder="ex: 180 = 3 min"
                        className="mt-0.5 w-full px-2 py-1 rounded-md border border-[var(--border)] bg-[var(--surface)] text-[var(--text1)] text-xs" />
                    </div>
                    <div>
                      <label className="text-[10px] text-[var(--text4)]">Note</label>
                      <select value={step.note_type} onChange={e => updateStep(idx, 'note_type', e.target.value)}
                        className="mt-0.5 w-full px-2 py-1 rounded-md border border-[var(--border)] bg-[var(--surface)] text-[var(--text1)] text-xs">
                        <option value="">— Aucune —</option>
                        <option value="tip">💡 Conseil</option>
                        <option value="warning">⚠️ Attention</option>
                      </select>
                    </div>
                  </div>

                  {step.note_type && (
                    <input value={step.note_text} onChange={e => updateStep(idx, 'note_text', e.target.value)}
                      placeholder="Texte de la note"
                      className="w-full px-2 py-1.5 rounded-md border border-[var(--border)] bg-[var(--surface)] text-[var(--text1)] text-xs" />
                  )}

                  <input value={step.media_url} onChange={e => updateStep(idx, 'media_url', e.target.value)}
                    placeholder="URL vidéo YouTube/Vimeo (optionnel)"
                    className="w-full px-2 py-1.5 rounded-md border border-[var(--border)] bg-[var(--surface)] text-[var(--text2)] text-xs" />
                </div>
              ))}
            </div>
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

- [ ] **Step 2: TypeScript check + commit**

```bash
npx tsc --noEmit
git add src/app/dashboard/sops/_components/sop-form.tsx
git commit -m "feat(sops): add SOPForm with inline step editor"
```

---

## Task 9: SOPKitchenMode

**Files:**
- Create: `src/app/dashboard/sops/_components/sop-kitchen-mode.tsx`

- [ ] **Step 1: Write component**

```tsx
// src/app/dashboard/sops/_components/sop-kitchen-mode.tsx
'use client'
import { useState, useEffect, useRef } from 'react'
import type { SopWithSteps } from './types'

interface Props {
  sop: SopWithSteps
  onClose: () => void
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export function SopKitchenMode({ sop, onClose }: Props) {
  const [currentIdx, setCurrentIdx] = useState(0)
  const [timeLeft,   setTimeLeft]   = useState<number | null>(null)
  const [timerActive, setTimerActive] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const steps = sop.steps.slice().sort((a, b) => a.sort_order - b.sort_order)
  const step  = steps[currentIdx]

  // Reset timer when step changes
  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current)
    setTimerActive(false)
    setTimeLeft(step?.duration_seconds ?? null)
  }, [currentIdx, step?.duration_seconds])

  // Timer countdown
  useEffect(() => {
    if (!timerActive || timeLeft === null) return
    if (timeLeft <= 0) { setTimerActive(false); return }
    intervalRef.current = setInterval(() => {
      setTimeLeft(t => {
        if (t === null || t <= 1) { clearInterval(intervalRef.current!); setTimerActive(false); return 0 }
        return t - 1
      })
    }, 1000)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [timerActive, timeLeft])

  if (!step) return null

  function goNext() {
    if (currentIdx < steps.length - 1) setCurrentIdx(i => i + 1)
  }

  function goPrev() {
    if (currentIdx > 0) setCurrentIdx(i => i - 1)
  }

  return (
    <div className="fixed inset-0 z-[100] flex flex-col" style={{ background: 'var(--bg)' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)]" style={{ background: 'var(--surface2)' }}>
        <div>
          <h1 className="text-base font-bold text-[var(--text1)]">{sop.title}</h1>
          <p className="text-xs text-[var(--text4)]">Étape {currentIdx + 1} sur {steps.length}</p>
        </div>
        <button onClick={onClose} className="px-3 py-1.5 rounded-lg text-sm text-[var(--text3)] border border-[var(--border)] hover:bg-[var(--surface)]">
          ✕ Fermer
        </button>
      </div>

      {/* Progress bar */}
      <div className="h-1 bg-[var(--border)]">
        <div
          className="h-full bg-blue-500 transition-all"
          style={{ width: `${((currentIdx + 1) / steps.length) * 100}%` }}
        />
      </div>

      {/* Step list + active step */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar: step list */}
        <div className="w-60 border-r border-[var(--border)] overflow-y-auto flex-shrink-0 hidden md:block" style={{ background: 'var(--surface2)' }}>
          {steps.map((s, idx) => (
            <button
              key={s.id}
              onClick={() => setCurrentIdx(idx)}
              className={`w-full text-left px-4 py-3 border-b border-[var(--border)]/50 transition-colors ${
                idx === currentIdx ? 'border-l-2 border-l-blue-500' : ''
              } ${idx < currentIdx ? 'opacity-40' : ''}`}
              style={{ background: idx === currentIdx ? 'rgba(29,78,216,.08)' : undefined }}
            >
              <div className="flex items-center gap-2">
                <span className={`text-xs font-bold ${idx < currentIdx ? 'text-green-400' : idx === currentIdx ? 'text-blue-400' : 'text-[var(--text4)]'}`}>
                  {idx < currentIdx ? '✓' : idx + 1}
                </span>
                <span className={`text-xs font-medium truncate ${idx === currentIdx ? 'text-[var(--text1)]' : 'text-[var(--text3)]'}`}>
                  {s.title}
                </span>
              </div>
            </button>
          ))}
        </div>

        {/* Main: active step */}
        <div className="flex-1 overflow-y-auto p-8 flex flex-col">
          <div className="max-w-2xl mx-auto w-full">
            {/* Step title */}
            <h2 className="text-2xl font-bold text-[var(--text1)] mb-4">{step.title}</h2>

            {/* Description */}
            {step.description && (
              <p className="text-[var(--text2)] leading-relaxed mb-6 text-base">{step.description}</p>
            )}

            {/* Note */}
            {step.note_type && step.note_text && (
              <div className={`flex gap-3 p-4 rounded-xl mb-6 ${
                step.note_type === 'warning'
                  ? 'bg-amber-900/15 border border-amber-500/30'
                  : 'bg-blue-900/15 border border-blue-500/30'
              }`}>
                <span className="text-xl">{step.note_type === 'warning' ? '⚠️' : '💡'}</span>
                <p className={`text-sm ${step.note_type === 'warning' ? 'text-amber-300' : 'text-blue-300'}`}>
                  {step.note_text}
                </p>
              </div>
            )}

            {/* Video embed */}
            {step.media_url && (
              <div className="mb-6 rounded-xl overflow-hidden border border-[var(--border)]" style={{ aspectRatio: '16/9' }}>
                <iframe
                  src={step.media_url
                    .replace('youtu.be/', 'www.youtube.com/embed/')
                    .replace('watch?v=', 'embed/')}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  className="w-full h-full"
                />
              </div>
            )}

            {/* Timer */}
            {step.duration_seconds && (
              <div className="flex items-center gap-4 mb-8">
                <div className="text-4xl font-mono font-bold tabular-nums text-[var(--text1)]">
                  {formatTime(timeLeft ?? step.duration_seconds)}
                </div>
                <button
                  onClick={() => setTimerActive(v => !v)}
                  className="px-4 py-2 rounded-lg text-sm font-semibold border border-[var(--border)]"
                  style={{
                    background: timerActive ? 'rgba(239,68,68,.1)' : 'rgba(16,185,129,.1)',
                    color: timerActive ? '#f87171' : '#34d399',
                  }}
                >
                  {timerActive ? '⏸ Pause' : '▶ Démarrer'}
                </button>
                <button onClick={() => setTimeLeft(step.duration_seconds)}
                  className="text-xs text-[var(--text4)] hover:text-[var(--text2)]">↺ Reset</button>
              </div>
            )}

            {/* Navigation */}
            <div className="flex gap-3 mt-auto">
              <button onClick={goPrev} disabled={currentIdx === 0}
                className="flex-1 py-3 rounded-xl border border-[var(--border)] text-sm font-semibold text-[var(--text3)] disabled:opacity-30 hover:bg-[var(--surface)]">
                ← Étape précédente
              </button>
              {currentIdx < steps.length - 1 ? (
                <button onClick={goNext}
                  className="flex-1 py-3 rounded-xl text-sm font-bold text-white"
                  style={{ background: 'var(--blue)' }}>
                  Étape suivante →
                </button>
              ) : (
                <button onClick={onClose}
                  className="flex-1 py-3 rounded-xl text-sm font-bold text-white"
                  style={{ background: 'var(--green)' }}>
                  ✓ Procédure terminée
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: TypeScript check + commit**

```bash
npx tsc --noEmit
git add src/app/dashboard/sops/_components/sop-kitchen-mode.tsx
git commit -m "feat(sops): add SOPKitchenMode — full-screen sequential reading with timer + video"
```

---

## Task 10: End-to-End Smoke Test

- [ ] **Step 1: Start dev server**

```bash
npm run dev
```

- [ ] **Step 2: Manual verification checklist**

Visit `http://localhost:3000/dashboard/sops` and verify:
- [ ] Sidebar shows "SOPs" as an active link
- [ ] 6 default category pills appear (🍳 🧼 👕 🧹 👤 📦)
- [ ] "⚙️ Catégories" button opens the category manager modal
- [ ] Adding a new category appears in the filter pills
- [ ] "+ Nouveau SOP" opens the form with category + recipe selectors
- [ ] Adding steps with timer, note, and video URL fields works
- [ ] Up/down arrows reorder steps correctly
- [ ] Saving creates the SOP visible in the list with step count and duration
- [ ] Badge "📖 [Recette]" appears when recipe is linked
- [ ] Badge "▶ Vidéo" appears when a step has a media_url
- [ ] "▶ Mode cuisine" opens full-screen kitchen mode
- [ ] Step navigation (prev/next) works with progress bar
- [ ] Timer starts/pauses/resets correctly
- [ ] "✓ Procédure terminée" button closes kitchen mode on last step

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "feat(sops): Sprint 5 SOPs system complete"
```
