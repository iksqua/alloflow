import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { DashboardPageClient } from './dashboard-page-client'
import { resolvePeriod, fetchDashboardData } from './_lib/fetch-dashboard-data'

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; from?: string; to?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('establishment_id, role').eq('id', user.id).single()

  if (profile?.role === 'franchise_admin') redirect('/dashboard/franchise/command-center')
  if (!profile?.establishment_id) redirect('/dashboard/products')

  const { data: establishment } = await supabase
    .from('establishments').select('name').eq('id', profile.establishment_id).single()

  const params = await searchParams
  const bounds = resolvePeriod(params.period, params.from, params.to)

  try {
    const summary = await fetchDashboardData(supabase, profile.establishment_id, bounds)
    return (
      <DashboardPageClient
        initialSummary={summary}
        establishmentName={establishment?.name ?? 'Alloflow'}
      />
    )
  } catch {
    const emptyBounds = resolvePeriod()
    const empty = await fetchDashboardData(supabase, profile.establishment_id, emptyBounds).catch(() => null)
    return (
      <DashboardPageClient
        initialSummary={empty ?? {
          period: { from: '', to: '', label: "Aujourd'hui", isToday: true },
          kpis: { ca: 0, caPrev: 0, orders: 0, ordersPrev: 0, avgTicket: 0, avgTicketPrev: 0, loyalCustomers: 0, newCustomers: 0, refundCount: 0, avgItemsPerOrder: 0 },
          cashSession: null, paymentBreakdown: [], hourlyActivity: [], dailyTrend: [],
          stockAlerts: [], pendingDeliveries: [], topProducts: [], recentOrders: [],
        }}
        establishmentName={establishment?.name ?? 'Alloflow'}
      />
    )
  }
}
