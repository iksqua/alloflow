import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { DashboardPageClient } from './dashboard-page-client'
import type { DashboardSummary } from '@/app/api/dashboard/summary/route'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('establishment_id, role')
    .eq('id', user.id)
    .single()

  if (!profile?.establishment_id) redirect('/login')

  // Récupérer le nom de l'établissement
  const { data: establishment } = await supabase
    .from('establishments')
    .select('name')
    .eq('id', profile.establishment_id)
    .single()

  // Fetch du summary via la route API (appel interne SSR)
  const { cookies } = await import('next/headers')
  const cookieStore = await cookies()
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const res = await fetch(`${baseUrl}/api/dashboard/summary`, {
    headers: { cookie: cookieStore.toString() },
    cache: 'no-store',
  })

  let summary: DashboardSummary
  if (res.ok) {
    summary = await res.json()
  } else {
    // État dégradé : données vides
    summary = {
      kpis: { caToday: 0, caYesterday: 0, ordersToday: 0, ordersYesterday: 0, avgTicketToday: 0, avgTicketYesterday: 0, loyalCustomersToday: 0 },
      hourlyActivity: Array.from({ length: 13 }, (_, i) => ({ hour: 8 + i, count: 0 })),
      stockAlerts: [],
      pendingDeliveries: [],
      topProducts: [],
      recentOrders: [],
    }
  }

  return (
    <DashboardPageClient
      summary={summary}
      establishmentName={establishment?.name ?? 'Alloflow'}
    />
  )
}
