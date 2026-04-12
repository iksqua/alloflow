'use client'
import { useState, useTransition } from 'react'
import type { DashboardData } from './_lib/fetch-dashboard-data'
import { KpiCards } from './_components/kpi-cards'
import { ActivityChart } from './_components/activity-chart'
import { AlertsPanel } from './_components/alerts-panel'
import { TopProducts } from './_components/top-products'
import { RecentOrders } from './_components/recent-orders'
import { CashSessionCard } from './_components/cash-session-card'
import { PaymentBreakdown } from './_components/payment-breakdown'
import { PeriodSelector, type Period } from './_components/period-selector'

interface Props {
  initialSummary: DashboardData
  establishmentName: string
}

export function DashboardPageClient({ initialSummary, establishmentName: _name }: Props) {
  const [summary, setSummary] = useState<DashboardData>(initialSummary)
  const [period, setPeriod]   = useState<Period>('today')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo]     = useState('')
  const [isPending, startTransition] = useTransition()

  async function fetchPeriod(p: Period, from?: string, to?: string) {
    let url = '/api/dashboard/summary'
    if (p === 'custom' && from && to) {
      url += `?from=${from}&to=${to}`
    } else if (p !== 'today') {
      url += `?period=${p}`
    }

    startTransition(async () => {
      try {
        const res = await fetch(url)
        if (res.ok) {
          const data: DashboardData = await res.json()
          setSummary(data)
        }
      } catch {
        // keep current data on error
      }
    })
  }

  function handlePeriodChange(p: Period, from?: string, to?: string) {
    setPeriod(p)
    if (p === 'custom') { setCustomFrom(from ?? ''); setCustomTo(to ?? '') }
    fetchPeriod(p, from, to)
  }

  const today = new Date().toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-[var(--text1)]">Vue d'ensemble</h1>
          <p className="text-sm text-[var(--text3)] mt-0.5 capitalize">{today}</p>
        </div>
        <PeriodSelector
          current={period}
          customFrom={customFrom}
          customTo={customTo}
          onChange={handlePeriodChange}
          loading={isPending}
        />
      </div>

      {/* Loading overlay */}
      {isPending && (
        <div className="fixed inset-0 z-30 pointer-events-none flex items-start justify-center pt-20">
          <div className="px-4 py-2 rounded-full text-xs text-white font-medium shadow-lg" style={{ background: 'var(--blue)' }}>
            Chargement…
          </div>
        </div>
      )}

      {/* Cash session — always today */}
      <div className="mb-4">
        <CashSessionCard cashSession={summary.cashSession} />
      </div>

      {/* KPI cards */}
      <KpiCards kpis={summary.kpis} isToday={summary.period.isToday} />

      {/* Activity chart + Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-4 mb-4">
        <ActivityChart
          isToday={summary.period.isToday}
          hourlyActivity={summary.hourlyActivity}
          dailyTrend={summary.dailyTrend}
          label={summary.period.label}
        />
        <AlertsPanel
          stockAlerts={summary.stockAlerts}
          pendingDeliveries={summary.pendingDeliveries}
        />
      </div>

      {/* Bottom grid: top products + payment breakdown + recent orders */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <TopProducts products={summary.topProducts} label={summary.period.label} />
        <PaymentBreakdown breakdown={summary.paymentBreakdown} />
        <RecentOrders orders={summary.recentOrders} />
      </div>
    </div>
  )
}
