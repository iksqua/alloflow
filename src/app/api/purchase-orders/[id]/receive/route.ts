// src/app/api/purchase-orders/[id]/receive/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { receiveDeliverySchema } from '@/lib/validations/stock'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const result = receiveDeliverySchema.safeParse(body)
  if (!result.success) return NextResponse.json({ error: result.error.flatten() }, { status: 400 })

  // Fetch order items to know which stock_items to update
  const { data: orderItems, error: fetchError } = await supabase
    .from('purchase_order_items')
    .select('id, stock_item_id, quantity_ordered')
    .eq('purchase_order_id', id)

  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 })

  const receivedMap = new Map(result.data.items.map(i => [i.purchase_order_item_id, i.quantity_received]))

  // Update each order item's quantity_received and increment stock
  for (const orderItem of orderItems ?? []) {
    const received = receivedMap.get(orderItem.id)
    if (received === undefined) continue

    // Update order item
    await supabase
      .from('purchase_order_items')
      .update({ quantity_received: received })
      .eq('id', orderItem.id)

    // Increment stock quantity
    if (received > 0) {
      const { data: stock } = await supabase
        .from('stock_items')
        .select('quantity')
        .eq('id', orderItem.stock_item_id)
        .single()

      await supabase
        .from('stock_items')
        .update({ quantity: (stock?.quantity ?? 0) + received })
        .eq('id', orderItem.stock_item_id)
    }
  }

  // Determine new order status
  const allReceived = (orderItems ?? []).every(oi => {
    const received = receivedMap.get(oi.id) ?? 0
    return received >= oi.quantity_ordered
  })

  await supabase
    .from('purchase_orders')
    .update({ status: allReceived ? 'received' : 'partial' })
    .eq('id', id)

  return NextResponse.json({ success: true, status: allReceived ? 'received' : 'partial' })
}
