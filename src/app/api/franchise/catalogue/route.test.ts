// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('next/headers', () => ({ cookies: vi.fn(() => ({ getAll: () => [], set: vi.fn() })) }))
vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn() }))

import { GET } from './route'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

function mockAuth(role = 'franchise_admin', orgId = 'org-1') {
  ;(createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } } }) },
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { role, org_id: orgId }, error: null }),
    })),
  })
}

function mockSupabase(rows: unknown[]) {
  ;(createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue({
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: rows, error: null }),
    })),
  })
}

describe('GET /api/franchise/catalogue', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 when unauthenticated', async () => {
    ;(createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
      from: vi.fn(),
    })
    const req = new NextRequest('http://localhost')
    const res = await GET(req)
    expect(res.status).toBe(401)
  })

  it('maps catalog_item_comments aggregate to flat comment_count integer', async () => {
    // PostgREST returns count as a STRING — must be converted to number
    mockAuth()
    mockSupabase([{
      id: 'item-1', org_id: 'org-1', type: 'ingredient', name: 'Sel',
      is_mandatory: false, is_seasonal: false, status: 'published', version: 1,
      network_catalog_item_data: null,
      catalog_item_comments: [{ count: '3' }],   // STRING, not number
    }])
    const req = new NextRequest('http://localhost')
    const res = await GET(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.items[0].comment_count).toBe(3)              // must be number 3, not string '3'
    expect(body.items[0].catalog_item_comments).toBeUndefined() // stripped from response
  })

  it('sets comment_count to 0 when no comments exist', async () => {
    mockAuth()
    mockSupabase([{
      id: 'item-2', org_id: 'org-1', type: 'product', name: 'Pain',
      is_mandatory: false, is_seasonal: false, status: 'draft', version: 1,
      network_catalog_item_data: null,
      catalog_item_comments: [],
    }])
    const req = new NextRequest('http://localhost')
    const res = await GET(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.items[0].comment_count).toBe(0)
    expect(body.items[0].catalog_item_comments).toBeUndefined()
  })
})
