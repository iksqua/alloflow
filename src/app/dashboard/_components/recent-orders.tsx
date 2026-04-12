'use client'
import type { DashboardData } from '@/app/dashboard/_lib/fetch-dashboard-data'

function timeAgo(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (diff < 60) return `${diff}s`
  if (diff < 3600) return `${Math.floor(diff / 60)} min`
  return `${Math.floor(diff / 3600)}h`
}

const TIER_STYLE: Record<string, { bg: string; color: string }> = {
  gold:     { bg: 'rgba(245,158,11,0.15)',   color: '#fbbf24' },
  silver:   { bg: 'rgba(148,163,184,0.15)',  color: '#cbd5e1' },
  standard: { bg: 'var(--surface2)',          color: 'var(--text2)' },
}

interface RecentOrdersProps {
  orders: DashboardData['recentOrders']
}

export function RecentOrders({ orders }: RecentOrdersProps) {
  return (
    <div className="rounded-xl border border-[var(--border)] p-5" style={{ background: 'var(--surface)' }}>
      <div className="mb-4">
        <div className="text-sm font-bold text-[var(--text1)]">Activité récente</div>
        <div className="text-xs text-[var(--text3)] mt-0.5">Dernières transactions</div>
      </div>

      {orders.length === 0 && (
        <div className="text-sm text-[var(--text3)] py-4 text-center">Aucune commande pour le moment</div>
      )}

      <div className="flex flex-col divide-y divide-[var(--border)]/30">
        {orders.map((o) => {
          const initials = o.customerName
            ? o.customerName.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
            : '—'
          const tierStyle = o.customerTier ? TIER_STYLE[o.customerTier] : TIER_STYLE['standard']

          return (
            <div key={o.id} className="flex items-start gap-2.5 py-2.5 first:pt-0 last:pb-0">
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0"
                style={{ background: tierStyle.bg, color: tierStyle.color }}
              >
                {initials}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium text-[var(--text1)]">
                  {o.customerName ?? 'Anonyme'} · #{o.orderNumber ?? o.id.slice(0, 8).toUpperCase()}
                </div>
                <div className="text-[11px] text-[var(--text3)] truncate mt-0.5">
                  {o.itemsSummary || '—'} · {o.totalAmount.toFixed(2).replace('.', ',')} €
                </div>
              </div>
              <div className="text-[11px] text-[var(--text4)] flex-shrink-0">{timeAgo(o.createdAt)}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
