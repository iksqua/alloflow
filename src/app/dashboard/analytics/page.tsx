// src/app/dashboard/analytics/page.tsx
import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getPeriodRange, fetchKpiSummary, fetchDailyCA, fetchTopProducts } from '@/lib/analytics/queries'
import type { Period } from '@/lib/analytics/types'
import { PeriodPicker } from './_components/period-picker'
import { KpiCards } from './_components/kpi-cards'
import { CaBarChart } from './_components/ca-bar-chart'
import { TopProducts } from './_components/top-products'

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; site?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const params = await searchParams
  const period = (params.period ?? '30d') as Period
  const range = getPeriodRange(period)

  // Get user's establishment_id as the default filter
  const { data: profile } = await supabase
    .from('profiles')
    .select('establishment_id')
    .eq('id', user.id)
    .single()

  // siteId: use picker param if set, otherwise default to user's establishment
  const siteId = params.site || profile?.establishment_id || undefined

  // Fetch establishments for the picker
  const { data: establishments } = await supabase
    .from('establishments')
    .select('id, name')
    .order('name')

  // Fetch analytics data in parallel
  let kpi: Awaited<ReturnType<typeof fetchKpiSummary>> | null = null
  let dailyCA: Awaited<ReturnType<typeof fetchDailyCA>> = []
  let topProducts: Awaited<ReturnType<typeof fetchTopProducts>> = []
  let analyticsError: string | null = null

  try {
    ;[kpi, dailyCA, topProducts] = await Promise.all([
      fetchKpiSummary(range, siteId),
      fetchDailyCA(range, siteId),
      fetchTopProducts(range, siteId, 5),
    ])
  } catch (err) {
    analyticsError = err instanceof Error ? err.message : String(err)
  }

  const establishmentList = (establishments ?? []) as { id: string; name: string }[]

  if (analyticsError || !kpi) {
    return (
      <div className="p-6">
        <h1 className="text-xl font-bold text-[var(--text1)] mb-4">Analytiques</h1>
        <div className="px-4 py-3 rounded-lg text-sm font-mono" style={{ background: 'var(--red-bg)', color: 'var(--red)', border: '1px solid var(--red)' }}>
          Erreur: {analyticsError ?? 'Données indisponibles'}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col min-h-0 flex-1">
      {/* Topbar */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-[var(--text1)]">Analytiques</h1>
        <Suspense fallback={<div className="h-7" />}>
          <PeriodPicker
            currentPeriod={period}
            establishments={establishmentList}
            currentEstablishment={siteId}
          />
        </Suspense>
      </div>

      {/* KPI Cards */}
      <KpiCards data={kpi} />

      {/* Row 1: CA chart + rush hours placeholder */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <CaBarChart data={dailyCA} />
        <div className="bg-[#0f2744] border border-white/[0.06] rounded-[14px] p-[18px] flex flex-col">
          <h3 className="text-sm font-semibold text-slate-200 mb-4">Heures de rush</h3>
          <div className="flex-1 flex items-center justify-center">
            <p className="text-slate-500 text-center py-8 text-sm">Bientôt disponible</p>
          </div>
        </div>
      </div>

      {/* Row 2: Top products + network snapshot placeholder */}
      <div className="grid grid-cols-2 gap-4">
        <TopProducts data={topProducts} />
        <div className="bg-[#0f2744] border border-white/[0.06] rounded-[14px] p-[18px] flex flex-col">
          <h3 className="text-sm font-semibold text-slate-200 mb-4">Snapshot réseau</h3>
          <div className="flex-1 flex items-center justify-center">
            <p className="text-slate-500 text-center py-8 text-sm">Bientôt disponible</p>
          </div>
        </div>
      </div>
    </div>
  )
}
