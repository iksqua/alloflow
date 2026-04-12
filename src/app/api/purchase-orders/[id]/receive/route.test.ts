// src/app/api/purchase-orders/[id]/receive/route.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('next/headers', () => ({ cookies: vi.fn(() => ({ getAll: () => [], set: vi.fn() })) }))

import { POST } from './route'
import { createClient } from '@/lib/supabase/server'

describe('POST /api/purchase-orders/[id]/receive', () => {
  beforeEach(() => vi.clearAllMocks())

  it('requires at least one item', async () => {
    vi.mocked(createClient).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } } }) },
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: { establishment_id: 'est-1' }, error: null }),
      }),
    } as never)

    const req = new NextRequest('http://localhost/', {
      method: 'POST',
      body: JSON.stringify({ items: [] }),
    })
    const res = await POST(req, { params: Promise.resolve({ id: 'ord-1' }) })
    expect(res.status).toBe(400)
  })

  it('rejects negative quantities', async () => {
    vi.mocked(createClient).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } } }) },
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: { establishment_id: 'est-1' }, error: null }),
      }),
    } as never)

    const req = new NextRequest('http://localhost/', {
      method: 'POST',
      body: JSON.stringify({ items: [{ purchase_order_item_id: 'item-1', quantity_received: -1 }] }),
    })
    const res = await POST(req, { params: Promise.resolve({ id: 'ord-1' }) })
    expect(res.status).toBe(400)
  })
})
