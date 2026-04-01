// src/app/api/orders/[id]/refund/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createHash } from 'crypto'

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

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Check role — admin or manager only
  const { data: profile } = await supabase
    .from('profiles')
    .select('establishment_id, role')
    .eq('id', user.id)
    .single()

  if (!profile?.establishment_id) {
    return NextResponse.json({ error: 'Profile not found' }, { status: 403 })
  }
  if (profile.role !== 'admin' && profile.role !== 'super_admin') {
    return NextResponse.json({ error: 'Insufficient permissions — admin required' }, { status: 403 })
  }

  const { id } = await params

  // Fetch the order — must be 'paid' to refund
  const { data: order } = await supabase
    .from('orders')
    .select('id, total_ttc, status, establishment_id, session_id')
    .eq('id', id)
    .eq('establishment_id', profile.establishment_id)
    .single()

  if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })
  if (order.status !== 'paid') {
    return NextResponse.json({ error: 'only_paid_orders_can_be_refunded' }, { status: 409 })
  }

  // Atomically mark the order as refunded (CAS on status = 'paid')
  const { data: updatedRows, error: updateError } = await supabase
    .from('orders')
    .update({ status: 'refunded', updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('status', 'paid')
    .select('id')

  if (updateError) {
    return NextResponse.json({ error: 'Failed to update order', detail: updateError.message }, { status: 500 })
  }
  if (!updatedRows || updatedRows.length === 0) {
    return NextResponse.json({ error: 'order_status_changed' }, { status: 409 })
  }

  // Write a fiscal journal entry (refund with negative amount)
  try {
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
    const refundAmount = -Math.abs(order.total_ttc)
    const entryHash  = computeEntryHash(prevHash, nextSeq, id, refundAmount, occurredAt)

    await supabase.from('fiscal_journal_entries').insert({
      establishment_id: profile.establishment_id,
      sequence_no:      nextSeq,
      event_type:       'refund',
      order_id:         id,
      amount_ttc:       refundAmount,
      cashier_id:       user.id,
      occurred_at:      occurredAt,
      previous_hash:    prevHash,
      entry_hash:       entryHash,
      meta:             { session_id: order.session_id ?? null },
    })
  } catch {
    // Journal write failure must not block the refund response
    console.error('[fiscal-journal] Failed to write refund journal entry')
  }

  return NextResponse.json({ success: true, order_id: id, status: 'refunded' })
}
