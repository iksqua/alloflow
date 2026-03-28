// src/app/api/loyalty/network-config/route.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('next/headers', () => ({ cookies: vi.fn(() => ({ getAll: () => [], set: vi.fn() })) }))
vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn() }))

import { GET, PUT } from './route'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

function mockAnonClient(overrides: Record<string, unknown> = {}) {
  const mock = {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }) },
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { role: 'franchise_admin', org_id: 'org-1' }, error: null }),
      ...overrides,
    })),
  }
  ;(createClient as ReturnType<typeof vi.fn>).mockResolvedValue(mock)
  return mock
}

function mockAdmin(overrides: Record<string, unknown> = {}) {
  const mock = {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
      upsert: vi.fn().mockResolvedValue({ error: null }),
      ...overrides,
    })),
  }
  ;(createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue(mock)
  return mock
}

describe('GET /api/loyalty/network-config', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 if not authenticated', async () => {
    const anonMock = mockAnonClient()
    anonMock.auth.getUser.mockResolvedValue({ data: { user: null } })
    const res = await GET()
    expect(res.status).toBe(401)
  })

  it('returns 403 if not franchise_admin', async () => {
    const anonMock = mockAnonClient()
    anonMock.from.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { role: 'admin', org_id: 'org-1' }, error: null }),
    })
    const res = await GET()
    expect(res.status).toBe(403)
  })

  it('returns defaults when no config exists', async () => {
    mockAnonClient()
    const admin = mockAdmin()

    admin.from.mockImplementation((table: string) => {
      const listResult = { data: [] as unknown[], error: null }
      const singleResult = table === 'network_loyalty_config'
        ? { data: null, error: null }
        : { data: [] as unknown[], error: null }

      // Build a chain that is properly thenable for list queries
      // and has a .single() that resolves for single queries
      const chain: Record<string, unknown> = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue(singleResult),
        // Make the chain itself awaitable (for list queries that don't call .single())
        then: (resolve: (v: unknown) => void) => resolve(listResult),
      }
      return chain
    }) as any

    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ptsPerEuro).toBe(1)
    expect(body.minRedemptionPts).toBe(100)
    expect(Array.isArray(body.levels)).toBe(true)
  })
})

describe('PUT /api/loyalty/network-config', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 400 if levels not in ascending order', async () => {
    mockAnonClient()
    mockAdmin()
    const req = new NextRequest('http://localhost/api/loyalty/network-config', {
      method: 'PUT',
      body: JSON.stringify({
        ptsPerEuro: 1,
        minRedemptionPts: 100,
        levels: [
          { key: 'silver', name: 'Silver', min: 500, max: 1999 },
          { key: 'standard', name: 'Standard', min: 0, max: 499 },
        ],
      }),
    })
    const res = await PUT(req)
    expect(res.status).toBe(400)
  })

  it('returns 200 on valid upsert', async () => {
    mockAnonClient()
    mockAdmin()
    const req = new NextRequest('http://localhost/api/loyalty/network-config', {
      method: 'PUT',
      body: JSON.stringify({
        ptsPerEuro: 1.5,
        minRedemptionPts: 200,
        levels: [
          { key: 'standard', name: 'Standard', min: 0, max: 499 },
          { key: 'silver', name: 'Silver', min: 500, max: 1999 },
          { key: 'gold', name: 'Gold', min: 2000, max: null },
        ],
      }),
    })
    const res = await PUT(req)
    expect(res.status).toBe(200)
  })
})
