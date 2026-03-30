'use client'
import Link from 'next/link'
import type { DashboardSummary } from '@/app/api/dashboard/summary/route'

interface AlertsPanelProps {
  stockAlerts: DashboardSummary['stockAlerts']
  pendingDeliveries: DashboardSummary['pendingDeliveries']
}

export function AlertsPanel({ stockAlerts, pendingDeliveries }: AlertsPanelProps) {
  const total = stockAlerts.length + pendingDeliveries.length

  return (
    <div className="rounded-xl border border-[var(--border)] p-5" style={{ background: 'var(--surface)' }}>
      <div className="mb-3">
        <div className="text-sm font-bold text-[var(--text1)]">Alertes</div>
        <div className="text-xs text-[var(--text3)] mt-0.5">
          {total === 0 ? 'Tout est en ordre ✓' : `${total} élément${total > 1 ? 's' : ''} à traiter`}
        </div>
      </div>

      {total === 0 && (
        <div className="text-sm text-[var(--text3)] py-4 text-center">Aucune alerte active</div>
      )}

      <div className="flex flex-col divide-y divide-[var(--border)]/30">
        {stockAlerts.map((alert) => (
          <div key={alert.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
            <div
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ background: alert.level === 'critical' ? 'var(--red)' : 'var(--amber)' }}
            />
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium text-[var(--text1)] truncate">{alert.name}</div>
              <div className="text-[11px] text-[var(--text3)]">
                {alert.quantity} · seuil {alert.alertThreshold}
              </div>
            </div>
            <Link
              href="/dashboard/stocks"
              className="text-[10px] px-2 py-1 rounded border border-[var(--border)] text-[var(--text2)] hover:bg-[var(--surface2)] transition-colors flex-shrink-0"
            >
              Stocks →
            </Link>
          </div>
        ))}

        {pendingDeliveries.map((d) => (
          <div key={d.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
            <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: 'var(--blue)' }} />
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium text-[var(--text1)] truncate">Livraison reçue</div>
              <div className="text-[11px] text-[var(--text3)] truncate">{d.supplierName}</div>
            </div>
            <Link
              href="/dashboard/stocks"
              className="text-[10px] px-2 py-1 rounded border border-[var(--border)] text-[var(--text2)] hover:bg-[var(--surface2)] transition-colors flex-shrink-0"
            >
              Valider →
            </Link>
          </div>
        ))}
      </div>
    </div>
  )
}
