// src/app/api/purchase-orders/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createPurchaseOrderSchema } from '@/lib/validations/stock'

async function getEstablishmentId(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data } = await supabase
    .from('profiles')
    .select('establishment_id')
    .eq('id', userId)
    .single()
  return data?.establishment_id ?? null
}

function generateOrderRef(year: number, count: number) {
  return `BC-${year}-${String(count + 1).padStart(4, '0')}`
}

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const establishmentId = await getEstablishmentId(supabase, user.id)
  if (!establishmentId) return NextResponse.json({ error: 'Établissement non trouvé' }, { status: 400 })

  const { data, error } = await supabase
    .from('purchase_orders')
    .select('*, items:purchase_order_items(*, stock_item:stock_items(id, name, unit))')
    .eq('establishment_id', establishmentId)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ orders: data ?? [] })
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const establishmentId = await getEstablishmentId(supabase, user.id)
  if (!establishmentId) return NextResponse.json({ error: 'Établissement non trouvé' }, { status: 400 })

  const body = await req.json()
  const result = createPurchaseOrderSchema.safeParse(body)
  if (!result.success) return NextResponse.json({ error: result.error.flatten() }, { status: 400 })

  // Count existing orders this year for ref generation
  const year = new Date().getFullYear()
  const { count } = await supabase
    .from('purchase_orders')
    .select('*', { count: 'exact', head: true })
    .eq('establishment_id', establishmentId)
    .gte('created_at', `${year}-01-01`)

  const orderRef = generateOrderRef(year, count ?? 0)
  const totalHt = result.data.items.reduce((sum, i) => sum + i.quantity_ordered * i.unit_price, 0)

  const { data: order, error: orderError } = await supabase
    .from('purchase_orders')
    .insert({
      establishment_id:        establishmentId,
      order_ref:               orderRef,
      supplier:                result.data.supplier,
      supplier_email:          result.data.supplier_email ?? null,
      requested_delivery_date: result.data.requested_delivery_date ?? null,
      notes:                   result.data.notes ?? null,
      total_ht:                totalHt,
      created_by:              user.id,
    })
    .select()
    .single()

  if (orderError) return NextResponse.json({ error: orderError.message }, { status: 500 })

  const { error: itemsError } = await supabase
    .from('purchase_order_items')
    .insert(result.data.items.map((item, idx) => ({
      purchase_order_id: order.id,
      stock_item_id:     item.stock_item_id,
      quantity_ordered:  item.quantity_ordered,
      unit_price:        item.unit_price,
      sort_order:        idx,
    })))

  if (itemsError) return NextResponse.json({ error: itemsError.message }, { status: 500 })

  return NextResponse.json(order, { status: 201 })
}
