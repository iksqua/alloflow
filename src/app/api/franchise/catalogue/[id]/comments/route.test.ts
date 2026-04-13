import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('next/headers', () => ({ cookies: vi.fn(() => ({ getAll: () => [], set: vi.fn() })) }))
vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn() }))

import { GET } from './route'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

function mockAuth(orgId = 'org-1') {
  ;(createServerClient as ReturnType<typeof vi.fn>).mockResolvedValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } } }) },
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { role: 'franchise_admin', org_id: orgId }, error: null }),
    })),
  })
}

function mockAdmin(itemOrgId = 'org-1', comments = [{ id: 'c1', content: 'Bon item', created_at: '2026-04-13T00:00:00Z', establishments: { name: 'Paris 1' } }]) {
  ;(createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue({
    from: vi.fn((table: string) => {
      if (table === 'network_catalog_items') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: { id: 'item-1', org_id: itemOrgId }, error: null }),
        }
      }
      // catalog_item_comments
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: comments, error: null }),
      }
    }),
  })
}

describe('GET /api/franchise/catalogue/[id]/comments', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 404 when item belongs to different org', async () => {
    mockAuth('org-1'); mockAdmin('org-2')
    const req = new NextRequest('http://localhost')
    const res = await GET(req, { params: Promise.resolve({ id: 'item-1' }) })
    expect(res.status).toBe(404)
  })

  it('returns comments for items in own org', async () => {
    mockAuth(); mockAdmin()
    const req = new NextRequest('http://localhost')
    const res = await GET(req, { params: Promise.resolve({ id: 'item-1' }) })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.comments).toHaveLength(1)
    expect(body.comments[0].content).toBe('Bon item')
  })
})
