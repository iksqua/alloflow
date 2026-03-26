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

  const { id } = await params
  const body = await req.json()
  const parsed = discountSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const { data: order } = await supabase
    .from('orders')
    .select('subtotal_ht, tax_5_5, tax_10, tax_20, total_ttc, status')
    .eq('id', id)
    .single()

  if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })
  if (order.status !== 'open') return NextResponse.json({ error: 'order_closed' }, { status: 400 })

  const { type, value } = parsed.data

  // Calcul selon l'ordre de cascade défini dans la spec :
  // 1. Remise sur sous-total HT
  // 2. TVA recalculée sur les montants remisés
  // 3. total_ttc = HT remisé + TVA
  const subtotalHt = order.subtotal_ht
  const discountAmount = type === 'percent'
    ? subtotalHt * (value / 100)
    : Math.min(value, subtotalHt)

  if (type === 'percent' && value > 100) {
    return NextResponse.json({ error: 'discount_value_invalid' }, { status: 400 })
  }
  if (type === 'amount' && value > order.total_ttc) {
    return NextResponse.json({ error: 'discount_value_invalid' }, { status: 400 })
  }

  const discountedHt = subtotalHt - discountAmount
  const ratio = discountedHt / subtotalHt  // facteur de réduction
  const newTax55 = order.tax_5_5 * ratio
  const newTax10 = order.tax_10 * ratio
  const newTax20 = order.tax_20 * ratio
  const newTotal = discountedHt + newTax55 + newTax10 + newTax20

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
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ order: data })
}
