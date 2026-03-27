// src/app/dashboard/crm/page.tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { CrmStatCards } from './_components/crm-stat-cards'
import { CustomerTable } from './_components/customer-table'
import type { Customer, CrmStats } from './_components/types'
import { CrmTopbar } from './_components/crm-topbar'

export default async function CrmPage() {
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

  // First day of current month
  const now = new Date()
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

  // Fetch customers — cast to any to handle created_at which is not in generated types
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: customersData } = await (supabase as any)
    .from('customers')
    .select('id, first_name, last_name, tier, points, phone, email, created_at')
    .eq('establishment_id', establishmentId)
    .order('created_at', { ascending: false })
    .limit(200)

  const customers: Customer[] = (customersData ?? []) as Customer[]

  // Fetch stats in parallel
  const customerIds = customers.map((c) => c.id)

  const [goldRes, silverRes, ptsRes, rewardsRes] = await Promise.all([
    supabase
      .from('customers')
      .select('id', { count: 'exact', head: true })
      .eq('establishment_id', establishmentId)
      .eq('tier', 'gold'),
    supabase
      .from('customers')
      .select('id', { count: 'exact', head: true })
      .eq('establishment_id', establishmentId)
      .eq('tier', 'silver'),
    customerIds.length > 0
      ? supabase
          .from('loyalty_transactions')
          .select('points')
          .eq('type', 'earn')
          .gte('created_at', firstOfMonth)
          .in('customer_id', customerIds)
      : Promise.resolve({ data: [] }),
    customerIds.length > 0
      ? supabase
          .from('loyalty_transactions')
          .select('id', { count: 'exact', head: true })
          .eq('type', 'redeem')
          .gte('created_at', firstOfMonth)
          .in('customer_id', customerIds)
      : Promise.resolve({ count: 0 }),
  ])

  const ptsDistributedThisMonth = ((ptsRes.data ?? []) as { points: number }[]).reduce(
    (sum, t) => sum + (t.points ?? 0),
    0
  )

  const stats: CrmStats = {
    totalCustomers: customers.length,
    goldCount: goldRes.count ?? 0,
    silverCount: silverRes.count ?? 0,
    ptsDistributedThisMonth,
    rewardsUsedThisMonth: (rewardsRes as { count?: number }).count ?? 0,
  }

  return (
    <div className="p-6">
      <CrmTopbar />
      <CrmStatCards stats={stats} />
      <CustomerTable customers={customers} />
    </div>
  )
}
