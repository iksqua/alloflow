# Franchiseur Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow a franchise network owner to self-register on `/register`, creating their Supabase account, their `siege` organization, and their `franchise_admin` profile in one flow — with no manual intervention from Alloflow staff.

**Architecture:** A new public API route `POST /api/auth/register-franchise` creates the org then the user (passing `raw_user_meta_data` so the existing `handle_new_user` trigger creates the profile correctly). A new `/register` page calls this route then signs the user in. The login page gains role-aware redirect logic. A new `middleware.ts` rate-limits the registration endpoint.

**Tech Stack:** Next.js 15 App Router, Supabase Auth (admin API), Zod, Vitest

**Spec:** `docs/superpowers/specs/2026-03-29-franchiseur-onboarding-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/app/api/auth/register-franchise/route.ts` | Create | POST endpoint — create org + user atomically |
| `src/app/api/auth/register-franchise/route.test.ts` | Create | Tests: 201, 409, 422 |
| `src/middleware.ts` | Create | Rate-limit `POST /api/auth/register-franchise` |
| `src/app/(auth)/register/page.tsx` | Create | Public registration form |
| `src/app/(auth)/login/page.tsx` | Modify | Role-aware redirect + "Créer un réseau" link |

---

## Task 1: POST /api/auth/register-franchise

**Files:**
- Create: `src/app/api/auth/register-franchise/route.ts`
- Create: `src/app/api/auth/register-franchise/route.test.ts`

**Context:** No auth check on this route — it's public. Uses `supabaseAdmin` (service role) to create the org then the user. The `handle_new_user` DB trigger fires on user creation and inserts the profile with `role='franchise_admin'` and `org_id` from `user_metadata`. If user creation fails after the org was created, the org is deleted (cleanup). Pattern: same imports as `src/app/api/settings/invite/route.ts`.

- [ ] **Step 1: Write the failing tests**

Create `src/app/api/auth/register-franchise/route.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// Mock supabase-js admin client
const mockCreateUser = vi.fn()
const mockInsert     = vi.fn()
const mockDelete     = vi.fn()
const mockEq         = vi.fn()

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    from: (table: string) => {
      if (table === 'organizations') {
        return {
          insert: mockInsert,
        }
      }
      return {}
    },
    auth: {
      admin: {
        createUser: mockCreateUser,
      },
    },
  })),
}))

// Silence env vars
process.env.NEXT_PUBLIC_SUPABASE_URL      = 'https://test.supabase.co'
process.env.SUPABASE_SERVICE_ROLE_KEY     = 'service-role-key'

import { POST } from './route'

function makeRequest(body: unknown) {
  return new NextRequest('http://localhost/api/auth/register-franchise', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('POST /api/auth/register-franchise', () => {
  it('retourne 422 si le body est invalide', async () => {
    const res = await POST(makeRequest({ email: 'not-an-email', password: 'short', networkName: 'x' }))
    expect(res.status).toBe(422)
  })

  it('retourne 201 et crée org + user', async () => {
    mockInsert.mockReturnValue({
      select: () => ({
        single: () => Promise.resolve({ data: { id: 'org-123' }, error: null }),
      }),
    })
    mockCreateUser.mockResolvedValue({ data: { user: { id: 'user-123' } }, error: null })

    const res = await POST(makeRequest({
      networkName: 'Allocookie Paris',
      email: 'siege@alloflow.dev',
      password: 'SecurePass1!',
    }))

    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(mockCreateUser).toHaveBeenCalledWith(expect.objectContaining({
      email: 'siege@alloflow.dev',
      email_confirm: true,
      user_metadata: expect.objectContaining({
        role:   'franchise_admin',
        org_id: 'org-123',
      }),
    }))
  })

  it('retourne 409 si email déjà enregistré', async () => {
    mockInsert.mockReturnValue({
      select: () => ({
        single: () => Promise.resolve({ data: { id: 'org-123' }, error: null }),
      }),
    })
    mockCreateUser.mockResolvedValue({
      data: {},
      error: { message: 'User already registered', status: 422 },
    })
    // delete for cleanup
    mockDelete.mockReturnValue({ eq: mockEq.mockResolvedValue({ error: null }) })

    const res = await POST(makeRequest({
      networkName: 'Allocookie Paris',
      email: 'existing@alloflow.dev',
      password: 'SecurePass1!',
    }))

    expect(res.status).toBe(409)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd "/Users/anthony/Super pouvoir/Alloflow" && npx vitest run src/app/api/auth/register-franchise/route.test.ts
```

Expected: FAIL — `route.ts` does not exist yet.

- [ ] **Step 3: Create the route**

Create `src/app/api/auth/register-franchise/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient as createAdminClient } from '@supabase/supabase-js'

const schema = z.object({
  networkName: z.string().min(2).max(80),
  email:       z.string().email(),
  password:    z.string().min(8),
})

export async function POST(req: NextRequest) {
  const body = schema.safeParse(await req.json())
  if (!body.success) return NextResponse.json({ error: body.error.flatten() }, { status: 422 })

  const { networkName, email, password } = body.data

  const supabaseAdmin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // 1. Create org
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: org, error: orgError } = await (supabaseAdmin as any)
    .from('organizations')
    .insert({ name: networkName, type: 'siege' })
    .select()
    .single()

  if (orgError) return NextResponse.json({ error: 'Erreur lors de la création du réseau' }, { status: 500 })

  // 2. Create user — trigger handle_new_user creates profile from user_metadata
  const { data, error: userError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      role:   'franchise_admin',
      org_id: org.id,
    },
  })

  if (userError) {
    // Cleanup orphaned org
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabaseAdmin as any).from('organizations').delete().eq('id', org.id)

    const isAlreadyRegistered = userError.message?.toLowerCase().includes('already registered')
      || userError.message?.toLowerCase().includes('already been registered')
    if (isAlreadyRegistered) {
      return NextResponse.json({ error: 'Un compte existe déjà avec cet email' }, { status: 409 })
    }
    return NextResponse.json({ error: userError.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true }, { status: 201 })
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd "/Users/anthony/Super pouvoir/Alloflow" && npx vitest run src/app/api/auth/register-franchise/route.test.ts
```

Expected: 3 tests PASS.

- [ ] **Step 5: TypeScript check**

```bash
cd "/Users/anthony/Super pouvoir/Alloflow" && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
cd "/Users/anthony/Super pouvoir/Alloflow"
git add 'src/app/api/auth/register-franchise/route.ts' 'src/app/api/auth/register-franchise/route.test.ts'
git commit -m "feat(api): add POST /api/auth/register-franchise endpoint"
```

---

## Task 2: Rate-Limiting Middleware

**Files:**
- Create: `src/middleware.ts`

**Context:** Next.js middleware runs at the Edge before every request. In Next.js App Router, `middleware.ts` lives at `src/middleware.ts`. The middleware intercepts `POST /api/auth/register-franchise` and applies a simple in-memory rate limit (5 req/min per IP). All other routes pass through unchanged. The in-memory map resets on cold starts — acceptable for MVP.

No tests for middleware (Edge runtime, hard to unit test with Vitest).

- [ ] **Step 1: Create the middleware**

Create `src/middleware.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'

// In-memory rate limiter: max 5 POST requests per IP per minute
// Resets on cold start — acceptable for MVP
const ipCounts = new Map<string, { count: number; resetAt: number }>()

const RATE_LIMIT_MAX    = 5
const RATE_LIMIT_WINDOW = 60_000 // 1 minute in ms

export function middleware(req: NextRequest) {
  if (req.method === 'POST' && req.nextUrl.pathname === '/api/auth/register-franchise') {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown'
    const now = Date.now()

    const record = ipCounts.get(ip)
    if (!record || now > record.resetAt) {
      ipCounts.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW })
    } else {
      record.count++
      if (record.count > RATE_LIMIT_MAX) {
        return NextResponse.json(
          { error: 'Trop de tentatives. Réessayez dans une minute.' },
          { status: 429 }
        )
      }
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/api/auth/register-franchise'],
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd "/Users/anthony/Super pouvoir/Alloflow" && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd "/Users/anthony/Super pouvoir/Alloflow"
git add src/middleware.ts
git commit -m "feat(middleware): add rate limiting for POST /api/auth/register-franchise"
```

---

## Task 3: Login — Role-Aware Redirect + "Créer un réseau" Link

**Files:**
- Modify: `src/app/(auth)/login/page.tsx`

**Context:** Currently line 34 always does `router.push('/dashboard/products')`. The change: after sign-in, fetch the profile role from `profiles` and redirect to `/dashboard/franchise/command-center` if `franchise_admin`, otherwise `/dashboard/products`. Also add a discreet link below the submit button: "Vous êtes franchiseur ? Créer votre réseau →" pointing to `/register`.

- [ ] **Step 1: Update the login page**

In `src/app/(auth)/login/page.tsx`, replace the `handleSubmit` function and add the link:

Replace the current `handleSubmit`:

```typescript
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const supabase = createClient()
    const { data: authData, error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError('Email ou mot de passe incorrect')
      setLoading(false)
      return
    }

    // Role-aware redirect
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', authData.user.id)
      .single()

    if (profile?.role === 'franchise_admin') {
      router.push('/dashboard/franchise/command-center')
    } else {
      router.push('/dashboard/products')
    }
    router.refresh()
  }
```

Add the link below the `<Button>` closing tag (after `</Button>` on line 79), inside the `<form>`:

```tsx
          <p className="text-center text-xs mt-2" style={{ color: 'var(--text4)' }}>
            Vous êtes franchiseur ?{' '}
            <a href="/register" style={{ color: 'var(--blue)' }}>
              Créer votre réseau →
            </a>
          </p>
```

- [ ] **Step 2: TypeScript check**

```bash
cd "/Users/anthony/Super pouvoir/Alloflow" && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd "/Users/anthony/Super pouvoir/Alloflow"
git add 'src/app/(auth)/login/page.tsx'
git commit -m "feat(auth): role-aware redirect after login + Créer un réseau link"
```

---

## Task 4: Register Page

**Files:**
- Create: `src/app/(auth)/register/page.tsx`

**Context:** Public page, same dark theme and layout as `/login`. No sidebar. Three fields: networkName, email, password. On submit: POST to `/api/auth/register-franchise`, then `supabase.auth.signInWithPassword`, then redirect to `/dashboard/franchise/command-center`. Uses the same `createClient` from `@/lib/supabase/client` and the same UI components (`Button`, `Input`, `Label`) as the login page.

- [ ] **Step 1: Create the register page**

Create `src/app/(auth)/register/page.tsx`:

```typescript
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export default function RegisterPage() {
  const [networkName, setNetworkName] = useState('')
  const [email,       setEmail]       = useState('')
  const [password,    setPassword]    = useState('')
  const [error,       setError]       = useState<string | null>(null)
  const [loading,     setLoading]     = useState(false)
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    // 1. Create org + user via API
    const res = await fetch('/api/auth/register-franchise', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ networkName, email, password }),
    })

    if (!res.ok) {
      const data = await res.json()
      if (res.status === 409) {
        setError('Un compte existe déjà avec cet email')
      } else if (res.status === 422) {
        setError('Vérifiez les informations saisies')
      } else if (res.status === 429) {
        setError('Trop de tentatives. Réessayez dans une minute.')
      } else {
        setError(data.error ?? 'Erreur lors de la création du compte')
      }
      setLoading(false)
      return
    }

    // 2. Sign in
    const supabase = createClient()
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })

    if (signInError) {
      setError('Compte créé. Connectez-vous sur la page de connexion →')
      setLoading(false)
      return
    }

    // 3. Redirect
    router.push('/dashboard/franchise/command-center')
    router.refresh()
  }

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg)' }}>
      <div className="w-full max-w-md p-8 rounded-xl border border-[var(--border)]" style={{ background: 'var(--surface)' }}>
        <h1 className="text-2xl font-bold mb-2 text-center text-[var(--text1)]">Alloflow</h1>
        <p className="text-sm text-center mb-6" style={{ color: 'var(--text4)' }}>
          Créer votre réseau franchiseur
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="networkName">Nom du réseau</Label>
            <Input
              id="networkName"
              type="text"
              value={networkName}
              onChange={e => setNetworkName(e.target.value)}
              required
              minLength={2}
              maxLength={80}
              placeholder="Ex : Allocookie Paris"
              autoComplete="organization"
            />
          </div>

          <div>
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
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
              onChange={e => setPassword(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
            />
          </div>

          {error && (
            <p className="text-sm" style={{ color: 'var(--red)' }}>{error}</p>
          )}

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Création en cours…' : 'Créer mon réseau'}
          </Button>

          <p className="text-center text-xs mt-2" style={{ color: 'var(--text4)' }}>
            Déjà un compte ?{' '}
            <a href="/login" style={{ color: 'var(--blue)' }}>
              Se connecter →
            </a>
          </p>
        </form>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd "/Users/anthony/Super pouvoir/Alloflow" && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Run full test suite**

```bash
cd "/Users/anthony/Super pouvoir/Alloflow" && npx vitest run
```

Expected: all Sprint 12 tests pass (3 new), pre-existing failures unchanged.

- [ ] **Step 4: Commit**

```bash
cd "/Users/anthony/Super pouvoir/Alloflow"
git add 'src/app/(auth)/register/page.tsx'
git commit -m "feat(ui): add public /register page for franchiseur onboarding"
```

---

## Verification Checklist

After all tasks complete:

- [ ] `GET /register` renders the form (no login required)
- [ ] Submit with invalid body → inline error visible
- [ ] Submit with valid body → account created → redirected to `/dashboard/franchise/command-center`
- [ ] Submit with duplicate email → "Un compte existe déjà avec cet email"
- [ ] Login as `franchise_admin` → redirected to `/dashboard/franchise/command-center`
- [ ] Login as `admin` / `caissier` → redirected to `/dashboard/products`
- [ ] `/login` shows "Vous êtes franchiseur ? Créer votre réseau →" link
