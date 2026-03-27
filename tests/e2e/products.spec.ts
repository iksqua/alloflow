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

    // Open edit form
    await page.locator(`[data-testid="product-edit-btn-${productId}"]`).click()

    // Verify TTC price displayed (4.09 HT × 1.10 = 4.50 TTC)
    const priceInput = page.locator('[data-testid="product-price-input"]')
    await expect(priceInput).toBeVisible()
    const displayed = await priceInput.inputValue()
    expect(parseFloat(displayed)).toBeCloseTo(4.50, 1)

    // Save without modifying price
    await page.getByRole('button', { name: /enregistrer/i }).click()
    await expect(page.locator('[data-testid="product-price-input"]')).not.toBeVisible()

    // Verify HT price in DB has not changed
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

    // Toggle active → OFF (click the wrapper div, which contains the toggle button)
    await page.locator('[data-testid="product-active-toggle"]').click()
    await page.getByRole('button', { name: /enregistrer/i }).click()

    // Verify via API
    const saved = await getProduct(request, productId)
    expect(saved?.is_active).toBe(false)
  })
})
