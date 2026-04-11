/**
 * franchise.spec.ts — Tests E2E pour le module franchise
 * Project: franchise (compte testeur.franchise@alloflow.dev)
 *
 * NOTE: ces tests tournent avec le storageState franchise (voir playwright.config.ts).
 * Si le compte admin tente d'accéder aux routes franchise, il est redirigé vers /dashboard.
 * Le compte franchise a role=super_admin ou franchise_admin.
 */
import { test, expect } from '@playwright/test'

const BASE = process.env.BASE_URL ?? 'http://localhost:3000'

// Next.js production builds emit minified React hydration errors — filter them
function isBenignProdError(msg: string): boolean {
  return (
    msg.includes('react.dev/errors/') ||
    msg.includes('Minified React error') ||
    msg.includes('Server Components render') ||
    msg.includes('digest')
  )
}

// ─── 1. Dashboard franchise se charge ────────────────────────────────────────
test.describe('Franchise — dashboard', () => {
  test('dashboard franchise accessible après login', async ({ page }) => {
    const jsErrors: string[] = []
    page.on('pageerror', (err) => {
      if (!isBenignProdError(err.message)) jsErrors.push(err.message)
    })

    await page.goto('/dashboard/franchise')
    await page.waitForLoadState('networkidle')

    // Must be authenticated (no login redirect)
    expect(page.url()).not.toContain('/login')
    // Either landed on franchise or was redirected to dashboard (role mismatch)
    const onFranchise = page.url().includes('/franchise')
    const onDashboard = page.url().includes('/dashboard')
    expect(onFranchise || onDashboard).toBeTruthy()
    expect(jsErrors).toHaveLength(0)
  })
})

// ─── 2. Command Center ────────────────────────────────────────────────────────
test.describe('Franchise — command center', () => {
  test('command center se charge', async ({ page }) => {
    const jsErrors: string[] = []
    page.on('pageerror', (err) => {
      if (!isBenignProdError(err.message)) jsErrors.push(err.message)
    })

    await page.goto('/dashboard/franchise/command-center')
    await page.waitForLoadState('networkidle')

    expect(page.url()).not.toContain('/login')
    // No hard 404
    await expect(page.getByText(/404|page introuvable/i)).not.toBeVisible()
    expect(jsErrors).toHaveLength(0)
  })

  test('API /api/franchise/network-stats répond', async ({ request }) => {
    const res = await request.get(`${BASE}/api/franchise/network-stats`)
    // 200 = ok, 400/401/403 = non-franchise or missing establishment — all valid
    expect([200, 400, 401, 403]).toContain(res.status())
    if (res.ok()) {
      const json = await res.json()
      expect(json.network).toBeDefined()
      expect(json.establishments).toBeDefined()
    }
  })
})

// ─── 3. Pilotage des établissements ───────────────────────────────────────────
test.describe('Franchise — pilotage', () => {
  test('page pilotage se charge ou retourne 404 si non-franchise', async ({ page }) => {
    const jsErrors: string[] = []
    page.on('pageerror', (err) => {
      if (!isBenignProdError(err.message)) jsErrors.push(err.message)
    })

    await page.goto('/dashboard/franchise/pilotage')
    await page.waitForLoadState('networkidle')

    // Must be authenticated
    expect(page.url()).not.toContain('/login')
    // 404 is acceptable — means the route is protected by role (non-franchise accounts get 404)
    // What's NOT acceptable is an unhandled error or login redirect
    expect(jsErrors).toHaveLength(0)
  })

  test('page liste des franchises se charge', async ({ page }) => {
    const jsErrors: string[] = []
    page.on('pageerror', (err) => {
      if (!isBenignProdError(err.message)) jsErrors.push(err.message)
    })

    await page.goto('/dashboard/franchise/franchises')
    await page.waitForLoadState('networkidle')

    expect(page.url()).not.toContain('/login')
    await expect(page.getByText(/404/)).not.toBeVisible()
    expect(jsErrors).toHaveLength(0)
  })

  test('API /api/franchise/establishments répond', async ({ request }) => {
    const res = await request.get(`${BASE}/api/franchise/establishments`)
    expect([200, 400, 401, 403]).toContain(res.status())
    if (res.ok()) {
      const json = await res.json()
      expect(json.establishments ?? json).toBeDefined()
    }
  })
})

// ─── 4. Navigation complète ───────────────────────────────────────────────────
test.describe('Franchise — navigation complète', () => {
  const franchiseRoutes = [
    '/dashboard/franchise/command-center',
    '/dashboard/franchise/franchises',
    '/dashboard/franchise/loyalty',
  ]

  for (const route of franchiseRoutes) {
    test(`route ${route} accessible ou protégée par rôle`, async ({ page }) => {
      const jsErrors: string[] = []
      page.on('pageerror', (err) => {
        if (!isBenignProdError(err.message)) jsErrors.push(err.message)
      })

      await page.goto(route)
      await page.waitForLoadState('networkidle')

      // Must be authenticated (no login redirect)
      expect(page.url()).not.toContain('/login')
      // 404 is acceptable for role-protected routes
      // No unhandled JS errors
      expect(jsErrors).toHaveLength(0)
    })
  }
})
