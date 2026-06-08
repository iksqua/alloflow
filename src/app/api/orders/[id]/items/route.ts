// src/app/api/orders/[id]/items/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { z } from 'zod'
import { uuidStr } from '@/lib/validations/uuid'

const addItemSchema = z.object({
  product_id: uuidStr,
  product_name: z.string(),
  emoji: z.string().nullable().optional(),
  unit_price: z.number().positive(),
  tva_rate: z.union([z.literal(5.5), z.literal(10), z.literal(20)]),
  quantity: z.number().int().positive(),
  note: z.string().optional(),
})

const r2 = (x: number) => Math.round(x * 100) / 100

// Recomputes undiscounted subtotalHt + tax breakdown from all current order_items.
// Used when a discount or reward is present to avoid mixing post-discount and pre-discount values.
async function recomputeRawTotals(
  supabase: Awaited<ReturnType<typeof import('@/lib/supabase/server').createClient>>,
  orderId: string
) {
  const { data: allItems } = await supabase
    .from('order_items')
    .select('unit_price, tva_rate, quantity')
    .eq('order_id', orderId)

  let rawHt = 0, rawTax55 = 0, rawTax10 = 0, rawTax20 = 0
  for (const it of allItems ?? []) {
    const lHt = r2(it.unit_price * it.quantity)
    const lTax = r2(lHt * (it.tva_rate / 100))
    rawHt += lHt
    if (it.tva_rate === 5.5) rawTax55 += lTax
    else if (it.tva_rate === 10) rawTax10 += lTax
    else rawTax20 += lTax
  }
  return { rawHt: r2(rawHt), rawTax55: r2(rawTax55), rawTax10: r2(rawTax10), rawTax20: r2(rawTax20) }
}

// Applies stored discount + reward to undiscounted totals and returns the fields to write back.
async function applyDiscountsToTotals(
  supabase: Awaited<ReturnType<typeof import('@/lib/supabase/server').createClient>>,
  rawHt: number, rawTax55: number, rawTax10: number, rawTax20: number,
  order: {
    discount_type: string | null
    discount_value: number | null
    reward_id: string | null
    reward_discount_amount: number | null
  }
) {
  let discountAmount = 0
  let finalTax55 = rawTax55, finalTax10 = rawTax10, finalTax20 = rawTax20

  if (order.discount_type && order.discount_value != null) {
    discountAmount = order.discount_type === 'percent'
      ? r2(rawHt * (order.discount_value / 100))
      : r2(Math.min(order.discount_value, rawHt))
    const discountedHt = r2(rawHt - discountAmount)
    const ratio = rawHt > 0 ? discountedHt / rawHt : 1
    finalTax55 = r2(rawTax55 * ratio)
    finalTax10 = r2(rawTax10 * ratio)
    finalTax20 = r2(rawTax20 * ratio)
  }

  const baseTtc = r2(rawHt - discountAmount + finalTax55 + finalTax10 + finalTax20)

  let rewardDiscount = order.reward_discount_amount ?? 0
  if (order.reward_id && rewardDiscount > 0) {
    const { data: reward } = await supabase
      .from('loyalty_rewards')
      .select('type, value')
      .eq('id', order.reward_id)
      .single()
    if (reward && (reward.type === 'percent' || reward.type === 'reduction_pct')) {
      rewardDiscount = r2(baseTtc * (reward.value / 100))
    }
  }

  return {
    subtotal_ht: rawHt,
    discount_amount: discountAmount,
    tax_5_5: finalTax55,
    tax_10: finalTax10,
    tax_20: finalTax20,
    reward_discount_amount: rewardDiscount,
    total_ttc: r2(Math.max(0, baseTtc - rewardDiscount)),
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles').select('establishment_id').eq('id', user.id).single()
  if (!profile?.establishment_id) return NextResponse.json({ error: 'Profile not found' }, { status: 403 })

  const { id } = await params
  const body = await req.json()
  const parsed = addItemSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const { data: order } = await supabase
    .from('orders')
    .select('id, status, subtotal_ht, tax_5_5, tax_10, tax_20, total_ttc, establishment_id, discount_type, discount_value, discount_amount, reward_discount_amount, reward_id')
    .eq('id', id)
    .eq('establishment_id', profile.establishment_id)
    .single()

  if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })
  if (order.status !== 'open') return NextResponse.json({ error: 'order_closed' }, { status: 400 })

  const { product_id, product_name, emoji, unit_price, tva_rate, quantity, note } = parsed.data
  const lineHt  = r2(unit_price * quantity)
  const lineTax = r2(lineHt * (tva_rate / 100))
  const lineTtc = r2(lineHt + lineTax)

  const { data: item, error: itemError } = await supabase
    .from('order_items')
    .insert({
      order_id: id,
      product_id,
      product_name,
      emoji: emoji ?? null,
      unit_price,
      tva_rate,
      quantity,
      line_total: lineTtc,
      note: note ?? null,
    })
    .select()
    .single()

  if (itemError) return NextResponse.json({ error: itemError.message }, { status: 500 })

  const hasDiscount = order.discount_type != null || (order.reward_discount_amount ?? 0) > 0

  let updateFields: Record<string, unknown>

  if (hasDiscount) {
    // Order has active discount(s) — recompute everything from all items to avoid
    // mixing post-discount stored taxes with pre-discount new-item taxes.
    const { rawHt, rawTax55, rawTax10, rawTax20 } = await recomputeRawTotals(supabase, id)
    updateFields = await applyDiscountsToTotals(supabase, rawHt, rawTax55, rawTax10, rawTax20, order)
  } else {
    // Fast incremental path — no active discount or reward.
    const newSubtotalHt = r2(order.subtotal_ht + lineHt)
    const newTax55 = tva_rate === 5.5 ? r2(order.tax_5_5 + lineTax) : order.tax_5_5
    const newTax10 = tva_rate === 10  ? r2(order.tax_10 + lineTax) : order.tax_10
    const newTax20 = tva_rate === 20  ? r2(order.tax_20 + lineTax) : order.tax_20
    updateFields = {
      subtotal_ht: newSubtotalHt,
      tax_5_5: newTax55,
      tax_10: newTax10,
      tax_20: newTax20,
      total_ttc: r2(newSubtotalHt + newTax55 + newTax10 + newTax20),
    }
  }

  const { error: updateError } = await supabase
    .from('orders')
    .update({ ...updateFields, updated_at: new Date().toISOString() })
    .eq('id', id)

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })
  return NextResponse.json({ item }, { status: 201 })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles').select('establishment_id').eq('id', user.id).single()
  if (!profile?.establishment_id) return NextResponse.json({ error: 'Profile not found' }, { status: 403 })

  const { id } = await params
  const { searchParams } = new URL(req.url)
  const itemId = searchParams.get('item_id')

  if (!itemId) return NextResponse.json({ error: 'item_id required' }, { status: 400 })

  const { data: item } = await supabase
    .from('order_items')
    .select('unit_price, tva_rate, quantity, line_total')
    .eq('id', itemId)
    .eq('order_id', id)
    .single()

  if (!item) return NextResponse.json({ error: 'Item not found' }, { status: 404 })

  const { data: order } = await supabase
    .from('orders')
    .select('status, subtotal_ht, tax_5_5, tax_10, tax_20, total_ttc, discount_type, discount_value, discount_amount, reward_discount_amount, reward_id')
    .eq('id', id)
    .eq('establishment_id', profile.establishment_id)
    .single()

  if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })
  if (order.status !== 'open') return NextResponse.json({ error: 'order_closed' }, { status: 400 })

  const { error: deleteError } = await supabase
    .from('order_items')
    .delete()
    .eq('id', itemId)

  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 })

  const hasDiscount = order.discount_type != null || (order.reward_discount_amount ?? 0) > 0

  let updateFields: Record<string, unknown>

  if (hasDiscount) {
    // Recompute from remaining items after deletion.
    const { rawHt, rawTax55, rawTax10, rawTax20 } = await recomputeRawTotals(supabase, id)
    updateFields = await applyDiscountsToTotals(supabase, rawHt, rawTax55, rawTax10, rawTax20, order)
  } else {
    // Fast decremental path — no active discount or reward.
    const lineHt  = r2(item.unit_price * item.quantity)
    const lineTax = r2(lineHt * (item.tva_rate / 100))
    const newSubtotalHt = r2(Math.max(0, order.subtotal_ht - lineHt))
    const newTax55 = item.tva_rate === 5.5 ? r2(Math.max(0, order.tax_5_5 - lineTax)) : order.tax_5_5
    const newTax10 = item.tva_rate === 10  ? r2(Math.max(0, order.tax_10 - lineTax)) : order.tax_10
    const newTax20 = item.tva_rate === 20  ? r2(Math.max(0, order.tax_20 - lineTax)) : order.tax_20
    updateFields = {
      subtotal_ht: newSubtotalHt,
      tax_5_5: newTax55,
      tax_10: newTax10,
      tax_20: newTax20,
      total_ttc: r2(newSubtotalHt + newTax55 + newTax10 + newTax20),
    }
  }

  const { error: updateError } = await supabase
    .from('orders')
    .update({ ...updateFields, updated_at: new Date().toISOString() })
    .eq('id', id)

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
