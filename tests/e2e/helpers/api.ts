import { APIRequestContext } from '@playwright/test'

const BASE = process.env.BASE_URL ?? 'http://localhost:3000'

export async function createProduct(request: APIRequestContext, overrides = {}) {
  const res = await request.post(`${BASE}/api/products`, {
    data: {
      name:      'Test E2E Produit',
      price:     4.09,   // TTC — stored and displayed as-is in the product form
      tva_rate:  10,
      is_active: true,
      ...overrides,
    },
  })
  const json = await res.json()
  if (!res.ok()) throw new Error(`createProduct failed: ${JSON.stringify(json)}`)
  return json as { id: string; price: number; tva_rate: number; name: string }
}

export async function deleteProduct(request: APIRequestContext, id: string) {
  const res = await request.delete(`${BASE}/api/products/${id}`)
  if (!res.ok()) throw new Error(`deleteProduct failed: ${res.status()}`)
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
  const res = await request.delete(`${BASE}/api/recipes/${id}`)
  if (!res.ok()) throw new Error(`deleteRecipe failed: ${res.status()}`)
}

export async function createCashSession(request: APIRequestContext) {
  const res = await request.post(`${BASE}/api/cash-sessions`, {
    // API field is opening_float (not opening_amount)
    data: { opening_float: 100 },
  })
  const json = await res.json()
  if (!res.ok()) throw new Error(`createCashSession failed: ${JSON.stringify(json)}`)
  return json.session as { id: string }
}

export async function closeCashSession(request: APIRequestContext, id: string) {
  // PATCH only accepts closing_float; status is always set to 'closed' server-side
  const res = await request.patch(`${BASE}/api/cash-sessions/${id}`, {
    data: { closing_float: 100 },
  })
  if (!res.ok()) throw new Error(`closeCashSession failed: ${res.status()}`)
}

export async function getRecipes(request: APIRequestContext) {
  const res  = await request.get(`${BASE}/api/recipes`)
  if (!res.ok()) throw new Error(`getRecipes failed: ${res.status()}`)
  const json = await res.json()
  return json.recipes as Array<{
    id: string
    is_internal: boolean
    product: Array<{ id: string; category_id: string | null }> | null
  }>
}

export async function getProduct(request: APIRequestContext, id: string) {
  const res  = await request.get(`${BASE}/api/products`)
  if (!res.ok()) throw new Error(`getProduct failed: ${res.status()}`)
  const json = await res.json()
  // No GET /api/products/:id endpoint — fetch all and filter client-side
  const products = json.products as Array<{ id: string; price: number; is_active: boolean }>
  return products.find(p => p.id === id) ?? null
}
