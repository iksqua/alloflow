import { createClient } from '@/lib/supabase/server'

export interface CustomerOrder {
  id: string
  createdAt: string
  totalTtc: number
  paymentMethod: string
  items: { name: string; quantity: number }[]
  pointsEarned: number
}

export async function fetchCustomerOrders(customerId: string, limit = 20): Promise<CustomerOrder[]> {
  const supabase = await createClient()

  const { data: orders } = await supabase
    .from('orders')
    .select('id, created_at, total_ttc, order_items(quantity, product_name), payments(method, amount)')
    .eq('customer_id', customerId)
    .eq('status', 'paid')
    .order('created_at', { ascending: false })
    .limit(limit) as any

  if (!orders || orders.length === 0) return []

  const orderIds = orders.map((o: any) => o.id)

  // Early return guard for empty orderIds (avoids empty IN clause)
  let earnMap: Map<string, number> = new Map()
  if (orderIds.length > 0) {
    const { data: earnTx } = await supabase
      .from('loyalty_transactions')
      .select('order_id, points')
      .in('order_id', orderIds)
      .eq('type', 'earn') as any

    earnMap = new Map((earnTx ?? []).map((t: any) => [t.order_id, t.points]))
  }

  return orders.map((o: any) => {
    // Derive payment method from payments array (prefer card, fallback to cash)
    const payments: any[] = o.payments ?? []
    const hasCash = payments.some((p: any) => p.method === 'cash')
    const hasCard = payments.some((p: any) => p.method === 'card')
    const paymentMethod = hasCard && hasCash ? 'split' : hasCash ? 'cash' : 'card'

    return {
      id: o.id,
      createdAt: o.created_at,
      totalTtc: o.total_ttc ?? 0,
      paymentMethod,
      items: (o.order_items ?? []).map((i: any) => ({
        name: i.product_name ?? '?',
        quantity: i.quantity ?? 1,
      })),
      pointsEarned: earnMap.get(o.id) ?? Math.floor(o.total_ttc ?? 0),
    }
  })
}
