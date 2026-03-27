import { test, expect } from '@playwright/test'
import { createProduct, deleteProduct, createCashSession, closeCashSession } from './helpers/api'

test.describe('POS', () => {
  let productId!: string
  let productPrice!: number
  let productTva!: number
  let sessionId!: string

  test.beforeEach(async ({ request }) => {
    const session = await createCashSession(request)
    sessionId = session.id

    const product = await createProduct(request, {
      name: 'Test POS E2E',
      price: 4.09,
      tva_rate: 10,
    })
    productId = product.id
    productPrice = product.price
    productTva = product.tva_rate
  })

  test.afterEach(async ({ request }) => {
    await closeCashSession(request, sessionId)
    await deleteProduct(request, productId)
  })

  test('page caisse charge sans erreur JS', async ({ page }) => {
    const jsErrors: string[] = []
    page.on('pageerror', (err) => jsErrors.push(err.message))

    await page.goto('/caisse/pos')
    await expect(page.getByText('Test POS E2E')).toBeVisible({ timeout: 10_000 })

    expect(jsErrors).toHaveLength(0)
  })

  test('ajout article au panier — total correct', async ({ page }) => {
    await page.goto('/caisse/pos')
    await expect(page.getByText('Test POS E2E')).toBeVisible({ timeout: 10_000 })

    // Click the product to add it to the cart
    await page.getByText('Test POS E2E').click()

    // The ticket panel shows total TTC — price is stored as HT, TTC = HT × (1 + tva/100)
    // e.g. 4.09 × 1.10 = 4.499 → toFixed(2) = "4.50" → "4,50 €"
    const expectedTtc = (productPrice * (1 + productTva / 100)).toFixed(2).replace('.', ',')
    await expect(page.getByText('Total TTC').locator('..').getByText(`${expectedTtc} €`)).toBeVisible({ timeout: 5_000 })
  })

  test('ouverture modal paiement', async ({ page }) => {
    await page.goto('/caisse/pos')
    await expect(page.getByText('Test POS E2E')).toBeVisible({ timeout: 10_000 })

    // Add product to cart
    await page.getByText('Test POS E2E').click()

    // Handle loyalty step: when a product is in the cart, loyaltyDone starts as false.
    // The panel shows "Passer sans fidélité" button to skip the loyalty flow.
    // Wait for either the skip button or the pay button to appear (avoids race condition).
    const skipBtn = page.getByText('Passer sans fidélité')
    await skipBtn.or(page.locator('[data-testid="pos-pay-btn"]')).first().waitFor({ timeout: 10_000 })
    if (await skipBtn.isVisible()) {
      await skipBtn.click()
    }

    // Now pos-pay-btn should be visible
    await expect(page.locator('[data-testid="pos-pay-btn"]')).toBeVisible({ timeout: 5_000 })
    await page.locator('[data-testid="pos-pay-btn"]').click()

    // Payment modal should appear
    await expect(page.locator('[data-testid="payment-modal"]')).toBeVisible({ timeout: 5_000 })

    // Amount displayed in modal is TTC: HT × (1 + tva/100), formatted with comma separator
    const expectedTtc = (productPrice * (1 + productTva / 100)).toFixed(2).replace('.', ',')
    await expect(page.locator('[data-testid="payment-modal"]').getByText(expectedTtc)).toBeVisible()
  })
})
