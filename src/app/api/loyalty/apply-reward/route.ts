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

  // Fetch reward
  const { data: reward, error: rErr } = await supabase
    .from('loyalty_rewards')
    .select('type, value')
    .eq('id', reward_id)
    .single()
  if (rErr || !reward) return NextResponse.json({ error: 'Récompense non trouvée' }, { status: 404 })

  // Fetch order total
  const { data: order, error: oErr } = await supabase
    .from('orders')
    .select('total_ttc, establishment_id')
    .eq('id', order_id)
    .single()
  if (oErr || !order) return NextResponse.json({ error: 'Commande non trouvée' }, { status: 404 })
  if (order.establishment_id !== profile.establishment_id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const discountAmount = reward.type === 'percent' || reward.type === 'reduction_pct'
    ? Math.round(order.total_ttc * (reward.value / 100) * 100) / 100
    : reward.value

  const newTotal = Math.max(0, order.total_ttc - discountAmount)

  const { error: uErr } = await supabase
    .from('orders')
    .update({
      customer_id,
      reward_id,
      discount_amount: discountAmount,
      total_ttc:       newTotal,
    })
    .eq('id', order_id)

  if (uErr) return NextResponse.json({ error: uErr.message }, { status: 500 })
  return NextResponse.json({ order_id, discount_amount: discountAmount, new_total: newTotal })
}
