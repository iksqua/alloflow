import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))

import { createClient } from '@/lib/supabase/server'
import { GET, POST } from './route'
import { NextRequest } from 'next/server'

describe('GET /api/categories', () => {
  it('retourne les catégories triées par sort_order', async () => {
    const mockCategories = [
      { id: '1', name: 'Cafés', sort_order: 0 },
      { id: '2', name: 'Cookies', sort_order: 1 },
    ]
    ;(createClient as ReturnType<typeof vi.fn>).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } } }) },
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: { establishment_id: 'est-1' }, error: null }),
        order: vi.fn().mockResolvedValue({ data: mockCategories, error: null }),
      }),
    })
    const req = new NextRequest('http://localhost/api/categories')
    const res = await GET(req)
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.categories).toHaveLength(2)
  })

  it('retourne 401 si non authentifié', async () => {
    ;(createClient as ReturnType<typeof vi.fn>).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
    })
    const req = new NextRequest('http://localhost/api/categories')
    const res = await GET(req)
    expect(res.status).toBe(401)
  })
})

describe('POST /api/categories', () => {
  it('retourne 401 si non authentifié', async () => {
    ;(createClient as ReturnType<typeof vi.fn>).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
    })
    const req = new NextRequest('http://localhost/api/categories', {
      method: 'POST',
      body: JSON.stringify({ name: 'Cafés' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(401)
  })
})
