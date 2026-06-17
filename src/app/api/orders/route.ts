// src/app/api/orders/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { z } from 'zod'
import { uuidStr } from '@/lib/validations/uuid'

const createOrderSchema = z.object({
  session_id:     uuidStr.optional(),
  table_id:       uuidStr.optional(),
  customer_id:    uuidStr.optional(),
  reward_id:      uuidStr.optional(),
  discount_type:  z.enum(['percent', 'amount']).optional(),
  discount_value: z.number().positive().optional(),
  items: z.array(z.object({
    product_id:   uuidStr,
    product_name: z.string(),
    emoji:        z.string().nullable().optional(),
    unit_price:   z.number().positive(),   // HT
    tva_rate:     z.union([z.literal(5.5), z.literal(10), z.literal(20)]),
    quantity:     z.number().int().positive(),
    note:         z.string().optional(),
  })).min(1, 'Au moins un article requis'),
}).refine(
  data => !(data.reward_id && !data.customer_id),
  { message: 'customer_id requis si reward_id est fourni', path: ['customer_id'] }
).refine(
  data => !(data.discount_type && data.discount_value == null),
  { message: 'discount_value requis si discount_type est fourni', path: ['discount_value'] }
)

function r2(x: number) { return Math.round(x * 100) / 100 }

function computeOrderTotals(items: z.infer<typeof createOrderSchema>['items']) {
  let subtotalHt = 0
  let tax55 = 0
  let tax10 = 0
  let tax20 = 0

  const processedItems = items.map((item) => {
    const lineHt  = r2(item.unit_price * item.quantity)
    const lineTax = r2(lineHt * (item.tva_rate / 100))
    const lineTtc = r2(lineHt + lineTax)

    subtotalHt += lineHt
    if (item.tva_rate === 5.5) tax55 += lineTax
    else if (item.tva_rate === 10) tax10 += lineTax
    else tax20 += lineTax

    return { ...item, line_total: lineTtc }
  })

  const totalTtc = r2(subtotalHt + tax55 + tax10 + tax20)
  return { processedItems, subtotalHt: r2(subtotalHt), tax55: r2(tax55), tax10: r2(tax10), tax20: r2(tax20), totalTtc }
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles').select('establishment_id').eq('id', user.id).single()
  if (!profile?.establishment_id) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

  const body = await req.json()
  const parsed = createOrderSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const { items, session_id, table_id } = parsed.data
  const { processedItems, subtotalHt, tax55, tax10, tax20, totalTtc } = computeOrderTotals(items)

  // Apply commercial discount atomically if provided (avoids orphaned orders on separate discount API failure).
  let discountAmount = 0
  let storedTax55 = tax55
  let storedTax10 = tax10
  let storedTax20 = tax20
  let baseTtcForReward = totalTtc

  if (parsed.data.discount_type && parsed.data.discount_value != null) {
    const dtype = parsed.data.discount_type
    const dvalue = parsed.data.discount_value
    if (dtype === 'percent' && dvalue > 100) {
      return NextResponse.json({ error: 'discount_value_invalid' }, { status: 400 })
    }
    if (dtype === 'amount' && dvalue > subtotalHt) {
      return NextResponse.json({ error: 'discount_value_invalid' }, { status: 400 })
    }
    discountAmount = r2(dtype === 'percent'
      ? subtotalHt * (dvalue / 100)
      : Math.min(dvalue, subtotalHt))
    const discountedHt = r2(subtotalHt - discountAmount)
    const ratio = subtotalHt > 0 ? discountedHt / subtotalHt : 1
    storedTax55 = r2(tax55 * ratio)
    storedTax10 = r2(tax10 * ratio)
    storedTax20 = r2(tax20 * ratio)
    baseTtcForReward = r2(discountedHt + storedTax55 + storedTax10 + storedTax20)
  }

  // Compute reward discount on the post-commercial-discount base.
  // Never trust a client-supplied discount value.
  let rewardDiscountAmount = 0
  if (parsed.data.reward_id) {
    const { data: reward } = await supabase
      .from('loyalty_rewards')
      .select('type, value')
      .eq('id', parsed.data.reward_id)
      .eq('establishment_id', profile.establishment_id)
      .single()
    if (!reward) return NextResponse.json({ error: 'Reward not found or access denied' }, { status: 404 })
    rewardDiscountAmount = reward.type === 'percent' || reward.type === 'reduction_pct'
      ? r2(baseTtcForReward * (reward.value / 100))
      : reward.value
  }

  // Créer la commande
  const { data: order, error: orderError } = await supabase
    .from('orders')
    .insert({
      establishment_id: profile.establishment_id,
      session_id:       session_id ?? null,
      table_id:         table_id ?? null,
      cashier_id:       user.id,
      customer_id:              parsed.data.customer_id ?? null,
      reward_id:                parsed.data.reward_id ?? null,
      reward_discount_amount:   rewardDiscountAmount,
      subtotal_ht:              subtotalHt,
      discount_type:            parsed.data.discount_type ?? undefined,
      discount_value:           parsed.data.discount_value ?? undefined,
      discount_amount:          discountAmount > 0 ? discountAmount : undefined,
      tax_5_5:                  storedTax55,
      tax_10:                   storedTax10,
      tax_20:                   storedTax20,
      total_ttc:                r2(Math.max(0, baseTtcForReward - rewardDiscountAmount)),
    })
    .select()
    .single()

  if (orderError) return NextResponse.json({ error: orderError.message }, { status: 500 })

  // Créer les lignes
  const { error: itemsError } = await supabase.from('order_items').insert(
    processedItems.map((item) => ({
      order_id: order.id,
      product_id: item.product_id,
      product_name: item.product_name,
      emoji: item.emoji ?? null,
      unit_price: item.unit_price,
      tva_rate: item.tva_rate,
      quantity: item.quantity,
      line_total: item.line_total,
      note: item.note ?? null,
    }))
  )

  if (itemsError) {
    await supabase.from('orders').delete().eq('id', order.id)
    return NextResponse.json({ error: itemsError.message }, { status: 500 })
  }

  // Marquer la table comme occupée
  if (table_id) {
    await supabase
      .from('restaurant_tables')
      .update({ status: 'occupied', current_order_id: order.id })
      .eq('id', table_id)
      .eq('establishment_id', profile.establishment_id)
  }

  return NextResponse.json({ order: { ...order, items: processedItems } }, { status: 201 })
}
