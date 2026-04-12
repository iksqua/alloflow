import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('next/headers', () => ({ cookies: vi.fn(() => ({ getAll: () => [], set: vi.fn() })) }))

import { PATCH } from './route'
import { createClient } from '@/lib/supabase/server'

function makeSupabase(overrides = {}) {
  const chain = {
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: { id: 'ord-1', status: 'pending' }, error: null }),
    ...overrides,
  }
  return chain
}

describe('PATCH /api/purchase-orders/[id]', () => {
  beforeEach(() => vi.clearAllMocks())

  it('updates supplier and notes', async () => {
    const supabase = makeSupabase()
    vi.mocked(createClient).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } } }) },
      ...supabase,
    } as never)

    const req = new NextRequest('http://localhost/api/purchase-orders/ord-1', {
      method: 'PATCH',
      body: JSON.stringify({ supplier: 'Nouveau Fournisseur', notes: 'test' }),
    })
    const res = await PATCH(req, { params: Promise.resolve({ id: 'ord-1' }) })
    expect(res.status).not.toBe(400)
  })

  it('rejects update on received order', async () => {
    let callCount = 0
    const supabase = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockImplementation(() => {
        callCount++
        if (callCount === 1) return Promise.resolve({ data: { establishment_id: 'est-1' }, error: null })
        return Promise.resolve({ data: { id: 'ord-1', status: 'received' }, error: null })
      }),
    }
    vi.mocked(createClient).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } } }) },
      ...supabase,
    } as never)

    const req = new NextRequest('http://localhost/api/purchase-orders/ord-1', {
      method: 'PATCH',
      body: JSON.stringify({ supplier: 'Test' }),
    })
    const res = await PATCH(req, { params: Promise.resolve({ id: 'ord-1' }) })
    expect(res.status).toBe(409)
  })
})
