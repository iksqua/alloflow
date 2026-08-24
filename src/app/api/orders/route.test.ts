// src/app/api/orders/route.test.ts
import { describe, it, expect, vi } from 'vitest'
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
import { createClient } from '@/lib/supabase/server'
import { POST } from './route'
import { NextRequest } from 'next/server'

const PRODUCT_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
const SESSION_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567891'

// Chainable builder that resolves to `data` when awaited (thenable) and also supports .single().
// Supports .select/.eq/.in/.is/.order/.limit chaining used by the route handler.
function builder(data: unknown, error: unknown = null) {
  const b: Record<string, unknown> = {}
  const chain = () => b
  b.select = chain; b.eq = chain; b.in = chain; b.is = chain; b.order = chain; b.limit = chain
  b.single = vi.fn().mockResolvedValue({ data, error })
  b.then = (resolve: (v: { data: unknown; error: unknown }) => unknown) => Promise.resolve({ data, error }).then(resolve)
  b.insert = vi.fn().mockReturnValue({
    select: vi.fn().mockReturnValue({
      single: vi.fn().mockResolvedValue({
        data: { id: 'order1', status: 'open', total_ttc: 12.50 },
        error: null,
      }),
    }),
  })
  return b
}

function makeSupabase(fromByTable: Record<string, unknown>) {
  return {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } } }) },
    from: vi.fn((table: string) => fromByTable[table] ?? builder(null)),
  }
}

describe('POST /api/orders', () => {
  it('crée une commande avec les lignes fournies', async () => {
    ;(createClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeSupabase({
        profiles:  builder({ establishment_id: 'e1', role: 'admin' }),
        products:  builder([{ id: PRODUCT_ID, price: 2.0, tva_rate: 10, is_active: true }]),
        cash_sessions: builder({ id: SESSION_ID }),
        orders: {
          ...builder(null),
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { id: 'order1', status: 'open', total_ttc: 4.40 },
                error: null,
              }),
            }),
          }),
        },
        order_items: {
          ...builder(null),
          insert: vi.fn().mockResolvedValue({ error: null }),
        },
      })
    )

    const req = new NextRequest('http://localhost/api/orders', {
      method: 'POST',
      body: JSON.stringify({
        items: [
          { product_id: PRODUCT_ID, product_name: 'Café', unit_price: 2.0, tva_rate: 10, quantity: 2, emoji: '☕' }
        ],
        session_id: SESSION_ID,
      }),
    })
    const res = await POST(req)
    expect(res.status).toBe(201)
  })

  it('refuse un unit_price trafiqué qui ne correspond pas au produit', async () => {
    ;(createClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeSupabase({
        profiles: builder({ establishment_id: 'e1', role: 'admin' }),
        products: builder([{ id: PRODUCT_ID, price: 2.0, tva_rate: 10, is_active: true }]),
      })
    )
    const req = new NextRequest('http://localhost/api/orders', {
      method: 'POST',
      body: JSON.stringify({
        items: [
          { product_id: PRODUCT_ID, product_name: 'Café', unit_price: 0.01, tva_rate: 10, quantity: 2 }
        ],
      }),
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('price_mismatch')
  })

  it('refuse un tva_rate trafiqué qui ne correspond pas au produit', async () => {
    ;(createClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeSupabase({
        profiles: builder({ establishment_id: 'e1', role: 'admin' }),
        products: builder([{ id: PRODUCT_ID, price: 2.0, tva_rate: 10, is_active: true }]),
      })
    )
    const req = new NextRequest('http://localhost/api/orders', {
      method: 'POST',
      body: JSON.stringify({
        items: [
          { product_id: PRODUCT_ID, product_name: 'Café', unit_price: 2.0, tva_rate: 5.5, quantity: 1 }
        ],
      }),
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('tva_rate_mismatch')
  })

  it('refuse un product_id inconnu (ou cross-tenant)', async () => {
    ;(createClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeSupabase({
        profiles: builder({ establishment_id: 'e1', role: 'admin' }),
        products: builder([]), // product filtered out by establishment scope
      })
    )
    const req = new NextRequest('http://localhost/api/orders', {
      method: 'POST',
      body: JSON.stringify({
        items: [
          { product_id: PRODUCT_ID, product_name: 'Café', unit_price: 2.0, tva_rate: 10, quantity: 1 }
        ],
      }),
    })
    const res = await POST(req)
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toBe('product_not_found')
  })

  it('retourne 400 si items est vide', async () => {
    ;(createClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeSupabase({
        profiles: builder({ establishment_id: 'e1' }),
      })
    )
    const req = new NextRequest('http://localhost/api/orders', {
      method: 'POST',
      body: JSON.stringify({ items: [] }),
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })
})
