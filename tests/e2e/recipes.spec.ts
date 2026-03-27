import { test, expect } from '@playwright/test'
import { createRecipe, deleteRecipe } from './helpers/api'

const BASE = process.env.BASE_URL ?? 'http://localhost:3000'

/** Fetch all recipes and return raw JSON array (includes title + food_cost_pct). */
async function getRawRecipes(request: import('@playwright/test').APIRequestContext) {
  const res  = await request.get(`${BASE}/api/recipes`)
  if (!res.ok()) throw new Error(`getRawRecipes failed: ${res.status()}`)
  const json = await res.json()
  return (json.recipes ?? []) as Array<{
    id:            string
    title:         string
    is_internal:   boolean
    food_cost_pct: number | null
    product:       Array<{ id: string; category_id: string | null }> | null
  }>
}

test.describe('Recipes', () => {
  const createdIds: string[] = []

  test.afterEach(async ({ request }) => {
    for (const id of createdIds) {
      await deleteRecipe(request, id).catch(() => { /* already deleted or never created */ })
    }
    createdIds.length = 0
  })

  // ── Test 1 ────────────────────────────────────────────────────────────────
  test('création recette interne sans erreur', async ({ page, request }) => {
    await page.goto('/dashboard/recettes')

    // Open "Nouvelle recette" form
    await page.getByRole('button', { name: /\+ nouvelle recette/i }).click()

    // Fill title — leave POS toggle OFF
    await page.getByPlaceholder('Cookie chocolat').fill('Recette Interne E2E')

    // Save
    await page.getByRole('button', { name: /enregistrer/i }).click()

    // Recipe title should appear in the list
    await expect(page.getByText('Recette Interne E2E')).toBeVisible()

    // Collect ID for cleanup
    const recipes = await getRawRecipes(request)
    const match   = recipes.find(r => r.title === 'Recette Interne E2E')
    if (match) createdIds.push(match.id)
  })

  // ── Test 2: UUID regression ───────────────────────────────────────────────
  test('toggle Vendu en caisse sans erreur UUID (régression)', async ({ page, request }) => {
    await page.goto('/dashboard/recettes')

    await page.getByRole('button', { name: /\+ nouvelle recette/i }).click()

    await page.getByPlaceholder('Cookie chocolat').fill('Recette POS E2E')

    // Enable POS
    await page.locator('[data-testid="recipe-pos-toggle"]').click()

    // Fill price — leave category empty (= null UUID regression test)
    await page.locator('[data-testid="recipe-pos-price-input"]').fill('4.50')

    // Save
    await page.getByRole('button', { name: /enregistrer/i }).click()

    // No error should be shown
    await expect(page.locator('[data-testid="recipe-form-error"]')).not.toBeVisible()

    // Recipe appears in list
    await expect(page.getByText('Recette POS E2E')).toBeVisible()

    // Verify via API: linked product must have category_id = null
    const recipes = await getRawRecipes(request)
    const match   = recipes.find(r => r.title === 'Recette POS E2E')
    expect(match).toBeDefined()
    if (match) {
      createdIds.push(match.id)
      expect(match.product?.[0]?.category_id ?? null).toBeNull()
    }
  })

  // ── Test 3: food cost % ───────────────────────────────────────────────────
  test('food cost % affiché correctement', async ({ page, request }) => {
    // Create via API:
    //   ingredient: 100 g × 0.05 €/g → food cost amount = 5.00 €
    //   price TTC = 10.00 €          → food cost % = 50 %
    const recipe = await createRecipe(request, {
      title:       'Recette Food Cost E2E',
      is_internal: false,
      ingredients: [
        { name: 'Ingrédient test', quantity: 100, unit: 'g', unit_cost: 0.05, sort_order: 0 },
      ],
      pos: {
        price:       10.00,
        tva_rate:    10,
        category_id: null,
      },
    })
    createdIds.push(recipe.id)

    // Verify food_cost_pct computed by the API
    const recipes = await getRawRecipes(request)
    const match   = recipes.find(r => r.id === recipe.id)
    expect(match).toBeDefined()
    expect(match!.food_cost_pct).toBe(50)

    // Navigate to recipes page and verify the food cost % is displayed
    await page.goto('/dashboard/recettes')
    await expect(page.getByText('50%')).toBeVisible()
  })
})
