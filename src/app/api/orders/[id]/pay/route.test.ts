// src/app/api/orders/[id]/pay/route.test.ts
import { describe, it, expect, vi } from 'vitest'
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
import { createClient } from '@/lib/supabase/server'
import { POST } from './route'
import { NextRequest } from 'next/server'

function makeChain(overrides: Record<string, unknown> = {}) {
  const chain: Record<string, unknown> = {
    select:  vi.fn().mockReturnThis(),
    eq:      vi.fn().mockReturnThis(),
    in:      vi.fn().mockReturnThis(),
    update:  vi.fn().mockReturnThis(),
    insert:  vi.fn().mockReturnThis(),
    order:   vi.fn().mockReturnThis(),
    limit:   vi.fn().mockReturnThis(),
    single:  vi.fn().mockResolvedValue({ data: null, error: null }),
    ...overrides,
  }
  return chain
}

describe('POST /api/orders/:id/pay', () => {
  it('enregistre un paiement CB complet', async () => {
    let callCount = 0
    ;(createClient as ReturnType<typeof vi.fn>).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } } }) },
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'orders') {
          callCount++
          if (callCount === 1) {
            // First call: select order
            return makeChain({ single: vi.fn().mockResolvedValue({ data: { id: 'o1', status: 'open', total_ttc: 25.00, table_id: null, session_id: null }, error: null }) })
          }
          // Second call: update order status — returns data with select
          return makeChain({ select: vi.fn().mockResolvedValue({ data: [{ id: 'o1' }], error: null }) })
        }
        if (table === 'payments') {
          return makeChain({ select: vi.fn().mockResolvedValue({ data: [{ id: 'pay1' }], error: null }) })
        }
        if (table === 'profiles') {
          return makeChain({ single: vi.fn().mockResolvedValue({ data: { establishment_id: 'est1' }, error: null }) })
        }
        if (table === 'fiscal_journal_entries') {
          return makeChain({ single: vi.fn().mockResolvedValue({ data: null, error: null }), insert: vi.fn().mockResolvedValue({ data: null, error: null }) })
        }
        return makeChain()
      }),
    })

    const req = new NextRequest('http://localhost/api/orders/o1/pay', {
      method: 'POST',
      body: JSON.stringify({ method: 'card', amount: 25.00 }),
    })
    const res = await POST(req, { params: Promise.resolve({ id: 'o1' }) })
    expect(res.status).toBe(200)
  })

  it('retourne 400 si split sans split_payments', async () => {
    ;(createClient as ReturnType<typeof vi.fn>).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } } }) },
      from: vi.fn().mockImplementation(() => makeChain({
        single: vi.fn().mockResolvedValue({ data: { id: 'o1', status: 'open', total_ttc: 50.00, table_id: null, session_id: null }, error: null }),
      })),
    })

    const req = new NextRequest('http://localhost/api/orders/o1/pay', {
      method: 'POST',
      body: JSON.stringify({ method: 'split', amount: 50.00 }),  // split sans split_payments
    })
    const res = await POST(req, { params: Promise.resolve({ id: 'o1' }) })
    expect(res.status).toBe(400)
  })
})
