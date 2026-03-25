# Alloflow Phase 1 — Fondations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scaffolder Alloflow (Next.js 14 + Supabase + shadcn/ui), créer toute la BDD, l'auth par rôles, le CRUD produits, et déployer sur Vercel.

**Architecture:** App Next.js App Router avec routes API protégées par session Supabase. Toutes les tables BDD sont créées dès Phase 1. RLS activé sur toutes les tables. UI construite avec shadcn/ui.

**Tech Stack:** Next.js 14, TypeScript strict, Tailwind CSS, shadcn/ui, Supabase CLI, @supabase/ssr, Zod, Vitest

---

## Fichiers créés

```
alloflow/
  src/
    app/
      (auth)/login/page.tsx              → Page login
      (dashboard)/
        layout.tsx                       → Layout protégé + header avec déconnexion
        products/
          page.tsx                       → Page liste produits
          _components/
            products-table.tsx           → Tableau shadcn/ui
            product-form.tsx             → Formulaire modal créer/modifier
            products-page-client.tsx     → Wrapper client (état + actions)
    api/
      products/
        route.ts                         → GET + POST
        [id]/route.ts                    → PATCH + DELETE
    lib/
      supabase/
        client.ts                        → Client browser
        server.ts                        → Client server (SSR)
      validations/
        product.ts                       → Schémas Zod
      types/
        database.ts                      → Types TypeScript des tables
    middleware.ts                        → Protection routes dashboard
  supabase/
    migrations/
      20260325000001_organizations.sql
      20260325000002_profiles.sql
      20260325000003_products.sql
      20260325000004_orders.sql
      20260325000005_stocks.sql
      20260325000006_crm.sql
  vitest.config.ts
  vitest.setup.ts
  src/lib/validations/product.test.ts
  src/app/api/products/route.test.ts
  src/app/api/products/[id]/route.test.ts
```

---

### Task 1: Scaffold Next.js + installer les dépendances

**Files:**
- Create: `alloflow/` (projet entier)
- Create: `vitest.config.ts`
- Create: `vitest.setup.ts`

- [ ] **Step 1: Scaffold le projet Next.js**

```bash
npx create-next-app@latest alloflow \
  --typescript \
  --tailwind \
  --app \
  --src-dir \
  --import-alias "@/*" \
  --no-eslint
cd alloflow
```

- [ ] **Step 2: Installer les dépendances**

```bash
npm install @supabase/supabase-js @supabase/ssr zod
npm install -D vitest @vitejs/plugin-react @testing-library/react jsdom
```

- [ ] **Step 3: Installer shadcn/ui**

```bash
npx shadcn@latest init
```
Répondre aux prompts : style `default`, couleur `slate`, CSS variables `yes`.

Installer les composants nécessaires :
```bash
npx shadcn@latest add button input label table dialog form select badge
```

- [ ] **Step 4: Configurer Vitest**

Créer `vitest.config.ts` :
```ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
```

Créer `vitest.setup.ts` :
```ts
import { vi } from 'vitest'
```

Ajouter dans `package.json` sous `"scripts"` :
```json
"test": "vitest",
"test:run": "vitest run"
```

- [ ] **Step 5: Vérifier que Vitest fonctionne**

Créer un test temporaire `src/lib/test-setup.test.ts` :
```ts
describe('setup', () => {
  it('fonctionne', () => {
    expect(1 + 1).toBe(2)
  })
})
```

```bash
npm run test:run
```
Attendu : `1 passed`

Supprimer le test temporaire.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: scaffold Next.js 14 + Vitest + shadcn/ui"
```

---

### Task 2: Initialiser Supabase CLI

**Files:**
- Create: `supabase/` (via CLI)

- [ ] **Step 1: Installer Supabase CLI**

```bash
brew install supabase/tap/supabase
```
Ou via npm : `npm install -g supabase`

- [ ] **Step 2: Initialiser Supabase dans le projet**

```bash
supabase init
```
Attendu : dossier `supabase/` créé avec `config.toml`

- [ ] **Step 3: Créer le projet sur Supabase Cloud**

1. Aller sur https://supabase.com → New project
2. Nom : `alloflow`, région : **Frankfurt (EU Central)**
3. Sauvegarder le mot de passe BDD

- [ ] **Step 4: Lier le projet local au projet cloud**

```bash
supabase login
supabase link --project-ref <TON_PROJECT_REF>
```
Le `project-ref` est visible dans l'URL du dashboard Supabase.

- [ ] **Step 5: Configurer les variables d'environnement**

Créer `.env.local` (jamais committé) :
```env
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
```
Ces valeurs sont dans Supabase dashboard → Settings → API.

- [ ] **Step 6: Commit**

```bash
git add supabase/
git commit -m "feat: initialisation Supabase CLI"
```

---

### Task 3: Migrations BDD — Organizations & Establishments

**Files:**
- Create: `supabase/migrations/20260325000001_organizations.sql`

- [ ] **Step 1: Créer la migration**

```bash
supabase migration new organizations
```
Renommer le fichier généré en `20260325000001_organizations.sql` ou utiliser le nom généré.

Contenu du fichier :
```sql
-- Organizations (siège ou franchise)
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null check (type in ('siege', 'franchise')),
  created_at timestamptz not null default now()
);

-- Establishments (points de vente)
create table public.establishments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  org_id uuid not null references public.organizations(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- RLS
alter table public.organizations enable row level security;
alter table public.establishments enable row level security;

-- Policies de base (lecture pour les utilisateurs authentifiés)
-- Note : policies plus granulaires ajoutées en Phase 4 (multi-établissements)
create policy "Utilisateurs authentifiés lisent les organisations"
  on public.organizations for select
  using (auth.role() = 'authenticated');

create policy "Utilisateurs authentifiés lisent les établissements"
  on public.establishments for select
  using (auth.role() = 'authenticated');
```

- [ ] **Step 2: Appliquer la migration sur Supabase Cloud**

```bash
supabase db push
```
Attendu : `Applying migration...` sans erreur.

- [ ] **Step 3: Commit**

```bash
git add supabase/
git commit -m "feat(db): migration organizations et establishments"
```

---

### Task 4: Migration BDD — Profiles + RLS

**Files:**
- Create: `supabase/migrations/20260325000002_profiles.sql`

- [ ] **Step 1: Créer la migration**

```bash
supabase migration new profiles
```

Contenu :
```sql
-- Types
create type public.user_role as enum ('super_admin', 'admin', 'caissier');

-- Profiles (étend auth.users)
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role public.user_role not null default 'caissier',
  establishment_id uuid references public.establishments(id),
  org_id uuid references public.organizations(id),
  created_at timestamptz not null default now()
);

-- RLS
alter table public.profiles enable row level security;

-- Politique : un utilisateur peut lire son propre profil
create policy "Utilisateur lit son profil"
  on public.profiles for select
  using (auth.uid() = id);

-- Politique : un admin peut lire les profils de son établissement
create policy "Admin lit profils établissement"
  on public.profiles for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('admin', 'super_admin')
        and (p.establishment_id = profiles.establishment_id or p.role = 'super_admin')
    )
  );

-- Trigger : créer un profil automatiquement à l'inscription
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id)
  values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
```

- [ ] **Step 2: Appliquer**

```bash
supabase db push
```

- [ ] **Step 3: Commit**

```bash
git add supabase/
git commit -m "feat(db): migration profiles avec RLS et trigger"
```

---

### Task 5: Migration BDD — Products

**Files:**
- Create: `supabase/migrations/20260325000003_products.sql`

- [ ] **Step 1: Créer la migration**

```bash
supabase migration new products
```

Contenu :
```sql
-- Types
create type public.product_category as enum ('entree', 'plat', 'dessert', 'boisson', 'autre');

-- Products
create table public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  price numeric(10, 2) not null check (price >= 0),
  category public.product_category not null,
  tva_rate numeric(4, 2) not null check (tva_rate in (5.5, 10, 20)),
  establishment_id uuid not null references public.establishments(id) on delete cascade,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- RLS
alter table public.products enable row level security;

-- Politique : les utilisateurs voient les produits de leur établissement
create policy "Utilisateurs voient produits établissement"
  on public.products for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and (p.establishment_id = products.establishment_id or p.role = 'super_admin')
    )
  );

-- Politique : seuls admin et super_admin peuvent modifier
create policy "Admins modifient produits"
  on public.products for all
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('admin', 'super_admin')
        and (p.establishment_id = products.establishment_id or p.role = 'super_admin')
    )
  );
```

- [ ] **Step 2: Appliquer**

```bash
supabase db push
```

- [ ] **Step 3: Commit**

```bash
git add supabase/
git commit -m "feat(db): migration products avec RLS"
```

---

### Task 6: Migrations BDD — Tables futures (Phase 2-4)

**Files:**
- Create: `supabase/migrations/20260325000004_orders.sql`
- Create: `supabase/migrations/20260325000005_stocks.sql`
- Create: `supabase/migrations/20260325000006_crm.sql`

- [ ] **Step 1: Migration 004 — Commandes**

```bash
supabase migration new orders
```

Contenu :
```sql
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  establishment_id uuid not null references public.establishments(id),
  total numeric(10, 2) not null default 0,
  payment_method text,
  status text not null default 'pending',
  customer_id uuid, -- FK vers customers ajoutée dans migration 006
  created_at timestamptz not null default now()
);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid not null references public.products(id),
  quantity int not null check (quantity > 0),
  unit_price numeric(10, 2) not null
);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id),
  amount numeric(10, 2) not null,
  type text not null,
  tpe_ref text,
  created_at timestamptz not null default now()
);

alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.transactions enable row level security;
```

- [ ] **Step 2: Migration 005 — Stocks & recettes**

```bash
supabase migration new stocks
```

Contenu :
```sql
create table public.stock_items (
  id uuid primary key default gen_random_uuid(),
  establishment_id uuid not null references public.establishments(id),
  ingredient text not null,
  quantity numeric not null default 0,
  unit text not null,
  alert_threshold numeric not null default 0
);

create table public.recipes (
  id uuid primary key default gen_random_uuid(),
  establishment_id uuid not null references public.establishments(id),
  title text not null,
  content text,
  media_urls text[] default '{}',
  version int not null default 1
);

create table public.sops (
  id uuid primary key default gen_random_uuid(),
  establishment_id uuid not null references public.establishments(id),
  title text not null,
  content text,
  media_urls text[] default '{}',
  version int not null default 1
);

alter table public.stock_items enable row level security;
alter table public.recipes enable row level security;
alter table public.sops enable row level security;
```

- [ ] **Step 3: Migration 006 — CRM**

```bash
supabase migration new crm
```

Contenu :
```sql
create table public.customers (
  id uuid primary key default gen_random_uuid(),
  establishment_id uuid not null references public.establishments(id),
  name text not null,
  phone text,
  email text,
  points int not null default 0,
  tier text not null default 'bronze' check (tier in ('bronze', 'argent', 'or'))
);

create table public.loyalty_rewards (
  id uuid primary key default gen_random_uuid(),
  establishment_id uuid not null references public.establishments(id),
  name text not null,
  points_required int not null,
  discount_type text not null check (discount_type in ('percent', 'fixed', 'product')),
  discount_value numeric not null default 0
);

create table public.loyalty_transactions (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id),
  order_id uuid references public.orders(id),
  points int not null,
  type text not null check (type in ('earn', 'redeem')),
  created_at timestamptz not null default now()
);

-- Ajouter la FK customer_id sur orders maintenant que customers existe
alter table public.orders
  add constraint orders_customer_id_fkey
  foreign key (customer_id) references public.customers(id);

alter table public.customers enable row level security;
alter table public.loyalty_rewards enable row level security;
alter table public.loyalty_transactions enable row level security;
```

- [ ] **Step 4: Appliquer toutes les migrations**

```bash
supabase db push
```
Attendu : les 6 migrations appliquées sans erreur.

- [ ] **Step 5: Commit**

```bash
git add supabase/
git commit -m "feat(db): migrations complètes Phase 2-4 (tables vides)"
```

---

### Task 7: Clients Supabase + Types TypeScript

**Files:**
- Create: `src/lib/supabase/client.ts`
- Create: `src/lib/supabase/server.ts`
- Create: `src/lib/types/database.ts`

- [ ] **Step 1: Générer les types TypeScript depuis Supabase**

```bash
supabase gen types typescript --linked > src/lib/types/database.ts
```
Attendu : fichier `database.ts` avec les types de toutes les tables.

- [ ] **Step 2: Créer le client browser**

```ts
// src/lib/supabase/client.ts
import { createBrowserClient } from '@supabase/ssr'
import type { Database } from '@/lib/types/database'

export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
```

- [ ] **Step 3: Créer le client server**

```ts
// src/lib/supabase/server.ts
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { Database } from '@/lib/types/database'

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Ignoré en Server Component (pas de set)
          }
        },
      },
    }
  )
}
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/
git commit -m "feat: clients Supabase browser et server + types TypeScript"
```

---

### Task 8: Schémas Zod + tests

**Files:**
- Create: `src/lib/validations/product.ts`
- Create: `src/lib/validations/product.test.ts`

- [ ] **Step 1: Écrire les tests en premier (RED)**

```ts
// src/lib/validations/product.test.ts
import { describe, it, expect } from 'vitest'
import { createProductSchema, updateProductSchema } from './product'

describe('createProductSchema', () => {
  it('valide un produit correct', () => {
    const result = createProductSchema.safeParse({
      name: 'Burger Classic',
      price: 12.50,
      category: 'plat',
      tva_rate: 10,
    })
    expect(result.success).toBe(true)
  })

  it('rejette un prix négatif', () => {
    const result = createProductSchema.safeParse({
      name: 'Burger',
      price: -5,
      category: 'plat',
      tva_rate: 10,
    })
    expect(result.success).toBe(false)
  })

  it('rejette un taux de TVA invalide', () => {
    const result = createProductSchema.safeParse({
      name: 'Burger',
      price: 10,
      category: 'plat',
      tva_rate: 15,
    })
    expect(result.success).toBe(false)
  })

  it('rejette une catégorie invalide', () => {
    const result = createProductSchema.safeParse({
      name: 'Burger',
      price: 10,
      category: 'sandwich',
      tva_rate: 10,
    })
    expect(result.success).toBe(false)
  })

  it('rejette un nom vide', () => {
    const result = createProductSchema.safeParse({
      name: '',
      price: 10,
      category: 'plat',
      tva_rate: 10,
    })
    expect(result.success).toBe(false)
  })
})

describe('updateProductSchema', () => {
  it('accepte une mise à jour partielle', () => {
    const result = updateProductSchema.safeParse({ price: 15.00 })
    expect(result.success).toBe(true)
  })

  it('rejette un objet vide', () => {
    const result = updateProductSchema.safeParse({})
    expect(result.success).toBe(false)
  })
})
```

- [ ] **Step 2: Vérifier que les tests échouent (RED)**

```bash
npm run test:run -- src/lib/validations/product.test.ts
```
Attendu : FAIL (module non trouvé)

- [ ] **Step 3: Implémenter les schémas (GREEN)**

```ts
// src/lib/validations/product.ts
import { z } from 'zod'

const CATEGORIES = ['entree', 'plat', 'dessert', 'boisson', 'autre'] as const
const TVA_RATES = [5.5, 10, 20] as const

export const createProductSchema = z.object({
  name: z.string().min(1, 'Le nom est requis'),
  price: z.number().min(0, 'Le prix doit être positif'),
  category: z.enum(CATEGORIES, { message: 'Catégorie invalide' }),
  tva_rate: z.union([
    z.literal(5.5),
    z.literal(10),
    z.literal(20),
  ], { message: 'TVA invalide (5.5, 10 ou 20)' }),
})

export const updateProductSchema = createProductSchema
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Au moins un champ est requis',
  })

export type CreateProductInput = z.infer<typeof createProductSchema>
export type UpdateProductInput = z.infer<typeof updateProductSchema>
```

- [ ] **Step 4: Vérifier que les tests passent (GREEN)**

```bash
npm run test:run -- src/lib/validations/product.test.ts
```
Attendu : `6 passed`

- [ ] **Step 5: Commit**

```bash
git add src/lib/validations/
git commit -m "feat(validation): schémas Zod produits avec tests"
```

---

### Task 9: Middleware Next.js (protection des routes)

**Files:**
- Create: `src/middleware.ts`

- [ ] **Step 1: Créer le middleware**

```ts
// src/middleware.ts
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  const isDashboard = request.nextUrl.pathname.startsWith('/dashboard')
  const isLogin = request.nextUrl.pathname.startsWith('/login')

  if (isDashboard && !user) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  if (isDashboard && user) {
    // Vérifier le rôle : les caissiers n'ont pas accès au dashboard
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (profile?.role === 'caissier') {
      const url = new URL('/login', request.url)
      url.searchParams.set('error', 'unauthorized')
      return NextResponse.redirect(url)
    }
  }

  if (isLogin && user) {
    return NextResponse.redirect(new URL('/dashboard/products', request.url))
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/dashboard/:path*', '/login'],
}
```

- [ ] **Step 2: Vérifier manuellement**

```bash
npm run dev
```
- Aller sur `http://localhost:3000/dashboard/products` sans être connecté → doit rediriger vers `/login`
- Aller sur `http://localhost:3000/login` → doit afficher la page (même vide pour l'instant)

- [ ] **Step 3: Commit**

```bash
git add src/middleware.ts
git commit -m "feat(auth): middleware de protection des routes dashboard"
```

---

### Task 10: Page Login

**Files:**
- Create: `src/app/(auth)/login/page.tsx`

- [ ] **Step 1: Créer la page login**

```tsx
// src/app/(auth)/login/page.tsx
'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const searchParams = useSearchParams()

  const unauthorized = searchParams.get('error') === 'unauthorized'

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError('Email ou mot de passe incorrect')
      setLoading(false)
      return
    }

    router.push('/dashboard/products')
    router.refresh()
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-md p-8 bg-white rounded-lg shadow">
        <h1 className="text-2xl font-bold mb-6 text-center">Alloflow</h1>

        {unauthorized && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
            Accès non autorisé. Contactez votre administrateur.
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>

          <div>
            <Label htmlFor="password">Mot de passe</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </div>

          {error && (
            <p className="text-sm text-red-600">{error}</p>
          )}

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Connexion...' : 'Se connecter'}
          </Button>
        </form>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Tester manuellement**

```bash
npm run dev
```
- Aller sur `http://localhost:3000/login`
- Le formulaire s'affiche
- Essayer un mauvais email → message d'erreur "Email ou mot de passe incorrect"

Pour créer un utilisateur de test :
1. Supabase dashboard → Authentication → Users → Add user
2. Email : `admin@test.com`, mot de passe : `password123`
3. Dans Table Editor → profiles → mettre le rôle à `admin` **ET** renseigner `establishment_id`
   (sinon l'API `/api/products` ne renverra aucun produit sans erreur visible)
4. Dans Table Editor → establishments → créer un établissement de test et copier son `id`

- [ ] **Step 3: Commit**

```bash
git add src/app/
git commit -m "feat(auth): page login"
```

---

### Task 11: Dashboard Layout + Header

**Files:**
- Create: `src/app/(dashboard)/layout.tsx`

- [ ] **Step 1: Créer le layout**

```tsx
// src/app/(dashboard)/layout.tsx
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Button } from '@/components/ui/button'

async function signOut() {
  'use server'
  const { createClient: createServerClient } = await import('@/lib/supabase/server')
  const supabase = await createServerClient()
  await supabase.auth.signOut()
  redirect('/login')
}

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-6 py-3 flex items-center justify-between">
        <h1 className="text-lg font-semibold">Alloflow</h1>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-500">{user.email}</span>
          <span className="text-xs bg-gray-100 px-2 py-1 rounded">{profile?.role}</span>
          <form action={signOut}>
            <Button type="submit" variant="outline" size="sm">
              Déconnexion
            </Button>
          </form>
        </div>
      </header>
      <main className="p-6">{children}</main>
    </div>
  )
}
```

- [ ] **Step 2: Tester manuellement**

Connecté en tant qu'admin :
- Header visible avec email, rôle, bouton déconnexion
- Bouton déconnexion → redirige vers `/login`

- [ ] **Step 3: Commit**

```bash
git add src/app/(dashboard)/
git commit -m "feat(dashboard): layout avec header et déconnexion"
```

---

### Task 12: API Routes Produits — GET et POST

**Files:**
- Create: `src/app/api/products/route.ts`
- Create: `src/app/api/products/route.test.ts`

- [ ] **Step 1: Écrire les tests (RED)**

```ts
// src/app/api/products/route.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// Mock Supabase server
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

// Mock next/headers (requis par Supabase SSR)
vi.mock('next/headers', () => ({
  cookies: vi.fn(() => ({ getAll: () => [], set: vi.fn() })),
}))

import { GET, POST } from './route'
import { createClient } from '@/lib/supabase/server'

const mockProducts = [
  { id: '1', name: 'Burger', price: 12.5, category: 'plat', tva_rate: 10, active: true },
]

function mockSupabase(overrides = {}) {
  const base = {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: 'user-1' } },
        error: null,
      }),
    },
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: mockProducts[0], error: null }),
      mockResolvedValue: undefined,
      then: undefined,
      ...overrides,
    })),
  }
  ;(createClient as ReturnType<typeof vi.fn>).mockResolvedValue(base)
  return base
}

describe('GET /api/products', () => {
  it('retourne 401 si non authentifié', async () => {
    const mock = mockSupabase()
    mock.auth.getUser.mockResolvedValue({ data: { user: null }, error: null })

    const req = new NextRequest('http://localhost/api/products')
    const res = await GET(req)
    expect(res.status).toBe(401)
  })
})

describe('POST /api/products', () => {
  it('retourne 400 si données invalides', async () => {
    mockSupabase()
    const req = new NextRequest('http://localhost/api/products', {
      method: 'POST',
      body: JSON.stringify({ name: '', price: -1 }),
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })
})
```

- [ ] **Step 2: Vérifier que les tests échouent (RED)**

```bash
npm run test:run -- src/app/api/products/route.test.ts
```
Attendu : FAIL (module non trouvé)

- [ ] **Step 3: Implémenter GET et POST (GREEN)**

```ts
// src/app/api/products/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createProductSchema } from '@/lib/validations/product'

export async function GET(_req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('establishment_id, role')
    .eq('id', user.id)
    .single()

  let query = supabase.from('products').select('*')

  if (profile?.role !== 'super_admin' && profile?.establishment_id) {
    query = query.eq('establishment_id', profile.establishment_id)
  }

  const { data, error } = await query.eq('active', true)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  const body = await req.json()
  const result = createProductSchema.safeParse(body)

  if (!result.success) {
    return NextResponse.json({ error: result.error.flatten() }, { status: 400 })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('establishment_id, role')
    .eq('id', user.id)
    .single()

  if (!profile?.establishment_id) {
    return NextResponse.json({ error: 'Établissement non trouvé' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('products')
    .insert({ ...result.data, establishment_id: profile.establishment_id })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data, { status: 201 })
}
```

- [ ] **Step 4: Vérifier que les tests passent (GREEN)**

```bash
npm run test:run -- src/app/api/products/route.test.ts
```
Attendu : `2 passed`

- [ ] **Step 5: Commit**

```bash
git add src/app/api/products/
git commit -m "feat(api): GET et POST /api/products"
```

---

### Task 13: API Routes Produits — PATCH et DELETE

**Files:**
- Create: `src/app/api/products/[id]/route.ts`
- Create: `src/app/api/products/[id]/route.test.ts`

- [ ] **Step 1: Écrire les tests (RED)**

```ts
// src/app/api/products/[id]/route.test.ts
import { describe, it, expect, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))
vi.mock('next/headers', () => ({
  cookies: vi.fn(() => ({ getAll: () => [], set: vi.fn() })),
}))

import { PATCH, DELETE } from './route'
import { createClient } from '@/lib/supabase/server'

function mockSupabase(userNull = false) {
  const mock = {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: userNull ? null : { id: 'user-1' } },
      }),
    },
    from: vi.fn(() => ({
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { id: 'prod-1' }, error: null }),
    })),
  }
  ;(createClient as ReturnType<typeof vi.fn>).mockResolvedValue(mock)
  return mock
}

describe('PATCH /api/products/[id]', () => {
  it('retourne 401 si non authentifié', async () => {
    mockSupabase(true)
    const req = new NextRequest('http://localhost/api/products/1', {
      method: 'PATCH',
      body: JSON.stringify({ price: 15 }),
    })
    const res = await PATCH(req, { params: Promise.resolve({ id: '1' }) })
    expect(res.status).toBe(401)
  })

  it('retourne 400 si body invalide', async () => {
    mockSupabase()
    const req = new NextRequest('http://localhost/api/products/1', {
      method: 'PATCH',
      body: JSON.stringify({}),
    })
    const res = await PATCH(req, { params: Promise.resolve({ id: '1' }) })
    expect(res.status).toBe(400)
  })
})

describe('DELETE /api/products/[id]', () => {
  it('retourne 401 si non authentifié', async () => {
    mockSupabase(true)
    const req = new NextRequest('http://localhost/api/products/1', {
      method: 'DELETE',
    })
    const res = await DELETE(req, { params: Promise.resolve({ id: '1' }) })
    expect(res.status).toBe(401)
  })
})
```

- [ ] **Step 2: Vérifier que les tests échouent (RED)**

```bash
npm run test:run -- "src/app/api/products/\[id\]/route.test.ts"
```
Attendu : FAIL

- [ ] **Step 3: Implémenter PATCH et DELETE (GREEN)**

```ts
// src/app/api/products/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { updateProductSchema } from '@/lib/validations/product'

type Params = { params: Promise<{ id: string }> }

export async function PATCH(req: NextRequest, { params }: Params) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  const { id } = await params
  const body = await req.json()
  const result = updateProductSchema.safeParse(body)

  if (!result.success) {
    return NextResponse.json({ error: result.error.flatten() }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('products')
    .update(result.data)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  const { id } = await params

  const { error } = await supabase
    .from('products')
    .update({ active: false })
    .eq('id', id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return new NextResponse(null, { status: 204 })
}
```

- [ ] **Step 4: Vérifier que les tests passent (GREEN)**

```bash
npm run test:run -- "src/app/api/products/\[id\]/route.test.ts"
```
Attendu : `3 passed`

- [ ] **Step 5: Commit**

```bash
git add "src/app/api/products/[id]/"
git commit -m "feat(api): PATCH et DELETE /api/products/[id] (soft delete)"
```

---

### Task 14: UI Produits — Page liste + tableau

**Files:**
- Create: `src/app/(dashboard)/products/page.tsx`
- Create: `src/app/(dashboard)/products/_components/products-table.tsx`
- Create: `src/app/(dashboard)/products/_components/products-page-client.tsx` (stub, remplacé en Task 15)

- [ ] **Step 1: Créer le stub ProductsPageClient** *(évite une erreur d'import dans page.tsx)*

```tsx
// src/app/(dashboard)/products/_components/products-page-client.tsx
export function ProductsPageClient({ initialProducts }: { initialProducts: any[] }) {
  return <div className="p-4 text-gray-500">{initialProducts.length} produit(s) — interface complète en Task 15</div>
}
```

- [ ] **Step 2: Créer le composant tableau**

```tsx
// src/app/(dashboard)/products/_components/products-table.tsx
'use client'

import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

type Product = {
  id: string
  name: string
  price: number
  category: string
  tva_rate: number
  active: boolean
}

type Props = {
  products: Product[]
  onEdit: (product: Product) => void
  onDelete: (id: string) => void
}

export function ProductsTable({ products, onEdit, onDelete }: Props) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Nom</TableHead>
          <TableHead>Prix</TableHead>
          <TableHead>Catégorie</TableHead>
          <TableHead>TVA</TableHead>
          <TableHead>Statut</TableHead>
          <TableHead>Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {products.map((product) => (
          <TableRow key={product.id}>
            <TableCell className="font-medium">{product.name}</TableCell>
            <TableCell>{product.price.toFixed(2)} €</TableCell>
            <TableCell className="capitalize">{product.category}</TableCell>
            <TableCell>{product.tva_rate}%</TableCell>
            <TableCell>
              <Badge variant={product.active ? 'default' : 'secondary'}>
                {product.active ? 'Actif' : 'Inactif'}
              </Badge>
            </TableCell>
            <TableCell className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => onEdit(product)}>
                Modifier
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => onDelete(product.id)}
              >
                Désactiver
              </Button>
            </TableCell>
          </TableRow>
        ))}
        {products.length === 0 && (
          <TableRow>
            <TableCell colSpan={6} className="text-center text-gray-500 py-8">
              Aucun produit. Créez votre premier produit.
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  )
}
```

- [ ] **Step 2: Créer la page produits**

```tsx
// src/app/(dashboard)/products/page.tsx
import { createClient } from '@/lib/supabase/server'
import { ProductsPageClient } from './_components/products-page-client'

export default async function ProductsPage() {
  const supabase = await createClient()
  const { data: products = [] } = await supabase
    .from('products')
    .select('*')
    .eq('active', true)
    .order('name')

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold">Produits</h2>
      </div>
      <ProductsPageClient initialProducts={products ?? []} />
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/(dashboard)/products/
git commit -m "feat(ui): page liste produits avec tableau"
```

---

### Task 15: UI Produits — Formulaire modal (créer / modifier)

**Files:**
- Create: `src/app/(dashboard)/products/_components/product-form.tsx`
- Create: `src/app/(dashboard)/products/_components/products-page-client.tsx`

- [ ] **Step 1: Créer le formulaire modal**

```tsx
// src/app/(dashboard)/products/_components/product-form.tsx
'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'

type Product = {
  id: string
  name: string
  price: number
  category: string
  tva_rate: number
  active: boolean
}

type Props = {
  open: boolean
  onClose: () => void
  onSave: (data: Omit<Product, 'id' | 'active'>) => Promise<void>
  product?: Product | null
}

const CATEGORIES = ['entree', 'plat', 'dessert', 'boisson', 'autre']
const TVA_RATES = [5.5, 10, 20]

export function ProductForm({ open, onClose, onSave, product }: Props) {
  const [name, setName] = useState(product?.name ?? '')
  const [price, setPrice] = useState(String(product?.price ?? ''))
  const [category, setCategory] = useState(product?.category ?? 'plat')
  const [tvaRate, setTvaRate] = useState(String(product?.tva_rate ?? '10'))
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      await onSave({
        name,
        price: parseFloat(price),
        category,
        tva_rate: parseFloat(tvaRate),
      })
      onClose()
    } catch (err) {
      setError('Une erreur est survenue')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{product ? 'Modifier le produit' : 'Nouveau produit'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="name">Nom</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div>
            <Label htmlFor="price">Prix (€)</Label>
            <Input
              id="price"
              type="number"
              step="0.01"
              min="0"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              required
            />
          </div>
          <div>
            <Label>Catégorie</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>TVA</Label>
            <Select value={tvaRate} onValueChange={setTvaRate}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {TVA_RATES.map((r) => (
                  <SelectItem key={r} value={String(r)}>{r}%</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Annuler</Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Enregistrement...' : 'Enregistrer'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Créer le composant client de la page produits**

```tsx
// src/app/(dashboard)/products/_components/products-page-client.tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { ProductsTable } from './products-table'
import { ProductForm } from './product-form'

type Product = {
  id: string
  name: string
  price: number
  category: string
  tva_rate: number
  active: boolean
}

export function ProductsPageClient({ initialProducts }: { initialProducts: Product[] }) {
  const [products, setProducts] = useState(initialProducts)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const router = useRouter()

  function openCreate() {
    setEditingProduct(null)
    setModalOpen(true)
  }

  function openEdit(product: Product) {
    setEditingProduct(product)
    setModalOpen(true)
  }

  async function handleSave(data: Omit<Product, 'id' | 'active'>) {
    if (editingProduct) {
      const res = await fetch(`/api/products/${editingProduct.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) throw new Error('Erreur lors de la modification')
    } else {
      const res = await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) throw new Error('Erreur lors de la création')
    }
    router.refresh()
    setModalOpen(false)
  }

  async function handleDelete(id: string) {
    if (!confirm('Désactiver ce produit ?')) return
    const res = await fetch(`/api/products/${id}`, { method: 'DELETE' })
    if (!res.ok) return alert('Erreur lors de la désactivation')
    setProducts((prev) => prev.filter((p) => p.id !== id))
    router.refresh()
  }

  return (
    <>
      <div className="flex justify-end mb-4">
        <Button onClick={openCreate}>+ Nouveau produit</Button>
      </div>

      <div className="bg-white rounded-lg border">
        <ProductsTable
          products={products}
          onEdit={openEdit}
          onDelete={handleDelete}
        />
      </div>

      <ProductForm
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSave={handleSave}
        product={editingProduct}
      />
    </>
  )
}
```

- [ ] **Step 3: Tester manuellement le CRUD complet**

```bash
npm run dev
```
- Connecté en admin → `/dashboard/products`
- Créer un produit → apparaît dans le tableau
- Modifier un produit → formulaire pré-rempli, changements sauvegardés
- Désactiver un produit → disparaît du tableau

- [ ] **Step 4: Lancer tous les tests**

```bash
npm run test:run
```
Attendu : tous les tests passent

- [ ] **Step 5: Commit**

```bash
git add src/app/(dashboard)/
git commit -m "feat(ui): formulaire modal et page client produits"
```

---

### Task 16: Déploiement Vercel

**Files:**
- Aucun fichier créé (configuration externe)

- [ ] **Step 1: Pousser le code sur GitHub**

```bash
# Créer un repo GitHub via gh CLI ou interface web
gh repo create alloflow --private --source=. --push
# ou
git remote add origin https://github.com/<ton-username>/alloflow.git
git push -u origin main
```

- [ ] **Step 2: Connecter Vercel**

1. Aller sur https://vercel.com → New Project
2. Importer le repo `alloflow` depuis GitHub
3. Framework : Next.js (détecté automatiquement)
4. Ajouter les variables d'environnement :
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
5. Cliquer Deploy

- [ ] **Step 3: Appliquer les migrations sur Supabase Cloud**

```bash
supabase db push
```
Attendu : toutes les migrations appliquées sans erreur.

- [ ] **Step 4: Vérifier le déploiement**

- Ouvrir l'URL Vercel
- Login fonctionne
- CRUD produits fonctionne en production

- [ ] **Step 5: Lancer les tests une dernière fois**

```bash
npm run test:run
```
Attendu : tous les tests passent

- [ ] **Step 6: Commit final**

```bash
git add -A
git commit -m "chore: Phase 1 complète — fondations Alloflow"
git push
```

---

## Livrables Phase 1

- [ ] App Next.js deployée sur Vercel avec URL publique
- [ ] Supabase project créé (région EU), toutes les migrations appliquées
- [ ] Login fonctionnel avec les 3 rôles
- [ ] CRUD produits opérationnel pour un admin
