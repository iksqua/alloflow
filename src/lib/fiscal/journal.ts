import { createHash } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'

export function computeEntryHash(
  previousHash: string,
  establishmentId: string,
  sequenceNo: number,
  eventType: string,
  orderId: string,
  cashierId: string,
  amountTtc: number,
  occurredAt: string
): string {
  return createHash('sha256')
    .update(`${previousHash}|${establishmentId}|${sequenceNo}|${eventType}|${orderId}|${cashierId}|${amountTtc}|${occurredAt}`)
    .digest('hex')
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = SupabaseClient<any, any, any>

interface WriteJournalEntryOptions {
  supabase: AnySupabase
  establishmentId: string
  eventType: string
  orderId: string | null
  amountTtc: number
  cashierId: string
  meta?: Record<string, unknown>
}

/**
 * Writes a fiscal journal entry with SHA-256 chaining (NF525).
 * Retries up to 3 times on sequence_no unique-constraint conflicts.
 * Failure is non-blocking: logs the error but does not throw.
 */
export async function writeFiscalJournalEntry(opts: WriteJournalEntryOptions): Promise<void> {
  const { supabase, establishmentId, eventType, orderId, amountTtc, cashierId, meta } = opts
  try {
    let written = false
    for (let attempt = 0; attempt < 3 && !written; attempt++) {
      const { data: lastEntry } = await supabase
        .from('fiscal_journal_entries')
        .select('sequence_no, entry_hash')
        .eq('establishment_id', establishmentId)
        .order('sequence_no', { ascending: false })
        .limit(1)
        .single()

      const prevSeq    = lastEntry?.sequence_no ?? 0
      const prevHash   = lastEntry?.entry_hash  ?? ''
      const nextSeq    = prevSeq + 1
      const occurredAt = new Date().toISOString()
      const entryHash  = computeEntryHash(prevHash, establishmentId, nextSeq, eventType, orderId ?? '', cashierId, amountTtc, occurredAt)

      const { error } = await supabase.from('fiscal_journal_entries').insert({
        establishment_id: establishmentId,
        sequence_no:      nextSeq,
        event_type:       eventType,
        order_id:         orderId,
        amount_ttc:       amountTtc,
        cashier_id:       cashierId,
        occurred_at:      occurredAt,
        previous_hash:    prevHash,
        entry_hash:       entryHash,
        meta:             meta ?? {},
      })

      if (!error) {
        written = true
      } else if (error.code !== '23505') {
        console.error(`[fiscal-journal] Failed to write ${eventType} entry:`, error)
        break
      }
      // code '23505': concurrent operation claimed this sequence_no — retry with fresh seq
    }
  } catch (err) {
    console.error(`[fiscal-journal] Unexpected error writing ${eventType} entry:`, err)
  }
}
