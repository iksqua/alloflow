'use client'
import type { DashboardSummary } from '@/app/api/dashboard/summary/route'
import { KpiCards } from './_components/kpi-cards'
import { HourlyChart } from './_components/hourly-chart'
import { AlertsPanel } from './_components/alerts-panel'
import { TopProducts } from './_components/top-products'
import { RecentOrders } from './_components/recent-orders'

interface DashboardPageClientProps {
  summary: DashboardSummary
  establishmentName: string
}

export function DashboardPageClient({ summary, establishmentName }: DashboardPageClientProps) {
  const today = new Date().toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-[var(--text1)]">Vue d&apos;ensemble</h1>
        <p className="text-sm text-[var(--text3)] mt-0.5 capitalize">{today}</p>
      </div>

      <KpiCards kpis={summary.kpis} />

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4 mb-4">
        <HourlyChart data={summary.hourlyActivity} />
        <AlertsPanel
          stockAlerts={summary.stockAlerts}
          pendingDeliveries={summary.pendingDeliveries}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <TopProducts products={summary.topProducts} />
        <RecentOrders orders={summary.recentOrders} />
      </div>
    </div>
  )
}
