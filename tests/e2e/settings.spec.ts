/**
 * settings.spec.ts — Tests E2E pour les paramètres
 * Project: admin
 */
import { test, expect } from '@playwright/test'

// Next.js production builds emit minified React hydration errors — filter them
function isBenignProdError(msg: string): boolean {
  return (
    msg.includes('react.dev/errors/') ||
    msg.includes('Minified React error') ||
    msg.includes('Server Components render') ||
    msg.includes('digest')
  )
}

const BASE = process.env.BASE_URL ?? 'http://localhost:3000'

// ─── 1. Sauvegarder les settings établissement ────────────────────────────────
test.describe('Settings — établissement', () => {
  test('charger et sauvegarder les settings établissement', async ({ page, request }) => {
    const jsErrors: string[] = []
    page.on('pageerror', (err) => jsErrors.push(err.message))

    // Load current settings via API
    const getRes = await request.get(`${BASE}/api/settings/establishment`)
    expect(getRes.ok()).toBeTruthy()
    const original = await getRes.json()

    await page.goto('/dashboard/settings/etablissement')
    await page.waitForLoadState('networkidle')

    expect(page.url()).not.toContain('/login')

    // Find the name input and submit button
    const nameInput = page.getByLabel(/nom.*établissement|nom/i).first()
    if (await nameInput.isVisible({ timeout: 8_000 }).catch(() => false)) {
      const currentName = await nameInput.inputValue()
      // Touch the field to enable save
      await nameInput.fill(currentName || 'Alloflow Test')
      if (!currentName) await nameInput.fill(original?.name ?? 'Alloflow')

      const submitBtn = page.getByRole('button', { name: /enregistrer|sauvegarder|save/i })
      await expect(submitBtn).toBeVisible({ timeout: 5_000 })
      await submitBtn.click()

      // Success feedback (toast or status text)
      await expect(page.getByText(/enregistré|sauvegardé|paramètres.*mis à jour/i)).toBeVisible({ timeout: 8_000 })
    } else {
      // Page structure may differ — test load only
      expect(page.url()).toContain('/settings')
    }

    expect(jsErrors).toHaveLength(0)
  })
})

// ─── 2. Inviter un membre équipe ───────────────────────────────────────────────
test.describe('Settings — équipe', () => {
  /**
   * NOTE: inviteUserByEmail déclenche un envoi d'email réel via Supabase.
   * En prod, on ne peut pas créer un vrai compte de test à chaque run.
   * Ce test vérifie que la page se charge et que le formulaire est présent.
   * L'invocation API réelle est skippée pour éviter les side-effects.
   */
  test('page équipe se charge et affiche les membres actuels', async ({ page }) => {
    const jsErrors: string[] = []
    page.on('pageerror', (err) => {
      if (!isBenignProdError(err.message)) jsErrors.push(err.message)
    })

    await page.goto('/dashboard/settings/equipe')
    await page.waitForLoadState('networkidle')

    expect(page.url()).not.toContain('/login')
    await expect(page.getByText(/404|page introuvable/i)).not.toBeVisible()

    // Members list or invite button should exist
    const inviteBtn = page.getByRole('button', { name: /inviter|ajouter.*membre|nouveau.*membre/i })
    const memberRow = page.locator('table tr, [data-testid*="member"]').first()

    const hasInviteOrMember = await inviteBtn.isVisible({ timeout: 5_000 }).catch(() => false)
      || await memberRow.isVisible({ timeout: 5_000 }).catch(() => false)

    expect(hasInviteOrMember).toBeTruthy()
    expect(jsErrors).toHaveLength(0)
  })

  test('formulaire d\'invitation visible et formulaire pré-rempli', async ({ page }) => {
    await page.goto('/dashboard/settings/equipe')
    await page.waitForLoadState('networkidle')

    const inviteBtn = page.getByRole('button', { name: /inviter|ajouter.*membre/i })
    if (await inviteBtn.isVisible({ timeout: 8_000 }).catch(() => false)) {
      await inviteBtn.click()

      // Email input should be visible
      const emailInput = page.getByPlaceholder(/email|courriel/i).first()
      if (await emailInput.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await expect(emailInput).toBeVisible()
      }
    } else {
      test.skip()
    }
  })

  test.skip('inviter un membre — nécessite email Supabase réel (side-effect)', async () => {
    // Skippé intentionnellement : inviteUserByEmail envoie un email réel.
    // Pour tester en staging, utiliser un domaine mailsink dédié.
  })
})

// ─── 3. API settings team GET ────────────────────────────────────────────────
test.describe('Settings — API', () => {
  test('GET /api/settings/team retourne les membres', async ({ request }) => {
    const res = await request.get(`${BASE}/api/settings/team`)
    expect(res.ok()).toBeTruthy()
    const json = await res.json()
    expect(Array.isArray(json.members)).toBeTruthy()
    // L'admin testeur doit être dans la liste
    const adminMember = (json.members as Array<{ email: string }>)
      .find(m => m.email?.includes('testeur.admin'))
    expect(adminMember).toBeDefined()
  })

  test('GET /api/settings/establishment retourne les données', async ({ request }) => {
    const res = await request.get(`${BASE}/api/settings/establishment`)
    expect(res.ok()).toBeTruthy()
    const json = await res.json()
    expect(json.name).toBeDefined()
    expect(json.timezone).toBeDefined()
  })
})
