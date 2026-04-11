// src/app/api/automation-rules/route.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('next/headers', () => ({ cookies: vi.fn(() => ({ getAll: () => [], set: vi.fn() })) }))

import { GET, PUT } from './route'
import { createClient } from '@/lib/supabase/server'

const VALID_RULE = {
  trigger_type:  'welcome',
  channel:       'sms',
  delay_hours:   1,
  template_body: 'Bienvenue {{prenom}} !',
  active:        true,
}

function makePutReq(body: object) {
  return new NextRequest('http://localhost/api/automation-rules', {
    method: 'PUT',
    body: JSON.stringify(body),
  })
}

function mockSupabase({
  userId = 'user-1',
  establishmentId = 'est-1',
  upsertResult = { data: { id: 'rule-1', ...VALID_RULE, establishment_id: 'est-1' }, error: null },
  listResult = { data: [], error: null },
}: {
  userId?: string | null
  establishmentId?: string | null
  upsertResult?: { data: object | null; error: object | null }
  listResult?: { data: object[] | null; error: object | null }
} = {}) {
  const profileQuery = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({
      data: establishmentId ? { establishment_id: establishmentId } : null,
      error: null,
    }),
  }
  const listQuery = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockResolvedValue(listResult),
  }
  const upsertQuery = {
    upsert: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(upsertResult),
  }
  const mock = {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: userId ? { id: userId } : null } }) },
    from: vi.fn((table: string) => {
      if (table === 'profiles') return profileQuery
      if (table === 'automation_rules') return { ...listQuery, ...upsertQuery }
      return listQuery
    }),
  }
  ;(createClient as ReturnType<typeof vi.fn>).mockResolvedValue(mock)
  return mock
}

describe('GET /api/automation-rules', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 when unauthenticated', async () => {
    mockSupabase({ userId: null })
    const res = await GET()
    expect(res.status).toBe(401)
  })

  it('returns empty list when no establishment', async () => {
    mockSupabase({ establishmentId: null })
    const res = await GET()
    expect(res.status).toBe(200)
    const json = await res.json() as { rules: unknown[] }
    expect(json.rules).toEqual([])
  })

  it('returns rules list', async () => {
    const rules = [{ id: 'r1', trigger_type: 'welcome', active: true }]
    mockSupabase({ listResult: { data: rules, error: null } })
    const res = await GET()
    expect(res.status).toBe(200)
    const json = await res.json() as { rules: unknown[] }
    expect(json.rules).toEqual(rules)
  })
})

describe('PUT /api/automation-rules', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 when unauthenticated', async () => {
    mockSupabase({ userId: null })
    const res = await PUT(makePutReq(VALID_RULE))
    expect(res.status).toBe(401)
  })

  it('returns 422 on invalid trigger_type', async () => {
    mockSupabase()
    const res = await PUT(makePutReq({ ...VALID_RULE, trigger_type: 'invalid_trigger' }))
    expect(res.status).toBe(422)
  })

  it('returns 422 on invalid channel', async () => {
    mockSupabase()
    const res = await PUT(makePutReq({ ...VALID_RULE, channel: 'fax' }))
    expect(res.status).toBe(422)
  })

  it('returns 422 when delay_hours exceeds 168', async () => {
    mockSupabase()
    const res = await PUT(makePutReq({ ...VALID_RULE, delay_hours: 200 }))
    expect(res.status).toBe(422)
  })

  it('upserts a valid automation rule', async () => {
    mockSupabase()
    const res = await PUT(makePutReq(VALID_RULE))
    expect(res.status).toBe(200)
    const json = await res.json() as { id: string; trigger_type: string }
    expect(json.trigger_type).toBe('welcome')
  })

  it('accepts all valid trigger types', async () => {
    const triggers = ['welcome', 'birthday', 'reactivation', 'lost', 'google_review', 'tier_upgrade']
    for (const trigger_type of triggers) {
      mockSupabase()
      const res = await PUT(makePutReq({ ...VALID_RULE, trigger_type }))
      expect(res.status).toBe(200)
    }
  })
})
