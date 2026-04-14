// src/app/dashboard/crm/[id]/page.tsx
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { redirect, notFound } from 'next/navigation'
import { CustomerProfile } from './_components/customer-profile'
import { CustomerOrderHistory } from './_components/customer-order-history'
import { CustomerNotes } from './_components/customer-notes'
import { CustomerLoyaltyPanel } from './_components/customer-loyalty-panel'
import { fetchCustomerOrders } from './_lib/fetch-customer-orders'

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
  type: string
  value: number
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

  if (!profile?.establishment_id) redirect('/dashboard')
  const establishmentId = profile.establishment_id

  // Fetch in parallel: customer, orders, loyalty transactions, available rewards
  const [
    { data: customer },
    rawOrders,
    { data: transactionsData },
    { data: rewardsData },
  ] = await Promise.all([
    supabase
      .from('customers')
      .select('id, first_name, last_name, tier, points, phone, email, last_order_at, gender, birthdate, opt_in_sms, opt_in_email, opt_in_whatsapp, tags, rfm_segment, avg_basket, order_count, network_customer_id')
      .eq('id', id)
      .eq('establishment_id', establishmentId)
      .single(),
    fetchCustomerOrders(id),
    supabase
      .from('loyalty_transactions')
      .select('id, type, points, created_at, order_id')
      .eq('customer_id', id)
      .order('created_at', { ascending: false })
      .limit(10),
    supabase
      .from('loyalty_rewards')
      .select('id, name, points_required, type, value, active')
      .eq('establishment_id', establishmentId)
      .eq('active', true)
      .order('points_required'),
  ])

  if (!customer) notFound()

  // Fetch network identity if customer is linked
  let networkData: { id: string; total_points: number; tier: 'standard' | 'silver' | 'gold' } | null = null
  if (customer.network_customer_id) {
    const supabaseAdmin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    const { data: nc } = await supabaseAdmin
      .from('network_customers')
      .select('id, total_points, tier')
      .eq('id', customer.network_customer_id)
      .single()
    if (nc) networkData = { id: nc.id, total_points: nc.total_points, tier: nc.tier as 'standard' | 'silver' | 'gold' }
  }

  const orders: Order[] = rawOrders.map((o) => ({
    id: o.id,
    created_at: o.createdAt,
    total_ttc: o.totalTtc,
    payment_method: o.paymentMethod,
    items: o.items,
    points_earned: o.pointsEarned,
  }))

  const transactions: LoyaltyTransaction[] = (transactionsData ?? []) as LoyaltyTransaction[]
  const rewards: LoyaltyReward[] = (rewardsData ?? []) as LoyaltyReward[]

  // Normalize customer to satisfy component interfaces (DB returns string for enum fields)
  const customerNormalized = customer as typeof customer & {
    tier: 'standard' | 'silver' | 'gold'
    rfm_segment: 'vip' | 'fidele' | 'nouveau' | 'a_risque' | 'perdu'
    notes?: string | null
  }

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
            customer={customerNormalized}
            totalRevenue={totalRevenue}
            visitCount={visitCount}
            avgTicket={avgTicket}
          />
          <CustomerOrderHistory orders={orders} />
        </div>

        {/* Right column — 40% */}
        <div className="flex-[2] min-w-0 flex flex-col gap-5">
          <CustomerNotes customerId={id} initialNotes={''} />
          <CustomerLoyaltyPanel
            customer={customerNormalized}
            transactions={transactions}
            rewards={rewards}
            network={networkData}
          />
        </div>
      </div>
    </div>
  )
}
