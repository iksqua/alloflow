# Design System & Navigation — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remplacer le layout minimal existant (header blanc basique) par le design system complet d'Alloflow : tokens CSS, sidebar dashboard, topbar, layout caisse, composants partagés, et navigation dashboard ↔ caisse.

**Architecture:** Les tokens CSS sont définis dans `globals.css` (dark theme, 2 surfaces différentes admin vs caisse). Le dashboard layout est un Server Component avec une sidebar 220px. La caisse est un layout séparé (`/caisse`) avec 3 colonnes. Les composants partagés (`StatusToggle`, `TvaBadge`, etc.) vivent dans `src/components/`.

**Tech Stack:** Next.js 16 App Router, Tailwind CSS v4, shadcn/ui, TypeScript, Vitest + Testing Library

---

## Fichiers créés / modifiés

| Action | Fichier | Responsabilité |
|--------|---------|----------------|
| Modify | `src/app/globals.css` | Tokens CSS Alloflow (dark theme, 2 fonds) |
| Modify | `src/app/dashboard/layout.tsx` | Sidebar 220px + topbar |
| Create | `src/app/dashboard/_components/sidebar.tsx` | Sidebar nav avec items actifs |
| Create | `src/app/dashboard/_components/topbar.tsx` | Barre de titre + bouton caisse |
| Create | `src/app/caisse/layout.tsx` | Layout caisse (fond #0a1628, protégé auth) |
| Create | `src/app/caisse/pos/page.tsx` | Shell POS vide (sera implémenté Sprint 3) |
| Create | `src/components/ui/status-toggle.tsx` | Toggle actif/inactif (utilisé produits + caisse) |
| Create | `src/components/ui/tva-badge.tsx` | Badge TVA amber/orange |
| Create | `src/components/ui/toast-provider.tsx` | Sonner toast configuration |
| Create | `src/components/ui/empty-state.tsx` | État vide réutilisable |
| Modify | `src/lib/types/database.ts` | Ajout types Role étendu |
| Create | `src/middleware.ts` | Redirect auth + protection routes caisse |
| Create | `src/components/ui/status-toggle.test.tsx` | Tests StatusToggle |
| Create | `src/components/ui/tva-badge.test.tsx` | Tests TvaBadge |

---

## Tâche 1 : Tokens CSS dark theme

**Fichiers :**
- Modify: `src/app/globals.css`

- [ ] **Étape 1 : Remplacer les tokens par le dark theme Alloflow**

Dans `src/app/globals.css`, remplacer le bloc `:root { ... }` existant (oklch blancs) par :

```css
:root {
  /* Backgrounds */
  --bg:               #0f172a;    /* Dashboard Admin */
  --bg-caisse:        #0a1628;    /* Interface Caisse */
  --bg-tabs:          #060e1a;    /* Barre la plus sombre */
  --surface:          #1e293b;    /* Cards, tables, sidebars */
  --surface2:         #263348;    /* Hover rows, dropdowns */
  --border:           #334155;
  --border-active:    #475569;

  /* Text */
  --text1:            #f8fafc;    /* Titres, prix */
  --text2:            #e2e8f0;    /* Contenu standard */
  --text3:            #94a3b8;    /* Labels secondaires */
  --text4:            #475569;    /* Désactivé */

  /* Actions */
  --blue:             #1d4ed8;
  --blue-light:       rgba(29, 78, 216, 0.12);
  --blue-glow:        rgba(29, 78, 216, 0.35);
  --green:            #10b981;
  --green-bg:         rgba(16, 185, 129, 0.1);
  --amber:            #f59e0b;
  --amber-bg:         rgba(245, 158, 11, 0.12);
  --red:              #ef4444;
  --red-bg:           rgba(239, 68, 68, 0.1);
  --orange:           #f97316;
  --orange-bg:        rgba(249, 115, 22, 0.12);

  /* Radius */
  --radius:           0.75rem;

  /* Shadcn overrides → dark mode */
  --background:       var(--bg);
  --foreground:       var(--text1);
  --card:             var(--surface);
  --card-foreground:  var(--text1);
  --primary:          var(--blue);
  --primary-foreground: #ffffff;
  --secondary:        var(--surface2);
  --secondary-foreground: var(--text2);
  --muted:            var(--surface);
  --muted-foreground: var(--text3);
  --border:           var(--border);
  --input:            var(--surface2);
  --ring:             var(--blue);
  --destructive:      var(--red);
}

body {
  background-color: var(--bg);
  color: var(--text1);
}
```

- [ ] **Étape 2 : Tester visuellement** — lancer `npm run dev`, aller sur `/login`. Le fond doit être dark `#0f172a`.

- [ ] **Étape 3 : Commit**
```bash
git add src/app/globals.css
git commit -m "feat(design): dark theme tokens CSS Alloflow"
```

---

## Tâche 2 : Composant StatusToggle

**Fichiers :**
- Create: `src/components/ui/status-toggle.tsx`
- Create: `src/components/ui/status-toggle.test.tsx`

- [ ] **Étape 1 : Écrire le test**

```typescript
// src/components/ui/status-toggle.test.tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { StatusToggle } from './status-toggle'

test('affiche ON quand active=true', () => {
  render(<StatusToggle active={true} onChange={() => {}} />)
  expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'true')
})

test('affiche OFF quand active=false', () => {
  render(<StatusToggle active={false} onChange={() => {}} />)
  expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'false')
})

test('appelle onChange au clic', () => {
  const onChange = vi.fn()
  render(<StatusToggle active={false} onChange={onChange} />)
  fireEvent.click(screen.getByRole('switch'))
  expect(onChange).toHaveBeenCalledWith(true)
})

test('loading=true désactive le toggle', () => {
  render(<StatusToggle active={true} onChange={() => {}} loading />)
  expect(screen.getByRole('switch')).toBeDisabled()
})
```

- [ ] **Étape 2 : Lancer le test** — doit échouer avec "Cannot find module"
```bash
npx vitest run src/components/ui/status-toggle.test.tsx
```

- [ ] **Étape 3 : Implémenter**

```typescript
// src/components/ui/status-toggle.tsx
'use client'

interface StatusToggleProps {
  active: boolean
  onChange: (value: boolean) => void
  loading?: boolean
}

export function StatusToggle({ active, onChange, loading = false }: StatusToggleProps) {
  return (
    <button
      role="switch"
      aria-checked={active}
      disabled={loading}
      onClick={() => onChange(!active)}
      className={[
        'relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--blue)] focus:ring-offset-2 focus:ring-offset-[var(--bg)]',
        active ? 'bg-[var(--green)]' : 'bg-[var(--border)]',
        loading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
      ].join(' ')}
    >
      <span
        className={[
          'inline-block h-4 w-4 rounded-full bg-white transition-transform',
          active ? 'translate-x-6' : 'translate-x-1',
        ].join(' ')}
      />
    </button>
  )
}
```

- [ ] **Étape 4 : Lancer le test** — doit passer
```bash
npx vitest run src/components/ui/status-toggle.test.tsx
```

- [ ] **Étape 5 : Commit**
```bash
git add src/components/ui/status-toggle.tsx src/components/ui/status-toggle.test.tsx
git commit -m "feat(ui): StatusToggle component with tests"
```

---

## Tâche 3 : Composant TvaBadge

**Fichiers :**
- Create: `src/components/ui/tva-badge.tsx`
- Create: `src/components/ui/tva-badge.test.tsx`

- [ ] **Étape 1 : Écrire le test**

```typescript
// src/components/ui/tva-badge.test.tsx
import { render, screen } from '@testing-library/react'
import { TvaBadge } from './tva-badge'

test('affiche 5,5% en amber', () => {
  render(<TvaBadge rate={5.5} />)
  const badge = screen.getByText('TVA 5,5%')
  expect(badge).toHaveClass('text-[var(--amber)]')
})

test('affiche 10% en amber', () => {
  render(<TvaBadge rate={10} />)
  expect(screen.getByText('TVA 10%')).toHaveClass('text-[var(--amber)]')
})

test('affiche 20% en orange', () => {
  render(<TvaBadge rate={20} />)
  expect(screen.getByText('TVA 20%')).toHaveClass('text-[var(--orange)]')
})
```

- [ ] **Étape 2 : Lancer — doit échouer**
```bash
npx vitest run src/components/ui/tva-badge.test.tsx
```

- [ ] **Étape 3 : Implémenter**

```typescript
// src/components/ui/tva-badge.tsx
type TvaRate = 5.5 | 10 | 20

interface TvaBadgeProps {
  rate: TvaRate
}

export function TvaBadge({ rate }: TvaBadgeProps) {
  const isOrange = rate === 20
  return (
    <span
      className={[
        'text-xs font-semibold px-1.5 py-0.5 rounded',
        isOrange
          ? 'text-[var(--orange)] bg-[var(--orange-bg)]'
          : 'text-[var(--amber)] bg-[var(--amber-bg)]',
      ].join(' ')}
    >
      TVA {rate === 5.5 ? '5,5' : rate}%
    </span>
  )
}
```

- [ ] **Étape 4 : Lancer — doit passer**
```bash
npx vitest run src/components/ui/tva-badge.test.tsx
```

- [ ] **Étape 5 : Commit**
```bash
git add src/components/ui/tva-badge.tsx src/components/ui/tva-badge.test.tsx
git commit -m "feat(ui): TvaBadge component amber/orange with tests"
```

---

## Tâche 4 : Composant EmptyState

**Fichiers :**
- Create: `src/components/ui/empty-state.tsx`

- [ ] **Étape 1 : Implémenter** (composant simple, pas de logique à tester unitairement)

```typescript
// src/components/ui/empty-state.tsx
interface EmptyStateProps {
  icon?: string
  title: string
  description?: string
  action?: React.ReactNode
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-8 text-center">
      {icon && (
        <span className="text-5xl mb-4 opacity-40">{icon}</span>
      )}
      <h3 className="text-base font-semibold text-[var(--text1)] mb-2">{title}</h3>
      {description && (
        <p className="text-sm text-[var(--text3)] max-w-xs mb-6">{description}</p>
      )}
      {action}
    </div>
  )
}
```

- [ ] **Étape 2 : Commit**
```bash
git add src/components/ui/empty-state.tsx
git commit -m "feat(ui): EmptyState component"
```

---

## Tâche 5 : Toast Provider (Sonner)

**Fichiers :**
- Modify: `package.json` (ajouter sonner)
- Create: `src/components/ui/toast-provider.tsx`
- Modify: `src/app/layout.tsx`

- [ ] **Étape 1 : Installer sonner**
```bash
npm install sonner
```

- [ ] **Étape 2 : Créer le provider**

```typescript
// src/components/ui/toast-provider.tsx
'use client'
import { Toaster } from 'sonner'

export function ToastProvider() {
  return (
    <Toaster
      theme="dark"
      position="bottom-right"
      toastOptions={{
        style: {
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          color: 'var(--text1)',
        },
      }}
    />
  )
}
```

- [ ] **Étape 3 : Ajouter dans le root layout**

Dans `src/app/layout.tsx`, ajouter `<ToastProvider />` juste avant `</body>`.

- [ ] **Étape 4 : Commit**
```bash
git add src/components/ui/toast-provider.tsx src/app/layout.tsx package.json package-lock.json
git commit -m "feat(ui): Sonner toast provider dark theme"
```

---

## Tâche 6 : Dashboard Sidebar

**Fichiers :**
- Create: `src/app/dashboard/_components/sidebar.tsx`

- [ ] **Étape 1 : Créer la sidebar**

```typescript
// src/app/dashboard/_components/sidebar.tsx
'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const NAV_ITEMS = [
  { href: '/dashboard/products', label: 'Produits', icon: '🍽️' },
  { href: '/dashboard/analytics', label: 'Analytique', icon: '📊', disabled: true },
  { href: '/dashboard/stock', label: 'Stocks', icon: '📦', disabled: true },
  { href: '/dashboard/crm', label: 'CRM', icon: '👥', disabled: true },
]

interface SidebarProps {
  userName: string
  userRole: string
  establishmentName?: string
}

export function Sidebar({ userName, userRole, establishmentName }: SidebarProps) {
  const pathname = usePathname()

  return (
    <aside
      className="fixed left-0 top-0 h-full flex flex-col"
      style={{
        width: '220px',
        background: '#111827',
        borderRight: '1px solid var(--border)',
      }}
    >
      {/* Logo */}
      <div className="p-4 border-b border-[var(--border)]">
        <div className="flex items-center gap-3">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-sm flex-shrink-0"
            style={{ background: 'var(--blue)' }}
          >
            A
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-[var(--text1)] truncate">
              {establishmentName ?? 'Alloflow'}
            </div>
            <div className="text-xs text-[var(--text3)] capitalize">{userRole}</div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname.startsWith(item.href)
          if (item.disabled) {
            return (
              <div
                key={item.href}
                className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-[var(--text4)] cursor-not-allowed"
              >
                <span>{item.icon}</span>
                <span>{item.label}</span>
                <span className="ml-auto text-[10px] bg-[var(--surface)] px-1.5 py-0.5 rounded text-[var(--text4)]">
                  Bientôt
                </span>
              </div>
            )
          }
          return (
            <Link
              key={item.href}
              href={item.href}
              className={[
                'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
                isActive
                  ? 'bg-[var(--blue-light)] text-[var(--text1)] border-l-2 border-[var(--blue)] pl-[10px]'
                  : 'text-[var(--text2)] hover:bg-[var(--surface2)]',
              ].join(' ')}
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          )
        })}
      </nav>

      {/* Footer */}
      <div className="p-3 border-t border-[var(--border)]">
        <div className="flex items-center gap-2 px-3 py-2">
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
            style={{ background: 'var(--surface2)' }}
          >
            {userName.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className="text-xs font-medium text-[var(--text1)] truncate">{userName}</div>
            <div className="text-[10px] text-[var(--text3)] capitalize">{userRole}</div>
          </div>
        </div>
      </div>
    </aside>
  )
}
```

- [ ] **Étape 2 : Commit**
```bash
git add src/app/dashboard/_components/sidebar.tsx
git commit -m "feat(dashboard): Sidebar component with nav items"
```

---

## Tâche 7 : Dashboard Topbar

**Fichiers :**
- Create: `src/app/dashboard/_components/topbar.tsx`

- [ ] **Étape 1 : Créer la topbar**

```typescript
// src/app/dashboard/_components/topbar.tsx
'use client'

interface TopbarProps {
  title: string
  showCaisseButton?: boolean
  onSignOut: () => void
}

export function Topbar({ title, showCaisseButton = true, onSignOut }: TopbarProps) {
  const openCaisse = () => {
    window.open('/caisse/pos', '_blank')
  }

  return (
    <header
      className="fixed top-0 right-0 h-12 flex items-center justify-between px-6 border-b border-[var(--border)] z-10"
      style={{ left: '220px', background: 'var(--bg)' }}
    >
      <h1 className="text-sm font-semibold text-[var(--text1)]">{title}</h1>
      <div className="flex items-center gap-3">
        {showCaisseButton && (
          <button
            onClick={openCaisse}
            title="S'ouvre dans un nouvel onglet — La caisse tourne en parallèle"
            className="flex items-center gap-2 h-8 px-3 rounded-lg text-xs font-semibold text-white transition-colors hover:opacity-90"
            style={{ background: 'var(--green)' }}
          >
            Ouvrir la caisse ↗
          </button>
        )}
        <form action={onSignOut as never}>
          <button
            type="submit"
            className="text-xs text-[var(--text3)] hover:text-[var(--text1)] transition-colors"
          >
            Déconnexion
          </button>
        </form>
      </div>
    </header>
  )
}
```

- [ ] **Étape 2 : Commit**
```bash
git add src/app/dashboard/_components/topbar.tsx
git commit -m "feat(dashboard): Topbar with caisse button (new tab)"
```

---

## Tâche 8 : Réécrire Dashboard Layout

**Fichiers :**
- Modify: `src/app/dashboard/layout.tsx`

- [ ] **Étape 1 : Réécrire avec sidebar + topbar**

```typescript
// src/app/dashboard/layout.tsx
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Sidebar } from './_components/sidebar'

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
    .select('role, establishment_id')
    .eq('id', user.id)
    .single()

  if (!profile) redirect('/login?error=profile_not_found')
  if (profile.role === 'caissier') redirect('/caisse/pos')

  const { data: establishment } = profile.establishment_id
    ? await supabase
        .from('establishments')
        .select('name')
        .eq('id', profile.establishment_id)
        .single()
    : { data: null }

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      <Sidebar
        userName={user.email?.split('@')[0] ?? 'Utilisateur'}
        userRole={profile.role}
        establishmentName={establishment?.name}
      />
      {/* Main area offset by sidebar */}
      <div style={{ marginLeft: '220px', paddingTop: '48px' }}>
        <header
          className="fixed top-0 right-0 h-12 flex items-center justify-between px-6 border-b border-[var(--border)] z-10"
          style={{ left: '220px', background: 'var(--bg)' }}
        >
          <span />
          <div className="flex items-center gap-4">
            <button
              onClick={() => window.open('/caisse/pos', '_blank')}
              title="S'ouvre dans un nouvel onglet"
              className="flex items-center gap-2 h-8 px-3 rounded-lg text-xs font-semibold text-white"
              style={{ background: 'var(--green)' }}
            >
              Ouvrir la caisse ↗
            </button>
            <form action={signOut}>
              <button type="submit" className="text-xs text-[var(--text3)] hover:text-[var(--text1)]">
                Déconnexion
              </button>
            </form>
          </div>
        </header>
        <main className="p-6">{children}</main>
      </div>
    </div>
  )
}
```

- [ ] **Étape 2 : Vérifier visuellement** — aller sur `/dashboard/products`, la sidebar doit apparaître à gauche.

- [ ] **Étape 3 : Commit**
```bash
git add src/app/dashboard/layout.tsx
git commit -m "feat(dashboard): layout avec sidebar 220px et topbar fixe"
```

---

## Tâche 9 : Shell Caisse Layout

**Fichiers :**
- Create: `src/app/caisse/layout.tsx`
- Create: `src/app/caisse/pos/page.tsx`

- [ ] **Étape 1 : Créer le layout caisse**

```typescript
// src/app/caisse/layout.tsx
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export default async function CaisseLayout({
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

  if (!profile) redirect('/login?error=profile_not_found')

  // serveur n'a pas accès à la caisse
  // (si rôle serveur existait — pour l'instant tous les rôles ont accès)

  return (
    <div
      className="h-screen overflow-hidden flex flex-col"
      style={{ background: 'var(--bg-caisse)', color: 'var(--text1)' }}
    >
      {children}
    </div>
  )
}
```

- [ ] **Étape 2 : Créer la page POS shell**

```typescript
// src/app/caisse/pos/page.tsx
export default function PosPage() {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center">
        <div className="text-5xl mb-4">🧾</div>
        <h2 className="text-xl font-semibold text-[var(--text1)] mb-2">Interface Caisse</h2>
        <p className="text-sm text-[var(--text3)]">Implémentation Sprint 3</p>
      </div>
    </div>
  )
}
```

- [ ] **Étape 3 : Tester** — ouvrir `/caisse/pos` → fond `#0a1628`, message placeholder.

- [ ] **Étape 4 : Commit**
```bash
git add src/app/caisse/layout.tsx src/app/caisse/pos/page.tsx
git commit -m "feat(caisse): layout shell et route pos placeholder"
```

---

## Tâche 10 : Redirect root `/caisse`

**Fichiers :**
- Create: `src/app/caisse/page.tsx`

- [ ] **Étape 1 : Créer la page redirect**

```typescript
// src/app/caisse/page.tsx
import { redirect } from 'next/navigation'

export default function CaissePage() {
  redirect('/caisse/pos')
}
```

- [ ] **Étape 2 : Commit**
```bash
git add src/app/caisse/page.tsx
git commit -m "feat(caisse): redirect / vers /caisse/pos"
```

---

## Tâche 11 : Sidebar tablette (64px icônes)

**Fichiers :**
- Modify: `src/app/dashboard/_components/sidebar.tsx`

- [ ] **Étape 1 : Ajouter les classes responsive**

Dans `sidebar.tsx`, modifier les classes pour réduire à 64px sur `768-1024px` :

```typescript
// Ajouter dans le fichier (après les imports) :
// La sidebar passe à 64px entre 768px et 1024px (icônes uniquement + tooltip)
// Ajuster l'aside :
<aside
  className="fixed left-0 top-0 h-full flex flex-col transition-all"
  style={{ width: 'clamp(64px, 14vw, 220px)', ... }}
>
```

Note : utiliser Tailwind responsive pour masquer les labels sous 1024px et ne garder que les icônes avec `title` (tooltip natif) sur les liens.

Modifier les nav items pour ajouter `title={item.label}` et masquer le texte avec `hidden xl:block`.

- [ ] **Étape 2 : Vérifier à 900px de large** — seules les icônes doivent apparaître avec tooltip au hover.

- [ ] **Étape 3 : Commit**
```bash
git add src/app/dashboard/_components/sidebar.tsx
git commit -m "feat(dashboard): sidebar responsive 64px icons < 1024px"
```

---

## Tâche 12 : Middleware auth

**Fichiers :**
- Create: `src/middleware.ts`

- [ ] **Étape 1 : Créer le middleware**

```typescript
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
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

  // Routes protégées → redirect vers login si pas authentifié
  if (!user && (pathname.startsWith('/dashboard') || pathname.startsWith('/caisse'))) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // Déjà connecté → pas besoin d'aller sur login
  if (user && pathname === '/login') {
    return NextResponse.redirect(new URL('/dashboard/products', request.url))
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api).*)'],
}
```

- [ ] **Étape 2 : Commit**
```bash
git add src/middleware.ts
git commit -m "feat(auth): middleware protection routes dashboard et caisse"
```

---

## Tâche 13 : Vérification finale

- [ ] **Lancer tous les tests**
```bash
npx vitest run
```
Expected: tous les tests passent.

- [ ] **Vérifier les routes manuellement :**
  - `/` → redirect `/login`
  - `/login` → page login dark theme
  - `/dashboard/products` → sidebar + topbar + bouton caisse
  - `/caisse/pos` → fond dark `#0a1628`, placeholder
  - Clic "Ouvrir la caisse" → nouvel onglet `/caisse/pos`
  - Non connecté `/dashboard` → redirect `/login`

- [ ] **Commit final**
```bash
git add -A
git commit -m "feat(design-system): sprint 1 complet — tokens, sidebar, caisse layout, composants"
```

---

## Résumé Sprint 1

| Feature | Status |
|---------|--------|
| Tokens CSS dark theme | ✅ |
| StatusToggle + tests | ✅ |
| TvaBadge + tests | ✅ |
| EmptyState | ✅ |
| Sonner toasts | ✅ |
| Sidebar 220px (+ 64px tablette) | ✅ |
| Dashboard layout | ✅ |
| Caisse layout shell | ✅ |
| Middleware auth | ✅ |
