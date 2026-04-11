// src/app/api/orders/[id]/pay/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { z } from 'zod'
import { createHash } from 'crypto'

const paySchema = z.object({
  method: z.enum(['card', 'cash', 'split']),
  amount: z.number().positive(),
  cash_given: z.number().optional(),    // pour espèces
  split_payments: z.array(z.object({   // pour split
    method: z.enum(['card', 'cash']),
    amount: z.number().positive(),
    cash_given: z.number().optional(),
  })).optional(),
})

function computeEntryHash(
  previousHash: string,
  sequenceNo: number,
  orderId: string,
  amountTtc: number,
  occurredAt: string
): string {
  return createHash('sha256')
    .update(`${previousHash}|${sequenceNo}|${orderId}|${amountTtc}|${occurredAt}`)
    .digest('hex')
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await req.json()
  const parsed = paySchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const { data: order } = await supabase
    .from('orders')
    .select('total_ttc, status, table_id, session_id')
    .eq('id', id)
    .single()

  if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })
  if (order.status !== 'open' && order.status !== 'paying') {
    return NextResponse.json({ error: 'order_already_closed' }, { status: 409 })
  }

  const { method, cash_given, split_payments } = parsed.data
  // Use the server-stored total_ttc as the authoritative amount (avoids client/server float mismatch)
  const authorizedTotal = order.total_ttc

  // Validate split totals BEFORE marking the order paid
  if (method === 'split' && split_payments) {
    const splitTotal = split_payments.reduce((sum, p) => sum + p.amount, 0)
    if (Math.abs(splitTotal - authorizedTotal) > 0.01) {
      return NextResponse.json({ error: 'split_payments_total_mismatch', expected: authorizedTotal, got: splitTotal }, { status: 400 })
    }
  }

  // Marquer la commande payée — filtre sur status pour éviter double-paiement concurrent
  const { error: statusError, data: updatedRows } = await supabase
    .from('orders')
    .update({ status: 'paid', updated_at: new Date().toISOString() })
    .eq('id', id)
    .in('status', ['open', 'paying'])
    .select('id')

  if (statusError) {
    console.error('[pay] Failed to update order status:', statusError)
    return NextResponse.json({ error: 'Failed to update order status', detail: statusError.message }, { status: 500 })
  }

  if (!updatedRows || updatedRows.length === 0) {
    return NextResponse.json({ error: 'order_already_paid' }, { status: 409 })
  }

  // Enregistrer le(s) paiement(s)
  const paymentsToInsert = method === 'split' && split_payments
    ? split_payments.map((p) => ({
        order_id: id,
        method: p.method,
        amount: p.amount,
        cash_given: p.cash_given ?? null,
        change_due: p.cash_given != null ? p.cash_given - p.amount : null,
      }))
    : [{
        order_id: id,
        method,
        amount: authorizedTotal,
        cash_given: cash_given ?? null,
        change_due: cash_given != null ? cash_given - authorizedTotal : null,
      }]

  const { data: payments } = await supabase
    .from('payments')
    .insert(paymentsToInsert as { order_id: string; method: 'card' | 'cash' | 'ticket_resto'; amount: number; cash_given: number | null; change_due: number | null }[])
    .select()

  // Libérer la table
  if (order.table_id) {
    await supabase
      .from('restaurant_tables')
      .update({ status: 'free', current_order_id: null })
      .eq('id', order.table_id)
  }

  // --- Fiscal journal entry (NF525 chain hash) ---
  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('establishment_id')
      .eq('id', user.id)
      .single()

    if (profile?.establishment_id) {
      // Get last entry for this establishment to chain hash
      const { data: lastEntry } = await supabase
        .from('fiscal_journal_entries')
        .select('sequence_no, entry_hash')
        .eq('establishment_id', profile.establishment_id)
        .order('sequence_no', { ascending: false })
        .limit(1)
        .single()

      const prevSeq    = lastEntry?.sequence_no ?? 0
      const prevHash   = lastEntry?.entry_hash  ?? ''
      const nextSeq    = prevSeq + 1
      const occurredAt = new Date().toISOString()
      const entryHash  = computeEntryHash(prevHash, nextSeq, id, authorizedTotal, occurredAt)

      await supabase.from('fiscal_journal_entries').insert({
        establishment_id: profile.establishment_id,
        sequence_no:      nextSeq,
        event_type:       'sale',
        order_id:         id,
        amount_ttc:       authorizedTotal,
        cashier_id:       user.id,
        occurred_at:      occurredAt,
        previous_hash:    prevHash,
        entry_hash:       entryHash,
        meta:             { method: parsed.data.method, session_id: order.session_id ?? null },
      })
    }
  } catch {
    // Journal write failure must not block the payment success response
    console.error('[fiscal-journal] Failed to write journal entry')
  }

  return NextResponse.json({ success: true, payments })
}
