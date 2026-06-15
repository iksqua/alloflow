// src/app/api/orders/[id]/pay/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { z } from 'zod'
import { createHash } from 'crypto'

const splitPaymentSchema = z.object({
  method: z.enum(['card', 'cash']),
  amount: z.number().positive(),
  cash_given: z.number().optional(),
}).superRefine((p, ctx) => {
  if (p.method === 'cash' && p.cash_given != null && p.cash_given < p.amount) {
    ctx.addIssue({ code: 'custom', message: 'cash_given must be >= amount', path: ['cash_given'] })
  }
})

const paySchema = z.object({
  method: z.enum(['card', 'cash', 'split']),
  amount: z.number().positive(),
  cash_given: z.number().optional(),    // pour espèces
  split_payments: z.array(splitPaymentSchema).optional(),
}).superRefine((p, ctx) => {
  if (p.method === 'cash' && p.cash_given != null && p.cash_given < p.amount) {
    ctx.addIssue({ code: 'custom', message: 'cash_given must be >= amount', path: ['cash_given'] })
  }
})

function computeEntryHash(
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

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Cross-tenant isolation: resolve cashier's establishment first
  const { data: profile } = await supabase
    .from('profiles')
    .select('establishment_id')
    .eq('id', user.id)
    .single()
  if (!profile?.establishment_id) return NextResponse.json({ error: 'Profile not found' }, { status: 403 })

  const { id } = await params
  const body = await req.json()
  const parsed = paySchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const { data: order } = await supabase
    .from('orders')
    .select('total_ttc, status, table_id, session_id, establishment_id')
    .eq('id', id)
    .single()

  if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })

  // Cross-tenant guard — reject if order belongs to a different establishment
  if (order.establishment_id !== profile.establishment_id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  if (order.status !== 'open' && order.status !== 'paying') {
    return NextResponse.json({ error: 'order_already_closed' }, { status: 409 })
  }

  // Guard: order total must be positive
  if (order.total_ttc <= 0) {
    return NextResponse.json({ error: 'invalid_order_total' }, { status: 400 })
  }

  // Guard: if this order is linked to a session, ensure it is still open
  if (order.session_id) {
    const { data: cashSession } = await supabase
      .from('cash_sessions')
      .select('status')
      .eq('id', order.session_id)
      .single()
    if (!cashSession || cashSession.status !== 'open') {
      return NextResponse.json({ error: 'cash_session_closed' }, { status: 409 })
    }
  }

  const { method, cash_given, split_payments } = parsed.data

  // Validate split has payments before proceeding
  if (method === 'split' && (!split_payments || split_payments.length === 0)) {
    return NextResponse.json({ error: 'split_payments required when method is split' }, { status: 400 })
  }

  // Use the server-stored total_ttc as the authoritative amount (avoids client/server float mismatch)
  const authorizedTotal = order.total_ttc

  // Validate split totals BEFORE updating status to avoid marking paid with mismatched payments
  if (method === 'split' && split_payments) {
    const splitTotal = Math.round(split_payments.reduce((sum, p) => sum + p.amount, 0) * 100) / 100
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
        change_due: p.cash_given != null ? Math.round((p.cash_given - p.amount) * 100) / 100 : null,
      }))
    : [{
        order_id: id,
        method,
        amount: authorizedTotal,
        cash_given: cash_given ?? null,
        change_due: cash_given != null ? Math.round((cash_given - authorizedTotal) * 100) / 100 : null,
      }]

  const { data: payments, error: paymentsError } = await supabase
    .from('payments')
    .insert(paymentsToInsert as { order_id: string; method: 'card' | 'cash' | 'ticket_resto'; amount: number; cash_given: number | null; change_due: number | null }[])
    .select()

  if (paymentsError) {
    console.error('[pay] Failed to insert payments:', paymentsError)
    // Best-effort revert: try to re-open the order so it can be retried
    await supabase
      .from('orders')
      .update({ status: 'open', updated_at: new Date().toISOString() })
      .eq('id', id)
    return NextResponse.json({ error: 'payment_record_failed', detail: paymentsError.message }, { status: 500 })
  }

  // Libérer la table
  if (order.table_id) {
    await supabase
      .from('restaurant_tables')
      .update({ status: 'free', current_order_id: null })
      .eq('id', order.table_id)
  }

  // --- Fiscal journal entry (NF525 chain hash) ---
  // Retry up to 3 times on unique-constraint conflict (concurrent payments racing on sequence_no).
  try {
    const estId = profile.establishment_id
    let written = false
    for (let attempt = 0; attempt < 3 && !written; attempt++) {
      const { data: lastEntry } = await supabase
        .from('fiscal_journal_entries')
        .select('sequence_no, entry_hash')
        .eq('establishment_id', estId)
        .order('sequence_no', { ascending: false })
        .limit(1)
        .single()

      const prevSeq    = lastEntry?.sequence_no ?? 0
      const prevHash   = lastEntry?.entry_hash  ?? ''
      const nextSeq    = prevSeq + 1
      const occurredAt = new Date().toISOString()
      const entryHash  = computeEntryHash(prevHash, estId, nextSeq, 'sale', id, user.id, authorizedTotal, occurredAt)

      const { error: journalError } = await supabase.from('fiscal_journal_entries').insert({
        establishment_id: estId,
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

      if (!journalError) {
        written = true
      } else if (journalError.code !== '23505') {
        // Not a unique-constraint conflict — no point retrying
        console.error('[fiscal-journal] Failed to write journal entry:', journalError)
        break
      }
      // code '23505': another concurrent payment claimed this sequence_no first;
      // re-read lastEntry on the next iteration with a fresh prevSeq/prevHash
    }
  } catch {
    // Journal write failure must not block the payment success response
    console.error('[fiscal-journal] Failed to write journal entry')
  }

  return NextResponse.json({ success: true, payments })
}
