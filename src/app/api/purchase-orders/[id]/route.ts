// src/app/api/purchase-orders/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { patchPurchaseOrderSchema } from '@/lib/validations/stock'

async function getEstablishmentId(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data } = await supabase.from('profiles').select('establishment_id').eq('id', userId).single()
  return (data?.establishment_id as string | undefined) ?? null
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const establishmentId = await getEstablishmentId(supabase, user.id)
  if (!establishmentId) return NextResponse.json({ error: 'Establishment not found' }, { status: 400 })

  const { data, error } = await supabase
    .from('purchase_orders')
    .select(`
      *,
      items:purchase_order_items(*, stock_item:stock_items(id, name, unit)),
      receptions:purchase_order_receptions(id, received_at, notes, lines)
    `)
    .eq('id', id)
    .eq('establishment_id', establishmentId)
    .order('received_at', { foreignTable: 'purchase_order_receptions', ascending: true })
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 404 })
  return NextResponse.json(data)
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const establishmentId = await getEstablishmentId(supabase, user.id)

  // Verify order belongs to this establishment and is editable
  const { data: order, error: orderError } = await supabase
    .from('purchase_orders')
    .select('id, status')
    .eq('id', id)
    .eq('establishment_id', establishmentId ?? '')
    .single()

  if (orderError || !order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })
  if (order.status === 'received' || order.status === 'cancelled') {
    return NextResponse.json({ error: 'Cannot edit a received or cancelled order' }, { status: 409 })
  }

  const body = await req.json()
  const result = patchPurchaseOrderSchema.safeParse(body)
  if (!result.success) return NextResponse.json({ error: result.error.flatten() }, { status: 400 })

  const { supplier, requested_delivery_date, notes, upsert_items, delete_item_ids } = result.data

  // Update order header fields
  const headerUpdate: Record<string, unknown> = {}
  if (supplier !== undefined)                headerUpdate.supplier = supplier
  if (requested_delivery_date !== undefined) headerUpdate.requested_delivery_date = requested_delivery_date
  if (notes !== undefined)                   headerUpdate.notes = notes

  if (Object.keys(headerUpdate).length > 0) {
    await supabase.from('purchase_orders').update(headerUpdate).eq('id', id)
  }

  // Delete lines (only those with quantity_received null or 0)
  if (delete_item_ids && delete_item_ids.length > 0) {
    const { data: safeToDelete } = await supabase
      .from('purchase_order_items')
      .select('id')
      .eq('purchase_order_id', id)
      .in('id', delete_item_ids)
      .or('quantity_received.is.null,quantity_received.eq.0')

    if (safeToDelete && safeToDelete.length > 0) {
      await supabase.from('purchase_order_items').delete().in('id', safeToDelete.map(r => r.id))
    }
  }

  // Upsert lines
  if (upsert_items && upsert_items.length > 0) {
    const toUpsert = upsert_items.map((item, idx) => ({
      ...(item.id ? { id: item.id } : {}),
      purchase_order_id: id,
      stock_item_id:     item.stock_item_id,
      quantity_ordered:  item.quantity_ordered,
      unit_price:        item.unit_price,
      sort_order:        idx,
    }))
    await supabase.from('purchase_order_items').upsert(toUpsert)
  }

  // Recalculate total_ht
  const { data: allItems } = await supabase
    .from('purchase_order_items')
    .select('quantity_ordered, unit_price')
    .eq('purchase_order_id', id)

  const totalHt = (allItems ?? []).reduce((s, i) => s + i.quantity_ordered * i.unit_price, 0)
  const { data: updated, error: finalError } = await supabase
    .from('purchase_orders')
    .update({ total_ht: totalHt })
    .eq('id', id)
    .select()
    .single()

  if (finalError) return NextResponse.json({ error: finalError.message }, { status: 500 })
  return NextResponse.json(updated)
}
