// src/app/api/customers/[id]/orders/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles').select('establishment_id').eq('id', user.id).single()
  if (!profile?.establishment_id) return NextResponse.json({ error: 'Établissement non trouvé' }, { status: 400 })

  // Verify customer belongs to this establishment
  const { data: customer } = await supabase
    .from('customers')
    .select('id')
    .eq('id', id)
    .eq('establishment_id', profile.establishment_id)
    .single()
  if (!customer) return NextResponse.json({ error: 'Client non trouvé' }, { status: 404 })

  // Fetch last 20 paid orders with items
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: orders, error } = await (supabase as any)
    .from('orders')
    .select(`
      id,
      created_at,
      total_ttc,
      payment_method,
      order_items (
        quantity,
        products ( name )
      )
    `)
    .eq('customer_id', id)
    .eq('status', 'paid')
    .order('created_at', { ascending: false })
    .limit(20)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // For each order, look up earn transactions
  const orderIds: string[] = (orders ?? []).map((o: { id: string }) => o.id)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: earnTxs } = await (supabase as any)
    .from('loyalty_transactions')
    .select('order_id, points')
    .eq('customer_id', id)
    .eq('type', 'earn')
    .in('order_id', orderIds.length > 0 ? orderIds : ['__none__'])

  const earnByOrderId: Record<string, number> = {}
  for (const tx of earnTxs ?? []) {
    if (tx.order_id) earnByOrderId[tx.order_id] = (earnByOrderId[tx.order_id] ?? 0) + tx.points
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = (orders ?? []).map((o: any) => ({
    id: o.id,
    created_at: o.created_at,
    total_ttc: o.total_ttc,
    payment_method: o.payment_method,
    items: (o.order_items ?? []).map((item: { quantity: number; products: { name: string } | null }) => ({
      name: item.products?.name ?? 'Produit inconnu',
      quantity: item.quantity,
    })),
    points_earned: earnByOrderId[o.id] ?? Math.floor(o.total_ttc ?? 0),
  }))

  return NextResponse.json({ orders: result })
}
