import { createClient } from '@/lib/supabase/server'

export interface CrmStats {
  totalCustomers: number
  goldCount: number
  silverCount: number
  ptsDistributedThisMonth: number
  rewardsUsedThisMonth: number
}

export async function fetchCrmStats(establishmentId: string): Promise<CrmStats> {
  const supabase = await createClient()

  // Total and tier counts using count
  const { count: totalCustomers } = await supabase
    .from('customers')
    .select('*', { count: 'exact', head: true })
    .eq('establishment_id', establishmentId)

  const { count: goldCount } = await supabase
    .from('customers')
    .select('*', { count: 'exact', head: true })
    .eq('establishment_id', establishmentId)
    .eq('tier', 'gold')

  const { count: silverCount } = await supabase
    .from('customers')
    .select('*', { count: 'exact', head: true })
    .eq('establishment_id', establishmentId)
    .eq('tier', 'silver')

  // Points this month (earn)
  const startOfMonth = new Date()
  startOfMonth.setDate(1)
  startOfMonth.setHours(0, 0, 0, 0)

  // Get customer IDs for this establishment
  const { data: customerIds } = await supabase
    .from('customers')
    .select('id')
    .eq('establishment_id', establishmentId)

  const ids = (customerIds ?? []).map((c) => c.id)

  let ptsDistributedThisMonth = 0
  let rewardsUsedThisMonth = 0

  if (ids.length > 0) {
    const { data: earnTx } = await supabase
      .from('loyalty_transactions')
      .select('points')
      .in('customer_id', ids)
      .eq('type', 'earn')
      .gte('created_at', startOfMonth.toISOString())

    ptsDistributedThisMonth = (earnTx ?? []).reduce((s, t) => s + (t.points ?? 0), 0)

    const { count: rewardsCount } = await supabase
      .from('loyalty_transactions')
      .select('*', { count: 'exact', head: true })
      .in('customer_id', ids)
      .eq('type', 'redeem')
      .gte('created_at', startOfMonth.toISOString())

    rewardsUsedThisMonth = rewardsCount ?? 0
  }

  return {
    totalCustomers: totalCustomers ?? 0,
    goldCount: goldCount ?? 0,
    silverCount: silverCount ?? 0,
    ptsDistributedThisMonth,
    rewardsUsedThisMonth,
  }
}
