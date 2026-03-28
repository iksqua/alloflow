import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// Mock supabase-js admin client
const mockCreateUser = vi.fn()
const mockInsert     = vi.fn()
const mockDelete     = vi.fn()
const mockEq         = vi.fn()

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    from: (table: string) => {
      if (table === 'organizations') {
        return {
          insert: mockInsert,
          delete: () => ({ eq: mockEq }),
        }
      }
      return {}
    },
    auth: {
      admin: {
        createUser: mockCreateUser,
      },
    },
  })),
}))

// Silence env vars
process.env.NEXT_PUBLIC_SUPABASE_URL  = 'https://test.supabase.co'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key'

import { POST } from './route'

function makeRequest(body: unknown) {
  return new NextRequest('http://localhost/api/auth/register-franchise', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('POST /api/auth/register-franchise', () => {
  it('retourne 422 si le body est invalide', async () => {
    const res = await POST(makeRequest({ email: 'not-an-email', password: 'short', networkName: 'x' }))
    expect(res.status).toBe(422)
  })

  it('retourne 201 et crée org + user', async () => {
    mockInsert.mockReturnValue({
      select: () => ({
        single: () => Promise.resolve({ data: { id: 'org-123' }, error: null }),
      }),
    })
    mockCreateUser.mockResolvedValue({ data: { user: { id: 'user-123' } }, error: null })

    const res = await POST(makeRequest({
      networkName: 'Allocookie Paris',
      email: 'siege@alloflow.dev',
      password: 'SecurePass1!',
    }))

    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(mockCreateUser).toHaveBeenCalledWith(expect.objectContaining({
      email: 'siege@alloflow.dev',
      email_confirm: true,
      user_metadata: expect.objectContaining({
        role:   'franchise_admin',
        org_id: 'org-123',
      }),
    }))
  })

  it('retourne 409 si email déjà enregistré', async () => {
    mockInsert.mockReturnValue({
      select: () => ({
        single: () => Promise.resolve({ data: { id: 'org-123' }, error: null }),
      }),
    })
    mockEq.mockResolvedValue({ error: null })
    mockCreateUser.mockResolvedValue({
      data: {},
      error: { message: 'User already registered', status: 422 },
    })

    const res = await POST(makeRequest({
      networkName: 'Allocookie Paris',
      email: 'existing@alloflow.dev',
      password: 'SecurePass1!',
    }))

    expect(res.status).toBe(409)
  })
})
