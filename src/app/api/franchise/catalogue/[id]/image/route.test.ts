// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('next/headers', () => ({ cookies: vi.fn(() => ({ getAll: () => [], set: vi.fn() })) }))
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: vi.fn() }))

import { POST, DELETE } from './route'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

function makeFormData(file: File) {
  const fd = new FormData()
  fd.append('file', file)
  return fd
}

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

function mockService(itemOrgId = 'org-1') {
  const dbFrom = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: { id: 'item-1', org_id: itemOrgId }, error: null }),
    update: vi.fn().mockReturnThis(),
  }
  const storageFrom = {
    upload: vi.fn().mockResolvedValue({ error: null }),
    remove: vi.fn().mockResolvedValue({ error: null }),
    getPublicUrl: vi.fn().mockReturnValue({ data: { publicUrl: 'https://cdn.example.com/org-1/item-1.jpg' } }),
  }
  ;(createServiceClient as ReturnType<typeof vi.fn>).mockReturnValue({
    from: vi.fn(() => dbFrom),
    storage: { from: vi.fn(() => storageFrom) },
  })
  return { dbFrom, storageFrom }
}

describe('POST /api/franchise/catalogue/[id]/image', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 422 for non-image MIME type', async () => {
    mockAuth(); mockService()
    const file = new File(['data'], 'file.pdf', { type: 'application/pdf' })
    const req = new NextRequest('http://localhost/api/franchise/catalogue/item-1/image', {
      method: 'POST', body: makeFormData(file),
    })
    const res = await POST(req, { params: Promise.resolve({ id: 'item-1' }) })
    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.error).toMatch(/format/i)
  })

  it('returns 422 when file exceeds 2 MB', async () => {
    mockAuth(); mockService()
    const file = new File([new Uint8Array(2 * 1024 * 1024 + 1)], 'big.jpg', { type: 'image/jpeg' })
    const req = new NextRequest('http://localhost/api/franchise/catalogue/item-1/image', {
      method: 'POST', body: makeFormData(file),
    })
    const res = await POST(req, { params: Promise.resolve({ id: 'item-1' }) })
    expect(res.status).toBe(422)
  })

  it('returns 404 when item belongs to different org', async () => {
    mockAuth('franchise_admin', 'org-1'); mockService('org-2')
    const file = new File(['x'], 'img.jpg', { type: 'image/jpeg' })
    const req = new NextRequest('http://localhost/api/franchise/catalogue/item-1/image', {
      method: 'POST', body: makeFormData(file),
    })
    const res = await POST(req, { params: Promise.resolve({ id: 'item-1' }) })
    expect(res.status).toBe(404)
  })

  it('returns 200 with image_url on valid upload', async () => {
    mockAuth(); mockService()
    const file = new File(['x'], 'img.jpg', { type: 'image/jpeg' })
    const req = new NextRequest('http://localhost/api/franchise/catalogue/item-1/image', {
      method: 'POST', body: makeFormData(file),
    })
    const res = await POST(req, { params: Promise.resolve({ id: 'item-1' }) })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.image_url).toContain('cdn.example.com')
  })
})

describe('DELETE /api/franchise/catalogue/[id]/image', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 200 and clears image_url', async () => {
    mockAuth(); mockService()
    const req = new NextRequest('http://localhost/api/franchise/catalogue/item-1/image', { method: 'DELETE' })
    const res = await DELETE(req, { params: Promise.resolve({ id: 'item-1' }) })
    expect(res.status).toBe(200)
  })
})
