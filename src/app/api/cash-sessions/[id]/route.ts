// src/app/api/cash-sessions/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  // Verify session belongs to user's establishment
  const { data: profile } = await supabase.from('profiles').select('establishment_id').eq('id', user.id).single()
  if (!profile?.establishment_id) return NextResponse.json({ error: 'Establishment not found' }, { status: 400 })

  const { data: sessionCheck } = await supabase
    .from('cash_sessions').select('establishment_id, status').eq('id', id).single()
  if (!sessionCheck || sessionCheck.establishment_id !== profile.establishment_id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  if (sessionCheck.status === 'closed') {
    return NextResponse.json({ error: 'session_already_closed' }, { status: 409 })
  }

  const body = await req.json()
  const { closing_float } = body

  // Step 1: Close the session FIRST to prevent new orders/payments from being linked
  // This acts as a fence — any new order will see status='closed' and be rejected
  const { error: closeError } = await supabase
    .from('cash_sessions')
    .update({
      status: 'closed',
      closed_by: user.id,
      closed_at: new Date().toISOString(),
      closing_float,
    })
    .eq('id', id)
    .eq('status', 'open')

  if (closeError) {
    return NextResponse.json({ error: 'Failed to close session', detail: closeError.message }, { status: 500 })
  }

  // Step 2: Now compute totals — session is closed, no new payments can arrive
  const { data: sessionPayments } = await supabase
    .from('payments')
    .select('method, amount, orders!inner(session_id)')
    .eq('orders.session_id', id)

  const totalCash = sessionPayments
    ?.filter((p) => p.method === 'cash')
    .reduce((sum, p) => sum + p.amount, 0) ?? 0

  const totalCard = sessionPayments
    ?.filter((p) => p.method === 'card')
    .reduce((sum, p) => sum + p.amount, 0) ?? 0

  // Step 3: Update with final computed totals
  const { data, error } = await supabase
    .from('cash_sessions')
    .update({
      total_cash: totalCash,
      total_card: totalCard,
      total_sales: totalCash + totalCard,
    })
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ session: data })
}
