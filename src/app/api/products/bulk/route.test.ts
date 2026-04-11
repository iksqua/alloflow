import { describe, it, expect, vi } from 'vitest'
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
import { createClient } from '@/lib/supabase/server'
import { POST } from './route'
import { NextRequest } from 'next/server'

describe('POST /api/products/bulk', () => {
  it('active les produits sélectionnés', async () => {
    ;(createClient as ReturnType<typeof vi.fn>).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } } }) },
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'profiles') {
          return {
            select: vi.fn().mockReturnThis(),
            eq:     vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: { establishment_id: 'est1' }, error: null }),
          }
        }
        // products table
        const chain = {
          update: vi.fn().mockReturnThis(),
          in:     vi.fn().mockReturnThis(),
          eq:     vi.fn().mockResolvedValue({ error: null }),
        }
        return chain
      }),
    })
    const req = new NextRequest('http://localhost/api/products/bulk', {
      method: 'POST',
      body: JSON.stringify({ action: 'activate', ids: ['p1', 'p2'] }),
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
  })

  it('retourne 400 si action invalide', async () => {
    ;(createClient as ReturnType<typeof vi.fn>).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } } }) },
    })
    const req = new NextRequest('http://localhost/api/products/bulk', {
      method: 'POST',
      body: JSON.stringify({ action: 'fly', ids: ['p1'] }),
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })
})
