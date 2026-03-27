// src/app/dashboard/crm/[id]/page.tsx
import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import { CustomerProfile } from './_components/customer-profile'
import { CustomerOrderHistory } from './_components/customer-order-history'
import { CustomerNotes } from './_components/customer-notes'
import { CustomerLoyaltyPanel } from './_components/customer-loyalty-panel'

interface Order {
  id: string
  created_at: string
  total_ttc: number
  payment_method: string | null
  items: { name: string; quantity: number }[]
  points_earned: number
}

interface LoyaltyTransaction {
  id: string
  type: 'earn' | 'spend' | 'redeem'
  points: number
  created_at: string
  order_id: string | null
}

interface LoyaltyReward {
  id: string
  name: string
  points_required: number
  discount_type: string
  discount_value: number
  active: boolean
}

export default async function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('establishment_id')
    .eq('id', user.id)
    .single()

  if (!profile?.establishment_id) redirect('/onboarding')
  const establishmentId = profile.establishment_id

  // Fetch in parallel: customer, orders, loyalty transactions, available rewards
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabaseAny = supabase as any
  const [
    { data: customer },
    { data: ordersData },
    { data: transactionsData },
    { data: rewardsData },
  ] = await Promise.all([
    supabaseAny
      .from('customers')
      .select('id, first_name, last_name, tier, points, phone, email, notes, created_at')
      .eq('id', id)
      .eq('establishment_id', establishmentId)
      .single(),
    supabaseAny
      .from('orders')
      .select(`
        id, created_at, total_ttc, payment_method,
        order_items ( quantity, products ( name ) )
      `)
      .eq('customer_id', id)
      .eq('status', 'paid')
      .order('created_at', { ascending: false })
      .limit(20),
    supabaseAny
      .from('loyalty_transactions')
      .select('id, type, points, created_at, order_id')
      .eq('customer_id', id)
      .order('created_at', { ascending: false })
      .limit(10),
    supabaseAny
      .from('loyalty_rewards')
      .select('id, name, points_required, discount_type, discount_value, active')
      .eq('establishment_id', establishmentId)
      .eq('active', true)
      .order('points_required'),
  ])

  if (!customer) notFound()

  // Fetch earn transactions for orders to compute points_earned
  const orderIds: string[] = (ordersData ?? []).map((o: { id: string }) => o.id)
  const { data: earnTxs } = await supabaseAny
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
  const orders: Order[] = (ordersData ?? []).map((o: any) => ({
    id: o.id,
    created_at: o.created_at,
    total_ttc: o.total_ttc ?? 0,
    payment_method: o.payment_method ?? null,
    items: (o.order_items ?? []).map((item: { quantity: number; products: { name: string } | null }) => ({
      name: item.products?.name ?? 'Produit inconnu',
      quantity: item.quantity,
    })),
    points_earned: earnByOrderId[o.id] ?? Math.floor(o.total_ttc ?? 0),
  }))

  const transactions: LoyaltyTransaction[] = (transactionsData ?? []) as LoyaltyTransaction[]
  const rewards: LoyaltyReward[] = (rewardsData ?? []) as LoyaltyReward[]

  // Compute stats
  const totalRevenue = orders.reduce((sum, o) => sum + o.total_ttc, 0)
  const visitCount = orders.length
  const avgTicket = visitCount > 0 ? totalRevenue / visitCount : 0

  return (
    <div className="p-6">
      <div className="flex gap-6 items-start">
        {/* Left column — 60% */}
        <div className="flex-[3] min-w-0 flex flex-col gap-5">
          <CustomerProfile
            customer={customer}
            totalRevenue={totalRevenue}
            visitCount={visitCount}
            avgTicket={avgTicket}
          />
          <CustomerOrderHistory orders={orders} />
        </div>

        {/* Right column — 40% */}
        <div className="flex-[2] min-w-0 flex flex-col gap-5">
          <CustomerNotes customerId={id} initialNotes={customer.notes ?? ''} />
          <CustomerLoyaltyPanel
            customer={customer}
            transactions={transactions}
            rewards={rewards}
          />
        </div>
      </div>
    </div>
  )
}
