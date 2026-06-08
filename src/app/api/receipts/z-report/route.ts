// src/app/api/receipts/z-report/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles').select('role, establishment_id').eq('id', user.id).single()

  if (profile?.role === 'caissier') {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  if (!profile?.establishment_id) return NextResponse.json({ error: 'Profile not found' }, { status: 403 })

  const { session_id } = await req.json()

  const { data: session } = await supabase
    .from('cash_sessions')
    .select('*')
    .eq('id', session_id)
    .eq('establishment_id', profile.establishment_id)
    .single()

  if (!session) return NextResponse.json({ error: 'session_not_found' }, { status: 404 })

  // Fetch all paid orders for this session
  const { data: orders } = await supabase
    .from('orders')
    .select('id, total_ttc, subtotal_ht, tax_5_5, tax_10, tax_20, discount_amount, reward_discount_amount, status')
    .eq('session_id', session_id)
    .in('status', ['paid', 'refunded'])

  // Fetch payments for these orders
  const orderIds = (orders ?? []).map(o => o.id)
  const { data: payments } = orderIds.length > 0
    ? await supabase
        .from('payments')
        .select('method, amount, order_id')
        .in('order_id', orderIds)
    : { data: [] }

  const paidOrders = (orders ?? []).filter(o => o.status === 'paid')
  const refundedOrders = (orders ?? []).filter(o => o.status === 'refunded')

  const totalTtc = paidOrders.reduce((s, o) => s + (o.total_ttc ?? 0), 0)
  const totalRefunds = refundedOrders.reduce((s, o) => s + (o.total_ttc ?? 0), 0)
  const netTtc = totalTtc - totalRefunds

  // Compute post-all-discounts HT base: subtract both commercial and loyalty reward discounts.
  // tax_5_5/10/20 stored in DB are post-commercial-discount; reward discount is applied on TTC,
  // so we convert it back to its HT equivalent by dividing by the blended TTC/HT ratio.
  const totalHt = paidOrders.reduce((s, o) => {
    const htBase = (o.subtotal_ht ?? 0) - (o.discount_amount ?? 0)
    const ttcBase = htBase + (o.tax_5_5 ?? 0) + (o.tax_10 ?? 0) + (o.tax_20 ?? 0)
    const rewardTtc = o.reward_discount_amount ?? 0
    // Proportionally allocate the reward discount to the HT portion
    const rewardHt = ttcBase > 0 ? rewardTtc * (htBase / ttcBase) : 0
    return s + htBase - rewardHt
  }, 0)
  const totalTax55 = paidOrders.reduce((s, o) => s + (o.tax_5_5 ?? 0), 0)
  const totalTax10 = paidOrders.reduce((s, o) => s + (o.tax_10 ?? 0), 0)
  const totalTax20 = paidOrders.reduce((s, o) => s + (o.tax_20 ?? 0), 0)
  const totalDiscounts = paidOrders.reduce((s, o) => s + (o.discount_amount ?? 0), 0)

  // Payment method breakdown
  const byMethod: Record<string, number> = {}
  for (const p of (payments ?? [])) {
    byMethod[p.method] = (byMethod[p.method] ?? 0) + p.amount
  }

  return NextResponse.json({
    session,
    summary: {
      order_count: paidOrders.length,
      refund_count: refundedOrders.length,
      total_ttc: totalTtc,
      total_refunds: totalRefunds,
      net_ttc: netTtc,
      total_ht: totalHt,
      tax_5_5: totalTax55,
      tax_10: totalTax10,
      tax_20: totalTax20,
      total_discounts: totalDiscounts,
      by_method: byMethod,
    },
  })
}
