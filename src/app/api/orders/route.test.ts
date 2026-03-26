// src/app/api/orders/route.test.ts
import { describe, it, expect, vi } from 'vitest'
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
import { createClient } from '@/lib/supabase/server'
import { POST } from './route'
import { NextRequest } from 'next/server'

const mockInsert = vi.fn()

describe('POST /api/orders', () => {
  it('crée une commande avec les lignes fournies', async () => {
    ;(createClient as ReturnType<typeof vi.fn>).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } } }) },
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: { establishment_id: 'e1', role: 'admin' },
        }),
        insert: vi.fn().mockReturnThis(),
        ...mockInsert(),
      }),
    })
    mockInsert.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: { id: 'order1', status: 'open', total_ttc: 12.50 },
        error: null,
      }),
    })

    const req = new NextRequest('http://localhost/api/orders', {
      method: 'POST',
      body: JSON.stringify({
        items: [
          { product_id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', product_name: 'Café', unit_price: 2.0, tva_rate: 10, quantity: 2, emoji: '☕' }
        ],
        session_id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567891',
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
})
