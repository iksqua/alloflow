// src/app/api/orders/[id]/pay/route.test.ts
import { describe, it, expect, vi } from 'vitest'
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
import { createClient } from '@/lib/supabase/server'
import { POST } from './route'
import { NextRequest } from 'next/server'

describe('POST /api/orders/:id/pay', () => {
  it('enregistre un paiement CB complet', async () => {
    const mockSingle = vi.fn()
    mockSingle
      .mockResolvedValueOnce({ data: { id: 'o1', status: 'open', total_ttc: 25.00, table_id: null } }) // order

    ;(createClient as ReturnType<typeof vi.fn>).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } } }) },
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        update: vi.fn().mockReturnThis(),
        insert: vi.fn().mockReturnValue({ select: vi.fn().mockResolvedValue({ data: [{ id: 'pay1' }], error: null }) }),
        single: mockSingle,
      }),
    })

    const req = new NextRequest('http://localhost/api/orders/o1/pay', {
      method: 'POST',
      body: JSON.stringify({ method: 'card', amount: 25.00 }),
    })
    const res = await POST(req, { params: Promise.resolve({ id: 'o1' }) })
    expect(res.status).toBe(200)
  })

  it('retourne 400 si montant insuffisant (split incomplet)', async () => {
    ;(createClient as ReturnType<typeof vi.fn>).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } } }) },
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn()
          .mockResolvedValueOnce({ data: { id: 'o1', status: 'open', total_ttc: 50.00, table_id: null } }),
      }),
    })

    const req = new NextRequest('http://localhost/api/orders/o1/pay', {
      method: 'POST',
      body: JSON.stringify({ method: 'card', amount: 30.00 }),  // insuffisant
    })
    const res = await POST(req, { params: Promise.resolve({ id: 'o1' }) })
    expect(res.status).toBe(400)
  })
})
