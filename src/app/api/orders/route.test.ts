// src/app/api/orders/route.test.ts
import { describe, it, expect, vi } from 'vitest'
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
import { createClient } from '@/lib/supabase/server'
import { POST } from './route'
import { NextRequest } from 'next/server'

const PRODUCT_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
const SESSION_ID  = 'a1b2c3d4-e5f6-7890-abcd-ef1234567891'

function buildFromMock() {
  return vi.fn().mockImplementation((table: string) => {
    if (table === 'profiles') {
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: { establishment_id: 'e1', role: 'admin' }, error: null }),
      }
    }
    if (table === 'products') {
      // authoritative price fetch — returns the DB price regardless of client input
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        in: vi.fn().mockResolvedValue({
          data: [{ id: PRODUCT_ID, price: 2.0, tva_rate: 10 }],
          error: null,
        }),
      }
    }
    if (table === 'cash_sessions') {
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: { id: SESSION_ID }, error: null }),
      }
    }
    if (table === 'orders') {
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: { id: 'order1', status: 'open', total_ttc: 4.40 }, error: null }),
        }),
      }
    }
    if (table === 'order_items') {
      return {
        insert: vi.fn().mockResolvedValue({ data: [], error: null }),
      }
    }
    // restaurant_tables, customers, loyalty_rewards — not needed for these tests
    return {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    }
  })
}

describe('POST /api/orders', () => {
  it('crée une commande en utilisant le prix DB (ignore le prix client)', async () => {
    ;(createClient as ReturnType<typeof vi.fn>).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } } }) },
      from: buildFromMock(),
    })

    const req = new NextRequest('http://localhost/api/orders', {
      method: 'POST',
      // The client sends unit_price: 0.01 (price manipulation attempt) — must be ignored
      body: JSON.stringify({
        items: [
          { product_id: PRODUCT_ID, product_name: 'Café', unit_price: 0.01, tva_rate: 10, quantity: 2, emoji: '☕' }
        ],
        session_id: SESSION_ID,
      }),
    })
    const res = await POST(req)
    expect(res.status).toBe(201)
  })

  it('retourne 400 si items est vide', async () => {
    ;(createClient as ReturnType<typeof vi.fn>).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } } }) },
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: { establishment_id: 'e1' } }),
      }),
    })
    const req = new NextRequest('http://localhost/api/orders', {
      method: 'POST',
      body: JSON.stringify({ items: [] }),
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('retourne 404 si un produit est introuvable', async () => {
    ;(createClient as ReturnType<typeof vi.fn>).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } } }) },
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'profiles') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: { establishment_id: 'e1' }, error: null }),
          }
        }
        // products returns empty — simulates product not belonging to this establishment
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          in: vi.fn().mockResolvedValue({ data: [], error: null }),
        }
      }),
    })

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
  })
})
