// src/app/api/orders/[id]/pay/route.test.ts
import { describe, it, expect, vi } from 'vitest'
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
import { createClient } from '@/lib/supabase/server'
import { POST } from './route'
import { NextRequest } from 'next/server'

/** Retourne un mock supabase adapté à chaque table */
function buildFromMock(options: {
  order: { id: string; status: string; total_ttc: number; table_id: string | null; session_id: string | null; establishment_id: string }
  updatedRows?: { id: string }[]
}) {
  return vi.fn().mockImplementation((table: string) => {
    if (table === 'profiles') {
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: { establishment_id: options.order.establishment_id }, error: null }),
      }
    }
    if (table === 'orders') {
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: options.order, error: null }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            in: vi.fn().mockReturnValue({
              select: vi.fn().mockResolvedValue({
                data: options.updatedRows ?? [{ id: options.order.id }],
                error: null,
              }),
            }),
          }),
        }),
      }
    }
    if (table === 'payments') {
      return {
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockResolvedValue({ data: [{ id: 'pay1' }], error: null }),
        }),
      }
    }
    // fiscal_journal_entries, restaurant_tables — succès silencieux
    return {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
      update: vi.fn().mockReturnThis(),
      insert: vi.fn().mockResolvedValue({ error: null }),
    }
  })
}

describe('POST /api/orders/:id/pay', () => {
  it('enregistre un paiement CB complet', async () => {
    ;(createClient as ReturnType<typeof vi.fn>).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } } }) },
      from: buildFromMock({
        order: { id: 'o1', status: 'open', total_ttc: 25.00, table_id: null, session_id: null, establishment_id: 'est-1' },
      }),
    })

    const req = new NextRequest('http://localhost/api/orders/o1/pay', {
      method: 'POST',
      body: JSON.stringify({ method: 'card', amount: 25.00 }),
    })
    const res = await POST(req, { params: Promise.resolve({ id: 'o1' }) })
    expect(res.status).toBe(200)
  })

  it('retourne 400 si paiement split incomplet (somme != total_ttc)', async () => {
    ;(createClient as ReturnType<typeof vi.fn>).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } } }) },
      from: buildFromMock({
        order: { id: 'o1', status: 'open', total_ttc: 50.00, table_id: null, session_id: null, establishment_id: 'est-1' },
      }),
    })

    const req = new NextRequest('http://localhost/api/orders/o1/pay', {
      method: 'POST',
      // split dont le total (30 €) ne couvre pas le total de la commande (50 €)
      body: JSON.stringify({
        method: 'split',
        amount: 50.00,
        split_payments: [{ method: 'card', amount: 30.00 }],
      }),
    })
    const res = await POST(req, { params: Promise.resolve({ id: 'o1' }) })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('split_payments_total_mismatch')
  })
})
