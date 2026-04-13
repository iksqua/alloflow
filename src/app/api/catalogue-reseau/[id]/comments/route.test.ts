import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('next/headers', () => ({ cookies: vi.fn(() => ({ getAll: () => [], set: vi.fn() })) }))

import { POST } from './route'
import { createClient } from '@/lib/supabase/server'

function mockSupabase({ role = 'admin', establishmentId = 'est-1', membershipExists = true } = {}) {
  function makeFrom(table: string) {
    if (table === 'profiles') {
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: { role, establishment_id: establishmentId }, error: null }),
      }
    }
    if (table === 'establishment_catalog_items') {
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: membershipExists ? { id: 'eci-1' } : null, error: null }),
      }
    }
    if (table === 'catalog_item_comments') {
      return {
        insert: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: { id: 'c1' }, error: null }),
      }
    }
    return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: null }) }
  }

  ;(createClient as ReturnType<typeof vi.fn>).mockResolvedValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } } }) },
    from: vi.fn((table: string) => makeFrom(table)),
  })
}

describe('POST /api/catalogue-reseau/[id]/comments', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 422 for empty content', async () => {
    mockSupabase()
    const req = new NextRequest('http://localhost', { method: 'POST', body: JSON.stringify({ content: '' }), headers: { 'Content-Type': 'application/json' } })
    const res = await POST(req, { params: Promise.resolve({ id: 'item-1' }) })
    expect(res.status).toBe(422)
  })

  it('returns 422 for content over 1000 chars', async () => {
    mockSupabase()
    const req = new NextRequest('http://localhost', { method: 'POST', body: JSON.stringify({ content: 'a'.repeat(1001) }), headers: { 'Content-Type': 'application/json' } })
    const res = await POST(req, { params: Promise.resolve({ id: 'item-1' }) })
    expect(res.status).toBe(422)
  })

  it('returns 404 when item not in establishment catalog', async () => {
    mockSupabase({ membershipExists: false })
    const req = new NextRequest('http://localhost', { method: 'POST', body: JSON.stringify({ content: 'test retour' }), headers: { 'Content-Type': 'application/json' } })
    const res = await POST(req, { params: Promise.resolve({ id: 'item-1' }) })
    expect(res.status).toBe(404)
  })

  it('returns 201 on valid comment', async () => {
    mockSupabase()
    const req = new NextRequest('http://localhost', { method: 'POST', body: JSON.stringify({ content: 'Ingrédient difficile à trouver' }), headers: { 'Content-Type': 'application/json' } })
    const res = await POST(req, { params: Promise.resolve({ id: 'item-1' }) })
    expect(res.status).toBe(201)
  })
})
