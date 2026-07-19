// src/app/api/orders/[id]/discounts/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { z } from 'zod'

const discountSchema = z.object({
  type: z.enum(['percent', 'amount']),
  value: z.number().positive(),
})

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('establishment_id')
    .eq('id', user.id)
    .single()

  if (!profile?.establishment_id) return NextResponse.json({ error: 'Profile not found' }, { status: 403 })

  const { id } = await params
  const body = await req.json()
  const parsed = discountSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const { data: order } = await supabase
    .from('orders')
    .select('subtotal_ht, tax_5_5, tax_10, tax_20, total_ttc, status, establishment_id, reward_discount_amount, reward_id')
    .eq('id', id)
    .single()

  if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })
  if (order.establishment_id !== profile.establishment_id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  if (order.status !== 'open') return NextResponse.json({ error: 'order_closed' }, { status: 400 })

  const { type, value } = parsed.data

  // Calcul selon l'ordre de cascade défini dans la spec :
  // 1. Remise commerciale sur sous-total HT
  // 2. TVA recalculée proportionnellement
  // 3. Remise fidélité (si reward_id) appliquée en dernier sur le TTC remisé
  const r2 = (x: number) => Math.round(x * 100) / 100
  const subtotalHt = order.subtotal_ht

  if (type === 'percent' && value > 100) {
    return NextResponse.json({ error: 'discount_value_invalid' }, { status: 400 })
  }
  // Compare against subtotalHt (the actual base for amount discounts), not total_ttc
  // which may be reduced by a loyalty discount
  if (type === 'amount' && value > subtotalHt) {
    return NextResponse.json({ error: 'discount_value_invalid' }, { status: 400 })
  }

  const discountAmount = r2(type === 'percent'
    ? subtotalHt * (value / 100)
    : Math.min(value, subtotalHt))

  // Recompute raw taxes from order_items so repeated calls (discount updates) don't
  // apply the ratio to already-discounted stored values, which would compound discounts.
  const { data: rawItems } = await supabase
    .from('order_items')
    .select('unit_price, tva_rate, quantity')
    .eq('order_id', id)

  let rawTax55 = 0, rawTax10 = 0, rawTax20 = 0
  for (const it of rawItems ?? []) {
    const lHt = r2(it.unit_price * it.quantity)
    const lTax = r2(lHt * (it.tva_rate / 100))
    if (it.tva_rate === 5.5) rawTax55 += lTax
    else if (it.tva_rate === 10) rawTax10 += lTax
    else rawTax20 += lTax
  }
  rawTax55 = r2(rawTax55); rawTax10 = r2(rawTax10); rawTax20 = r2(rawTax20)

  const discountedHt = r2(subtotalHt - discountAmount)
  const ratio = subtotalHt > 0 ? discountedHt / subtotalHt : 1  // facteur de réduction
  const newTax55 = r2(rawTax55 * ratio)
  const newTax10 = r2(rawTax10 * ratio)
  const newTax20 = r2(rawTax20 * ratio)
  const newBaseTtc = r2(discountedHt + newTax55 + newTax10 + newTax20)

  // Recompute percent-based loyalty discount on the new (post-commercial-discount) TTC.
  // Fixed-amount rewards keep their original amount unchanged.
  let newRewardDiscountAmount = order.reward_discount_amount ?? 0
  if (order.reward_id && newRewardDiscountAmount > 0) {
    const { data: reward } = await supabase
      .from('loyalty_rewards')
      .select('type, value')
      .eq('id', order.reward_id)
      .single()
    if (reward && (reward.type === 'percent' || reward.type === 'reduction_pct')) {
      newRewardDiscountAmount = r2(newBaseTtc * (reward.value / 100))
    }
  }

  const newTotal = r2(Math.max(0, newBaseTtc - newRewardDiscountAmount))

  const { data, error } = await supabase
    .from('orders')
    .update({
      discount_type: type,
      discount_value: value,
      discount_amount: discountAmount,
      tax_5_5: newTax55,
      tax_10: newTax10,
      tax_20: newTax20,
      total_ttc: newTotal,
      reward_discount_amount: newRewardDiscountAmount,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ order: data })
}
