import { Suspense } from 'react'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import {
  getPeriodRange,
  fetchOrdersForReport,
  fetchKpiSummary,
  fetchTvaBreakdown,
} from '@/lib/analytics/queries'
import type { Period } from '@/lib/analytics/types'
import { PeriodPicker } from '../_components/period-picker'
import { ReportTable } from './_components/report-table'
import { TvaSummary } from './_components/tva-summary'

export default async function ReportPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; site?: string; page?: string; from?: string; to?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const params = await searchParams
  const period = (params.period ?? '30d') as Period
  const page = parseInt(params.page ?? '1', 10)
  const range = getPeriodRange(period, params.from, params.to)

  const { data: profile } = await supabase
    .from('profiles')
    .select('establishment_id, role')
    .eq('id', user.id)
    .single()

  const isFranchiseAdmin = profile?.role === 'franchise_admin'

  const siteId = isFranchiseAdmin
    ? (params.site || profile?.establishment_id || undefined)
    : (profile?.establishment_id || undefined)

  const establishmentList = isFranchiseAdmin
    ? ((await supabase.from('establishments').select('id, name').order('name')).data ?? []) as { id: string; name: string }[]
    : []

  // Fetch orders, KPI and TVA breakdown in parallel
  const [{ rows, total }, kpi, tvaBreakdown] = await Promise.all([
    fetchOrdersForReport(range, siteId, page, 50),
    fetchKpiSummary(range, siteId),
    fetchTvaBreakdown(range, siteId),
  ])

  const totalHt  = rows.reduce((s, r) => s + r.amountHt, 0)
  const totalTva = rows.reduce((s, r) => s + r.tvaAmount, 0)
  const totalTtc = rows.reduce((s, r) => s + r.amountTtc, 0)

  return (
    <div className="flex flex-col min-h-0 flex-1">
      {/* Topbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <h1 className="text-xl font-bold text-[var(--text1)]">Rapport des ventes</h1>
        <Suspense fallback={<div className="h-7" />}>
          <PeriodPicker
            currentPeriod={period}
            customFrom={params.from}
            customTo={params.to}
            establishments={establishmentList}
            currentEstablishment={siteId}
          />
        </Suspense>
      </div>

      {/* Main layout */}
      <div className="flex flex-col lg:flex-row gap-5">
        {/* Left column */}
        <div className="flex flex-col flex-1 gap-4 min-w-0">
          {/* Breadcrumb */}
          <nav className="flex items-center gap-1.5 text-xs text-[var(--text4)]">
            <Link href="/dashboard/analytics" className="text-blue-400 hover:underline">
              Analytics
            </Link>
            <span>›</span>
            <span className="text-[var(--text3)]">Rapport des ventes</span>
          </nav>

          {/* Sortable transactions table */}
          <ReportTable
            rows={rows}
            total={total}
            totalHt={totalHt}
            totalTva={totalTva}
            totalTtc={totalTtc}
          />
        </div>

        {/* Right column */}
        <div className="flex flex-col sm:flex-row lg:flex-col gap-4 lg:w-[240px] lg:shrink-0">
          {/* TVA Summary */}
          <TvaSummary data={tvaBreakdown} />

          {/* Payment split card */}
          <div className="rounded-[14px] p-[18px]" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <h3 className="text-sm font-semibold text-[var(--text1)] mb-4">Répartition paiements</h3>

            <div className="flex flex-col gap-3">
              {/* Carte */}
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-xs text-blue-400 font-semibold">
                    💳 Carte
                  </span>
                  <span className="text-xs text-[var(--text2)] tabular-nums font-semibold">
                    {kpi.cardAmount.toFixed(2)} €
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--surface2)' }}>
                    <div
                      className="h-full rounded-full bg-blue-400 transition-all"
                      style={{ width: `${kpi.cardPct}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-[var(--text4)] w-8 text-right tabular-nums">
                    {kpi.cardPct} %
                  </span>
                </div>
              </div>

              <div className="h-px" style={{ background: 'var(--border)' }} />

              {/* Espèces */}
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-xs text-amber-400 font-semibold">
                    💵 Espèces
                  </span>
                  <span className="text-xs text-[var(--text2)] tabular-nums font-semibold">
                    {kpi.cashAmount.toFixed(2)} €
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--surface2)' }}>
                    <div
                      className="h-full rounded-full bg-amber-400 transition-all"
                      style={{ width: `${kpi.cashPct}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-[var(--text4)] w-8 text-right tabular-nums">
                    {kpi.cashPct} %
                  </span>
                </div>
              </div>

              <div className="h-px" style={{ background: 'var(--border)' }} />

              {/* Total TTC */}
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-[var(--text4)] uppercase tracking-wider">Total TTC</span>
                <span className="text-sm text-blue-400 font-bold tabular-nums">
                  {kpi.caTtc.toFixed(2)} €
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
