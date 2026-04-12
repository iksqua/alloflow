// src/app/api/purchase-orders/[id]/receive/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { receiveOrderSchema } from '@/lib/validations/stock'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('establishment_id').eq('id', user.id).single()
  if (!profile?.establishment_id) return NextResponse.json({ error: 'Establishment not found' }, { status: 400 })

  // Verify order belongs to this establishment and is receivable
  const { data: order, error: orderError } = await supabase
    .from('purchase_orders')
    .select('id, status')
    .eq('id', id)
    .eq('establishment_id', profile.establishment_id)
    .single()

  if (orderError || !order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })
  if (order.status === 'received' || order.status === 'cancelled') {
    return NextResponse.json({ error: 'Order cannot receive deliveries in its current status' }, { status: 409 })
  }

  const body = await req.json()
  const result = receiveOrderSchema.safeParse(body)
  if (!result.success) return NextResponse.json({ error: result.error.flatten() }, { status: 400 })

  const { notes, items } = result.data

  // Fetch all order items for this order
  const { data: orderItems, error: fetchError } = await supabase
    .from('purchase_order_items')
    .select('id, stock_item_id, quantity_ordered, quantity_received')
    .eq('purchase_order_id', id)

  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 })

  const receivedMap = new Map(items.map(i => [i.purchase_order_item_id, i.quantity_received]))

  // Increment each item's quantity_received and update stock
  const receptionLines: { purchase_order_item_id: string; quantity_received: number }[] = []

  for (const orderItem of orderItems ?? []) {
    const delta = receivedMap.get(orderItem.id)
    if (delta === undefined || delta <= 0) continue

    const currentReceived = orderItem.quantity_received ?? 0
    const newReceived = currentReceived + delta

    // Increment order item quantity_received
    await supabase
      .from('purchase_order_items')
      .update({ quantity_received: newReceived })
      .eq('id', orderItem.id)

    // Increment stock
    const { data: stock } = await supabase
      .from('stock_items')
      .select('quantity, alert_threshold')
      .eq('id', orderItem.stock_item_id)
      .single()

    if (stock) {
      const newQty = stock.quantity + delta
      const newStatus = newQty <= 0
        ? 'out_of_stock'
        : newQty < stock.alert_threshold
        ? 'alert'
        : 'ok'
      await supabase
        .from('stock_items')
        .update({ quantity: newQty, status: newStatus })
        .eq('id', orderItem.stock_item_id)
    }

    receptionLines.push({ purchase_order_item_id: orderItem.id, quantity_received: delta })
  }

  // Record reception
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any).from('purchase_order_receptions').insert({
    purchase_order_id: id,
    notes: notes ?? null,
    lines: receptionLines,
  })

  // Recalculate status from DB state
  const { data: updatedItems } = await supabase
    .from('purchase_order_items')
    .select('quantity_ordered, quantity_received')
    .eq('purchase_order_id', id)

  const totalOrdered  = (updatedItems ?? []).reduce((s, i) => s + i.quantity_ordered, 0)
  const totalReceived = (updatedItems ?? []).reduce((s, i) => s + (i.quantity_received ?? 0), 0)

  const newStatus = totalReceived === 0
    ? 'pending'
    : totalReceived >= totalOrdered
    ? 'received'
    : 'partial'

  await supabase.from('purchase_orders').update({ status: newStatus }).eq('id', id)

  return NextResponse.json({ success: true, status: newStatus })
}
