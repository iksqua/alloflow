// src/app/api/orders/[id]/items/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { z } from 'zod'

const addItemSchema = z.object({
  product_id: z.string().uuid(),
  product_name: z.string(),
  emoji: z.string().nullable().optional(),
  unit_price: z.number().positive(),
  tva_rate: z.union([z.literal(5.5), z.literal(10), z.literal(20)]),
  quantity: z.number().int().positive(),
  note: z.string().optional(),
})

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await req.json()
  const parsed = addItemSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  // Vérifier que la commande existe et est ouverte
  const { data: order } = await supabase
    .from('orders')
    .select('id, status, subtotal_ht, tax_5_5, tax_10, tax_20, total_ttc')
    .eq('id', id)
    .single()

  if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })
  if (order.status !== 'open') return NextResponse.json({ error: 'order_closed' }, { status: 400 })

  const { product_id, product_name, emoji, unit_price, tva_rate, quantity, note } = parsed.data
  const lineHt = unit_price * quantity
  const lineTax = lineHt * (tva_rate / 100)
  const lineTtc = lineHt + lineTax

  // Insérer la ligne
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

  // Recalculer les totaux de la commande
  const newSubtotalHt = order.subtotal_ht + lineHt
  const newTax55 = tva_rate === 5.5 ? order.tax_5_5 + lineTax : order.tax_5_5
  const newTax10 = tva_rate === 10 ? order.tax_10 + lineTax : order.tax_10
  const newTax20 = tva_rate === 20 ? order.tax_20 + lineTax : order.tax_20
  const newTotal = newSubtotalHt + newTax55 + newTax10 + newTax20

  await supabase
    .from('orders')
    .update({
      subtotal_ht: newSubtotalHt,
      tax_5_5: newTax55,
      tax_10: newTax10,
      tax_20: newTax20,
      total_ttc: newTotal,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)

  return NextResponse.json({ item }, { status: 201 })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const { searchParams } = new URL(req.url)
  const itemId = searchParams.get('item_id')

  if (!itemId) return NextResponse.json({ error: 'item_id required' }, { status: 400 })

  // Récupérer la ligne pour recalculer les totaux
  const { data: item } = await supabase
    .from('order_items')
    .select('unit_price, tva_rate, quantity, line_total')
    .eq('id', itemId)
    .eq('order_id', id)
    .single()

  if (!item) return NextResponse.json({ error: 'Item not found' }, { status: 404 })

  // Vérifier que la commande est ouverte
  const { data: order } = await supabase
    .from('orders')
    .select('status, subtotal_ht, tax_5_5, tax_10, tax_20, total_ttc')
    .eq('id', id)
    .single()

  if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })
  if (order.status !== 'open') return NextResponse.json({ error: 'order_closed' }, { status: 400 })

  // Supprimer la ligne
  const { error: deleteError } = await supabase
    .from('order_items')
    .delete()
    .eq('id', itemId)

  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 })

  // Recalculer les totaux
  const lineHt = item.unit_price * item.quantity
  const lineTax = lineHt * (item.tva_rate / 100)
  const newSubtotalHt = Math.max(0, order.subtotal_ht - lineHt)
  const newTax55 = item.tva_rate === 5.5 ? Math.max(0, order.tax_5_5 - lineTax) : order.tax_5_5
  const newTax10 = item.tva_rate === 10 ? Math.max(0, order.tax_10 - lineTax) : order.tax_10
  const newTax20 = item.tva_rate === 20 ? Math.max(0, order.tax_20 - lineTax) : order.tax_20
  const newTotal = newSubtotalHt + newTax55 + newTax10 + newTax20

  await supabase
    .from('orders')
    .update({
      subtotal_ht: newSubtotalHt,
      tax_5_5: newTax55,
      tax_10: newTax10,
      tax_20: newTax20,
      total_ttc: newTotal,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)

  return NextResponse.json({ success: true })
}
