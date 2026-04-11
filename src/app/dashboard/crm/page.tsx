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

  if (!profile?.establishment_id) redirect('/onboarding')
  const establishmentId = profile.establishment_id

  // Fetch customers and stats in parallel
  const [{ data: customersData }, stats] = await Promise.all([
    supabase
      .from('customers')
      .select('id, first_name, last_name, tier, points, phone, email, rfm_segment, last_order_at')
      .eq('establishment_id', establishmentId)
      .order('last_order_at', { ascending: false, nullsFirst: false })
      .limit(200),
    fetchCrmStats(establishmentId),
  ])

  const customers: Customer[] = (customersData ?? []) as Customer[]

  return (
    <div className="p-6">
      <CrmTopbar />
      <CrmStatCards stats={stats} />
      <CustomerTable customers={customers} />
    </div>
  )
}
