'use client'
import Link from 'next/link'
import type { DashboardData } from '@/app/dashboard/_lib/fetch-dashboard-data'

interface Props {
  stockAlerts: DashboardData['stockAlerts']
  pendingDeliveries: DashboardData['pendingDeliveries']
}

export function AlertsPanel({ stockAlerts, pendingDeliveries }: Props) {
  return (
    <div className="flex flex-col gap-3">
      {/* Stock alerts */}
      <div className="rounded-xl border border-[var(--border)] p-4 flex-1" style={{ background: 'var(--surface)' }}>
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-bold text-[var(--text1)]">Alertes stock</div>
          {stockAlerts.length > 0 && (
            <span
              className="text-[10px] font-bold px-2 py-0.5 rounded-full"
              style={{ background: 'rgba(239,68,68,0.12)', color: 'var(--red)' }}
            >
              {stockAlerts.length}
            </span>
          )}
        </div>

        {stockAlerts.length === 0 ? (
          <div className="text-xs text-[var(--text3)] text-center py-2">✓ Stocks OK</div>
        ) : (
          <div className="flex flex-col gap-2">
            {stockAlerts.map(alert => (
              <div key={alert.id} className="flex items-center gap-2.5">
                <div
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ background: alert.level === 'critical' ? 'var(--red)' : '#f59e0b' }}
                />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-[var(--text1)] truncate">{alert.name}</div>
                  <div className="text-[11px] text-[var(--text3)]">
                    {alert.quantity} restant · seuil {alert.alertThreshold}
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
          </div>
        )}
      </div>

      {/* Deliveries — informational, not an alert */}
      {pendingDeliveries.length > 0 && (
        <div className="rounded-xl border border-[var(--border)] p-4" style={{ background: 'var(--surface)' }}>
          <div className="text-sm font-bold text-[var(--text1)] mb-3">Livraisons reçues</div>
          <div className="flex flex-col gap-2">
            {pendingDeliveries.map(d => (
              <div key={d.id} className="flex items-center gap-2.5">
                <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: 'var(--blue)' }} />
                <div className="flex-1 min-w-0 text-xs text-[var(--text1)] truncate">{d.supplierName}</div>
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
      )}
    </div>
  )
}
