import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// Mock Supabase server
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

// Mock next/headers (requis par Supabase SSR)
vi.mock('next/headers', () => ({
  cookies: vi.fn(() => ({ getAll: () => [], set: vi.fn() })),
}))

import { GET, POST } from './route'
import { createClient } from '@/lib/supabase/server'

const mockProducts = [
  { id: '1', name: 'Burger', price: 12.5, category: 'plat', tva_rate: 10, active: true },
]

function mockSupabase(overrides = {}) {
  const base = {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: 'user-1' } },
        error: null,
      }),
    },
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: mockProducts[0], error: null }),
      mockResolvedValue: undefined,
      then: undefined,
      ...overrides,
    })),
  }
  ;(createClient as ReturnType<typeof vi.fn>).mockResolvedValue(base)
  return base
}

describe('GET /api/products', () => {
  it('retourne 401 si non authentifié', async () => {
    const mock = mockSupabase()
    mock.auth.getUser.mockResolvedValue({ data: { user: null }, error: null })

    const req = new NextRequest('http://localhost/api/products')
    const res = await GET(req)
    expect(res.status).toBe(401)
  })
})

describe('POST /api/products', () => {
  it('retourne 400 si données invalides', async () => {
    mockSupabase()
    const req = new NextRequest('http://localhost/api/products', {
      method: 'POST',
      body: JSON.stringify({ name: '', price: -1 }),
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })
})
