'use client'
import type { DashboardData } from '@/app/dashboard/_lib/fetch-dashboard-data'

interface Props {
  isToday: boolean
  hourlyActivity: DashboardData['hourlyActivity']
  dailyTrend: DashboardData['dailyTrend']
  label: string
}

function shortDate(iso: string): string {
  const d = new Date(iso + 'T12:00:00')
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}

export function ActivityChart({ isToday, hourlyActivity, dailyTrend, label }: Props) {
  if (isToday) {
    // Hourly bars
    const now = new Date().getHours()
    const max = Math.max(...hourlyActivity.map(d => d.count), 1)
    const totalToday = hourlyActivity.reduce((s, d) => s + d.count, 0)

    return (
      <div className="rounded-xl border border-[var(--border)] p-5" style={{ background: 'var(--surface)' }}>
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="text-sm font-bold text-[var(--text1)]">Activité par heure</div>
            <div className="text-xs text-[var(--text3)] mt-0.5">{totalToday} transaction{totalToday > 1 ? 's' : ''} aujourd'hui</div>
          </div>
          <span className="text-[10px] px-2 py-1 rounded-full font-semibold flex items-center gap-1" style={{ background: 'rgba(16,185,129,0.12)', color: 'var(--green)' }}>
            <span className="w-1.5 h-1.5 rounded-full inline-block animate-pulse" style={{ background: 'var(--green)' }} />
            En direct
          </span>
        </div>
        <div className="flex items-end gap-1 h-28 pt-2">
          {hourlyActivity.map(({ hour, count }) => {
            const h = Math.max(4, (count / max) * 100)
            const isNow  = hour === now
            const isPast = hour < now
            const bg = isNow ? 'var(--blue)' : isPast ? 'rgba(29,78,216,0.45)' : 'rgba(29,78,216,0.12)'
            return (
              <div key={hour} className="flex-1 flex flex-col items-center gap-1 h-full justify-end group relative">
                {count > 0 && (
                  <div className="absolute -top-5 left-1/2 -translate-x-1/2 text-[9px] text-[var(--text3)] opacity-0 group-hover:opacity-100 whitespace-nowrap">
                    {count} cmd
                  </div>
                )}
                <div className="w-full rounded-t" style={{ height: `${count === 0 ? 3 : h}%`, background: bg, minHeight: '3px' }} />
                <div className="text-[9px] text-[var(--text4)]">{hour}h</div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // Daily bars
  const max = Math.max(...dailyTrend.map(d => d.ca), 1)
  const totalCA = dailyTrend.reduce((s, d) => s + d.ca, 0)
  const totalOrders = dailyTrend.reduce((s, d) => s + d.orders, 0)

  return (
    <div className="rounded-xl border border-[var(--border)] p-5" style={{ background: 'var(--surface)' }}>
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="text-sm font-bold text-[var(--text1)]">CA par jour</div>
          <div className="text-xs text-[var(--text3)] mt-0.5">{label} · {totalOrders} commandes</div>
        </div>
        <div className="text-right">
          <div className="text-sm font-bold text-[var(--text1)]">{totalCA.toFixed(2).replace('.', ',')} €</div>
          <div className="text-[10px] text-[var(--text3)]">total période</div>
        </div>
      </div>

      {dailyTrend.length === 0 ? (
        <div className="text-sm text-[var(--text3)] text-center py-8">Aucune donnée</div>
      ) : (
        <div className="flex items-end gap-1 h-28 pt-2">
          {dailyTrend.map(({ date, ca, orders }) => {
            const h = Math.max(4, (ca / max) * 100)
            return (
              <div key={date} className="flex-1 flex flex-col items-center gap-1 h-full justify-end group relative">
                <div className="absolute -top-8 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 z-10 whitespace-nowrap text-center pointer-events-none">
                  <div className="text-[9px] font-semibold text-[var(--text1)]">{ca.toFixed(2).replace('.', ',')} €</div>
                  <div className="text-[9px] text-[var(--text3)]">{orders} cmd</div>
                </div>
                <div className="w-full rounded-t transition-all" style={{ height: `${ca === 0 ? 3 : h}%`, background: 'var(--blue)', minHeight: '3px' }} />
                <div className="text-[9px] text-[var(--text4)] truncate w-full text-center">{shortDate(date)}</div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
