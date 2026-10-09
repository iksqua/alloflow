// src/app/api/orders/[id]/refund/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { writeFiscalJournalEntry } from '@/lib/fiscal/journal'

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Check role — admin or super_admin only
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
    .select('id, total_ttc, status, establishment_id, session_id, customer_id, reward_id')
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

  // Write a fiscal journal entry (refund with negative amount).
  const journalOk = await writeFiscalJournalEntry({
    supabase,
    establishmentId: profile.establishment_id,
    eventType:       'refund',
    orderId:         id,
    amountTtc:       -Math.abs(order.total_ttc),
    cashierId:       user.id,
    meta:            { session_id: order.session_id ?? null },
  })
  if (!journalOk) {
    console.error('[refund] CRITICAL: fiscal journal entry failed — attempting rollback. order_id:', id)
    const { error: rollbackErr } = await supabase
      .from('orders')
      .update({ status: 'paid', updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('status', 'refunded')
    if (rollbackErr) {
      console.error('[refund] CRITICAL: rollback failed — order stuck as refunded with no fiscal entry. order_id:', id, rollbackErr)
    }
    return NextResponse.json({ error: 'fiscal_journal_failed' }, { status: 500 })
  }

  // Restore loyalty points that were deducted at order-creation time (orders/route.ts CAS deduction).
  // Mirrors the cancel path in PATCH route.ts — a refund must return the points to the customer.
  if (order.reward_id && order.customer_id) {
    const { data: reward } = await supabase
      .from('loyalty_rewards')
      .select('points_required')
      .eq('id', order.reward_id)
      .eq('establishment_id', profile.establishment_id)
      .single()

    if (reward?.points_required && reward.points_required > 0) {
      const { data: cust } = await supabase
        .from('customers')
        .select('points')
        .eq('id', order.customer_id)
        .eq('establishment_id', profile.establishment_id)
        .single()

      if (cust) {
        await supabase
          .from('customers')
          .update({ points: cust.points + reward.points_required })
          .eq('id', order.customer_id)
          .eq('establishment_id', profile.establishment_id)
      }
    }
  }

  return NextResponse.json({ success: true, order_id: id, status: 'refunded' })
}
