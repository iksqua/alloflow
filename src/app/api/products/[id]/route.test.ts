import { describe, it, expect, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))
vi.mock('next/headers', () => ({
  cookies: vi.fn(() => ({ getAll: () => [], set: vi.fn() })),
}))

import { PATCH, DELETE } from './route'
import { createClient } from '@/lib/supabase/server'

function mockSupabase(userNull = false) {
  const mock = {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: userNull ? null : { id: 'user-1' } },
      }),
    },
    from: vi.fn(() => ({
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { id: 'prod-1', establishment_id: 'est-1' }, error: null }),
    })),
  }
  ;(createClient as ReturnType<typeof vi.fn>).mockResolvedValue(mock)
  return mock
}

describe('PATCH /api/products/[id]', () => {
  it('retourne 401 si non authentifié', async () => {
    mockSupabase(true)
    const req = new NextRequest('http://localhost/api/products/1', {
      method: 'PATCH',
      body: JSON.stringify({ price: 15 }),
    })
    const res = await PATCH(req, { params: Promise.resolve({ id: '1' }) })
    expect(res.status).toBe(401)
  })

  it('retourne 400 si body invalide', async () => {
    mockSupabase()
    const req = new NextRequest('http://localhost/api/products/1', {
      method: 'PATCH',
      body: JSON.stringify({}),
    })
    const res = await PATCH(req, { params: Promise.resolve({ id: '1' }) })
    expect(res.status).toBe(400)
  })
})

describe('DELETE /api/products/[id]', () => {
  it('retourne 401 si non authentifié', async () => {
    mockSupabase(true)
    const req = new NextRequest('http://localhost/api/products/1', {
      method: 'DELETE',
    })
    const res = await DELETE(req, { params: Promise.resolve({ id: '1' }) })
    expect(res.status).toBe(401)
  })
})
