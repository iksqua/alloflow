# Dashboard Produits — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Compléter le module Dashboard Produits : migration DB (categories séparées), filtres + recherche, toggle inline statut, sélection en masse, gestion catégories, formulaire produit complet (9 écrans du mockup).

**Architecture:** La page produits est un Server Component qui fetch les données ; un Client Component gère l'état UI (filtres, sélection, modales). Les API routes (`/api/products`, `/api/categories`) sont des Route Handlers Next.js qui délèguent à Supabase avec isolation par `establishment_id`. Le toggle statut appelle l'API via optimistic update.

**Tech Stack:** Next.js 16 App Router, Supabase (RLS), React Hook Form + Zod, shadcn/ui, Tailwind CSS v4, Vitest

**Prérequis :** Sprint 1 (Design System) complété.

---

## Fichiers créés / modifiés

| Action | Fichier | Responsabilité |
|--------|---------|----------------|
| Create | `supabase/migrations/20260326000001_categories.sql` | Table categories, update products |
| Create | `supabase/migrations/20260326000002_products_v2.sql` | Ajouter emoji, description, sort_order aux products |
| Modify | `src/lib/types/database.ts` | Types Category, Product mis à jour |
| Create | `src/lib/validations/category.ts` | Schémas Zod category |
| Create | `src/app/api/categories/route.ts` | GET/POST categories |
| Create | `src/app/api/categories/[id]/route.ts` | PATCH/DELETE category |
| Create | `src/app/api/categories/reorder/route.ts` | PATCH batch reorder |
| Modify | `src/app/api/products/route.ts` | Ajouter filtres, category_id |
| Modify | `src/app/api/products/[id]/route.ts` | Support emoji, description |
| Create | `src/app/api/products/bulk/route.ts` | POST bulk actions |
| Modify | `src/app/dashboard/products/page.tsx` | Fetch categories + products |
| Modify | `src/app/dashboard/products/_components/products-page-client.tsx` | État global UI |
| Create | `src/app/dashboard/products/_components/products-toolbar.tsx` | Recherche + filtres |
| Modify | `src/app/dashboard/products/_components/products-table.tsx` | Toggle inline, bulk select, rows |
| Modify | `src/app/dashboard/products/_components/product-form.tsx` | Formulaire complet |
| Create | `src/app/dashboard/products/_components/categories-modal.tsx` | Gestion catégories drag & drop |
| Create | `src/app/dashboard/products/_components/bulk-action-bar.tsx` | Barre actions en masse |
| Create | `src/app/dashboard/products/_components/delete-confirm-modal.tsx` | Modal confirmation suppression |
| Modify | `src/app/dashboard/products/_components/types.ts` | Types Product, Category |
| Create | `src/app/api/categories/route.test.ts` | Tests API categories |
| Create | `src/app/api/products/bulk/route.test.ts` | Tests bulk actions |

---

## Tâche 1 : Migration DB — Table categories

**Fichiers :**
- Create: `supabase/migrations/20260326000001_categories.sql`

- [ ] **Étape 1 : Écrire la migration**

```sql
-- supabase/migrations/20260326000001_categories.sql

-- Table categories (séparée de l'enum)
CREATE TABLE categories (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id UUID NOT NULL REFERENCES establishments(id) ON DELETE CASCADE,
  name             VARCHAR(50) NOT NULL CHECK (length(name) > 0),
  color_hex        VARCHAR(7) NOT NULL DEFAULT '#6b7280',
  icon             VARCHAR(10),
  sort_order       INTEGER NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_categories_establishment ON categories(establishment_id);
CREATE INDEX idx_categories_sort ON categories(establishment_id, sort_order);

-- Trigger auto-update updated_at
CREATE TRIGGER set_categories_updated_at
  BEFORE UPDATE ON categories
  FOR EACH ROW EXECUTE FUNCTION extensions.moddatetime();

-- RLS
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "categories_by_establishment" ON categories
  FOR ALL USING (
    establishment_id IN (
      SELECT establishment_id FROM profiles
      WHERE id = auth.uid()
    )
  );

CREATE POLICY "categories_admin_only_delete" ON categories
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND establishment_id = categories.establishment_id
        AND role IN ('admin', 'super_admin')
    )
  );
```

- [ ] **Étape 2 : Migration products — ajouter emoji, description, category_id**

```sql
-- supabase/migrations/20260326000002_products_v2.sql

-- Ajouter les champs manquants
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS emoji     VARCHAR(10),
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Renommer active → is_active pour cohérence avec la spec
ALTER TABLE products RENAME COLUMN active TO is_active;

-- Index
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_establishment ON products(establishment_id);

-- Soft delete — exclure les deleted des requêtes par défaut
CREATE OR REPLACE VIEW products_active AS
  SELECT * FROM products WHERE deleted_at IS NULL;
```

- [ ] **Étape 3 : Appliquer les migrations**
```bash
npx supabase db push
# ou pour développement local :
npx supabase migration up
```

- [ ] **Étape 4 : Commit**
```bash
git add supabase/migrations/
git commit -m "feat(db): migration categories table + products v2 (emoji, category_id, soft delete)"
```

---

## Tâche 2 : Mettre à jour les types TypeScript

**Fichiers :**
- Modify: `src/app/dashboard/products/_components/types.ts`

- [ ] **Étape 1 : Mettre à jour les types**

```typescript
// src/app/dashboard/products/_components/types.ts

export interface Category {
  id: string
  establishment_id: string
  name: string
  color_hex: string
  icon: string | null
  sort_order: number
  products_count?: number
}

export interface Product {
  id: string
  establishment_id: string
  name: string
  emoji: string | null
  description: string | null
  price: number          // price_ht en centimes ou €? → utiliser € avec 2 décimales
  tva_rate: 5.5 | 10 | 20
  category_id: string | null
  category?: Category
  is_active: boolean
  sort_order: number
  deleted_at: string | null
  created_at: string
  updated_at: string
}

export type BulkAction = 'activate' | 'deactivate' | 'delete' | 'change_category' | 'change_tva'
```

- [ ] **Étape 2 : Commit**
```bash
git add src/app/dashboard/products/_components/types.ts
git commit -m "feat(products): types Product et Category mis à jour"
```

---

## Tâche 3 : API Categories

**Fichiers :**
- Create: `src/app/api/categories/route.ts`
- Create: `src/app/api/categories/[id]/route.ts`
- Create: `src/app/api/categories/reorder/route.ts`
- Create: `src/lib/validations/category.ts`
- Create: `src/app/api/categories/route.test.ts`

- [ ] **Étape 1 : Schémas Zod**

```typescript
// src/lib/validations/category.ts
import { z } from 'zod'

export const createCategorySchema = z.object({
  name: z.string().min(1).max(50),
  color_hex: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#6b7280'),
  icon: z.string().max(10).optional(),
  sort_order: z.number().int().optional(),
})

export const updateCategorySchema = createCategorySchema.partial()

export const reorderCategoriesSchema = z.object({
  order: z.array(z.string().uuid()).min(1),
})
```

- [ ] **Étape 2 : Écrire les tests API**

```typescript
// src/app/api/categories/route.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock Supabase
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

import { createClient } from '@/lib/supabase/server'
import { GET, POST } from './route'
import { NextRequest } from 'next/server'

describe('GET /api/categories', () => {
  it('retourne les catégories triées par sort_order', async () => {
    const mockCategories = [
      { id: '1', name: 'Plats', sort_order: 0 },
      { id: '2', name: 'Boissons', sort_order: 1 },
    ]
    ;(createClient as ReturnType<typeof vi.fn>).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user1' } } }) },
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: mockCategories, error: null }),
      }),
    })
    const req = new NextRequest('http://localhost/api/categories')
    const res = await GET(req)
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.categories).toHaveLength(2)
  })

  it('retourne 401 si non authentifié', async () => {
    ;(createClient as ReturnType<typeof vi.fn>).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
    })
    const req = new NextRequest('http://localhost/api/categories')
    const res = await GET(req)
    expect(res.status).toBe(401)
  })
})
```

- [ ] **Étape 3 : Lancer les tests** — doivent échouer
```bash
npx vitest run src/app/api/categories/route.test.ts
```

- [ ] **Étape 4 : Implémenter GET/POST**

```typescript
// src/app/api/categories/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createCategorySchema } from '@/lib/validations/category'

export async function GET(_req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('categories')
    .select('*, products(count)')
    .order('sort_order')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ categories: data })
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('establishment_id, role')
    .eq('id', user.id)
    .single()

  if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 403 })

  const body = await req.json()
  const parsed = createCategorySchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const { data, error } = await supabase
    .from('categories')
    .insert({ ...parsed.data, establishment_id: profile.establishment_id })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ category: data }, { status: 201 })
}
```

- [ ] **Étape 5 : Implémenter PATCH/DELETE**

```typescript
// src/app/api/categories/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { updateCategorySchema } from '@/lib/validations/category'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await req.json()
  const parsed = updateCategorySchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const { data, error } = await supabase
    .from('categories')
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ category: data })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  // Vérifier qu'il n'y a pas de produits associés
  const { count } = await supabase
    .from('products')
    .select('*', { count: 'exact', head: true })
    .eq('category_id', id)
    .is('deleted_at', null)

  if ((count ?? 0) > 0) {
    return NextResponse.json(
      { error: { code: 'category_has_products', message: 'Déplacez les produits avant de supprimer cette catégorie' } },
      { status: 409 }
    )
  }

  const { error } = await supabase.from('categories').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
```

- [ ] **Étape 6 : Implémenter batch reorder**

```typescript
// src/app/api/categories/reorder/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { reorderCategoriesSchema } from '@/lib/validations/category'

export async function PATCH(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const parsed = reorderCategoriesSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  // Mise à jour atomique des sort_order
  const updates = parsed.data.order.map((id, index) =>
    supabase.from('categories').update({ sort_order: index }).eq('id', id)
  )

  await Promise.all(updates)

  const { data } = await supabase.from('categories').select().order('sort_order')
  return NextResponse.json({ categories: data })
}
```

- [ ] **Étape 7 : Lancer les tests — doivent passer**
```bash
npx vitest run src/app/api/categories/
```

- [ ] **Étape 8 : Commit**
```bash
git add src/app/api/categories/ src/lib/validations/category.ts
git commit -m "feat(api): CRUD categories + reorder batch endpoint"
```

---

## Tâche 4 : API Products mise à jour

**Fichiers :**
- Modify: `src/app/api/products/route.ts`
- Modify: `src/app/api/products/[id]/route.ts`
- Create: `src/app/api/products/bulk/route.ts`
- Create: `src/app/api/products/bulk/route.test.ts`

- [ ] **Étape 1 : Écrire tests bulk**

```typescript
// src/app/api/products/bulk/route.test.ts
import { describe, it, expect, vi } from 'vitest'
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
import { createClient } from '@/lib/supabase/server'
import { POST } from './route'
import { NextRequest } from 'next/server'

describe('POST /api/products/bulk', () => {
  it('active les produits sélectionnés', async () => {
    const mockUpdate = vi.fn().mockReturnValue({
      in: vi.fn().mockResolvedValue({ error: null }),
    })
    ;(createClient as ReturnType<typeof vi.fn>).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } } }) },
      from: vi.fn().mockReturnValue({ update: mockUpdate }),
    })
    const req = new NextRequest('http://localhost/api/products/bulk', {
      method: 'POST',
      body: JSON.stringify({ action: 'activate', ids: ['p1', 'p2'] }),
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
  })

  it('retourne 400 si action invalide', async () => {
    ;(createClient as ReturnType<typeof vi.fn>).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } } }) },
    })
    const req = new NextRequest('http://localhost/api/products/bulk', {
      method: 'POST',
      body: JSON.stringify({ action: 'fly', ids: ['p1'] }),
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })
})
```

- [ ] **Étape 2 : Lancer — doit échouer**
```bash
npx vitest run src/app/api/products/bulk/route.test.ts
```

- [ ] **Étape 3 : Implémenter bulk**

```typescript
// src/app/api/products/bulk/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { z } from 'zod'

const bulkSchema = z.object({
  action: z.enum(['activate', 'deactivate', 'delete', 'change_category', 'change_tva']),
  ids: z.array(z.string().uuid()).min(1),
  category_id: z.string().uuid().optional(),
  tva_rate: z.union([z.literal(5.5), z.literal(10), z.literal(20)]).optional(),
})

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const parsed = bulkSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const { action, ids, category_id, tva_rate } = parsed.data

  let update: Record<string, unknown> = {}
  if (action === 'activate') update = { is_active: true }
  else if (action === 'deactivate') update = { is_active: false }
  else if (action === 'delete') update = { deleted_at: new Date().toISOString() }
  else if (action === 'change_category' && category_id) update = { category_id }
  else if (action === 'change_tva' && tva_rate) update = { tva_rate }
  else return NextResponse.json({ error: 'Missing required field for action' }, { status: 400 })

  const { error } = await supabase
    .from('products')
    .update(update)
    .in('id', ids)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, count: ids.length })
}
```

- [ ] **Étape 4 : Mettre à jour GET products — ajouter filtres**

```typescript
// Dans src/app/api/products/route.ts, remplacer le GET par :
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const search = searchParams.get('search')
  const categoryId = searchParams.get('category_id')
  const status = searchParams.get('status')  // 'active' | 'inactive' | undefined
  const tvaRate = searchParams.get('tva_rate')

  let query = supabase
    .from('products')
    .select('*, category:categories(id, name, color_hex, icon)')
    .is('deleted_at', null)
    .order('sort_order')
    .order('name')

  if (search) query = query.ilike('name', `%${search}%`)
  if (categoryId) query = query.eq('category_id', categoryId)
  if (status === 'active') query = query.eq('is_active', true)
  if (status === 'inactive') query = query.eq('is_active', false)
  if (tvaRate) query = query.eq('tva_rate', parseFloat(tvaRate))

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ products: data })
}
```

- [ ] **Étape 5 : Lancer tous les tests**
```bash
npx vitest run src/app/api/products/
```

- [ ] **Étape 6 : Commit**
```bash
git add src/app/api/products/
git commit -m "feat(api): products filtres + bulk actions"
```

---

## Tâche 5 : Products Toolbar (recherche + filtres)

**Fichiers :**
- Create: `src/app/dashboard/products/_components/products-toolbar.tsx`

- [ ] **Étape 1 : Créer la toolbar**

```typescript
// src/app/dashboard/products/_components/products-toolbar.tsx
'use client'
import { useState, useTransition } from 'react'
import type { Category } from './types'

interface ProductsToolbarProps {
  categories: Category[]
  onSearch: (value: string) => void
  onFilterCategory: (id: string | null) => void
  onFilterStatus: (status: 'all' | 'active' | 'inactive') => void
  onFilterTva: (rate: number | null) => void
  onOpenCategories: () => void
  onAddProduct: () => void
}

export function ProductsToolbar({
  categories,
  onSearch,
  onFilterCategory,
  onFilterStatus,
  onFilterTva,
  onOpenCategories,
  onAddProduct,
}: ProductsToolbarProps) {
  const [search, setSearch] = useState('')
  const [, startTransition] = useTransition()

  const handleSearch = (value: string) => {
    setSearch(value)
    startTransition(() => onSearch(value))
  }

  return (
    <div className="flex items-center gap-3 flex-wrap mb-4">
      {/* Recherche */}
      <div className="relative flex-1 min-w-48">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text4)] text-sm">🔍</span>
        <input
          type="text"
          value={search}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder="Rechercher un produit..."
          className="w-full h-9 pl-8 pr-3 rounded-lg text-sm bg-[var(--surface)] border border-[var(--border)] text-[var(--text1)] placeholder:text-[var(--text4)] focus:outline-none focus:border-[var(--blue)]"
        />
      </div>

      {/* Filtre catégorie */}
      <select
        onChange={(e) => onFilterCategory(e.target.value || null)}
        className="h-9 px-3 rounded-lg text-sm bg-[var(--surface)] border border-[var(--border)] text-[var(--text2)] focus:outline-none focus:border-[var(--blue)]"
      >
        <option value="">Toutes catégories</option>
        {categories.map((cat) => (
          <option key={cat.id} value={cat.id}>{cat.name}</option>
        ))}
      </select>

      {/* Filtre statut */}
      <div className="flex rounded-lg overflow-hidden border border-[var(--border)]">
        {(['all', 'active', 'inactive'] as const).map((s) => (
          <button
            key={s}
            onClick={() => onFilterStatus(s)}
            className="h-9 px-3 text-sm text-[var(--text3)] hover:bg-[var(--surface2)] transition-colors first:pl-4 last:pr-4"
          >
            {s === 'all' ? 'Tous' : s === 'active' ? 'Actifs' : 'Inactifs'}
          </button>
        ))}
      </div>

      {/* Filtre TVA */}
      <select
        onChange={(e) => onFilterTva(e.target.value ? parseFloat(e.target.value) : null)}
        className="h-9 px-3 rounded-lg text-sm bg-[var(--surface)] border border-[var(--border)] text-[var(--text2)] focus:outline-none focus:border-[var(--blue)]"
      >
        <option value="">Toutes TVA</option>
        <option value="5.5">TVA 5,5%</option>
        <option value="10">TVA 10%</option>
        <option value="20">TVA 20%</option>
      </select>

      <div className="h-7 w-px bg-[var(--border)]" />

      {/* Bouton catégories */}
      <button
        onClick={onOpenCategories}
        className="h-9 px-3 rounded-lg text-sm text-[var(--text2)] border border-[var(--border)] hover:bg-[var(--surface2)] transition-colors"
      >
        Catégories
      </button>

      {/* Ajouter produit */}
      <button
        onClick={onAddProduct}
        className="h-9 px-4 rounded-lg text-sm font-semibold text-white transition-colors hover:opacity-90"
        style={{ background: 'var(--blue)' }}
      >
        + Nouveau produit
      </button>
    </div>
  )
}
```

- [ ] **Étape 2 : Commit**
```bash
git add src/app/dashboard/products/_components/products-toolbar.tsx
git commit -m "feat(products): toolbar recherche + filtres"
```

---

## Tâche 6 : Products Table (toggle inline + sélection)

**Fichiers :**
- Modify: `src/app/dashboard/products/_components/products-table.tsx`

- [ ] **Étape 1 : Réécrire la table**

```typescript
// src/app/dashboard/products/_components/products-table.tsx
'use client'
import { useState } from 'react'
import { toast } from 'sonner'
import { StatusToggle } from '@/components/ui/status-toggle'
import { TvaBadge } from '@/components/ui/tva-badge'
import type { Product } from './types'

interface ProductsTableProps {
  products: Product[]
  selectedIds: Set<string>
  onToggleSelect: (id: string) => void
  onSelectAll: (ids: string[]) => void
  onEdit: (product: Product) => void
  onDelete: (product: Product) => void
  onToggleStatus: (id: string, active: boolean) => Promise<void>
}

export function ProductsTable({
  products,
  selectedIds,
  onToggleSelect,
  onSelectAll,
  onEdit,
  onDelete,
  onToggleStatus,
}: ProductsTableProps) {
  const [loadingToggle, setLoadingToggle] = useState<string | null>(null)
  const allSelected = products.length > 0 && products.every((p) => selectedIds.has(p.id))

  const handleToggleStatus = async (product: Product) => {
    setLoadingToggle(product.id)
    try {
      await onToggleStatus(product.id, !product.is_active)
    } catch {
      toast.error('Erreur lors du changement de statut')
    } finally {
      setLoadingToggle(null)
    }
  }

  return (
    <div className="rounded-xl border border-[var(--border)] overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
            <th className="w-10 px-4 py-3">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={() =>
                  allSelected ? onSelectAll([]) : onSelectAll(products.map((p) => p.id))
                }
                className="rounded border-[var(--border)]"
              />
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--text4)]">
              Produit
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--text4)]">
              Catégorie
            </th>
            <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-[var(--text4)]">
              Prix TTC
            </th>
            <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-[var(--text4)]">
              TVA
            </th>
            <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-[var(--text4)]">
              Statut
            </th>
            <th className="w-20 px-4 py-3" />
          </tr>
        </thead>
        <tbody>
          {products.map((product, i) => (
            <tr
              key={product.id}
              style={{
                background: i % 2 === 0 ? 'transparent' : 'rgba(30,41,59,0.4)',
                borderBottom: '1px solid var(--border)',
              }}
              className="hover:bg-[var(--surface2)] transition-colors"
            >
              <td className="px-4 py-2.5">
                <input
                  type="checkbox"
                  checked={selectedIds.has(product.id)}
                  onChange={() => onToggleSelect(product.id)}
                  className="rounded border-[var(--border)]"
                />
              </td>
              <td className="px-4 py-2.5">
                <div className="flex items-center gap-2">
                  {product.emoji && <span className="text-xl">{product.emoji}</span>}
                  <span className="font-medium text-[var(--text1)]">{product.name}</span>
                </div>
              </td>
              <td className="px-4 py-2.5">
                {product.category ? (
                  <span
                    className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium"
                    style={{
                      background: `${product.category.color_hex}22`,
                      color: product.category.color_hex,
                    }}
                  >
                    {product.category.icon} {product.category.name}
                  </span>
                ) : (
                  <span className="text-xs text-[var(--text4)]">—</span>
                )}
              </td>
              <td className="px-4 py-2.5 text-right font-medium text-[var(--text1)] tabular-nums">
                {product.price.toFixed(2).replace('.', ',')} €
              </td>
              <td className="px-4 py-2.5 text-center">
                <TvaBadge rate={product.tva_rate as 5.5 | 10 | 20} />
              </td>
              <td className="px-4 py-2.5 text-center">
                <StatusToggle
                  active={product.is_active}
                  onChange={() => handleToggleStatus(product)}
                  loading={loadingToggle === product.id}
                />
              </td>
              <td className="px-4 py-2.5">
                <div className="flex items-center gap-1 justify-end">
                  <button
                    onClick={() => onEdit(product)}
                    className="w-7 h-7 rounded flex items-center justify-center text-[var(--text3)] hover:bg-[var(--surface2)] hover:text-[var(--text1)] transition-colors text-xs"
                    title="Modifier"
                  >
                    ✏️
                  </button>
                  <button
                    onClick={() => onDelete(product)}
                    className="w-7 h-7 rounded flex items-center justify-center text-[var(--text3)] hover:bg-[var(--red-bg)] hover:text-[var(--red)] transition-colors text-xs"
                    title="Supprimer"
                  >
                    🗑️
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Étape 2 : Commit**
```bash
git add src/app/dashboard/products/_components/products-table.tsx
git commit -m "feat(products): table avec toggle inline, sélection, TVA badge"
```

---

## Tâche 7 : Bulk Action Bar

**Fichiers :**
- Create: `src/app/dashboard/products/_components/bulk-action-bar.tsx`

- [ ] **Étape 1 : Créer la barre**

```typescript
// src/app/dashboard/products/_components/bulk-action-bar.tsx
'use client'
import type { Category } from './types'

interface BulkActionBarProps {
  count: number
  categories: Category[]
  onAction: (action: string, extra?: { category_id?: string; tva_rate?: number }) => void
  onClear: () => void
}

export function BulkActionBar({ count, categories, onAction, onClear }: BulkActionBarProps) {
  if (count === 0) return null

  return (
    <div
      className="fixed bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-3 px-4 py-3 rounded-xl shadow-2xl border border-[var(--border)] z-20"
      style={{ background: 'var(--surface)', minWidth: '480px' }}
    >
      <span className="text-sm font-semibold text-[var(--text1)]">{count} produit{count > 1 ? 's' : ''} sélectionné{count > 1 ? 's' : ''}</span>
      <div className="h-5 w-px bg-[var(--border)]" />
      <button
        onClick={() => onAction('activate')}
        className="h-8 px-3 rounded-lg text-xs font-semibold text-[var(--green)] border border-[var(--green)] hover:bg-[var(--green-bg)] transition-colors"
      >
        Activer
      </button>
      <button
        onClick={() => onAction('deactivate')}
        className="h-8 px-3 rounded-lg text-xs font-semibold text-[var(--text3)] border border-[var(--border)] hover:bg-[var(--surface2)] transition-colors"
      >
        Désactiver
      </button>
      <select
        onChange={(e) => e.target.value && onAction('change_category', { category_id: e.target.value })}
        className="h-8 px-2 rounded-lg text-xs bg-[var(--surface2)] border border-[var(--border)] text-[var(--text2)]"
        defaultValue=""
      >
        <option value="" disabled>Changer catégorie</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </select>
      <button
        onClick={() => onAction('delete')}
        className="h-8 px-3 rounded-lg text-xs font-semibold text-[var(--red)] border border-[var(--red)] hover:bg-[var(--red-bg)] transition-colors ml-auto"
      >
        Supprimer
      </button>
      <button onClick={onClear} className="text-xs text-[var(--text4)] hover:text-[var(--text2)] ml-1">
        ✕
      </button>
    </div>
  )
}
```

- [ ] **Étape 2 : Commit**
```bash
git add src/app/dashboard/products/_components/bulk-action-bar.tsx
git commit -m "feat(products): BulkActionBar component"
```

---

## Tâche 8 : Formulaire produit complet

**Fichiers :**
- Modify: `src/app/dashboard/products/_components/product-form.tsx`
- Modify: `src/lib/validations/product.ts`

- [ ] **Étape 1 : Mettre à jour le schéma Zod**

```typescript
// src/lib/validations/product.ts (remplacer)
import { z } from 'zod'

export const productSchema = z.object({
  name: z.string().min(1, 'Nom requis').max(100),
  emoji: z.string().max(10).optional(),
  description: z.string().max(500).optional(),
  price: z.number().positive('Prix doit être > 0'),
  tva_rate: z.union([z.literal(5.5), z.literal(10), z.literal(20)]),
  category_id: z.string().uuid().nullable().optional(),
  is_active: z.boolean().default(true),
})

export type ProductFormValues = z.infer<typeof productSchema>
```

- [ ] **Étape 2 : Réécrire le formulaire produit**

```typescript
// src/app/dashboard/products/_components/product-form.tsx
'use client'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { productSchema, type ProductFormValues } from '@/lib/validations/product'
import type { Category, Product } from './types'

const TVA_OPTIONS = [
  { value: 5.5, label: 'TVA 5,5% — alimentaire de base' },
  { value: 10, label: 'TVA 10% — restauration sur place' },
  { value: 20, label: 'TVA 20% — boissons, sodas' },
]

const EMOJI_SUGGESTIONS = ['🍽️', '🥩', '🍕', '🍺', '🥗', '🍰', '🥤', '🍜', '🥐', '🍔']

interface ProductFormProps {
  product?: Product | null
  categories: Category[]
  onSubmit: (values: ProductFormValues) => Promise<void>
  onCancel: () => void
}

export function ProductForm({ product, categories, onSubmit, onCancel }: ProductFormProps) {
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<ProductFormValues>({
    resolver: zodResolver(productSchema),
    defaultValues: {
      name: product?.name ?? '',
      emoji: product?.emoji ?? '',
      description: product?.description ?? '',
      price: product?.price ?? 0,
      tva_rate: (product?.tva_rate as 5.5 | 10 | 20) ?? 10,
      category_id: product?.category_id ?? null,
      is_active: product?.is_active ?? true,
    },
  })

  const selectedEmoji = watch('emoji')
  const price = watch('price')
  const tvaRate = watch('tva_rate')
  const priceTtc = price ? price * (1 + tvaRate / 100) : 0

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      {/* Emoji picker */}
      <div>
        <label className="text-xs text-[var(--text3)] uppercase tracking-wider mb-2 block">
          Icône
        </label>
        <div className="flex items-center gap-2 flex-wrap">
          {EMOJI_SUGGESTIONS.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => setValue('emoji', e)}
              className={[
                'w-10 h-10 rounded-lg text-xl transition-all',
                selectedEmoji === e
                  ? 'border-2 border-[var(--blue)] bg-[var(--blue-light)]'
                  : 'border border-[var(--border)] hover:bg-[var(--surface2)]',
              ].join(' ')}
            >
              {e}
            </button>
          ))}
          <input
            {...register('emoji')}
            placeholder="Autre…"
            className="w-20 h-10 px-3 rounded-lg text-sm bg-[var(--surface2)] border border-[var(--border)] text-[var(--text1)] placeholder:text-[var(--text4)] focus:outline-none focus:border-[var(--blue)]"
          />
        </div>
      </div>

      {/* Nom */}
      <div>
        <label className="text-xs text-[var(--text3)] uppercase tracking-wider mb-1.5 block">
          Nom du produit *
        </label>
        <input
          {...register('name')}
          className="w-full h-10 px-3 rounded-lg text-sm bg-[var(--surface2)] border border-[var(--border)] text-[var(--text1)] placeholder:text-[var(--text4)] focus:outline-none focus:border-[var(--blue)]"
          placeholder="Ex: Entrecôte 300g"
        />
        {errors.name && <p className="mt-1 text-xs text-[var(--red)]">{errors.name.message}</p>}
      </div>

      {/* Description */}
      <div>
        <label className="text-xs text-[var(--text3)] uppercase tracking-wider mb-1.5 block">
          Description
        </label>
        <textarea
          {...register('description')}
          rows={2}
          className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--surface2)] border border-[var(--border)] text-[var(--text1)] placeholder:text-[var(--text4)] focus:outline-none focus:border-[var(--blue)] resize-none"
          placeholder="Description optionnelle…"
        />
      </div>

      {/* Prix + TVA */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-[var(--text3)] uppercase tracking-wider mb-1.5 block">
            Prix HT (€) *
          </label>
          <input
            {...register('price', { valueAsNumber: true })}
            type="number"
            step="0.01"
            min="0"
            className="w-full h-10 px-3 rounded-lg text-sm bg-[var(--surface2)] border border-[var(--border)] text-[var(--text1)] focus:outline-none focus:border-[var(--blue)]"
          />
          {price > 0 && (
            <p className="mt-1 text-xs text-[var(--text3)]">
              TTC : {priceTtc.toFixed(2).replace('.', ',')} €
            </p>
          )}
          {errors.price && <p className="mt-1 text-xs text-[var(--red)]">{errors.price.message}</p>}
        </div>
        <div>
          <label className="text-xs text-[var(--text3)] uppercase tracking-wider mb-1.5 block">
            Taux TVA *
          </label>
          <select
            {...register('tva_rate', { valueAsNumber: true })}
            className="w-full h-10 px-3 rounded-lg text-sm bg-[var(--surface2)] border border-[var(--border)] text-[var(--text2)] focus:outline-none focus:border-[var(--blue)]"
          >
            {TVA_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Catégorie */}
      <div>
        <label className="text-xs text-[var(--text3)] uppercase tracking-wider mb-1.5 block">
          Catégorie
        </label>
        <select
          {...register('category_id')}
          className="w-full h-10 px-3 rounded-lg text-sm bg-[var(--surface2)] border border-[var(--border)] text-[var(--text2)] focus:outline-none focus:border-[var(--blue)]"
        >
          <option value="">Aucune catégorie</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
          ))}
        </select>
      </div>

      {/* Statut */}
      <div className="flex items-center justify-between py-2 px-3 rounded-lg bg-[var(--surface2)]">
        <span className="text-sm text-[var(--text2)]">Produit actif (visible sur la caisse)</span>
        <input type="checkbox" {...register('is_active')} className="rounded" />
      </div>

      {/* Actions */}
      <div className="flex gap-3 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 h-10 rounded-lg text-sm font-medium text-[var(--text2)] border border-[var(--border)] hover:bg-[var(--surface2)] transition-colors"
        >
          Annuler
        </button>
        <button
          type="submit"
          disabled={isSubmitting}
          className="flex-1 h-10 rounded-lg text-sm font-semibold text-white transition-colors hover:opacity-90 disabled:opacity-50"
          style={{ background: 'var(--blue)' }}
        >
          {isSubmitting ? 'Enregistrement…' : product ? 'Modifier' : 'Créer le produit'}
        </button>
      </div>
    </form>
  )
}
```

- [ ] **Étape 3 : Commit**
```bash
git add src/app/dashboard/products/_components/product-form.tsx src/lib/validations/product.ts
git commit -m "feat(products): formulaire complet avec emoji, TVA, catégorie"
```

---

## Tâche 9 : Modal Gestion Catégories

**Fichiers :**
- Create: `src/app/dashboard/products/_components/categories-modal.tsx`

- [ ] **Étape 1 : Installer @dnd-kit pour drag & drop**
```bash
npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

- [ ] **Étape 2 : Créer la modale**

```typescript
// src/app/dashboard/products/_components/categories-modal.tsx
'use client'
import { useState } from 'react'
import { DndContext, closestCenter, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { Category } from './types'

const COLOR_PRESETS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#6b7280']

interface CategoriesModalProps {
  categories: Category[]
  userRole: string
  onClose: () => void
  onCreate: (data: { name: string; color_hex: string; icon?: string }) => Promise<void>
  onUpdate: (id: string, data: Partial<Category>) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onReorder: (orderedIds: string[]) => Promise<void>
}

function SortableRow({
  category,
  canDelete,
  onUpdate,
  onDelete,
}: {
  category: Category
  canDelete: boolean
  onUpdate: (id: string, data: Partial<Category>) => void
  onDelete: (id: string) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: category.id })
  const style = { transform: CSS.Transform.toString(transform), transition }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-3 py-2.5 px-3 rounded-lg hover:bg-[var(--surface2)] group"
    >
      <span {...attributes} {...listeners} className="cursor-grab text-[var(--text4)] hover:text-[var(--text2)]">⠿</span>
      <span
        className="w-3.5 h-3.5 rounded flex-shrink-0"
        style={{ background: category.color_hex }}
      />
      <span className="text-sm text-[var(--text1)] flex-1">{category.icon} {category.name}</span>
      <span className="text-xs text-[var(--text4)]">{category.products_count ?? 0} produits</span>
      {canDelete && (
        <button
          onClick={() => onDelete(category.id)}
          className="opacity-0 group-hover:opacity-100 w-7 h-7 rounded text-[var(--red)] hover:bg-[var(--red-bg)] transition-all text-xs"
          title="Supprimer"
        >
          🗑️
        </button>
      )}
    </div>
  )
}

export function CategoriesModal({
  categories: initialCategories,
  userRole,
  onClose,
  onCreate,
  onUpdate,
  onDelete,
  onReorder,
}: CategoriesModalProps) {
  const [categories, setCategories] = useState(initialCategories)
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState('#3b82f6')
  const [newIcon, setNewIcon] = useState('')
  const [isAdding, setIsAdding] = useState(false)

  const canDelete = userRole === 'admin' || userRole === 'super_admin'

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = categories.findIndex((c) => c.id === active.id)
    const newIndex = categories.findIndex((c) => c.id === over.id)
    const reordered = arrayMove(categories, oldIndex, newIndex)
    setCategories(reordered)
    await onReorder(reordered.map((c) => c.id))
  }

  const handleCreate = async () => {
    if (!newName.trim()) return
    setIsAdding(true)
    try {
      await onCreate({ name: newName.trim(), color_hex: newColor, icon: newIcon || undefined })
      setNewName('')
      setNewIcon('')
    } finally {
      setIsAdding(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div
        className="relative w-full max-w-lg rounded-2xl p-6 shadow-2xl"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
      >
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-base font-semibold text-[var(--text1)]">Gérer les catégories</h3>
          <button onClick={onClose} className="text-[var(--text4)] hover:text-[var(--text2)] text-xl leading-none">×</button>
        </div>

        {/* Liste drag & drop */}
        <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={categories.map((c) => c.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-0.5 mb-4 max-h-64 overflow-y-auto">
              {categories.map((cat) => (
                <SortableRow
                  key={cat.id}
                  category={cat}
                  canDelete={canDelete}
                  onUpdate={onUpdate}
                  onDelete={onDelete}
                />
              ))}
              {categories.length === 0 && (
                <p className="text-sm text-center py-4 text-[var(--text4)]">Aucune catégorie</p>
              )}
            </div>
          </SortableContext>
        </DndContext>

        {/* Nouvelle catégorie */}
        <div className="border-t border-[var(--border)] pt-4">
          <p className="text-xs text-[var(--text3)] uppercase tracking-wider mb-3">Nouvelle catégorie</p>
          <div className="flex gap-2 mb-3">
            <input
              value={newIcon}
              onChange={(e) => setNewIcon(e.target.value)}
              placeholder="🍽️"
              className="w-12 h-9 px-2 text-center rounded-lg text-sm bg-[var(--surface2)] border border-[var(--border)] text-[var(--text1)] focus:outline-none focus:border-[var(--blue)]"
            />
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              placeholder="Nom de la catégorie"
              className="flex-1 h-9 px-3 rounded-lg text-sm bg-[var(--surface2)] border border-[var(--border)] text-[var(--text1)] placeholder:text-[var(--text4)] focus:outline-none focus:border-[var(--blue)]"
            />
          </div>
          <div className="flex items-center gap-2 mb-3">
            {COLOR_PRESETS.map((color) => (
              <button
                key={color}
                type="button"
                onClick={() => setNewColor(color)}
                className={`w-6 h-6 rounded-full transition-transform ${newColor === color ? 'scale-125 ring-2 ring-white' : ''}`}
                style={{ background: color }}
              />
            ))}
          </div>
          <button
            onClick={handleCreate}
            disabled={!newName.trim() || isAdding}
            className="w-full h-9 rounded-lg text-sm font-semibold text-white disabled:opacity-50 hover:opacity-90 transition-colors"
            style={{ background: 'var(--blue)' }}
          >
            {isAdding ? 'Création…' : '+ Ajouter la catégorie'}
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Étape 3 : Commit**
```bash
git add src/app/dashboard/products/_components/categories-modal.tsx package.json package-lock.json
git commit -m "feat(products): modal gestion catégories drag & drop"
```

---

## Tâche 10 : Intégration finale — ProductsPageClient

**Fichiers :**
- Modify: `src/app/dashboard/products/_components/products-page-client.tsx`
- Modify: `src/app/dashboard/products/page.tsx`

- [ ] **Étape 1 : Réécrire ProductsPageClient**

Le composant gère :
- État des filtres (`search`, `categoryFilter`, `statusFilter`, `tvaFilter`)
- Sélection en masse (`selectedIds: Set<string>`)
- Modales (product form add/edit, categories, delete confirm)
- Calls API (toggle status, bulk, CRUD)

```typescript
// src/app/dashboard/products/_components/products-page-client.tsx
'use client'
import { useState, useMemo, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ProductsToolbar } from './products-toolbar'
import { ProductsTable } from './products-table'
import { BulkActionBar } from './bulk-action-bar'
import { ProductForm } from './product-form'
import { CategoriesModal } from './categories-modal'
import { EmptyState } from '@/components/ui/empty-state'
import type { Product, Category } from './types'
import type { ProductFormValues } from '@/lib/validations/product'

interface ProductsPageClientProps {
  initialProducts: Product[]
  initialCategories: Category[]
  userRole: string
}

export function ProductsPageClient({
  initialProducts,
  initialCategories,
  userRole,
}: ProductsPageClientProps) {
  const router = useRouter()
  const [, startTransition] = useTransition()

  // Filters
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all')
  const [tvaFilter, setTvaFilter] = useState<number | null>(null)

  // Selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // Modals
  const [editProduct, setEditProduct] = useState<Product | null | 'new'>(null)
  const [deleteProduct, setDeleteProduct] = useState<Product | null>(null)
  const [showCategories, setShowCategories] = useState(false)

  // Data (mutable local state, re-fetched on changes via router.refresh)
  const [products, setProducts] = useState(initialProducts)
  const [categories, setCategories] = useState(initialCategories)

  const filtered = useMemo(() => {
    return products.filter((p) => {
      if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false
      if (categoryFilter && p.category_id !== categoryFilter) return false
      if (statusFilter === 'active' && !p.is_active) return false
      if (statusFilter === 'inactive' && p.is_active) return false
      if (tvaFilter !== null && p.tva_rate !== tvaFilter) return false
      return true
    })
  }, [products, search, categoryFilter, statusFilter, tvaFilter])

  // Handlers
  const handleToggleStatus = async (id: string, active: boolean) => {
    // Optimistic update
    setProducts((prev) => prev.map((p) => p.id === id ? { ...p, is_active: active } : p))
    const res = await fetch(`/api/products/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: active }),
    })
    if (!res.ok) {
      // Revert
      setProducts((prev) => prev.map((p) => p.id === id ? { ...p, is_active: !active } : p))
      throw new Error('Toggle failed')
    }
    toast.success(active ? 'Produit activé' : 'Produit désactivé')
  }

  const handleSubmitProduct = async (values: ProductFormValues) => {
    const isNew = editProduct === 'new'
    const url = isNew ? '/api/products' : `/api/products/${(editProduct as Product).id}`
    const res = await fetch(url, {
      method: isNew ? 'POST' : 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(values),
    })
    if (!res.ok) throw new Error('Save failed')
    toast.success(isNew ? 'Produit créé' : 'Produit modifié')
    setEditProduct(null)
    startTransition(() => router.refresh())
  }

  const handleDelete = async () => {
    if (!deleteProduct) return
    const res = await fetch(`/api/products/${deleteProduct.id}`, {
      method: 'DELETE',
    })
    if (!res.ok) { toast.error('Erreur lors de la suppression'); return }
    toast.success('Produit supprimé')
    setDeleteProduct(null)
    startTransition(() => router.refresh())
  }

  const handleBulkAction = async (action: string, extra?: { category_id?: string; tva_rate?: number }) => {
    const ids = Array.from(selectedIds)
    const res = await fetch('/api/products/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ids, ...extra }),
    })
    if (!res.ok) { toast.error('Erreur action en masse'); return }
    const { count } = await res.json()
    toast.success(`${count} produit${count > 1 ? 's' : ''} modifié${count > 1 ? 's' : ''}`)
    setSelectedIds(new Set())
    startTransition(() => router.refresh())
  }

  return (
    <>
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-[var(--text1)] mb-1">Produits</h2>
        <p className="text-sm text-[var(--text3)]">{filtered.length} produit{filtered.length > 1 ? 's' : ''}</p>
      </div>

      <ProductsToolbar
        categories={categories}
        onSearch={setSearch}
        onFilterCategory={setCategoryFilter}
        onFilterStatus={setStatusFilter}
        onFilterTva={setTvaFilter}
        onOpenCategories={() => setShowCategories(true)}
        onAddProduct={() => setEditProduct('new')}
      />

      {filtered.length === 0 ? (
        <EmptyState
          icon="🍽️"
          title="Votre catalogue est vide"
          description="Commencez par créer vos catégories, puis ajoutez vos produits."
          action={
            <button
              onClick={() => setEditProduct('new')}
              className="h-9 px-4 rounded-lg text-sm font-semibold text-white"
              style={{ background: 'var(--blue)' }}
            >
              + Ajouter un premier produit
            </button>
          }
        />
      ) : (
        <ProductsTable
          products={filtered}
          selectedIds={selectedIds}
          onToggleSelect={(id) =>
            setSelectedIds((prev) => {
              const next = new Set(prev)
              next.has(id) ? next.delete(id) : next.add(id)
              return next
            })
          }
          onSelectAll={(ids) => setSelectedIds(new Set(ids))}
          onEdit={(p) => setEditProduct(p)}
          onDelete={(p) => setDeleteProduct(p)}
          onToggleStatus={handleToggleStatus}
        />
      )}

      {/* Bulk bar */}
      <BulkActionBar
        count={selectedIds.size}
        categories={categories}
        onAction={handleBulkAction}
        onClear={() => setSelectedIds(new Set())}
      />

      {/* Modal produit */}
      {editProduct !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60" onClick={() => setEditProduct(null)} />
          <div
            className="relative w-full max-w-lg rounded-2xl p-6 shadow-2xl overflow-y-auto max-h-[90vh]"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
          >
            <h3 className="text-base font-semibold text-[var(--text1)] mb-5">
              {editProduct === 'new' ? 'Nouveau produit' : 'Modifier le produit'}
            </h3>
            <ProductForm
              product={editProduct === 'new' ? null : editProduct}
              categories={categories}
              onSubmit={handleSubmitProduct}
              onCancel={() => setEditProduct(null)}
            />
          </div>
        </div>
      )}

      {/* Modal suppression */}
      {deleteProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60" onClick={() => setDeleteProduct(null)} />
          <div
            className="relative w-full max-w-sm rounded-2xl p-6 shadow-2xl"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
          >
            <h3 className="text-base font-semibold text-[var(--text1)] mb-2">Supprimer le produit</h3>
            <p className="text-sm text-[var(--text3)] mb-5">
              Supprimer <strong className="text-[var(--text1)]">{deleteProduct.name}</strong> définitivement ?
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteProduct(null)}
                className="flex-1 h-10 rounded-lg text-sm border border-[var(--border)] text-[var(--text2)] hover:bg-[var(--surface2)]"
              >
                Annuler
              </button>
              <button
                onClick={handleDelete}
                className="flex-1 h-10 rounded-lg text-sm font-semibold text-white"
                style={{ background: 'var(--red)' }}
              >
                Supprimer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal catégories */}
      {showCategories && (
        <CategoriesModal
          categories={categories}
          userRole={userRole}
          onClose={() => setShowCategories(false)}
          onCreate={async (data) => {
            const res = await fetch('/api/categories', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(data),
            })
            if (!res.ok) throw new Error('Create failed')
            const { category } = await res.json()
            setCategories((prev) => [...prev, category])
            toast.success('Catégorie créée')
          }}
          onUpdate={async (id, data) => {
            await fetch(`/api/categories/${id}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(data),
            })
            setCategories((prev) => prev.map((c) => c.id === id ? { ...c, ...data } : c))
          }}
          onDelete={async (id) => {
            const res = await fetch(`/api/categories/${id}`, { method: 'DELETE' })
            if (!res.ok) {
              const { error } = await res.json()
              toast.error(error.message ?? 'Erreur suppression')
              return
            }
            setCategories((prev) => prev.filter((c) => c.id !== id))
            toast.success('Catégorie supprimée')
          }}
          onReorder={async (orderedIds) => {
            await fetch('/api/categories/reorder', {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ order: orderedIds }),
            })
          }}
        />
      )}
    </>
  )
}
```

- [ ] **Étape 2 : Mettre à jour le Server Component pour fetch les catégories**

```typescript
// src/app/dashboard/products/page.tsx
import { createClient } from '@/lib/supabase/server'
import { ProductsPageClient } from './_components/products-page-client'

export default async function ProductsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('establishment_id, role')
    .eq('id', user.id)
    .single()

  const baseFilter = profile?.establishment_id
    ? { establishment_id: profile.establishment_id }
    : {}

  const [{ data: products }, { data: categories }] = await Promise.all([
    supabase
      .from('products')
      .select('*, category:categories(id, name, color_hex, icon)')
      .match(baseFilter)
      .is('deleted_at', null)
      .order('sort_order')
      .order('name'),
    supabase
      .from('categories')
      .select('*, products(count)')
      .match(baseFilter)
      .order('sort_order'),
  ])

  return (
    <ProductsPageClient
      initialProducts={products ?? []}
      initialCategories={categories ?? []}
      userRole={profile?.role ?? 'admin'}
    />
  )
}
```

- [ ] **Étape 3 : Lancer tous les tests**
```bash
npx vitest run
```

- [ ] **Étape 4 : Test visuel complet** — vérifier les 9 écrans du mockup dans le navigateur.

- [ ] **Étape 5 : Commit final sprint 2**
```bash
git add src/app/dashboard/products/
git commit -m "feat(products): dashboard produits complet — 9 écrans, catégories, bulk, filtres"
```

---

## Résumé Sprint 2

| Feature | Status |
|---------|--------|
| Migration DB categories | ✅ |
| Migration products v2 | ✅ |
| API categories CRUD + reorder | ✅ |
| API products filtres + bulk | ✅ |
| Toolbar recherche + filtres | ✅ |
| Table toggle inline + sélection | ✅ |
| Bulk action bar | ✅ |
| Formulaire produit complet | ✅ |
| Modal catégories drag & drop | ✅ |
| Intégration complète | ✅ |
