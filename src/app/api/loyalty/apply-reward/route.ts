// src/app/api/loyalty/apply-reward/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { applyRewardSchema } from '@/lib/validations/loyalty'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const result = applyRewardSchema.safeParse(body)
  if (!result.success) return NextResponse.json({ error: result.error.flatten() }, { status: 400 })

  const { order_id, reward_id, customer_id } = result.data

  const { data: profile } = await supabase
    .from('profiles')
    .select('establishment_id')
    .eq('id', user.id)
    .single()

  if (!profile?.establishment_id) return NextResponse.json({ error: 'Profile not found' }, { status: 403 })

  // Fetch reward — scoped to the cashier's establishment to prevent cross-tenant reward abuse
  const { data: reward, error: rErr } = await supabase
    .from('loyalty_rewards')
    .select('type, value, points_required')
    .eq('id', reward_id)
    .eq('establishment_id', profile.establishment_id)
    .single()
  if (rErr || !reward) return NextResponse.json({ error: 'Récompense non trouvée' }, { status: 404 })

  // Verify customer belongs to the same establishment (prevents cross-tenant points deduction)
  const { data: customer, error: cErr } = await supabase
    .from('customers')
    .select('points')
    .eq('id', customer_id)
    .eq('establishment_id', profile.establishment_id)
    .single()
  if (cErr || !customer) return NextResponse.json({ error: 'Client non trouvé' }, { status: 404 })

  // Fetch order total — also select original reward/customer fields so we can roll back on CAS failure
  const { data: order, error: oErr } = await supabase
    .from('orders')
    .select('total_ttc, reward_discount_amount, reward_id, customer_id, establishment_id, status')
    .eq('id', order_id)
    .single()
  if (oErr || !order) return NextResponse.json({ error: 'Commande non trouvée' }, { status: 404 })
  if (order.establishment_id !== profile.establishment_id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  if (order.status !== 'open') {
    return NextResponse.json({ error: 'order_closed' }, { status: 409 })
  }

  // When replacing an existing reward, its previously deducted points must be netted against the
  // new deduction — otherwise the customer loses points for the old reward permanently.
  let oldPointsRequired = 0
  if (order.reward_id && order.reward_id !== reward_id) {
    const { data: oldReward } = await supabase
      .from('loyalty_rewards')
      .select('points_required')
      .eq('id', order.reward_id)
      .eq('establishment_id', profile.establishment_id)
      .single()
    oldPointsRequired = oldReward?.points_required ?? 0
  }
  const rawPointsDiff = (reward.points_required ?? 0) - oldPointsRequired
  if (rawPointsDiff > 0 && customer.points < rawPointsDiff) {
    return NextResponse.json({ error: 'insufficient_points', required: rawPointsDiff, current: customer.points }, { status: 400 })
  }

  // The stored total_ttc is always post-reward. To avoid compounding discounts when the
  // cashier replaces a reward, compute the base TTC (before any loyalty reward) first.
  const baseTtc = Math.round((order.total_ttc + (order.reward_discount_amount ?? 0)) * 100) / 100

  const discountAmount = reward.type === 'percent' || reward.type === 'reduction_pct'
    ? Math.round(baseTtc * (reward.value / 100) * 100) / 100
    : Math.round(Math.min(reward.value, baseTtc) * 100) / 100

  const newTotal = Math.round(Math.max(0, baseTtc - discountAmount) * 100) / 100

  // Guard: reward must not reduce the order total to zero — a zero-total order is
  // unpayable (/pay rejects total_ttc <= 0 with invalid_order_total).
  if (newTotal <= 0) {
    return NextResponse.json({ error: 'reward_exceeds_total' }, { status: 400 })
  }

  const { data: updatedRows, error: uErr } = await supabase
    .from('orders')
    .update({
      customer_id,
      reward_id,
      reward_discount_amount: discountAmount,
      total_ttc:              newTotal,
    })
    .eq('id', order_id)
    .eq('establishment_id', profile.establishment_id)
    .in('status', ['open'])
    .select('id')

  if (uErr) return NextResponse.json({ error: uErr.message }, { status: 500 })
  // 0 rows updated means the order's status changed concurrently after our status check above
  if (!updatedRows || updatedRows.length === 0) {
    return NextResponse.json({ error: 'order_no_longer_open' }, { status: 409 })
  }

  // Apply net loyalty points change (CAS deduction prevents double-spend; net handles replacements).
  if (rawPointsDiff > 0) {
    const { data: deducted } = await supabase
      .from('customers')
      .update({ points: customer.points - rawPointsDiff })
      .eq('id', customer_id)
      .eq('establishment_id', profile.establishment_id)
      .eq('points', customer.points)
      .select('id')
    if (!deducted || deducted.length === 0) {
      // Roll back the order update so the discount is not applied without consuming points.
      const { error: revertErr } = await supabase
        .from('orders')
        .update({
          customer_id:            order.customer_id ?? null,
          reward_id:              order.reward_id ?? null,
          reward_discount_amount: order.reward_discount_amount ?? 0,
          total_ttc:              order.total_ttc,
        })
        .eq('id', order_id)
      if (revertErr) {
        console.error('[apply-reward] CRITICAL: order rollback failed after points CAS failure. order_id:', order_id, revertErr)
      }
      return NextResponse.json({ error: 'points_changed_concurrently' }, { status: 409 })
    }
  } else if (rawPointsDiff < 0) {
    // New reward is cheaper than the old one: refund the difference back to the customer.
    // Use CAS retry (up to 3 attempts) to prevent points drift under concurrent load,
    // matching the pattern in orders/[id]/route.ts and orders/[id]/refund/route.ts.
    let refundDone = false
    let pointsNow = customer.points
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt > 0) {
        const fresh = await supabase
          .from('customers')
          .select('points')
          .eq('id', customer_id)
          .eq('establishment_id', profile.establishment_id)
          .single()
        if (!fresh.data) break
        pointsNow = fresh.data.points
      }
      const { data: updated } = await supabase
        .from('customers')
        .update({ points: pointsNow - rawPointsDiff })
        .eq('id', customer_id)
        .eq('establishment_id', profile.establishment_id)
        .eq('points', pointsNow)
        .select('id')
      if (updated && updated.length > 0) { refundDone = true; break }
    }
    if (!refundDone) {
      console.error('[apply-reward] CRITICAL: failed to refund net points on reward replacement after 3 CAS attempts. customer_id:', customer_id)
    }
  }

  return NextResponse.json({ order_id, discount_amount: discountAmount, new_total: newTotal })
}
