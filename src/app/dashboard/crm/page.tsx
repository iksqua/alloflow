// src/app/dashboard/crm/page.tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { CrmStatCards } from './_components/crm-stat-cards'
import { CustomerTable } from './_components/customer-table'
import type { Customer } from './_components/types'
import { CrmTopbar } from './_components/crm-topbar'
import { fetchCrmStats } from './_lib/fetch-crm-stats'

export default async function CrmPage() {
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

  // Fetch customers, stats and loyalty config in parallel
  const [{ data: customersData }, stats, { data: loyaltyConfig }] = await Promise.all([
    supabase
      .from('customers')
      .select('id, first_name, last_name, tier, points, phone, email, rfm_segment, last_order_at, avg_basket, order_count')
      .eq('establishment_id', establishmentId)
      .order('last_order_at', { ascending: false, nullsFirst: false })
      .limit(200),
    fetchCrmStats(establishmentId),
    supabase
      .from('loyalty_config')
      .select('levels')
      .eq('establishment_id', establishmentId)
      .maybeSingle(),
  ])

  const customers: Customer[] = (customersData ?? []) as Customer[]

  // Extract gold threshold from levels JSON: [{tier:'gold', min_pts: N}, ...]
  let goldThreshold = 500
  if (loyaltyConfig?.levels && Array.isArray(loyaltyConfig.levels)) {
    const goldLevel = (loyaltyConfig.levels as Array<{ tier: string; min_pts?: number; threshold?: number }>)
      .find((l) => l.tier === 'gold')
    if (goldLevel) goldThreshold = goldLevel.min_pts ?? goldLevel.threshold ?? 500
  }

  return (
    <div>
      <CrmTopbar />
      <CrmStatCards stats={stats} />
      <CustomerTable customers={customers} goldThreshold={goldThreshold} />
    </div>
  )
}
