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

  // Fetch reward
  const { data: reward, error: rErr } = await supabase
    .from('loyalty_rewards')
    .select('discount_type, discount_value')
    .eq('id', reward_id)
    .single()
  if (rErr || !reward) return NextResponse.json({ error: 'Récompense non trouvée' }, { status: 404 })

  // Fetch order total
  const { data: order, error: oErr } = await supabase
    .from('orders')
    .select('total_ttc')
    .eq('id', order_id)
    .single()
  if (oErr || !order) return NextResponse.json({ error: 'Commande non trouvée' }, { status: 404 })

  const discountAmount = reward.discount_type === 'percent'
    ? Math.round(order.total_ttc * (reward.discount_value / 100) * 100) / 100
    : reward.discount_value

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
