// src/app/api/campaigns/route.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('next/headers', () => ({ cookies: vi.fn(() => ({ getAll: () => [], set: vi.fn() })) }))

import { GET, POST } from './route'
import { createClient } from '@/lib/supabase/server'

function makeReq(body: object) {
  return new NextRequest('http://localhost/api/campaigns', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

function mockSupabase({
  userId = 'user-1',
  establishmentId = 'est-1',
  insertResult = { data: { id: 'camp-1', name: 'Test', channel: 'sms', status: 'draft' }, error: null },
  listResult = { data: [], error: null },
}: {
  userId?: string | null
  establishmentId?: string | null
  insertResult?: { data: object | null; error: object | null }
  listResult?: { data: object[] | null; error: object | null }
} = {}) {
  const insertQuery = {
    insert: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(insertResult),
  }
  const selectQuery = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockResolvedValue(listResult),
  }
  const profileQuery = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({
      data: establishmentId ? { establishment_id: establishmentId } : null,
      error: null,
    }),
  }
  const mock = {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: userId ? { id: userId } : null } }) },
    from: vi.fn((table: string) => {
      if (table === 'profiles') return profileQuery
      if (table === 'campaigns') return { ...selectQuery, ...insertQuery }
      return selectQuery
    }),
  }
  ;(createClient as ReturnType<typeof vi.fn>).mockResolvedValue(mock)
  return mock
}

describe('GET /api/campaigns', () => {
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
    const json = await res.json() as { campaigns: unknown[] }
    expect(json.campaigns).toEqual([])
  })

  it('returns campaigns list', async () => {
    const camps = [{ id: 'c1', name: 'Promo', channel: 'sms', status: 'draft' }]
    mockSupabase({ listResult: { data: camps, error: null } })
    const res = await GET()
    expect(res.status).toBe(200)
    const json = await res.json() as { campaigns: unknown[] }
    expect(json.campaigns).toEqual(camps)
  })
})

describe('POST /api/campaigns', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 when unauthenticated', async () => {
    mockSupabase({ userId: null })
    const res = await POST(makeReq({ name: 'Test', channel: 'sms', template_body: 'Bonjour' }))
    expect(res.status).toBe(401)
  })

  it('returns 422 on invalid payload', async () => {
    mockSupabase()
    const res = await POST(makeReq({ name: '', channel: 'sms', template_body: 'ok' }))
    expect(res.status).toBe(422)
  })

  it('creates a draft campaign', async () => {
    mockSupabase()
    const res = await POST(makeReq({ name: 'Promo vendredi', channel: 'sms', template_body: 'Bonjour {{prenom}} !' }))
    expect(res.status).toBe(201)
    const json = await res.json() as { id: string }
    expect(json.id).toBe('camp-1')
  })

  it('returns 422 when template_body exceeds 160 chars', async () => {
    mockSupabase()
    const longMsg = 'A'.repeat(161)
    const res = await POST(makeReq({ name: 'Test', channel: 'sms', template_body: longMsg }))
    expect(res.status).toBe(422)
  })

  it('creates a scheduled campaign when scheduled_at is provided', async () => {
    const scheduledResult = { data: { id: 'camp-2', status: 'scheduled' }, error: null }
    mockSupabase({ insertResult: scheduledResult })
    const res = await POST(makeReq({
      name: 'Promo samedi',
      channel: 'sms',
      template_body: 'Hello {{prenom}}',
      scheduled_at: new Date(Date.now() + 86400000).toISOString(),
    }))
    expect(res.status).toBe(201)
  })
})
