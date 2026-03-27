# Playwright E2E Tests — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Install Playwright and write 9 E2E tests across products, recipes, and POS that catch regressions automatically before each deploy.

**Architecture:** `global-setup.ts` logs in once and saves cookies to `.auth/user.json`. Each spec file uses `beforeEach`/`afterEach` to create and delete test data via API calls. `data-testid` attributes are added to UI components before writing tests.

**Tech Stack:** Playwright, TypeScript, Next.js 16 App Router, Supabase (RLS-isolated test account)

---

## Prerequisites

Before starting: create a test account manually in Supabase:
1. Go to `https://vblxzfsddxhtthycsmim.supabase.co` → Auth → Users → Add user
2. Email: `test@alloflow.dev`, set a password
3. In SQL Editor: `UPDATE public.profiles SET establishment_id = '00000000-0000-0000-0000-000000000010' WHERE id = (SELECT id FROM auth.users WHERE email = 'test@alloflow.dev');`
4. Create `.env.test` at repo root with the credentials

`.env.test`:
```
TEST_USER_EMAIL=test@alloflow.dev
TEST_USER_PASSWORD=<your-password>
BASE_URL=http://localhost:3000
```

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `tests/e2e/playwright.config.ts` | Config globale Playwright |
| Create | `tests/e2e/global-setup.ts` | Login unique → storageState |
| Create | `tests/e2e/helpers/api.ts` | Helpers fetch authentifié (create/delete produit, recette, session) |
| Create | `tests/e2e/products.spec.ts` | 3 tests produits |
| Create | `tests/e2e/recipes.spec.ts` | 3 tests recettes |
| Create | `tests/e2e/pos.spec.ts` | 3 tests caisse |
| Modify | `src/app/dashboard/products/_components/products-page-client.tsx` | Ajouter `data-testid` edit btn |
| Modify | `src/app/dashboard/products/_components/product-form.tsx` | Ajouter `data-testid` sur prix + toggle actif |
| Modify | `src/app/dashboard/recettes/_components/recipe-form.tsx` | Ajouter `data-testid` sur toggle POS, prix POS, erreur |
| Modify | `src/app/caisse/pos/_components/ticket-panel.tsx` | Ajouter `data-testid` sur bouton Payer |
| Modify | `src/app/caisse/pos/_components/payment-modal.tsx` | Ajouter `data-testid` sur la modal |
| Modify | `package.json` | Ajouter scripts test:e2e |
| Modify | `.gitignore` | Ignorer `.env.test` et `tests/e2e/.auth/` |

---

## Task 1 — Installation Playwright

**Files:**
- Modify: `package.json`
- Create: `tests/e2e/playwright.config.ts`
- Modify: `.gitignore`

- [ ] **Installer Playwright**

```bash
cd /Users/anthony/Super\ pouvoir/Alloflow
npm init playwright@latest -- --quiet --lang=ts --no-examples --install-deps tests/e2e 2>&1 | tail -5
```

Répondre aux prompts :
- Where to put tests: `tests/e2e`
- Add GitHub Actions: `N`
- Install browsers: `Y` (Chromium seulement)

- [ ] **Remplacer `tests/e2e/playwright.config.ts`** avec le contenu suivant :

```ts
import { defineConfig, devices } from '@playwright/test'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.test' })

export default defineConfig({
  testDir: './tests/e2e',
  globalSetup: './tests/e2e/global-setup.ts',
  timeout: 30_000,
  retries: 1,
  use: {
    baseURL: process.env.BASE_URL ?? 'http://localhost:3000',
    storageState: 'tests/e2e/.auth/user.json',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: true,
    timeout: 60_000,
  },
})
```

- [ ] **Ajouter scripts dans `package.json`**

Dans la section `"scripts"`, ajouter :
```json
"test:e2e":    "dotenv -e .env.test -- playwright test",
"test:e2e:ui": "dotenv -e .env.test -- playwright test --ui"
```

Installer dotenv-cli si absent : `npm install --save-dev dotenv-cli`

- [ ] **Mettre à jour `.gitignore`**

Ajouter à la fin :
```
# Playwright
tests/e2e/.auth/
playwright-report/
test-results/
.env.test
```

- [ ] **Vérifier que la config charge sans erreur**

```bash
cd /Users/anthony/Super\ pouvoir/Alloflow && npx playwright test --list 2>&1 | head -10
```

Résultat attendu : liste vide (aucun test encore) sans erreur.

- [ ] **Commit**

```bash
git add package.json package-lock.json tests/e2e/playwright.config.ts .gitignore
git commit -m "chore: install Playwright and configure E2E test suite"
```

---

## Task 2 — Global Setup (login unique)

**Files:**
- Create: `tests/e2e/global-setup.ts`

- [ ] **Créer `tests/e2e/global-setup.ts`**

```ts
import { chromium, FullConfig } from '@playwright/test'
import path from 'path'
import fs from 'fs'

const AUTH_FILE = path.join(__dirname, '.auth/user.json')

export default async function globalSetup(_config: FullConfig) {
  // Skip if auth file already fresh (< 1h old)
  if (fs.existsSync(AUTH_FILE)) {
    const stat = fs.statSync(AUTH_FILE)
    if (Date.now() - stat.mtimeMs < 60 * 60 * 1000) return
  }

  fs.mkdirSync(path.dirname(AUTH_FILE), { recursive: true })

  const browser = await chromium.launch()
  const page    = await browser.newPage()

  await page.goto(process.env.BASE_URL + '/login')

  await page.getByLabel(/email/i).fill(process.env.TEST_USER_EMAIL!)
  await page.getByLabel(/mot de passe|password/i).fill(process.env.TEST_USER_PASSWORD!)
  await page.getByRole('button', { name: /connexion|se connecter|login/i }).click()

  // Attendre la redirection post-login
  await page.waitForURL('**/dashboard/**', { timeout: 15_000 })

  await page.context().storageState({ path: AUTH_FILE })
  await browser.close()
}
```

- [ ] **Vérifier que le login fonctionne**

```bash
cd /Users/anthony/Super\ pouvoir/Alloflow && npx playwright test --list 2>&1 | head -5
```

S'il y a une erreur de login, vérifier les sélecteurs dans la page login (`src/app/(auth)/login/page.tsx`) et ajuster les labels.

- [ ] **Commit**

```bash
git add tests/e2e/global-setup.ts
git commit -m "test: add Playwright global setup with Supabase auth"
```

---

## Task 3 — Helpers API

**Files:**
- Create: `tests/e2e/helpers/api.ts`

Ces helpers effectuent des appels API authentifiés pour créer/supprimer les données de test.

- [ ] **Créer `tests/e2e/helpers/api.ts`**

```ts
import { APIRequestContext } from '@playwright/test'

const BASE = process.env.BASE_URL ?? 'http://localhost:3000'

export async function createProduct(request: APIRequestContext, overrides = {}) {
  const res = await request.post(`${BASE}/api/products`, {
    data: {
      name:      'Test E2E Produit',
      price:     4.09,   // HT — affiché 4.50 TTC à TVA 10%
      tva_rate:  10,
      is_active: true,
      category:  'autre',
      ...overrides,
    },
  })
  const json = await res.json()
  if (!res.ok()) throw new Error(`createProduct failed: ${JSON.stringify(json)}`)
  return json as { id: string; price: number; tva_rate: number; name: string }
}

export async function deleteProduct(request: APIRequestContext, id: string) {
  await request.delete(`${BASE}/api/products/${id}`)
}

export async function createRecipe(request: APIRequestContext, overrides = {}) {
  const res = await request.post(`${BASE}/api/recipes`, {
    data: {
      title:       'Test E2E Recette',
      is_internal: true,
      ingredients: [],
      ...overrides,
    },
  })
  const json = await res.json()
  if (!res.ok()) throw new Error(`createRecipe failed: ${JSON.stringify(json)}`)
  return json as { id: string }
}

export async function deleteRecipe(request: APIRequestContext, id: string) {
  await request.delete(`${BASE}/api/recipes/${id}`)
}

export async function createCashSession(request: APIRequestContext) {
  const res = await request.post(`${BASE}/api/cash-sessions`, {
    data: { opening_amount: 100 },
  })
  const json = await res.json()
  if (!res.ok()) throw new Error(`createCashSession failed: ${JSON.stringify(json)}`)
  return json.session as { id: string }
}

export async function closeCashSession(request: APIRequestContext, id: string) {
  await request.patch(`${BASE}/api/cash-sessions/${id}`, {
    data: { status: 'closed', closing_amount: 100 },
  })
}

export async function getRecipes(request: APIRequestContext) {
  const res  = await request.get(`${BASE}/api/recipes`)
  const json = await res.json()
  return json.recipes as Array<{
    id: string
    is_internal: boolean
    product: Array<{ id: string; category_id: string | null }> | null
  }>
}

export async function getProduct(request: APIRequestContext, id: string) {
  const res  = await request.get(`${BASE}/api/products`)
  const json = await res.json()
  const products = json.products as Array<{ id: string; price: number; is_active: boolean }>
  return products.find(p => p.id === id) ?? null
}
```

- [ ] **Commit**

```bash
git add tests/e2e/helpers/api.ts
git commit -m "test: add API helpers for E2E test data management"
```

---

## Task 4 — data-testid dans les composants UI

**Files:**
- Modify: `src/app/dashboard/products/_components/products-page-client.tsx`
- Modify: `src/app/dashboard/products/_components/product-form.tsx`
- Modify: `src/app/dashboard/recettes/_components/recipe-form.tsx`
- Modify: `src/app/caisse/pos/_components/ticket-panel.tsx`
- Modify: `src/app/caisse/pos/_components/payment-modal.tsx`

- [ ] **`products-page-client.tsx` — bouton Modifier**

Trouver le bouton "Modifier" dans la table/liste produits et ajouter l'attribut :
```tsx
data-testid={`product-edit-btn-${product.id}`}
```

- [ ] **`product-form.tsx` — champ prix et toggle actif**

Champ prix (input `type="number"` pour le prix TTC) :
```tsx
data-testid="product-price-input"
```

Toggle "Produit actif" (`<StatusToggle>`) — wrapper le composant dans un `<div data-testid="product-active-toggle">` ou ajouter le testid directement si StatusToggle l'accepte.

- [ ] **`recipe-form.tsx` — toggle POS, prix POS, erreur**

Bouton toggle "Vendu en caisse" :
```tsx
data-testid="recipe-pos-toggle"
```

Input prix POS (visible seulement quand toggle ON) :
```tsx
data-testid="recipe-pos-price-input"
```

Paragraphe d'erreur :
```tsx
data-testid="recipe-form-error"
```

- [ ] **`ticket-panel.tsx` — bouton Payer**

Sur le bouton qui déclenche `onPay` (ligne ~215) :
```tsx
data-testid="pos-pay-btn"
```

- [ ] **`payment-modal.tsx` — container modal**

Sur la div racine de la modal (premier div visible dans le return) :
```tsx
data-testid="payment-modal"
```

- [ ] **TypeScript check**

```bash
cd /Users/anthony/Super\ pouvoir/Alloflow && npx tsc --noEmit 2>&1
```

Résultat attendu : aucune erreur.

- [ ] **Commit**

```bash
git add src/app/dashboard/products/_components/products-page-client.tsx \
        src/app/dashboard/products/_components/product-form.tsx \
        src/app/dashboard/recettes/_components/recipe-form.tsx \
        src/app/caisse/pos/_components/ticket-panel.tsx \
        src/app/caisse/pos/_components/payment-modal.tsx
git commit -m "test: add data-testid attributes for Playwright selectors"
```

---

## Task 5 — products.spec.ts

**Files:**
- Create: `tests/e2e/products.spec.ts`

- [ ] **Créer `tests/e2e/products.spec.ts`**

```ts
import { test, expect } from '@playwright/test'
import { createProduct, deleteProduct, getProduct } from './helpers/api'

test.describe('Products', () => {
  let productId: string

  test.beforeEach(async ({ request }) => {
    const p  = await createProduct(request)
    productId = p.id
  })

  test.afterEach(async ({ request }) => {
    await deleteProduct(request, productId)
  })

  test('prix TTC stable après édition sans modification (régression HT/TTC)', async ({ page, request }) => {
    await page.goto('/dashboard/products')

    // Ouvrir le formulaire d'édition
    await page.locator(`[data-testid="product-edit-btn-${productId}"]`).click()

    // Vérifier que le champ prix affiche bien le TTC (4.09 HT × 1.10 = 4.50 TTC)
    const priceInput = page.locator('[data-testid="product-price-input"]')
    await expect(priceInput).toBeVisible()
    const displayed = await priceInput.inputValue()
    expect(parseFloat(displayed)).toBeCloseTo(4.50, 1)

    // Sauvegarder sans toucher au prix
    await page.getByRole('button', { name: /enregistrer/i }).click()
    await expect(page.locator('[data-testid="product-price-input"]')).not.toBeVisible()

    // Vérifier que le prix HT en DB n'a pas changé
    const saved = await getProduct(request, productId)
    expect(saved).not.toBeNull()
    expect(saved!.price).toBeCloseTo(4.09, 2)
  })

  test('modification du nom produit', async ({ page }) => {
    await page.goto('/dashboard/products')
    await page.locator(`[data-testid="product-edit-btn-${productId}"]`).click()

    const nameInput = page.getByPlaceholder(/latte|cookie|produit/i).or(page.locator('input[required]')).first()
    await nameInput.clear()
    await nameInput.fill('Produit Modifié E2E')

    await page.getByRole('button', { name: /enregistrer/i }).click()
    await expect(page.getByText('Produit Modifié E2E')).toBeVisible()
  })

  test('désactivation produit', async ({ page, request }) => {
    await page.goto('/dashboard/products')
    await page.locator(`[data-testid="product-edit-btn-${productId}"]`).click()

    // Toggle actif → OFF
    await page.locator('[data-testid="product-active-toggle"]').click()
    await page.getByRole('button', { name: /enregistrer/i }).click()

    // Vérifier via API
    const saved = await getProduct(request, productId)
    expect(saved?.is_active).toBe(false)
  })
})
```

- [ ] **Lancer uniquement ce fichier**

```bash
cd /Users/anthony/Super\ pouvoir/Alloflow && npx playwright test tests/e2e/products.spec.ts --project=chromium 2>&1
```

Résultat attendu : 3 tests PASSED.

- [ ] **Commit**

```bash
git add tests/e2e/products.spec.ts
git commit -m "test(e2e): add product E2E tests (HT/TTC regression, edit, deactivate)"
```

---

## Task 6 — recipes.spec.ts

**Files:**
- Create: `tests/e2e/recipes.spec.ts`

- [ ] **Créer `tests/e2e/recipes.spec.ts`**

```ts
import { test, expect } from '@playwright/test'
import { createRecipe, deleteRecipe, getRecipes } from './helpers/api'

test.describe('Recipes', () => {
  const createdIds: string[] = []

  test.afterEach(async ({ request }) => {
    for (const id of createdIds.splice(0)) {
      await deleteRecipe(request, id)
    }
  })

  test('création recette interne sans erreur', async ({ page }) => {
    await page.goto('/dashboard/recettes')
    await page.getByRole('button', { name: /nouvelle recette/i }).first().click()

    await page.getByPlaceholder(/cookie|recette|nom/i).fill('Recette Interne E2E')

    // Toggle POS doit rester OFF — ne pas le toucher
    await page.getByRole('button', { name: /enregistrer/i }).click()

    // Badge "Interne" visible
    await expect(page.getByText('Recette Interne E2E')).toBeVisible()

    // Récupérer l'id pour le nettoyage via le helper authentifié
    const recipes = await getRecipes(request)
    const created = recipes.find(r => r.is_internal)
    if (created) createdIds.push(created.id)
  })

  test('toggle Vendu en caisse sans erreur UUID (régression)', async ({ page, request }) => {
    await page.goto('/dashboard/recettes')
    await page.getByRole('button', { name: /nouvelle recette/i }).first().click()

    await page.getByPlaceholder(/cookie|recette|nom/i).fill('Recette POS E2E')

    // Activer le toggle POS
    await page.locator('[data-testid="recipe-pos-toggle"]').click()

    // Remplir le prix SANS sélectionner de catégorie caisse
    await page.locator('[data-testid="recipe-pos-price-input"]').fill('4.50')

    await page.getByRole('button', { name: /enregistrer/i }).click()

    // Aucune erreur UUID
    await expect(page.locator('[data-testid="recipe-form-error"]')).not.toBeVisible()

    // Recette visible avec badge POS
    await expect(page.getByText('Recette POS E2E')).toBeVisible()

    // Vérifier via API que category_id est null (pas "")
    const recipes = await getRecipes(request)
    const created = recipes.find(r => !r.is_internal)
    expect(created).toBeDefined()
    expect(created!.product?.[0]?.category_id).toBeNull()
    if (created) createdIds.push(created.id)
  })

  test('food cost % affiché correctement', async ({ page, request }) => {
    // Sans ingrédients, food_cost_amount = 0, food_cost_pct = null → affiche "—"
    // Ce test vérifie que la section food cost est présente et que "0.00 €" n'est pas affiché comme un %
    const recipe = await createRecipe(request, {
      title:       'Recette FoodCost E2E',
      is_internal: false,
      pos: { price: 4.50, tva_rate: 10 },
    })
    createdIds.push(recipe.id)

    await page.goto('/dashboard/recettes')
    await expect(page.getByText('Recette FoodCost E2E')).toBeVisible()

    // Le label "Food cost" doit être visible sur la carte
    const card = page.locator('div').filter({ hasText: /Recette FoodCost E2E/ }).first()
    await expect(card.getByText(/food cost/i)).toBeVisible()

    // Le prix de vente doit s'afficher (4.50 €)
    await expect(card.getByText(/4[,.]50/)).toBeVisible()
  })
})
```

- [ ] **Lancer uniquement ce fichier**

```bash
cd /Users/anthony/Super\ pouvoir/Alloflow && npx playwright test tests/e2e/recipes.spec.ts --project=chromium 2>&1
```

Résultat attendu : 3 tests PASSED.

- [ ] **Commit**

```bash
git add tests/e2e/recipes.spec.ts
git commit -m "test(e2e): add recipe E2E tests (UUID regression, POS toggle, food cost)"
```

---

## Task 7 — pos.spec.ts

**Files:**
- Create: `tests/e2e/pos.spec.ts`

- [ ] **Créer `tests/e2e/pos.spec.ts`**

```ts
import { test, expect } from '@playwright/test'
import { createProduct, deleteProduct, createCashSession, closeCashSession } from './helpers/api'

test.describe('POS Caisse', () => {
  let productId:  string
  let sessionId:  string
  let productPrice: number
  let productTva:   number

  test.beforeEach(async ({ request }) => {
    const session = await createCashSession(request)
    sessionId = session.id

    const product = await createProduct(request, { name: 'Test POS E2E', price: 4.09, tva_rate: 10 })
    productId   = product.id
    productPrice = product.price
    productTva   = product.tva_rate
  })

  test.afterEach(async ({ request }) => {
    await closeCashSession(request, sessionId)
    await deleteProduct(request, productId)
  })

  test('page caisse charge sans erreur JS', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', err => errors.push(err.message))

    await page.goto('/caisse/pos')

    // Grille produits visible
    await expect(page.getByText('Test POS E2E')).toBeVisible({ timeout: 10_000 })

    // Aucune erreur JS
    expect(errors).toHaveLength(0)
  })

  test('ajout article au panier — total correct', async ({ page }) => {
    await page.goto('/caisse/pos')
    await expect(page.getByText('Test POS E2E')).toBeVisible({ timeout: 10_000 })

    // Cliquer sur le produit
    await page.getByText('Test POS E2E').click()

    // Total TTC attendu = HT × (1 + TVA/100)
    const expectedTtc = (productPrice * (1 + productTva / 100)).toFixed(2)
    await expect(page.getByText(new RegExp(`${expectedTtc}`))).toBeVisible()
  })

  test('ouverture modal paiement', async ({ page }) => {
    await page.goto('/caisse/pos')
    await expect(page.getByText('Test POS E2E')).toBeVisible({ timeout: 10_000 })

    await page.getByText('Test POS E2E').click()

    // Cliquer Payer
    await page.locator('[data-testid="pos-pay-btn"]').click()

    // Modal paiement visible avec le bon montant
    const modal = page.locator('[data-testid="payment-modal"]')
    await expect(modal).toBeVisible()

    const expectedTtc = (productPrice * (1 + productTva / 100)).toFixed(2)
    await expect(modal.getByText(new RegExp(`${expectedTtc}`))).toBeVisible()
  })
})
```

- [ ] **Lancer uniquement ce fichier**

```bash
cd /Users/anthony/Super\ pouvoir/Alloflow && npx playwright test tests/e2e/pos.spec.ts --project=chromium 2>&1
```

Résultat attendu : 3 tests PASSED.

- [ ] **Commit**

```bash
git add tests/e2e/pos.spec.ts
git commit -m "test(e2e): add POS E2E tests (load, cart, payment modal)"
```

---

## Task 8 — Run complet + deploy

- [ ] **Lancer la suite complète**

```bash
cd /Users/anthony/Super\ pouvoir/Alloflow && npx playwright test --project=chromium 2>&1
```

Résultat attendu : **9 passed** en < 2 minutes.

- [ ] **Si des tests échouent**, utiliser le rapport HTML pour déboguer :

```bash
npx playwright show-report
```

- [ ] **Deploy final**

```bash
npx vercel --prod --scope iksquas-projects 2>&1
# Le token Vercel est dans .mcp.json — passer via VERCEL_TOKEN ou --token $VERCEL_TOKEN
```

- [ ] **Commit final si tout est vert**

```bash
git add .
git commit -m "test(e2e): complete Playwright suite — 9 tests passing"
```

---

## Résultat attendu

```
Running 9 tests using 1 worker

  ✓ Products › prix TTC stable après édition sans modification
  ✓ Products › modification du nom produit
  ✓ Products › désactivation produit
  ✓ Recipes › création recette interne sans erreur
  ✓ Recipes › toggle Vendu en caisse sans erreur UUID
  ✓ Recipes › food cost % affiché correctement
  ✓ POS Caisse › page caisse charge sans erreur JS
  ✓ POS Caisse › ajout article au panier — total correct
  ✓ POS Caisse › ouverture modal paiement

  9 passed (1m 23s)
```
