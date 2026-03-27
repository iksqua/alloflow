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
  const siteId = params.site || undefined
  const range = getPeriodRange(period)

  // Fetch establishments for the picker
  const { data: establishments } = await supabase
    .from('establishments')
    .select('id, name')
    .order('name')

  // Fetch analytics data in parallel
  const [kpi, dailyCA, topProducts] = await Promise.all([
    fetchKpiSummary(range, siteId),
    fetchDailyCA(range, siteId),
    fetchTopProducts(range, siteId, 5),
  ])

  const establishmentList = (establishments ?? []) as { id: string; name: string }[]

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
