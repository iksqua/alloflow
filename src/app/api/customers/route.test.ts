// src/app/api/customers/route.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('next/headers', () => ({ cookies: vi.fn(() => ({ getAll: () => [], set: vi.fn() })) }))
vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn() }))

import { POST } from './route'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

function makeReq(body: object) {
  return new NextRequest('http://localhost/api/customers', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

function mockAnonForPost(establishmentId = 'est-1') {
  const profileQuery = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: { establishment_id: establishmentId }, error: null }),
  }
  const insertQuery = {
    insert: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({
      data: { id: 'cust-1', first_name: 'Alice', last_name: null, phone: '+33600000000', email: null, points: 0, tier: 'standard' },
      error: null,
    }),
  }
  const mock = {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }) },
    from: vi.fn((table: string) =>
      table === 'profiles' ? profileQuery : insertQuery
    ),
  }
  ;(createClient as ReturnType<typeof vi.fn>).mockResolvedValue(mock)
  return mock
}

function mockAdminForLinking(orgType = 'independent') {
  const mock = {
    from: vi.fn((table: string) => {
      if (table === 'establishments') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: { org_id: 'org-1' }, error: null }),
        }
      }
      if (table === 'organizations') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: { id: 'org-1', type: orgType, parent_org_id: null },
            error: null,
          }),
        }
      }
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        insert: vi.fn().mockReturnThis(),
        update: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
      }
    }),
  }
  ;(createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue(mock)
  return mock
}

describe('POST /api/customers — network linking', () => {
  beforeEach(() => vi.clearAllMocks())

  it('skips network linking for independent org', async () => {
    mockAnonForPost()
    const adminMock = mockAdminForLinking('independent')

    const res = await POST(makeReq({ first_name: 'Alice', phone: '+33600000000' }))
    expect(res.status).toBe(201)

    // network_customers should never be queried
    const networkCalls = adminMock.from.mock.calls.filter(([t]: [string]) => t === 'network_customers')
    expect(networkCalls.length).toBe(0)
  })

  it('skips network linking when no phone provided', async () => {
    mockAnonForPost()
    const adminMock = mockAdminForLinking('siege')

    const res = await POST(makeReq({ first_name: 'Alice', email: 'alice@example.com' }))
    expect(res.status).toBe(201)

    const networkCalls = adminMock.from.mock.calls.filter(([t]: [string]) => t === 'network_customers')
    expect(networkCalls.length).toBe(0)
  })
})
