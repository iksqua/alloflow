import { test, expect } from '@playwright/test'
import { createProduct, deleteProduct, getProduct } from './helpers/api'

test.describe('Products', () => {
  let productId!: string

  test.beforeEach(async ({ request }) => {
    const p  = await createProduct(request)
    productId = p.id
  })

  test.afterEach(async ({ request }) => {
    await deleteProduct(request, productId)
  })

  test('prix TTC stable après édition sans modification (régression HT/TTC)', async ({ page, request }) => {
    await page.goto('/dashboard/products')

    // Open edit form
    await page.locator(`[data-testid="product-edit-btn-${productId}"]`).click()

    // DB stores TTC directly; form displays raw DB value (4.09 TTC)
    const priceInput = page.locator('[data-testid="product-price-input"]')
    await expect(priceInput).toBeVisible()
    const displayed = await priceInput.inputValue()
    expect(parseFloat(displayed)).toBeCloseTo(4.09, 2)

    // Save without modifying price
    await page.locator('[data-testid="product-submit-btn"]').click()
    await expect(page.locator('[data-testid="product-price-input"]')).not.toBeVisible()

    // Verify HT price in DB has not changed
    const saved = await getProduct(request, productId)
    expect(saved).not.toBeNull()
    expect(saved!.price).toBeCloseTo(4.09, 2)
  })

  test('modification du nom produit', async ({ page }) => {
    await page.goto('/dashboard/products')
    await page.locator(`[data-testid="product-edit-btn-${productId}"]`).click()

    const nameInput = page.locator('[data-testid="product-name-input"]')
    await nameInput.clear()
    await nameInput.fill('Produit Modifié E2E')

    await page.locator('[data-testid="product-submit-btn"]').click()
    await expect(page.getByText('Produit Modifié E2E')).toBeVisible()
  })

  test('désactivation produit', async ({ page, request }) => {
    await page.goto('/dashboard/products')
    await page.locator(`[data-testid="product-edit-btn-${productId}"]`).click()

    // Toggle active → OFF (click the switch button inside the wrapper)
    await page.locator('[data-testid="product-active-toggle"] button[role="switch"]').click()
    await page.locator('[data-testid="product-submit-btn"]').click()
    // Wait for form to close before querying API
    await expect(page.locator('[data-testid="product-active-toggle"]')).not.toBeVisible()

    // Verify via API
    const saved = await getProduct(request, productId)
    expect(saved?.is_active).toBe(false)
  })
})
