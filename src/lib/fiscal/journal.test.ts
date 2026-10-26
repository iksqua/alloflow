import { describe, it, expect, vi, beforeEach } from 'vitest'
import { computeEntryHash, writeFiscalJournalEntry } from './journal'
import { createHash } from 'crypto'

// ---------------------------------------------------------------------------
// computeEntryHash — pure function, no mocks needed
// ---------------------------------------------------------------------------
describe('computeEntryHash', () => {
  it('produces the same hash for the same inputs (deterministic)', () => {
    const h1 = computeEntryHash('', 'est-1', 1, 'sale', 'ord-1', 'usr-1', 25.50, '2024-01-01T00:00:00.000Z')
    const h2 = computeEntryHash('', 'est-1', 1, 'sale', 'ord-1', 'usr-1', 25.50, '2024-01-01T00:00:00.000Z')
    expect(h1).toBe(h2)
  })

  it('returns a 64-character hex string (SHA-256)', () => {
    const h = computeEntryHash('prev', 'est-1', 2, 'refund', 'ord-2', 'usr-1', -10.00, '2024-01-01T12:00:00.000Z')
    expect(h).toMatch(/^[0-9a-f]{64}$/)
  })

  it('chains on previous hash — changing previousHash changes the result', () => {
    const base = computeEntryHash('aaa', 'est-1', 3, 'sale', 'ord-3', 'usr-1', 15.00, '2024-01-01T00:00:00.000Z')
    const diff = computeEntryHash('bbb', 'est-1', 3, 'sale', 'ord-3', 'usr-1', 15.00, '2024-01-01T00:00:00.000Z')
    expect(base).not.toBe(diff)
  })

  it('produces a different hash for a different establishment (tenant isolation)', () => {
    const h1 = computeEntryHash('', 'est-A', 1, 'sale', 'ord-1', 'usr-1', 25.00, '2024-01-01T00:00:00.000Z')
    const h2 = computeEntryHash('', 'est-B', 1, 'sale', 'ord-1', 'usr-1', 25.00, '2024-01-01T00:00:00.000Z')
    expect(h1).not.toBe(h2)
  })

  it('produces a different hash when amount changes (tamper detection)', () => {
    const h1 = computeEntryHash('', 'est-1', 1, 'sale', 'ord-1', 'usr-1', 25.00, '2024-01-01T00:00:00.000Z')
    const h2 = computeEntryHash('', 'est-1', 1, 'sale', 'ord-1', 'usr-1', 24.99, '2024-01-01T00:00:00.000Z')
    expect(h1).not.toBe(h2)
  })

  it('matches a manually computed SHA-256', () => {
    const prevHash     = 'abc123'
    const estId        = 'est-X'
    const seq          = 5
    const eventType    = 'z_close'
    const orderId      = ''
    const cashierId    = 'cash-1'
    const amountTtc    = 0
    const occurredAt   = '2024-06-15T10:00:00.000Z'
    const expected = createHash('sha256')
      .update(`${prevHash}|${estId}|${seq}|${eventType}|${orderId}|${cashierId}|${amountTtc}|${occurredAt}`)
      .digest('hex')
    const actual = computeEntryHash(prevHash, estId, seq, eventType, orderId, cashierId, amountTtc, occurredAt)
    expect(actual).toBe(expected)
  })
})

// ---------------------------------------------------------------------------
// writeFiscalJournalEntry — requires Supabase mock
// ---------------------------------------------------------------------------

function buildSupabaseMock({
  lastEntry = null as { sequence_no: number; entry_hash: string } | null,
  insertError = null as { code?: string; message?: string } | null,
} = {}) {
  const insertMock = vi.fn().mockResolvedValue({ error: insertError })
  const fromMock = vi.fn().mockImplementation((table: string) => {
    if (table === 'fiscal_journal_entries') {
      return {
        select: vi.fn().mockReturnThis(),
        eq:     vi.fn().mockReturnThis(),
        order:  vi.fn().mockReturnThis(),
        limit:  vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: lastEntry, error: null }),
        insert: insertMock,
      }
    }
    return {}
  })
  return { from: fromMock, _insertMock: insertMock }
}

describe('writeFiscalJournalEntry', () => {
  it('returns true and inserts when there is no previous entry', async () => {
    const { from, _insertMock } = buildSupabaseMock({ lastEntry: null })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ok = await writeFiscalJournalEntry({ supabase: { from } as any, establishmentId: 'est-1', eventType: 'sale', orderId: 'ord-1', amountTtc: 10.00, cashierId: 'usr-1' })
    expect(ok).toBe(true)
    expect(_insertMock).toHaveBeenCalledOnce()
    const inserted = _insertMock.mock.calls[0][0]
    expect(inserted.sequence_no).toBe(1)
    expect(inserted.previous_hash).toBe('')
    expect(inserted.entry_hash).toHaveLength(64)
  })

  it('increments sequence_no from last entry', async () => {
    const { from, _insertMock } = buildSupabaseMock({
      lastEntry: { sequence_no: 7, entry_hash: 'deadbeef' },
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await writeFiscalJournalEntry({ supabase: { from } as any, establishmentId: 'est-1', eventType: 'sale', orderId: 'ord-2', amountTtc: 5.50, cashierId: 'usr-1' })
    const inserted = _insertMock.mock.calls[0][0]
    expect(inserted.sequence_no).toBe(8)
    expect(inserted.previous_hash).toBe('deadbeef')
  })

  it('retries up to 3 times on 23505 (unique-constraint conflict) and returns false if all fail', async () => {
    const insertMock = vi.fn().mockResolvedValue({ error: { code: '23505', message: 'duplicate' } })
    const fromMock = vi.fn().mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      eq:     vi.fn().mockReturnThis(),
      order:  vi.fn().mockReturnThis(),
      limit:  vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { sequence_no: 1, entry_hash: 'h' }, error: null }),
      insert: insertMock,
    }))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ok = await writeFiscalJournalEntry({ supabase: { from: fromMock } as any, establishmentId: 'est-1', eventType: 'sale', orderId: 'ord-3', amountTtc: 1.00, cashierId: 'usr-1' })
    expect(ok).toBe(false)
    expect(insertMock).toHaveBeenCalledTimes(3)
  })

  it('returns false (without throwing) on a non-conflict DB error', async () => {
    const { from } = buildSupabaseMock({ insertError: { code: '42P01', message: 'table not found' } })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ok = await writeFiscalJournalEntry({ supabase: { from } as any, establishmentId: 'est-1', eventType: 'sale', orderId: 'ord-4', amountTtc: 20.00, cashierId: 'usr-1' })
    expect(ok).toBe(false)
  })

  it('writes negative amount for refund events', async () => {
    const { from, _insertMock } = buildSupabaseMock()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await writeFiscalJournalEntry({ supabase: { from } as any, establishmentId: 'est-1', eventType: 'refund', orderId: 'ord-5', amountTtc: -30.00, cashierId: 'usr-1' })
    const inserted = _insertMock.mock.calls[0][0]
    expect(inserted.event_type).toBe('refund')
    expect(inserted.amount_ttc).toBe(-30.00)
  })
})
